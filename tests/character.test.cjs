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
      if (name.endsWith('/SessionProtectionContext')) return { useSessionProtection: () => ({ supported: false, selection: { mode: 'normal', allowed: [] }, capabilities: null, refresh: async () => {}, openPermission: async () => {}, choose: async () => false }) };
      if (name.endsWith("/AppBuildInfo")) return () => null;
      if (name === "expo-constants") return { expoConfig: { android: { package: "com.soonteck.liferpg" } } };
      if (name === "expo") return { isRunningInExpoGo: () => false };
      if (name.endsWith("/LevelTierSheet")) return props=>React.createElement("TierSheet",props);
      if (name.endsWith("/SwipeBack")) return {__esModule:true,default:props=>props.children};
      if (name.endsWith("/FocusAreaDetailSheet")) return props=>React.createElement("AreaSheet",props);
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
      { const study = require('./helpers/study-stubs.cjs')(name); if (study) return study; }
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

test("Profile combines legacy Wellbeing progress once while preserving rows and real identities", () => {
  const fitness = {...area(3, 3, 20), title:"Fitness & Health"};
  const grooming = {...area(4, 2, 40), title:"Grooming & Vitality"};
  const canonical = {...area(8, 1, 15), title:"Wellbeing", color_code:"#F4AA88"};
  const custom = {...area(42, 3, 12), title:"My ceramics"};
  const sameNamedCustom = {...area(43, 1, 7), title:"My ceramics"};
  const input = [fitness, grooming, canonical, canonical, custom, sameNamedCustom];
  const before = JSON.stringify(input);
  const result = growth.profileFocusAreaGrowth(input);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {...canonical, level:3, current_xp:125, current:125, required:150});
  assert.deepEqual(result.slice(1).map(item => [item.id, item.level, item.current]), [[42,3,12],[43,1,7]]);
  assert.equal(JSON.stringify(input), before, "source XP, IDs and rows stay unchanged");
});

test("combined focus area progress carries XP across the real subject-level boundaries", () => {
  for (const [leftLevel, leftXP, rightLevel, rightXP, expectedLevel, expectedXP] of [
    [1,0,1,0,1,0], [1,24,1,25,1,49], [1,25,1,25,2,0],
    [2,49,2,0,2,99], [2,50,2,0,3,0], [3,149,1,0,3,149], [3,149,1,1,4,0],
  ]) {
    const result = growth.profileFocusAreaGrowth([
      {...area(1,leftLevel,leftXP), title:"Fitness & Health"},
      {...area(2,rightLevel,rightXP), title:"Grooming & Vitality"},
    ]);
    assert.equal(result.length,1);assert.equal(result[0].title,"Wellbeing");
    assert.equal(result[0].level,expectedLevel);assert.equal(result[0].current,expectedXP);
    assert.equal(result[0].required,expectedLevel * 50);
  }
});

test("Profile area order follows Find your next step with the Free focus default last", () => {
  const titles = ["General", "Wellbeing", "Life Admin", "Creativity", "Work & projects", "Knowledge"];
  const rows = titles.map((title,index) => ({...area(index+1,1,index),title}));
  const catalogue = load("src/utils/focusAreas.ts");
  const directions = load("src/constants/guidedQuests.ts").FOCUS_DIRECTIONS;
  const result = growth.profileFocusAreaGrowth(rows).map(item => catalogue.focusAreaTitle(item.title));
  assert.deepEqual(result,[...directions.map(direction => direction.title),"Everyday focus"]);
  assert.deepEqual(rows.map(item => item.title),titles,"sorting must not change the shared snapshot");
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
  Keyboard: { dismiss() {}, metrics: () => undefined, addListener: () => ({ remove() {} }) },
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
    "react-native-safe-area-context": { SafeAreaView: host("Safe"), useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
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
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 1);
    await ui.input("Email", "person@example.com");
    await ui.input("Password", "password");
    const surface = ui.renderer.root.findByType("Scroll");
    await act(async () => surface.props.onLayout({ nativeEvent: { layout: { height: 450 } } }));
    assert.equal(ui.renderer.root.findAllByType("Portrait").length, 0);
    assert.match(ui.text(), /Welcome back/);
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 1);
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
// Milestones open as a sheet from Home and Progress, no longer as their own page.
async function rewardsHarness(options = {}) {
  const calls = [];
  const growth = {
    data: { areas: [], sessions: [session("s", "2026-10-01", 30)] },
    loading: false,
    error: false,
    refresh: async () => { calls.push("milestones-refresh"); },
    ...options.growth,
  };
  const Sheet = load("src/components/MilestonesSheet.tsx", {
    "react-native": Native, "@expo/vector-icons": { Ionicons: host("Icon") },
    "@gorhom/bottom-sheet": sheetMocks["@gorhom/bottom-sheet"],
    "./AppSheet": (props) => React.createElement("Sheet", props, props.header, props.children),
    "./SheetHeader": ({ title, subtitle }) => React.createElement("Header", null, title, subtitle),
    "./AppText": { Text: host("Text") },
    "./MotionPressable": host("Button"),
    "../context/UserContext": { useUser: () => ({ profile: { id: "a", timezone: "Asia/Kuala_Lumpur", daily_goal_minutes: 60, gold: 500 } }) },
    "../hooks/useCharacterData": { useCharacterData: () => growth },
    "../services/rewardService": new Proxy({}, { get() { throw Error("Milestones must not call the reward shop"); } }),
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Sheet, { visible: true, onClose: () => calls.push("close") })); });
  return { renderer, calls, text: () => text(renderer.root),
    press: async label => act(async () => renderer.root.findAllByType("Button").find(n => n.props.accessibilityLabel === label || text(n) === label).props.onPress()),
    cleanup: async () => act(async () => renderer.unmount()) };
}
test("milestones unlock automatically without personal reward creation, prices or claims", async () => {
  const ui = await rewardsHarness();
  try {
    assert.match(ui.text(), /My Milestones/);
    assert.match(ui.text(), /First step/);
    assert.match(ui.text(), /Earned/);
    assert.doesNotMatch(ui.text(), /Add a personal reward|Personal rewards|Gold|Claim daily bonus|Redeem/);
    assert.equal(ui.calls.length, 0);
  } finally { await ui.cleanup(); }
});
test("a sub-minute completed session earns a milestone, and a path milestone opens in place", async () => {
  const ui = await rewardsHarness();
  try {
    const first = ui.renderer.root.findAll(n => n.props.accessibilityLabel === "First step, earned");
    assert.ok(first.length > 0);
    const next = ui.renderer.root.findAllByType("Button").find(n => n.props.accessibilityState?.expanded === false && /of/.test(n.props.accessibilityLabel ?? ""));
    await act(async () => next.props.onPress());
    assert.match(ui.text(), /earned automatically when you get there/);
    assert.equal(ui.renderer.root.findAllByType("Sheet").length, 1, "details open in place, not in a second sheet");
  } finally { await ui.cleanup(); }
});
test("milestone refresh failure preserves the already-loaded collection with Retry", async () => {
  const ui = await rewardsHarness({ growth: { error: true } });
  try {
    assert.match(ui.text(), /Couldn’t refresh milestones/);
    assert.match(ui.text(), /First step/);
    await ui.press("Couldn’t refresh milestones. Tap to try again.");
    assert.deepEqual(ui.calls, ["milestones-refresh"]);
  } finally { await ui.cleanup(); }
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
      // The row and the sheet's button share a label; the sheet's comes last.
      const confirm = ui.renderer.root
        .findAllByType("Button")
        .filter((b) => text(b) === "Sign out").at(-1);
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
  // Profile is a page beside the tabs now, one folder up from them.
  const mocks = {
    "../../context/TimerContext": {useTimer: () => ({})},
    "expo-router": {
      useRouter: () => ({ navigate() {} }),
      useFocusEffect: (effect) => React.useEffect(effect, [effect]),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ bottom: 34 }),
    },
    "../../components/PersonalUI": UI,
    "../../components/MoreMenu": (props) => React.createElement("Menu", props),
    "../../components/CharacterPortrait": host("Portrait"),
    "../../components/SheetConfirmation": host("Confirm"),
    // Badges and subject breakdowns have their own tests.
    "../../components/MilestonesSheet": { __esModule: true, default: host("MilestonesSheet"), useMilestones: () => ({ ready: true, error: false, retry: async () => {},
      totals: { seconds: 5400, days: 3, bestStreak: 2, sessions: 4, milestones: [{ id: "first" }, { id: "ten" }] }, earned: [{ id: "first", title: "First step", icon: "footsteps-outline" }], next: null }) },
    "../../components/SubjectBreakdown": { __esModule: true, default: host("SubjectBreakdown") },
    "../../components/ProgressRing": ({ children }) => React.createElement("Ring", null, children),
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
  };
  return screen("src/app/profile.tsx", Object.fromEntries(Object.entries(mocks).map(([key, value]) => [key.replace(/^\.\.\/\.\.\//, "../"), value])));
}
test("Profile displays saved Life areas directly and keeps Save outside the scrolling editor", async () => {
  const ui = await profileScreen();
  try {
    assert.match(ui.text(), /My Categories/);
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

test("Profile renders one Wellbeing row in the shared direction order with its combined XP meter", async () => {
  const rows = [
    {...area(1,1,0),title:"General"}, {...area(2,3,20),title:"Fitness & Health"},
    {...area(3,1,0),title:"Life Admin"}, {...area(4,1,0),title:"Creativity"},
    {...area(5,1,0),title:"Work & projects"}, {...area(6,1,0),title:"Knowledge"},
    {...area(7,2,40),title:"Grooming & Vitality"}, {...area(8,1,15),title:"Wellbeing"},
  ];
  const ui = await profileScreen({"../../hooks/useCharacterData":{useCharacterData:()=>({data:{areas:rows,sessions:[]},loading:false,error:false,refresh:async()=>{}})}});
  try {
    const displayed = ui.renderer.root.findAllByType("Button").filter(node => typeof node.props.accessibilityLabel === "string" && node.props.accessibilityLabel.includes(", level "));
    assert.deepEqual(displayed.map(node => node.props.accessibilityLabel.split(", level ")[0]),
      ["Learning","Work & projects","Creativity","Everyday life","Wellbeing","Everyday focus"]);
    const wellbeing = displayed[4];
    assert.equal(wellbeing.props.accessibilityLabel,"Wellbeing, level 3, 125 of 150 XP to the next level. View details");
    assert.equal(wellbeing.findByType("Meter").props.value,125/150);
  } finally {await ui.cleanup();}
});

test("a focus area opens its details and starts a session there once the sheet has closed", async () => {
  const rows = [{...area(2,3,20),title:"Fitness & Health"}, {...area(7,2,40),title:"Grooming & Vitality"}, {...area(6,1,0),title:"Knowledge"}];
  const now = Date.now(), sessions = [
    {id:"a",subject_id:2,activity_type:"general",duration_seconds:900,xp_earned:0,gold_earned:0,completed_at:new Date(now-3600e3).toISOString()},
    {id:"b",subject_id:7,activity_type:"general",duration_seconds:60,xp_earned:0,gold_earned:0,completed_at:new Date(now-7200e3).toISOString()},
    {id:"c",subject_id:6,activity_type:"general",duration_seconds:1200,xp_earned:0,gold_earned:0,completed_at:new Date(now-3600e3).toISOString()},
  ];
  const calls = [];
  const timer = {hasOpenSession:false,setNotes:value=>calls.push(["notes",value]),setLinkedTaskId:value=>calls.push(["quest",value]),setTargetAttributeId:value=>calls.push(["area",value]),reviewSummary:()=>calls.push("review")};
  const ui = await profileScreen({
    "../../hooks/useCharacterData":{useCharacterData:()=>({data:{areas:rows,sessions},loading:false,error:false,refresh:async()=>{}})},
    "../../context/TimerContext":{useTimer:()=>timer},
    "expo-router":{useRouter:()=>({navigate:route=>calls.push(route)}),useFocusEffect:effect=>React.useEffect(effect,[effect])},
  });
  try {
    const sheet = () => ui.renderer.root.findByType("AreaSheet").props;
    assert.equal(sheet().visible, false);
    const tile = ui.renderer.root.findAllByType("Button").find(node => String(node.props.accessibilityLabel).startsWith("Wellbeing, level"));
    await act(async () => tile.props.onPress());
    assert.equal(sheet().visible, true);
    assert.equal(sheet().area.title, "Wellbeing");
    assert.equal(sheet().detail.seconds, 960, "both Wellbeing aliases count, other areas do not");
    assert.equal(sheet().detail.sessions, 2);
    await act(async () => sheet().onFocus());
    assert.equal(sheet().visible, false);
    assert.deepEqual(calls, [["notes",""],["quest",null],["area",2]], "nothing navigates while the sheet is still closing");
    await act(async () => sheet().onDismiss());
    assert.deepEqual(calls.slice(3), ["review","/session"]);
  } finally { await ui.cleanup(); }
});

test('Profile level opens the shared tier path with the saved XP balance',async()=>{
 const ui=await profileScreen();
 try{
  const button=ui.renderer.root.findAllByType('Button').find(node=>node.props.accessibilityLabel?.includes('View level tiers'));
  assert.ok(button);await act(async()=>button.props.onPress());
  const popup=ui.renderer.root.findByType('TierSheet');assert.equal(popup.props.visible,true);assert.equal(popup.props.level,3);assert.equal(popup.props.currentXP,20);
  await act(async()=>popup.props.onClose());assert.equal(ui.renderer.root.findByType('TierSheet').props.visible,false);
 }finally{await ui.cleanup();}
});

test("Profile opts only its hero into entrance greetings and pauses it behind profile sheets", async () => {
  const ui = await profileScreen();
  try {
    const hero = () => ui.renderer.root.findAllByType("Portrait").find(node => node.props.size === 112);
    assert.equal(hero().props.greetOnFocus, true);
    assert.equal(hero().props.animate, true);
    assert.equal(ui.renderer.root.findAllByType("Portrait").find(node => node.props.interactive === false).props.greetOnFocus, undefined);
    await ui.press("Personalise profile");
    assert.equal(hero().props.animate, false);
    await ui.press("Save changes");
    assert.equal(hero().props.animate, true);
    const levels = ui.renderer.root.findAllByType("Button").find(node => node.props.accessibilityLabel?.includes("View level tiers"));
    await act(async () => levels.props.onPress());
    assert.equal(hero().props.animate, false);
    await act(async () => ui.renderer.root.findByType("TierSheet").props.onClose());
    assert.equal(hero().props.animate, true);
  } finally { await ui.cleanup(); }
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
 assert.equal(new Set(catalogue.CHARACTER_LOOKS.map(look=>look.body)).size,12);
 assert.equal(new Set(catalogue.CHARACTER_LOOKS.map(look=>look.accessory)).size,12);
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
  const repeats=()=>fake.events.filter(event=>event.kind==='repeat');assert.equal(repeats().length,3);assert.equal(repeats()[0].count,-1);assert.equal(repeats()[1].animation.items[0].delay,4300);
  focused=false;listeners.blur();assert.equal(fake.values[0].get(),0);assert.equal(fake.values[1].get(),1);
  let count=repeats().length;appState('background');appState('active');assert.equal(repeats().length,count,'backgrounded or unfocused screens cannot restart motion');
  focused=true;listeners.focus();assert.equal(repeats().length,count+3);
  reduced=true;count=repeats().length;await act(async()=>renderer.update(element()));assert.equal(repeats().length,count);assert.equal(fake.values[0].get(),0);assert.equal(fake.values[1].get(),1);
  reduced=false;enabled=false;await act(async()=>renderer.update(element()));assert.equal(repeats().length,count);
 }finally{await act(async()=>renderer.unmount());}
 // Auth renders before the app navigator: no navigation context is required.
 const before=fake.events.filter(event=>event.kind==='repeat').length;
 enabled=true;await act(async()=>{renderer=create(React.createElement(Consumer));});
 assert.equal(fake.events.filter(event=>event.kind==='repeat').length,before+3);await act(async()=>renderer.unmount());
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

test("Profile shows its stats and badges, opens every milestone as a card, and keeps My Categories",async()=>{
 const routes=[],ui=await profileScreen({'expo-router':{useRouter:()=>({navigate:r=>routes.push(r)}),useFocusEffect:fn=>React.useEffect(fn,[fn])}});
 try{
  assert.match(ui.text(),/1h 30m/);assert.match(ui.text(),/focus days/);assert.match(ui.text(),/best streak/);
  assert.match(ui.text(),/My Badges/);assert.match(ui.text(),/1 of 2 earned/);assert.match(ui.text(),/First step/);
  const sheet=()=>ui.renderer.root.findByType('MilestonesSheet');assert.equal(sheet().props.visible,false);
  const badges=ui.renderer.root.findAllByType('Menu').find(node=>node.props.label==='Badge options');
  await act(async()=>badges.props.options.find(option=>option.label==='See all milestones').onPress());assert.equal(sheet().props.visible,true);assert.deepEqual(routes,[],'milestones open as a card, not a page');
  assert.match(ui.text(),/My Categories/);assert.doesNotMatch(ui.text(),/Your categories/);
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

test("two new looks fill four complete rows and have distinct drawn accessories",async()=>{
 const catalogue=load("src/constants/characterLooks.ts").CHARACTER_LOOKS;
 assert.equal(catalogue.length%3,0);assert.equal(new Set(catalogue.map(look=>look.id)).size,12);
 const Art=load("src/components/CharacterArt.tsx",{"react-native":Native}).default;
 let renderer;await act(async()=>{renderer=create(React.createElement(Art,{avatar:"📖",size:176}));});
 try{assert.equal(renderer.root.findAllByType("View").filter(node=>node.props.testID==="character-glasses").length,1);await act(async()=>renderer.update(React.createElement(Art,{avatar:"☁️",size:176})));assert.equal(renderer.root.findAllByType("View").filter(node=>node.props.testID==="character-beanie").length,1);assert.equal(renderer.root.findAllByType("View").filter(node=>node.props.testID==="character-glasses").length,0);}finally{await act(async()=>renderer.unmount());}
});
