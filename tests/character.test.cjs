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
const growth = load("src/utils/characterGrowth.ts");
const area = (id, level, xp) => ({
  id,
  title: `Area ${id}`,
  level,
  current_xp: xp,
  color_code: null,
});
const session = (id, day, seconds = 30) => ({
  id,
  subject_id: 1,
  activity_type: "other",
  duration_seconds: seconds,
  completed_at: `${day}T04:00:00Z`,
  xp_earned: 0,
  gold_earned: 0,
});
test("Life area growth displays the saved level and XP without a second category system", () => {
  for (let level = 1; level <= 20; level++) {
    const original = { ...area(1, level, level * 50 - 1), title: "Knowledge" };
    const value = growth.lifeAreaGrowth(original);
    assert.equal(value.title, "Knowledge");
    assert.equal(value.level, level);
    assert.equal(value.current, original.current_xp);
    assert.equal(value.required, level * 50);
    assert.deepEqual(original, {
      ...area(1, level, level * 50 - 1),
      title: "Knowledge",
    });
  }
});
test("custom Life areas retain their identity and growth without assigning attributes", () => {
  const custom = { ...area(42, 3, 12), title: "Learn Mandarin" };
  assert.deepEqual(growth.lifeAreaGrowth(custom), {
    ...custom,
    current: 12,
    required: 150,
  });
});
test("milestones use exact seconds and deduplicate saved sessions", () => {
  const a = session("a", "2026-10-01", 30),
    b = session("b", "2026-10-01", 3570);
  const result = growth.earnedMilestones(
    [a, a, b, session("zero", "2026-10-02", 0)],
    "Asia/Kuala_Lumpur",
  );
  assert.equal(result.sessions, 2);
  assert.equal(result.seconds, 3600);
  assert.equal(result.days, 1);
  assert.equal(result.milestones.find((m) => m.id === "hour").unlocked, true);
});
test("earned consistency milestones survive a broken current streak", () => {
  const rows = ["01", "02", "03", "07"].map((d, i) =>
    session(String(i), `2026-10-${d}`),
  );
  const result = growth.earnedMilestones(rows, "Asia/Kuala_Lumpur");
  assert.equal(result.bestStreak, 3);
  assert.equal(result.milestones.find((m) => m.id === "return").unlocked, true);
  assert.equal(result.milestones.find((m) => m.id === "week").unlocked, false);
});
const host =
  (name) =>
  ({ children, ...props }) =>
    React.createElement(name, props, children);
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
  PersonalPage: ({ action, children, ...props }) => React.createElement("Page", props, action, children),
  PersonalButton: ({ title, ...props }) =>
    React.createElement("Button", props, title),
  p: {},
};
const text = (node) =>
  typeof node === "string" ? node : (node.children ?? []).map(text).join("");
async function screen(file, mocks) {
  const Component = load(file, {
    "../services/dailyProgressService": { getTodayProgress: async () => null },
    expo: { isRunningInExpoGo: () => false },
    "react-native": Native,
    "react-native-safe-area-context": { SafeAreaView: host("Safe") },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../services/dailyGoalService": { getDailyGoalSettings: async () => ({ local_date: "2026-10-03", next_effective_date: "2026-10-04", today_goal_minutes: 60, next_goal_minutes: 60, timezone: "Asia/Kuala_Lumpur", pending: false }), scheduleDailyGoal: async () => { throw Error("Not configured"); } },
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
          .find((n) => n.props.title === title || n.props.accessibilityLabel === title || text(n) === title)
          .props.onPress(),
      ),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
test("registration confirms email without claiming an authenticated session", async () => {
  let calls = 0;
  const ui = await screen("src/components/AuthScreen.tsx", {
    "../context/AuthContext": {
      useAuth: () => ({
        signUp: async () => {
          calls++;
          return { needsEmailConfirmation: true };
        },
      }),
    },
  });
  try {
    await ui.press("New here? Create an account");
    await ui.input("Email", "person@example.com");
    await ui.input("Password", "password");
    await ui.press("Create account");
    assert.equal(calls, 1);
    assert.match(ui.text(), /If registration can be completed/);
    assert.match(ui.text(), /Sign in/);
  } finally {
    await ui.cleanup();
  }
});
test("failed login exposes error, preserves inputs and allows retry", async () => {
  let calls = 0;
  const ui = await screen("src/components/AuthScreen.tsx", {
    "../context/AuthContext": {
      useAuth: () => ({
        signIn: async () => {
          if (++calls === 1) throw Error("Offline");
          return { error: null };
        },
      }),
    },
  });
  try {
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 0);
    await ui.input("Email", "person@example.com");
    await ui.input("Password", "password");
    const surface = ui.renderer.root.findAllByType("View").find(n => n.props.testID === "auth-surface");
    await act(async () => surface.props.onLayout({ nativeEvent: { layout: { height: 450 } } }));
    assert.equal(ui.renderer.root.findAllByType("Portrait").length, 0);
    assert.match(ui.text(), /Welcome back/);
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 0);
    await ui.press("Sign in");
    assert.match(ui.text(), /Offline/);
    assert.equal(
      ui.renderer.root.findAllByType("Input")[1].props.value,
      "password",
    );
    await ui.press("Sign in");
    assert.equal(calls, 2);
    await act(async () => surface.props.onLayout({ nativeEvent: { layout: { height: 800 } } }));
    assert.equal(ui.renderer.root.findAllByType("Portrait").length, 1);
  } finally {
    await ui.cleanup();
  }
});
test("rapid sign-in taps submit once", async () => {
  let resolve,
    calls = 0;
  const promise = new Promise((r) => {
    resolve = r;
  });
  const ui = await screen("src/components/AuthScreen.tsx", {
    "../context/AuthContext": {
      useAuth: () => ({
        signIn: () => {
          calls++;
          return promise;
        },
      }),
    },
  });
  try {
    await ui.input("Email", "person@example.com");
    await ui.input("Password", "password");
    const handler = ui.renderer.root
      .findAllByType("Button")
      .find((b) => text(b) === "Sign in").props.onPress;
    await act(async () => {
      handler();
      handler();
    });
    assert.equal(calls, 1);
    await act(async () => resolve({ error: null }));
  } finally {
    await ui.cleanup();
  }
});
test("onboarding failure keeps choices and retries before entering tutorial", async () => {
  let attempts = 0;
  const routes = [];
  const ui = await screen("src/app/onboarding.tsx", {
    "expo-router": {
      useRouter: () => ({ replace: (route) => routes.push(route) }),
    },
    "../context/UserContext": {
      useUser: () => ({
        profile: { username: "Hero", avatar: "🌱", daily_goal_minutes: 60 },
        reloadProfile: async () => true,
      }),
    },
    "../services/onboardingService": {
      saveOnboardingProfile: async () => {
        if (++attempts === 1) throw Error("Offline");
      },
    },
  });
  try {
    await ui.input("Your name", "Soon Teck");
    await ui.press("Continue to the introduction");
    assert.match(ui.text(), /Couldn’t save/);
    assert.deepEqual(routes, []);
    await ui.press("Continue to the introduction");
    assert.deepEqual(routes, ["/tutorial"]);
  } finally {
    await ui.cleanup();
  }
});
test("new users finish tutorial before Home; failed finish can retry", async () => {
  let calls = 0;
  const routes = [];
  const ui = await screen("src/app/tutorial.tsx", {
    "expo-router": {
      useRouter: () => ({ replace: (route) => routes.push(route) }),
    },
    "../context/UserContext": {
      useUser: () => ({
        profile: { onboarding_completed: false },
        reloadProfile: async () => true,
      }),
    },
    "../services/onboardingService": {
      finishOnboarding: async () => {
        if (++calls === 1) throw Error("Offline");
      },
    },
  });
  try {
    for (let i = 0; i < 4; i++) await ui.press("Continue");
    assert.deepEqual(routes, []);
    await ui.press("Start my journey");
    assert.match(ui.text(), /Couldn’t finish setup/);
    await ui.press("Start my journey");
    assert.deepEqual(routes, ["/"]);
    assert.equal(calls, 2);
  } finally {
    await ui.cleanup();
  }
});
test("replaying tutorial returns without writing onboarding again", async () => {
  let calls = 0,
    back = 0;
  const ui = await screen("src/app/tutorial.tsx", {
    "expo-router": {
      useRouter: () => ({ canGoBack: () => true, back: () => back++ }),
    },
    "../context/UserContext": {
      useUser: () => ({ profile: { onboarding_completed: true } }),
    },
    "../services/onboardingService": { finishOnboarding: async () => calls++ },
  });
  try {
    for (let i = 0; i < 4; i++) await ui.press("Continue");
    await ui.press("Done");
    assert.equal(calls, 0);
    assert.equal(back, 1);
  } finally {
    await ui.cleanup();
  }
});
async function userProviderHarness({ updateError = null, stored = null } = {}) {
  let value;
  const writes = [];
  const row = {
    id: "user-1",
    username: "Soon",
    avatar: "🌱",
    class_title: "Scholar",
    onboarding_completed: true,
    timezone: "Asia/Kuala_Lumpur",
    level: 1,
    current_xp: 0,
    gold: 0,
  };
  const storage = {
    getItem: async () => stored,
    setItem: async (key, payload) => {
      writes.push([key, JSON.parse(payload)]);
    },
  };
  const user = { id: "user-1" };
  const module = load("src/context/UserContext.tsx", {
    "./AuthContext": { useAuth: () => ({ user }) },
    "@react-native-async-storage/async-storage": storage,
    "../../lib/supabase": {
      supabase: {
        from: () => {
          let update = null;
          const q = {
            select: () => q,
            eq: () => q,
            update: (payload) => {
              update = payload;
              return q;
            },
            single: async () =>
              update
                ? {
                    data: updateError ? null : { id: row.id, ...update },
                    error: updateError,
                  }
                : { data: row, error: null },
          };
          return q;
        },
      },
    },
  });
  function Consumer() {
    value = module.useUser();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        module.UserProvider,
        null,
        React.createElement(Consumer),
      ),
    );
  });
  return {
    value: () => value,
    writes,
    run: async (fn) => act(async () => fn(value)),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
test("profile save propagates failure instead of falsely reporting success", async () => {
  const ui = await userProviderHarness({ updateError: Error("Offline") });
  try {
    await assert.rejects(
      ui.value().updateProfile("Changed", "🌱", "Scholar"),
      /Offline/,
    );
    assert.equal(ui.value().profile.username, "Soon");
  } finally {
    await ui.cleanup();
  }
});
test("profile save waits for the saved row and updates the current identity", async () => {
  const ui = await userProviderHarness();
  try {
    await ui.run((v) => v.updateProfile(" Changed ", "⭐", "Scholar"));
    assert.equal(ui.value().profile.username, "Changed");
    assert.equal(ui.value().profile.avatar, "⭐");
  } finally {
    await ui.cleanup();
  }
});
test("device preferences restore and rapid different toggles persist their final values", async () => {
  const ui = await userProviderHarness({
    stored: JSON.stringify({ sound: true, haptics: true }),
  });
  try {
    await ui.run((v) => {
      v.setSoundEnabled(false);
      v.setHapticsEnabled(false);
    });
    assert.equal(ui.value().soundEnabled, false);
    assert.equal(ui.value().hapticsEnabled, false);
    assert.deepEqual(ui.writes.at(-1), [
      "liferpg:preferences:user-1",
      { sound: false, haptics: false },
    ]);
  } finally {
    await ui.cleanup();
  }
});
function mockSheet(props) {
  return React.createElement(
    "Sheet",
    props,
    props.visible ? [props.header, props.children, props.overlay] : null,
  );
}
const sheetMocks = {
  "../components/AppSheet": mockSheet,
  "../components/SheetConfirmation": host("Confirmation"),
  "@gorhom/bottom-sheet": {
    BottomSheetScrollView: host("SheetScroll"),
    BottomSheetTextInput: host("Input"),
    TouchableOpacity: host("Button"),
  },
};
async function rewardsHarness(options = {}) {
  const calls = [];
  let growth = {
    data: { areas: [], sessions: [session("s", "2026-10-01", 30)] },
    loading: false,
    error: false,
    refresh: async () => {
      calls.push("milestones-refresh");
    },
    ...options.growth,
  };
  const ui = await screen("src/app/rewards.tsx", {
    ...sheetMocks,
    "../components/AppSheet": (props) =>
      React.createElement("Sheet", props, props.header, props.children),
    "expo-router": { useFocusEffect: (fn) => React.useEffect(fn, [fn]) },
    "../context/UserContext": {
      useUser: () => ({
        profile: {
          id: "a",
          timezone: "Asia/Kuala_Lumpur",
          daily_goal_minutes: 60,
          gold: 500,
        },
      }),
    },
    "../context/TimerContext": { useTimer: () => ({ sessionSummary: null }) },
    "../hooks/useCharacterData": { useCharacterData: () => growth },
    "../services/rewardService": new Proxy(
      {},
      {
        get() {
          throw Error("Milestones must not call the reward shop");
        },
      },
    ),
    "../services/dailyProgressService": {
      getTodayProgress:
        options.getTodayProgress ??
        (async () => ({
          completed_minutes: 0,
          goal_minutes: 60,
          goal_completed: false,
        })),
    },
  });
  return { ...ui, calls };
}
test("milestones unlock automatically without personal reward creation, prices or claims", async () => {
  const ui = await rewardsHarness();
  try {
    assert.match(ui.text(), /Your collection/);
    assert.match(ui.text(), /First step/);
    assert.match(ui.text(), /Earned · Yours to keep/);
    assert.doesNotMatch(
      ui.text(),
      /Add a personal reward|Personal rewards|Gold|Claim daily bonus|Redeem/,
    );
    assert.equal(ui.calls.length, 0);
  } finally {
    await ui.cleanup();
  }
});
test("a sub-minute completed session earns a milestone before the independent daily goal", async () => {
  const ui = await rewardsHarness();
  try {
    const first = ui.renderer.root
      .findAllByType("Button")
      .find((n) => n.props.accessibilityLabel?.startsWith("First step,"));
    assert.match(first.props.accessibilityLabel, /earned/);
    assert.match(ui.text(), /0m \/ 60 min/);
    assert.doesNotMatch(ui.text(), /Daily goal achieved/);
    await act(async () => first.props.onPress());
    assert.match(ui.text(), /Earned automatically/);
  } finally {
    await ui.cleanup();
  }
});
test("milestone details stay mounted through dismissal and re-entry waits for native dismissal", async () => {
  const ui = await rewardsHarness();
  try {
    const rows = ui.renderer.root
      .findAllByType("Button")
      .filter((n) => n.props.accessibilityLabel?.includes("View milestone"));
    await act(async () => rows[0].props.onPress());
    const title =
      ui.renderer.root.findByType("Sheet").props.header.props.children.props
        .children;
    await act(async () =>
      ui.renderer.root.findByType("Sheet").props.onRequestClose(),
    );
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    assert.equal(
      ui.renderer.root.findByType("Sheet").props.header.props.children.props
        .children,
      title,
    );
    assert.match(ui.text(), /Earned automatically/);
    await act(async () => rows[1].props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    await act(async () =>
      ui.renderer.root.findByType("Sheet").props.onDismiss(),
    );
    await act(async () => rows[1].props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true);
    assert.match(ui.text(), /You’re making progress/);
  } finally {
    await ui.cleanup();
  }
});
test("daily-goal read failure is retryable and does not hide earned milestones", async () => {
  let attempts = 0;
  const ui = await rewardsHarness({
    getTodayProgress: async () => {
      if (++attempts === 1) throw Error("Offline");
      return { completed_minutes: 60, goal_minutes: 60, goal_completed: true };
    },
  });
  try {
    assert.match(ui.text(), /Couldn’t refresh today’s goal/);
    assert.match(ui.text(), /First step/);
    await ui.press("Retry today’s goal");
    assert.equal(attempts, 2);
    assert.match(ui.text(), /Daily goal achieved/);
    assert.doesNotMatch(ui.text(), /Couldn’t refresh today’s goal/);
  } finally {
    await ui.cleanup();
  }
});
test("a new day with no saved goal row shows the user's goal without inventing an achievement", async () => {
  const ui = await rewardsHarness({ getTodayProgress: async () => null });
  try {
    assert.match(ui.text(), /0m \/ 60 min/);
    assert.doesNotMatch(
      ui.text(),
      /Daily goal achieved|Couldn’t refresh today’s goal/,
    );
  } finally {
    await ui.cleanup();
  }
});
test("milestone refresh failure preserves the already-loaded collection with Retry", async () => {
  const ui = await rewardsHarness({ growth: { error: true } });
  try {
    assert.match(ui.text(), /previously loaded achievements/);
    assert.match(ui.text(), /First step/);
    await ui.press("Retry milestones");
    assert.deepEqual(ui.calls, ["milestones-refresh"]);
  } finally {
    await ui.cleanup();
  }
});
test("Settings prevents logout while a session is running, paused or unresolved", async () => {
  for (const timer of [
    { hasOpenSession: true },
    { isRestoring: true },
    { restoreError: true },
  ]) {
    let calls = 0;
    const ui = await screen("src/app/settings.tsx", {
      ...sheetMocks,
      "expo-router": { useRouter: () => ({ navigate() {} }) },
      "expo-notifications": {
        getPermissionsAsync: async () => ({ granted: true }),
      },
      "../context/UserContext": {
        useUser: () => ({
          profile: { username: "Soon", timezone: "Asia/Kuala_Lumpur" },
        }),
      },
      "../context/AuthContext": {
        useAuth: () => ({
          user: { email: "a@b.com" },
          signOut: async () => {
            calls++;
            return {};
          },
        }),
      },
      "../context/TimerContext": { useTimer: () => timer },
      "../hooks/useReducedMotion": { useReducedMotion: () => true },
    });
    try {
      const row = ui.renderer.root
        .findAllByType("Button")
        .find((b) => text(b).startsWith("Sign out"));
      await act(async () => row.props.onPress());
      const confirm = ui.renderer.root
        .findAllByType("Button")
        .find((b) => text(b) === "Sign out");
      assert.equal(confirm.props.disabled, true);
      await act(async () => confirm.props.onPress());
      assert.equal(calls, 0);
    } finally {
      await ui.cleanup();
    }
  }
});
test("auth restoration cannot overwrite a newer sign-in event; logout is device-local", async () => {
  let resolve, listener, value, scope;
  const restore = new Promise((r) => {
    resolve = r;
  });
  const auth = {
    getUser: async () => ({ data: { user: { id: "new" } }, error: null }),
    getSession: () => restore,
    onAuthStateChange: (callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signOut: async (options) => {
      scope = options.scope;
      return { error: null };
    },
  };
  const module = load("src/context/AuthContext.tsx", {
    "expo-linking": { createURL: () => "liferpg://auth/recovery", getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) },
    "react-native": { Platform: { OS: "android" } },
    "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    "../../lib/supabase": { supabase: { auth } },
  });
  function Consumer() {
    value = module.useAuth();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        module.AuthProvider,
        null,
        React.createElement(Consumer),
      ),
    );
  });
  try {
    await act(async () => listener("SIGNED_IN", { user: { id: "new" }, access_token: "fixture", refresh_token: "fixture" }));
    await act(async () => resolve({ data: { session: null }, error: null }));
    assert.equal(value.user.id, "new");
    await value.signOut();
    assert.equal(scope, "local");
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("Android Expo Go never evaluates the notification package entry", () => {
  const api = load("src/utils/sessionNotifications.ts", {
    expo: { isRunningInExpoGo: () => true },
    "react-native": { Platform: { OS: "android" } },
    // If the loader evaluates this entry, the test fails immediately.
    get "expo-notifications"() {
      throw Error("Push entry was evaluated");
    },
  });
  assert.equal(api.getSessionNotifications(), null);
});
test("development/release builds load and reuse the notification API", () => {
  let imports = 0;
  const notifications = {
    getPermissionsAsync: async () => ({ granted: true }),
  };
  const api = load("src/utils/sessionNotifications.ts", {
    expo: { isRunningInExpoGo: () => false },
    "react-native": { Platform: { OS: "android" } },
    get "expo-notifications"() {
      imports++;
      return notifications;
    },
  });
  assert.equal(api.getSessionNotifications(), notifications);
  assert.equal(api.getSessionNotifications(), notifications);
  assert.equal(imports, 1);
});
test("Settings renders in Expo Go even when notification import would throw", async () => {
  const ui = await screen("src/app/settings.tsx", {
    ...sheetMocks,
    expo: { isRunningInExpoGo: () => true },
    "expo-router": { useRouter: () => ({ navigate() {} }) },
    "../context/UserContext": {
      useUser: () => ({
        profile: { username: "Soon", timezone: "Asia/Kuala_Lumpur" },
      }),
    },
    "../context/AuthContext": {
      useAuth: () => ({
        user: { email: "a@b.com" },
        signOut: async () => ({}),
      }),
    },
    "../context/TimerContext": { useTimer: () => ({}) },
    "../utils/sessionNotifications": { getSessionNotifications: () => null },
  });
  try {
    const row = ui.renderer.root
      .findAllByType("Button")
      .find((b) => text(b).startsWith("Notifications"));
    await act(async () => row.props.onPress());
    assert.match(ui.text(), /unavailable here/);
  } finally {
    await ui.cleanup();
  }
});

async function profileScreen(overrides = {}) {
  return screen("src/app/(tabs)/profile.tsx", {
    "expo-router": {
      useRouter: () => ({ navigate() {} }),
      useFocusEffect: (effect) => React.useEffect(effect, [effect]),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 34 }),
    },
    "../../components/PersonalUI": UI,
    "../../components/CharacterPortrait": host("Portrait"),
    "../../components/SheetConfirmation": host("Confirm"),
    "../../components/AppSheet": (props) =>
      React.createElement(
        "Sheet",
        props,
        props.header,
        props.children,
        props.footer,
        props.overlay,
      ),
    "@gorhom/bottom-sheet": {
      BottomSheetScrollView: host("SheetScroll"),
      BottomSheetTextInput: host("Input"),
      TouchableOpacity: host("Button"),
    },
    "../../context/UserContext": {
      useUser: () => ({
        profile: {
          id: "user",
          username: "Soon",
          avatar: "⭐",
          class_title: "",
          level: 3,
          current_xp: 20,
          timezone: "Asia/Kuala_Lumpur",
        },
        updateProfile: async () => {},
        reloadProfile: async () => {},
      }),
    },
    "../../hooks/useCharacterData": {
      useCharacterData: () => ({
        data: {
          areas: [{ id: 1, title: "Knowledge", level: 2, current_xp: 12 }],
          sessions: [],
        },
        loading: false,
        error: false,
        refresh: async () => {},
      }),
    },
    ...overrides,
  });
}
test("Profile displays saved Life areas directly and keeps Save outside the scrolling editor", async () => {
  const ui = await profileScreen();
  try {
    assert.match(ui.text(), /Your Life areas/);
    assert.match(ui.text(), /KnowledgeLv 2/);
    assert.doesNotMatch(
      ui.text(),
      /Connect areas|No Life areas connected|Explore your progress/,
    );
    await ui.press("Personalise profile");
    const sheet = ui.renderer.root.findByType("Sheet");
    assert.equal(sheet.props.compact, true);
    assert.equal(sheet.props.guardDismiss, false);
    const scroll = ui.renderer.root.findByType("SheetScroll");
    assert.equal(
      scroll
        .findAllByType("Button")
        .some((n) => n.props.title === "Save changes"),
      false,
    );
    assert.ok(sheet.props.footer);
    assert.equal(sheet.props.footer.props.style.paddingBottom, 34);
    assert.equal(scroll.props.enableFooterMarginAdjustment, true);
    await ui.press("Save changes");
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    // The editor is retained for the library's downward exit; it never switches to another layout.
    assert.equal(ui.renderer.root.findByType("Input").props.value, "Soon");
  } finally {
    await ui.cleanup();
  }
});
test("Profile protects edited drafts and preserves the editor through discard dismissal", async () => {
  const ui = await profileScreen();
  try {
    await ui.press("Personalise profile");
    await ui.input("Profile name", "New name");
    assert.equal(ui.renderer.root.findByType("Sheet").props.guardDismiss, true);
    await act(async () =>
      ui.renderer.root.findByType("Sheet").props.onRequestClose(),
    );
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true);
    await act(async () =>
      ui.renderer.root.findByType("Confirm").props.onConfirm(),
    );
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    assert.equal(ui.renderer.root.findByType("Input").props.value, "New name");
  } finally {
    await ui.cleanup();
  }
});

test("Android secondary page retains its contents until animated back finishes and ignores repeated back", async () => {
  let finish, remove;
  const calls = [];
  const navigation = {
    canGoBack: () => true,
    goBack: () => calls.push("back"),
  };
  const { PersonalPage } = load("src/components/PersonalUI.tsx", {
    "react-native": {
      ...Native,
      StyleSheet: { create: (s) => s },
      useWindowDimensions: () => ({ width: 360 }),
      Animated: {
        Value: class {
          constructor(v) {
            this.value = v;
          }
          setValue(v) {
            this.value = v;
          }
        },
        View: host("Animated"),
        timing: (value, config) => ({
          start(callback) {
            if (config.toValue === 360) finish = callback;
            else {
              value.setValue(config.toValue);
              callback?.({ finished: true });
            }
          },
          stop() {},
        }),
      },
    },
    "expo-router": {
      useRouter: () => ({
        canGoBack: () => true,
        back: () => calls.push("router-back"),
      }),
      useNavigation: () => navigation,
    },
    "expo-router/react-navigation": {
      usePreventRemove: (_, callback) => {
        remove = callback;
      },
    },
    "react-native-safe-area-context": {
      SafeAreaView: host("Safe"),
      useSafeAreaInsets: () => ({ bottom: 24 }),
    },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "../hooks/useReducedMotion": { useReducedMotion: () => false },
    "./AppHeader": host("Header"),
  });
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        PersonalPage,
        {
          title: "Rewards",
          subtitle: "Your effort",
          back: true,
          animateTransition: true,
        },
        React.createElement("Text", null, "Saved rewards"),
      ),
    );
  });
  try {
    await act(async () => renderer.root.findByType("Header").props.onBack());
    await act(async () => remove());
    assert.equal(calls.length, 0);
    assert.match(text(renderer.root), /Saved rewards/);
    await act(async () => finish({ finished: true }));
    assert.deepEqual(calls, ["back"]);
    assert.match(text(renderer.root), /Saved rewards/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("character wave is cosmetic and respects reduced motion", async () => {
  for (const reduced of [false, true]) {
    const animations = [];
    const Portrait = load("src/components/CharacterPortrait.tsx", {
      "react-native": {
        ...Native,
        StyleSheet: { create: (s) => s },
        Animated: {
          Value: class {
            setValue() {}
            stopAnimation() {}
            interpolate() {
              return 0;
            }
          },
          View: host("Animated"),
          timing: (_, config) => ({
            start() {
              animations.push(config);
            },
          }),
        },
      },
      "../hooks/useReducedMotion": { useReducedMotion: () => reduced },
    }).default;
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(Portrait, { avatar: "⭐", level: 3, developed: 2 }),
      );
    });
    try {
      await act(async () => renderer.root.findByType("Button").props.onPress());
      assert.equal(animations.length, reduced ? 0 : 1);
      assert.match(
        renderer.root.findByType("Button").props.accessibilityLabel,
        /Level 3/,
      );
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});
