/* global __dirname */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
const React = require("react"),
  { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith(".")) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const ext = ["", ".ts", ".tsx"].find((e) => fs.existsSync(target + e));
      return load(
        path.relative(path.resolve(__dirname, ".."), target + ext),
        mocks,
        cache,
      );
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const host = name => function Host({ children, ...props }) { return React.createElement(name, props, children); };
const Native = {
  Animated: {
    Value: class {
      setValue() {}
    },
    View: host("Animated"),
    timing: () => ({ start() {}, stop() {} }),
  },
  AppState: { addEventListener: () => ({ remove() {} }) },
  Keyboard: { dismiss() {} },
  Switch: host("Switch"),
  Linking: { openSettings: async () => {} },
  Text: host("Text"),
  View: host("View"),
  Pressable: host("Button"),
  ScrollView: host("Scroll"),
  TextInput: host("Input"),
  KeyboardAvoidingView: host("KeyboardArea"),
  Platform: { OS: "android" },
};
const UI = {
  Meter: host("Meter"),
  PersonalRow: ({ title, subtitle, ...props }) =>
    React.createElement("Button", props, title, subtitle),
  PersonalPage: host("Page"),
  PersonalButton: ({ title, ...props }) =>
    React.createElement("Button", props, title),
  p: {},
};
const text = (node) =>
  typeof node === "string" ? node : (node.children ?? []).map(text).join("");
async function screen(file, mocks) {
  const Component = load(file, {
    expo: { isRunningInExpoGo: () => false },
    "react-native": Native,
    "react-native-safe-area-context": { SafeAreaView: host("Safe") },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../services/dailyGoalService": { getDailyGoalSettings: async () => ({ local_date: "2026-10-03", next_effective_date: "2026-10-04", today_goal_minutes: 60, next_goal_minutes: 60, timezone: "Asia/Kuala_Lumpur", pending: false, scheduling_available: true }), scheduleDailyGoal: async () => { throw Error("Not configured"); } },
    "./PersonalUI": UI,
    "../components/PersonalUI": UI,
    "./CharacterPortrait": host("Portrait"),
    "../components/CharacterPortrait": host("Portrait"),
    ...mocks,
  }).default;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component));
  });
  return {
    renderer,
    text: () => text(renderer.root),
    input: async (label, value) =>
      act(async () =>
        renderer.root
          .findAllByType("Input")
          .find((n) => n.props.accessibilityLabel === label)
          .props.onChangeText(value),
      ),
    press: async (title) =>
      act(async () =>
        renderer.root
          .findAllByType("Button")
          .find((n) => n.props.title === title || text(n) === title)
          .props.onPress(),
      ),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
const goals = load("src/utils/dailyGoal.ts");
const badges = load("src/constants/characterBadges.ts").CHARACTER_BADGES;
const goalData = { user_id: "account", local_date: "2026-10-03", next_effective_date: "2026-10-04",
  today_goal_minutes: 60, next_goal_minutes: 60, timezone: "Asia/Kuala_Lumpur", pending: false, scheduling_available: true,
  weekly_limit_available: true, can_change_goal: true, next_change_at: null };
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sheets = {
  "../components/AppSheet": ({ header, children, ...props }) => React.createElement("Sheet", props, header, children),
  "@gorhom/bottom-sheet": { BottomSheetScrollView: host("SheetScroll"), BottomSheetTextInput: host("Input") },
};
async function settings(options = {}) {
  let foreground, saveCalls = 0, signOutCalls = 0, enableCalls = 0, reads = 0, phoneCalls = 0;
  const navigate = [];
  const ui = await screen("src/app/settings.tsx", {
    ...sheets,
    "react-native": { ...Native, AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() {} }; } },
      Linking: { openSettings: async () => { phoneCalls++; } } },
    "expo-router": { useRouter: () => ({ navigate: path => navigate.push(path) }) },
    "../context/UserContext": { useUser: () => ({ profile: { id: "account", username: "Hero", avatar: badges[9], daily_goal_minutes: 60, timezone: "Asia/Kuala_Lumpur" },
      soundEnabled: true, hapticsEnabled: true, setSoundEnabled() {}, setHapticsEnabled() {} }) },
    "../context/AuthContext": { useAuth: () => ({ user: { email: "test@example.com" }, signOut: async () => {
      signOutCalls++; return { error: options.logoutError ?? null };
    } }) },
    "../context/TimerContext": { useTimer: () => options.timer ?? {} },
    "../services/dailyGoalService": { getDailyGoalSettings: async () => {
      if (options.loadError) throw { code: "PGRST202" };
      return { ...goalData, ...(options.noCapability ? { scheduling_available: false } : {}), ...(options.goal ?? {}) };
    }, missingGoalAPI: e => e?.code === "PGRST202", scheduleDailyGoal: async minutes => {
      saveCalls++; if (options.wait) await options.wait;
      if (options.saveError) throw Error("Offline");
      return { ...goalData, next_goal_minutes: minutes, pending: true, can_change_goal: false, next_change_at: "2026-10-10T10:00:00Z" };
    } },
    "../services/notificationPermissionService": {
      readNotificationPermission: async () => { reads++; return options.permission?.(reads) ?? { label: "Not allowed", action: "enable", supported: true }; },
      enableNotifications: async () => { enableCalls++; return { label: "Allowed on this device", action: "settings", supported: true }; },
    },
    "../services/dailyProgressService": { getTodayProgress: async () => options.savedGoal ? { goal_minutes: options.savedGoal } : null },
  });
  return { ...ui, calls: () => ({ saveCalls, signOutCalls, enableCalls, reads, phoneCalls, navigate }),
    foreground: async () => act(async () => foreground("active")) };
}
test("shared goal validation rejects fractional, empty and out-of-range targets", () => {
  for (const value of ["", " ", "1.5", "abc", "-30", "480.1"]) assert.ok(goals.validateDailyGoal(goals.parseDailyGoal(value)));
  for (const value of [0, 1, 14, 15, 29, 481, NaN, 1.5]) assert.ok(goals.validateDailyGoal(value));
  for (const value of [30, 60, 90, 120, 480]) assert.equal(goals.validateDailyGoal(value), "");
});
test("Settings starts with identity, separates logout and contains no inert Motion row", async () => {
  const ui = await settings();
  try {
    const labels = ui.renderer.root.findAllByType("Text").map(n => text(n));
    assert.equal(labels[0], "Account");
    assert.match(ui.text(), /test@example.com/);
    assert.match(ui.text(), /Session access/);
    assert.doesNotMatch(ui.text(), /Edit profile/);
    assert.match(ui.text(), /midnight in this time zone/);
    assert.doesNotMatch(ui.text(), /Motion|EAS|Expo Go|native build|widgets/);
    await ui.press("Replay the introductionSessions, growth, goals and rewards");
    assert.deepEqual(ui.calls().navigate, ["/tutorial"]);
  } finally { await ui.cleanup(); }
});
test("goal editor validates, submits once and explains next-local-day without changing today's target", async () => {
  const wait = defer();
  const ui = await settings({ wait: wait.promise });
  try {
    await ui.press("Daily focus goalToday: 60 min");
    await ui.input("Daily focus goal in minutes", "0");
    await ui.press("Save daily goal");
    assert.equal(ui.calls().saveCalls, 0);
    await ui.input("Daily focus goal in minutes", "30");
    let first;
    await act(async () => {
      const button = ui.renderer.root.findAllByType("Button").find(n => text(n) === "Save daily goal");
      first = button.props.onPress(); button.props.onPress();
    });
    assert.equal(ui.calls().saveCalls, 1);
    await act(async () => { wait.resolve(); await first; });
    assert.match(ui.text(), /2026-10-04/);
    assert.match(ui.text(), /Today: 60 min/);
    assert.match(ui.text(), /Your 30-minute goal starts/);
    assert.match(ui.text(), /change your goal again/);
  } finally { await ui.cleanup(); }
});
test("goal save failure preserves the draft and exposes retry without a successful outcome", async () => {
  const ui = await settings({ saveError: true });
  try {
    await ui.press("Daily focus goalToday: 60 min");
    await ui.input("Daily focus goal in minutes", "45");
    await ui.press("Save daily goal");
    assert.match(ui.text(), /Could not schedule/);
    assert.doesNotMatch(ui.text(), /Your 45-minute goal starts/);
    assert.equal(ui.renderer.root.findAllByType("Input")[0].props.value, "45");
  } finally { await ui.cleanup(); }
});
test("missing or unconfirmed goal capability stays read-only without a broken editor", async () => {
  for (const options of [{ loadError: true }, { noCapability: true }, { goal: { weekly_limit_available: false } }]) {
    const ui = await settings(options);
    try {
      const row = ui.renderer.root.findAllByType("Button").find(n => text(n) === "Daily focus goalToday: 60 min");
      assert.equal(row.props.onPress, undefined);
      assert.match(ui.text(), /read-only/);
      assert.doesNotMatch(ui.text(), /Retry goal loading|Save daily goal/);
      assert.equal(ui.calls().saveCalls, 0);
      await ui.foreground();
      assert.equal(ui.calls().saveCalls, 0);
    } finally { await ui.cleanup(); }
  }
});

test("weekly cooldown prevents editing and displays the server's next allowed time", async () => {
  const ui = await settings({ goal: { can_change_goal: false, next_change_at: "2026-10-10T10:00:00Z" } });
  try {
    const row = ui.renderer.root.findAllByType("Button").find(n => text(n) === "Daily focus goalToday: 60 min");
    assert.equal(row.props.onPress, undefined);
    assert.match(ui.text(), /change your goal again/);
    assert.equal(ui.calls().saveCalls, 0);
  } finally { await ui.cleanup(); }
});

test("older goal APIs fail closed for weekly editing while legacy daily targets remain readable", async () => {
  const api = load("src/services/dailyGoalService.ts", {
    "../../lib/supabase": { supabase: { rpc: async () => ({ data: { ...goalData, today_goal_minutes: 15, weekly_limit_available: undefined }, error: null }) } },
  });
  const result = await api.getDailyGoalSettings();
  assert.equal(result.today_goal_minutes, 15);
  assert.equal(result.weekly_limit_available, false);
  assert.equal(result.can_change_goal, false);
  await assert.rejects(() => api.scheduleDailyGoal(29), /30/);
});
test("Settings keeps the saved target for today when goal editing is unavailable", async () => {
  const ui = await settings({ loadError: true, savedGoal: 90 });
  try {
    assert.match(ui.text(), /Today: 90 min/);
    assert.match(ui.text(), /read-only/);
    assert.equal(ui.calls().saveCalls, 0);
  } finally { await ui.cleanup(); }
});
test("notifications enable explicitly and refresh real status on return from phone settings", async () => {
  const ui = await settings({ permission: reads => reads > 2 ? { label: "Denied after phone settings", action: "settings", supported: true } : { label: "Not allowed", action: "enable", supported: true } });
  try {
    await ui.press("NotificationsNot allowed");
    await ui.press("Enable notifications");
    assert.equal(ui.calls().enableCalls, 1);
    assert.match(ui.text(), /Allowed on this device/);
    await ui.press("Open phone settings");
    assert.equal(ui.calls().phoneCalls, 1);
    await ui.foreground();
    assert.match(ui.text(), /Denied after phone settings/);
    assert.ok(ui.calls().reads >= 3);
  } finally { await ui.cleanup(); }
});
test("unsupported notifications present no misleading enable or phone-settings action", async () => {
  const ui = await settings({ permission: () => ({ label: "Notifications unavailable here", action: null, supported: false }) });
  try {
    await ui.press("NotificationsNotifications unavailable here");
    assert.doesNotMatch(ui.text(), /Enable notifications|Open phone settings/);
    assert.equal(ui.calls().enableCalls, 0);
  } finally { await ui.cleanup(); }
});
test("busy/active/paused/restoring/failed sessions block logout; failure remains retryable", async () => {
  for (const timer of [{ hasOpenSession: true }, { isRestoring: true }, { restoreError: true }, { actionBusy: true }]) {
    const ui = await settings({ timer });
    try {
      await ui.press("Sign outFinish or end your session first");
      await ui.press("Sign out");
      assert.equal(ui.calls().signOutCalls, 0);
    } finally { await ui.cleanup(); }
  }
  const ui = await settings({ logoutError: Error("Offline") });
  try {
    await ui.press("Sign outYour saved progress stays with your account");
    await ui.press("Sign out");
    assert.match(ui.text(), /Could not sign out/);
    await ui.press("Sign out");
    assert.equal(ui.calls().signOutCalls, 2);
  } finally { await ui.cleanup(); }
});
test("goal service validates before requesting a server-computed effective date", async () => {
  const calls = [];
  const api = load("src/services/dailyGoalService.ts", {
    "../../lib/supabase": { supabase: { rpc: async (name, args) => { calls.push([name, args]); return { data: goalData, error: null }; } } },
  });
  await assert.rejects(() => api.scheduleDailyGoal(0));
  assert.equal(calls.length, 0);
  const result = await api.scheduleDailyGoal(90);
  assert.equal(result.next_effective_date, "2026-10-04");
  assert.deepEqual(calls, [["schedule_daily_goal", { p_goal_minutes: 90 }]]);
});
test("onboarding shares all ten badge values and preserves a saved choice on retry", async () => {
  assert.equal(badges.length, 10);
  assert.equal(new Set(badges).size, 10);
  const ui = await screen("src/app/onboarding.tsx", {
    "expo-router": { useRouter: () => ({ replace() {} }) },
    "../context/UserContext": { useUser: () => ({ profile: { username: "Hero", avatar: badges[9], daily_goal_minutes: 60 }, reloadProfile: async () => true }) },
    "../services/onboardingService": { saveOnboardingProfile: async () => { throw Error("Offline"); } },
  });
  try {
    const choices = ui.renderer.root.findAllByType("Button").filter(n => n.props.accessibilityLabel?.startsWith("Choose "));
    assert.equal(choices.length, 10);
    assert.equal(choices.find(n => n.props.accessibilityState.selected).props.accessibilityLabel, "Choose " + badges[9]);
  } finally { await ui.cleanup(); }
});
test("permission interpretation distinguishes quiet, temporary, granted and denied states", () => {
  const api = load("src/services/notificationPermissionService.ts", {
    "react-native": Native, "../utils/sessionNotifications": { getSessionNotifications: () => null },
  });
  assert.equal(api.notificationPermission({ granted: false, ios: { status: 3 } }).label, "Allowed quietly");
  assert.equal(api.notificationPermission({ granted: false, ios: { status: 4 } }).label, "Allowed temporarily");
  assert.equal(api.notificationPermission({ granted: false, canAskAgain: false }).action, "settings");
  assert.equal(api.notificationPermission({ granted: false, canAskAgain: true }).action, "enable");
});
test("today's stored target wins; an unsaved target snapshot never invents an achievement", async () => {
  for (const existing of [null, { user_id: "account", progress_date: "2026-10-03", goal_minutes: 90, completed_minutes: 5, goal_completed: false }]) {
    let reads = 0;
    const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: existing, error: null }) };
    const api = load("src/services/dailyProgressService.ts", {
      "../../lib/supabase": { supabase: { from: () => query } },
      "./dailyGoalService": { getDailyGoalSettings: async () => { reads++; return { ...goalData, today_goal_minutes: 45 }; }, missingGoalAPI: () => false },
    });
    const result = await api.getTodayProgress();
    if (existing) { assert.equal(result, existing); assert.equal(reads, 0); }
    else { assert.equal(result.goal_minutes, 45); assert.equal(result.goal_completed, false); assert.equal(result.completed_minutes, 0); assert.equal(result.is_snapshot, true); }
  }
});
test("legacy projects without goal scheduling retain existing target fallback; real read failures remain errors", async () => {
  for (const code of ["PGRST202", "NETWORK"]) {
    const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) };
    const api = load("src/services/dailyProgressService.ts", {
      "../../lib/supabase": { supabase: { from: () => query } },
      "./dailyGoalService": { getDailyGoalSettings: async () => { throw { code }; }, missingGoalAPI: e => e.code === "PGRST202" },
    });
    if (code === "PGRST202") assert.equal(await api.getTodayProgress(), null);
    else await assert.rejects(() => api.getTodayProgress());
  }
});
test("notification enabling creates the Android channel before prompting and never claims delivery", async () => {
  const calls = [];
  const api = load("src/services/notificationPermissionService.ts", {
    "react-native": Native,
    "../utils/sessionNotifications": { getSessionNotifications: () => ({
      AndroidImportance: { LOW: 2 },
      setNotificationChannelAsync: async () => { calls.push("channel"); },
      requestPermissionsAsync: async () => { calls.push("prompt"); return { granted: true }; },
    }) },
  });
  const result = await api.enableNotifications();
  assert.deepEqual(calls, ["channel", "prompt"]);
  assert.equal(result.label, "Allowed on this device");
});
