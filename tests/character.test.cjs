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
      if (name === "react-native-reanimated") return {__esModule:true,default:{View:props=>React.createElement("Animated",props,props.children)}};
      if (name.endsWith("/useCharacterMotion")) return {useCharacterMotion:()=>({bodyStyle:{},eyeStyle:{},armStyle:{},greet(){}})};
      if (name.endsWith("/FeatureTour")) return {FeatureTourProvider: props=>props.children, TourAnchor: props=>props.children, TourScrollView: mocks["react-native"]?.ScrollView || (props=>React.createElement("ScrollView",props,props.children)), useFeatureTour:()=>({start(){}}), prepareFeatureTour:async()=>{}};
      if (name.endsWith("/DailyGoalSheet")) return props=>React.createElement("GoalSheet",props);
      if (name.endsWith("/OnboardingFrame")) return require("./onboarding-mocks.cjs").frame(React);
      if (name.endsWith("/OnboardingFinish")) return require("./onboarding-mocks.cjs").finish(React);
      if (name.endsWith("/OnboardingWelcome")) return require("./onboarding-mocks.cjs").finish(React);
      if (["/GuidedPreferenceSheet", "/SaveSuggestedQuest", "/GuidedFocusCard"].some(suffix => name.endsWith(suffix))) return props => React.createElement("GuidedBoundary", props);
      if (name === "@react-native-async-storage/async-storage") return { getItem: async () => null, setItem: async () => {} };
      if (name.endsWith("/MotionPressable")) return mocks["react-native"]?.Pressable || mocks["react-native"]?.TouchableOpacity || (props => React.createElement("Button", props, props.children));
      if (name.endsWith("/GlassSurface")) return props => React.createElement("View", {...props, testID:"glass-surface"});
      if (name.endsWith("/SlidingSelection")) return props => React.createElement("View", {...props, style:[props.style,{left:props.index === 0 ? "0%" : "50%"}]});
      if (name === "expo-router/js-tabs") return {useBottomTabBarHeight: () => 90};
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
  StyleSheet: {create: value=>value,hairlineWidth:1},
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
test("onboarding failure keeps choices and retries before entering Home", async () => {
  let attempts = 0;
  const routes = [];
  const ui = await screen("src/app/onboarding.tsx", {
    "expo-router": {
      useRouter: () => ({ replace: (route) => routes.push(route) }),
    },
    "../context/UserContext": {
      useUser: () => ({
        profile: { id: "onboarding-account", username: "Hero", avatar: "🌱", daily_goal_minutes: 60 },
        reloadProfile: async () => true,
      }),
    },
    "../services/onboardingService": {
      saveOnboardingProfile: async () => {
        if (++attempts === 1) throw Error("Offline");
      },
      finishOnboarding: async () => {},
    },
  });
  try {
    await ui.press("Continue");
    await ui.press("Continue");
    await ui.input("Your name", "Soon Teck");
    await ui.press("Continue");
    await ui.press("Continue");
    await ui.press("Continue");
    await ui.press("Continue");
    await ui.press("Start my journey");
    assert.match(ui.text(), /Couldn’t save/);
    assert.deepEqual(routes, []);
    await ui.press("Start my journey");
    assert.deepEqual(routes, ["/"]);
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
        profile: { id: "new-user", username: "Soon", daily_goal_minutes: 60, onboarding_completed: false },
        reloadProfile: async () => true,
      }),
    },
    "../services/onboardingService": {
      saveOnboardingProfile: async () => {},
      finishOnboarding: async () => {
        if (++calls === 1) throw Error("Offline");
      },
    },
  });
  try {
    for (let i = 0; i < 2; i++) await ui.press("Continue");
    assert.deepEqual(routes, []);
    await ui.press("Start my journey");
    assert.match(ui.text(), /Couldn’t save your setup/);
    await ui.press("Start my journey");
    assert.deepEqual(routes, ["/"]);
    assert.equal(calls, 2);
  } finally {
    await ui.cleanup();
  }
});
test("existing introduction links open the static guide without changing onboarding", async () => {
 let writes=0;const routes=[];const ui=await screen("src/app/tutorial.tsx",{"expo-router":{useRouter:()=>({replace:route=>routes.push(route)})},"../context/UserContext":{useUser:()=>({profile:{onboarding_completed:true}})},"../services/onboardingService":{finishOnboarding:async()=>writes++}});
 assert.deepEqual(routes,["./guide"]);assert.equal(writes,0);await ui.cleanup();
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
    "../../context/TimerContext": {useTimer: () => ({})},
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
    assert.match(ui.text(), /Your focus areas/);
    assert.match(ui.text(), /LearningLv 2/);
    assert.doesNotMatch(
      ui.text(),
      /Connect areas|No Life areas connected|Explore your progress/,
    );
    await ui.press("Personalise profile");
    const sheet = ui.renderer.root.findByType("Sheet");
    assert.notEqual(sheet.props.compact, true);
    assert.equal(sheet.props.expanded, true);
    assert.equal(sheet.props.motionMode, "timed");
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

test("character greeting is cosmetic while automatic motion needs no tap",async()=>{
 let greetings=0;
 const Portrait=load("src/components/CharacterPortrait.tsx",{
  "react-native":Native,
  "../hooks/useCharacterMotion":{useCharacterMotion:()=>({bodyStyle:{transform:[{translateY:-2}]},eyeStyle:{transform:[{scaleY:1}]},armStyle:{},greet:()=>greetings++})},
 }).default;
 let renderer;await act(async()=>{renderer=create(React.createElement(Portrait,{avatar:"⭐",level:3,developed:2}));});
 try{
  assert.equal(greetings,0);assert.match(renderer.root.findByType("Button").props.accessibilityHint,/breathes and blinks/);
  await act(async()=>renderer.root.findByType("Button").props.onPress());assert.equal(greetings,1);
  assert.match(renderer.root.findByType("Button").props.accessibilityLabel,/Level 3/);
 }finally{await act(async()=>renderer.unmount());}
});

test("every saved badge selects a full look and Home shares the same drawing",async()=>{
 const catalogue=load("src/constants/characterLooks.ts"),appearance=load("src/utils/characterAppearance.ts");
 assert.deepEqual(catalogue.CHARACTER_LOOKS.map(look=>look.id),load("src/constants/characterBadges.ts").CHARACTER_BADGES);
 assert.equal(new Set(catalogue.CHARACTER_LOOKS.map(look=>look.body)).size,10);
 assert.equal(new Set(catalogue.CHARACTER_LOOKS.map(look=>look.accessory)).size,10);
 assert.equal(appearance.characterLook("🧙").id,"🧙‍♂️");assert.ok(appearance.characterLook("legacy badge"));
 const Mark=load("src/components/CharacterMark.tsx",{"react-native":Native}).default;
 let renderer;await act(async()=>{renderer=create(React.createElement(Mark,{avatar:"⭐",size:58}));});
 const part=id=>renderer.root.findAllByType("View").find(node=>node.props.testID===id);
 try{
  const canvas=part("character-canvas");assert.equal(canvas.props.style.left+canvas.props.style.width/2,29);
  const body=part("character-body").props.style[1].backgroundColor,head=part("character-head").props.style[1].backgroundColor;
  await act(async()=>renderer.update(React.createElement(Mark,{avatar:"🧑‍💻",size:58})));
  assert.notEqual(part("character-body").props.style[1].backgroundColor,body);assert.notEqual(part("character-head").props.style[1].backgroundColor,head);
  assert.doesNotMatch(text(renderer.root),/⭐|🧑‍💻/);
 }finally{await act(async()=>renderer.unmount());}
 const Picker=load("src/components/CharacterLookPicker.tsx",{"react-native":Native,"@gorhom/bottom-sheet":{TouchableOpacity:host("Button")},"@expo/vector-icons":{Ionicons:host("Icon")}}).default;
 await act(async()=>{renderer=create(React.createElement(Picker,{value:"🦊",disabled:false,onChange(){}}));});
 try{assert.equal(renderer.root.findAllByType("Button").filter(node=>node.props.accessibilityState.checked).length,1);assert.equal(renderer.root.findAllByType("Button").find(node=>node.props.accessibilityState.checked).props.accessibilityLabel,"Choose Ember");}
 finally{await act(async()=>renderer.unmount());}
});

test("idle motion cancels directly on frozen-tab blur, background and Reduce Motion",async()=>{
 let appState,reduced=false,focused=true,enabled=true,motion;const listeners={};
 const native={AppState:{currentState:'active',addEventListener:(_event,listener)=>{appState=state=>{native.AppState.currentState=state;listener(state);};return{remove(){}};}}};
 const navigation={isFocused:()=>focused,addListener:(event,listener)=>{listeners[event]=listener;return()=>{delete listeners[event];};}};
 const context=React.createContext(undefined),fake=require('./character-motion-mocks.cjs').motionApi(React,host);
 const hook=load('src/hooks/useCharacterMotion.ts',{'react-native':native,'expo-router/react-navigation':{NavigationContext:context},'react-native-reanimated':fake.api,'./useReducedMotion':{useReducedMotion:()=>reduced}}).useCharacterMotion;
 function Consumer(){motion=hook(enabled);return null;}
 const element=()=>React.createElement(context.Provider,{value:navigation},React.createElement(Consumer));
 let renderer;await act(async()=>{renderer=create(element());});
 try{
  const repeats=()=>fake.events.filter(event=>event.kind==='repeat');assert.equal(repeats().length,2);assert.equal(repeats()[0].count,-1);assert.equal(repeats()[1].animation.items[0].delay,4300);
  focused=false;listeners.blur();assert.equal(fake.values[0].get(),0);assert.equal(fake.values[1].get(),1);
  let count=repeats().length;appState('background');appState('active');assert.equal(repeats().length,count,'backgrounded or unfocused screens cannot restart motion');
  focused=true;listeners.focus();assert.equal(repeats().length,count+2);
  reduced=true;count=repeats().length;await act(async()=>renderer.update(element()));assert.equal(repeats().length,count);assert.equal(fake.values[0].get(),0);assert.equal(fake.values[1].get(),1);
  reduced=false;enabled=false;await act(async()=>renderer.update(element()));assert.equal(repeats().length,count);
 }finally{await act(async()=>renderer.unmount());}
 // Auth renders before the app navigator: no navigation context is required.
 const before=fake.events.filter(event=>event.kind==='repeat').length;
 enabled=true;await act(async()=>{renderer=create(React.createElement(Consumer));});
 assert.equal(fake.events.filter(event=>event.kind==='repeat').length,before+2);await act(async()=>renderer.unmount());
});

test("shared typography uses iOS System, keeps text readable and preserves exact timer line height", async () => {
  const AppText=load("src/components/AppText.tsx",{"react-native":{...Native,Platform:{OS:"ios"}}}).Text;
  let renderer;
  await act(async()=>{renderer=create(React.createElement(AppText,{style:{fontSize:11,lineHeight:16}},"Caption"));});
  try {
    let style=Object.assign({},...renderer.root.findByType("Text").props.style.filter(Boolean));
    assert.equal(style.fontFamily,"System"); assert.equal(style.fontSize,13); assert.ok(style.lineHeight>=18);
    await act(async()=>renderer.update(React.createElement(AppText,{allowFontScaling:false,style:{fontSize:60,lineHeight:75,height:75}},"25:00")));
    style=Object.assign({},...renderer.root.findByType("Text").props.style.filter(Boolean));
    assert.equal(style.lineHeight,75); assert.equal(style.height,75);
  } finally {await act(async()=>renderer.unmount());}
});

test("profile editing preserves spaces and uses the same 15-character boundary as onboarding",async()=>{
 const ui=await userProviderHarness();
 try {
  await ui.run(v=>v.updateProfile('  Soon Teck  ','⭐','Scholar'));assert.equal(ui.value().profile.username,'Soon Teck');
  await ui.run(v=>v.updateProfile('A'.repeat(15),'⭐','Scholar'));assert.equal(ui.value().profile.username.length,15);
  for(const invalid of [' ','A'.repeat(16)])await assert.rejects(ui.value().updateProfile(invalid,'⭐','Scholar'),/1 and 15/);
  assert.equal(ui.value().profile.username.length,15);
 }finally{await ui.cleanup();}
 const names=load('src/constants/profile.ts');assert.equal(load('src/constants/onboarding.ts').ONBOARDING_NAME_LIMIT,names.PROFILE_NAME_LIMIT);
});

test("profile name input fills the keyboard-safe parent and rejects over-limit pasted drafts beside the field",async()=>{
 const saves=[];const ui=await profileScreen({'../../context/UserContext':{useUser:()=>({profile:{id:'u',username:'Soon Teck',avatar:'⭐',class_title:'Scholar',level:1,current_xp:0,timezone:'Asia/Kuala_Lumpur'},updateProfile:async(...args)=>saves.push(args),reloadProfile:async()=>{}})}});
 try{
  await ui.press('Personalise profile');assert.equal(ui.renderer.root.findByType('Sheet').props.keyboardBehavior,'fillParent');
  assert.equal(ui.renderer.root.findByType('Input').props.maxLength,15);assert.ok(ui.renderer.root.findByType('Input').props.onFocus);
  await ui.input('Profile name','A'.repeat(16));await ui.press('Save changes');assert.equal(saves.length,0);assert.match(ui.text(),/1 and 15/);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,true);
  await ui.input('Profile name','Soon Teck');await ui.press('Save changes');assert.equal(saves[0][0],'Soon Teck');
 }finally{await ui.cleanup();}
});

test("onboarding profile validation rejects too-long names before the RPC and preserves internal spaces",async()=>{
 const queries=[];const api=load('src/services/onboardingService.ts',{'../../lib/supabase':{supabase:{rpc:async(name,args)=>{queries.push([name,args]);return {data:true,error:null};}}}});
 await assert.rejects(api.saveOnboardingProfile('A'.repeat(16),'⭐','Scholar',60),/1 and 15/);assert.equal(queries.length,0);
 await api.saveOnboardingProfile('  Soon Teck  ','⭐','Scholar',60);assert.equal(queries[0][0],'complete_onboarding');assert.equal(queries[0][1].p_username,'Soon Teck');
});

test("Profile has one milestone collection entry instead of a badge shortcut grid",async()=>{
 const routes=[],ui=await profileScreen({'expo-router':{useRouter:()=>({navigate:r=>routes.push(r)}),useFocusEffect:fn=>React.useEffect(fn,[fn])}});
 try{
  const entries=ui.renderer.root.findAllByType('Button').filter(b=>/milestone/i.test(b.props.accessibilityLabel??''));assert.equal(entries.length,1);
  await act(async()=>entries[0].props.onPress());assert.deepEqual(routes,['/rewards']);assert.match(ui.text(),/Your focus areas/);
 }finally{await ui.cleanup();}
});

test("look changes preview locally and save only after confirmation; failed saves retain the chosen look",async()=>{
 let fail=true;const saves=[];
 const ui=await profileScreen({'../../context/UserContext':{useUser:()=>({profile:{id:'u',username:'Soon Teck',avatar:'⭐',class_title:'Scholar',level:3,current_xp:20,timezone:'UTC'},reloadProfile:async()=>{},updateProfile:async(...args)=>{saves.push(args);if(fail)throw Error('Offline');}})}});
 try{
  await ui.press('Personalise profile');await ui.press('Choose Fern');assert.equal(saves.length,0);
  const portraits=ui.renderer.root.findAllByType('Portrait');assert.equal(portraits.find(node=>node.props.level===3).props.avatar,'⭐');assert.equal(portraits.find(node=>node.props.interactive===false).props.avatar,'🧝‍♂️');
  await ui.press('Save changes');assert.equal(ui.renderer.root.findByType('Sheet').props.visible,true);assert.match(ui.text(),/Couldn’t save/);
  const selected=ui.renderer.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Choose Fern');assert.equal(selected.props.accessibilityState.checked,true);
  fail=false;await ui.press('Save changes');assert.deepEqual(saves.at(-1),['Soon Teck','🧝‍♂️','Scholar']);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,false);
 }finally{await ui.cleanup();}
});
