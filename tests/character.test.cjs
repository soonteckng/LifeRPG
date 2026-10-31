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
      if (name.endsWith("/SwipeBack")) return {__esModule:true,default:props=>props.children,useSwipeOffset:()=>({get:()=>0,set(){}}),ParallaxLayer:props=>props.children,slideTo:(offset,to,duration,done)=>{(globalThis.__slides??=[]).push(to);if(globalThis.__onSlide)globalThis.__onSlide(to,done);else done?.();}};
      if (name.endsWith("/FocusAreaDetailSheet")) return props=>React.createElement("AreaSheet",props);
      if (name === "react-native-reanimated") return {__esModule:true,default:{View:props=>React.createElement("Animated",props,props.children)}};
      if (name.endsWith("/useCharacterMotion")) return {useCharacterMotion:()=>({bodyStyle:{},eyeStyle:{},armStyle:{},greet(){}})};
      if (name.endsWith('/SessionProtectionControl')) return { ProtectionSettingsSheet: props => React.createElement('ProtectionSheet', props), default: () => null };
      if (name.endsWith("/FeatureTour")) return {FeatureTourProvider: props=>props.children, TourAnchor: props=>props.children, TourScrollView: mocks["react-native"]?.ScrollView || (props=>React.createElement("ScrollView",props,props.children)), useFeatureTour:()=>({start(){}}), prepareFeatureTour:async()=>{}};
      if (name.endsWith("/DailyGoalSheet")) return props=>React.createElement("GoalSheet",props);
      if (name.endsWith("/OnboardingFrame")) return require("./onboarding-mocks.cjs").frame(React);
      if (name.endsWith("/OnboardingFinish")) return require("./onboarding-mocks.cjs").finish(React);
      if (name.endsWith("/OnboardingWelcome")) return require("./onboarding-mocks.cjs").finish(React);
      if (["/GuidedPreferenceSheet", "/SaveSuggestedQuest"].some(suffix => name.endsWith(suffix))) return props => React.createElement("GuidedBoundary", props);
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
  BackHandler: { addEventListener: () => ({ remove() {} }) },
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
    "./CharacterMark": host("Mark"),
    "../components/CharacterMark": host("Mark"),
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
    update: async () => act(async () => renderer.update(React.createElement(Component))),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
// The new-person intro, reduced to what these tests need: the welcome
// finishes at once and the intro frame is a plain container.
const introMocks = {
  "./OnboardingWelcome": ({ onDone }) => { React.useEffect(() => { onDone(); }, [onDone]); return null; },
  "./OnboardingFrame": Object.assign(({ children, primary, onNext, secondary, onSecondary, title }) => React.createElement("Frame", { title },
    React.createElement("Button", { onPress: onNext, accessibilityLabel: primary }, primary),
    onSecondary ? React.createElement("Button", { onPress: onSecondary, accessibilityLabel: secondary }, secondary) : null, children),
    { useOnboardingTransition: () => ({ opacity: {}, moving: false, change: fn => fn() }) }),
  "../services/authSettings": { useAuthSettings: () => ({ google: false }) },
  "../services/nativeFocusProtection": { getSessionProtectionModule: async () => null },
  "@react-native-async-storage/async-storage": { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
};
test("a new account waits for its email code and never claims a session before it", async () => {
  let calls = 0, verified = 0;
  const ui = await screen("src/components/AuthScreen.tsx", { ...introMocks,
    "../context/AuthContext": {
      useAuth: () => ({
        googleStatus: "idle", clearGoogleStatus() {},
        signUp: async () => { calls++; return { error: null, needsEmailConfirmation: true }; },
        verifySignUpCode: async () => { verified++; return { error: null }; },
      }),
    },
  });
  try {
    await ui.press("New here? Create an account");
    assert.equal(ui.renderer.root.findByType("Frame").props.title, "What would you like to make time for?", "a new person starts with the intro");
    await ui.press("Skip for now");
    assert.match(ui.text(), /Save your progress/);
    await ui.input("Email", "person@example.com");
    await ui.input("Password", "password");
    await ui.press("Create account");
    assert.equal(calls, 1);
    assert.match(ui.text(), /Check your email/);
    assert.match(ui.text(), /6-digit code to person@example.com/);
    assert.equal(verified, 0, "nothing opens until the code is entered");
    assert.match(ui.text(), /Sign in/);
  } finally {
    await ui.cleanup();
  }
});
test("failed sign-in explains itself, keeps what was typed and allows retry", async () => {
  let calls = 0;
  const ui = await screen("src/components/AuthScreen.tsx", { ...introMocks,
    "../context/AuthContext": {
      useAuth: () => ({
        googleStatus: "idle", clearGoogleStatus() {},
        signIn: async () => {
          if (++calls === 1) throw Error("Offline");
          return { error: null };
        },
      }),
    },
  });
  try {
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 1);
    await ui.input("Email or username", "person@example.com");
    await ui.input("Password", "password");
    const surface = ui.renderer.root.findByType("Scroll");
    await act(async () => surface.props.onLayout({ nativeEvent: { layout: { height: 450 } } }));
    // The calm timer mark above the form makes room for the keyboard on short screens.
    const marks = () => ui.renderer.root.findAll(n => typeof n.type === "string" && n.props.style && n.props.style.width === 112 && n.props.style.borderRadius === 56).length;
    assert.equal(marks(), 0);
    assert.match(ui.text(), /Welcome back/);
    assert.equal(ui.renderer.root.findAllByType("Scroll").length, 1);
    await ui.press("Sign in");
    assert.match(ui.text(), /Couldn’t connect/);
    assert.equal(ui.renderer.root.findAllByType("Input").find(n => n.props.accessibilityLabel === "Password").props.value, "password");
    await ui.press("Sign in");
    assert.equal(calls, 2);
    await act(async () => surface.props.onLayout({ nativeEvent: { layout: { height: 800 } } }));
    assert.ok(marks() > 0);
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
  const ui = await screen("src/components/AuthScreen.tsx", { ...introMocks,
    "../context/AuthContext": {
      useAuth: () => ({
        googleStatus: "idle", clearGoogleStatus() {},
        signIn: () => {
          calls++;
          return promise;
        },
      }),
    },
  });
  try {
    await ui.input("Email or username", "person@example.com");
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
    "../services/onboardingService": { usernameAvailable: async () => true,
      saveOnboardingProfile: async () => {
        if (++attempts === 1) throw Error("Offline");
      },
      finishOnboarding: async () => {},
    },
  });
  try {
    await ui.press("Skip for now");
    await ui.input("Your name", "Soon Teck");
    // Round 88: goal, then one "How it works" page.
    await ui.press("Continue");
    await ui.press("Continue");
    await ui.press("Go to Today");
    assert.match(ui.text(), /Couldn’t save/);
    assert.deepEqual(routes, []);
    await ui.press("Go to Today");
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
    "../services/onboardingService": { usernameAvailable: async () => true,
      saveOnboardingProfile: async () => {},
      finishOnboarding: async () => {
        if (++calls === 1) throw Error("Offline");
      },
    },
  });
  try {
    // Round 88: the introduction is one page, so it opens on its last step.
    assert.deepEqual(routes, []);
    await ui.press("Go to Today");
    assert.match(ui.text(), /Couldn’t save your setup/);
    await ui.press("Go to Today");
    assert.deepEqual(routes, ["/"]);
    assert.equal(calls, 2);
  } finally {
    await ui.cleanup();
  }
});
test("existing introduction links open the static guide without changing onboarding", async () => {
 let writes=0;const routes=[];const ui=await screen("src/app/tutorial.tsx",{"expo-router":{useRouter:()=>({replace:route=>routes.push(route)})},"../context/UserContext":{useUser:()=>({profile:{onboarding_completed:true}})},"../services/onboardingService":{ usernameAvailable: async () => true,finishOnboarding:async()=>writes++}});
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
test("Settings prevents logout while a session is running, paused or unresolved", async () => {
  for (const timer of [
    { hasOpenSession: true },
    { isRestoring: true },
    { restoreError: true },
  ]) {
    let calls = 0;
    const ui = await screen("src/app/settings.tsx", {
      ...sheetMocks,
      "../components/DeveloperTools": () => null,
      "../components/DeleteAccount": () => null,
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
    "../components/DeveloperTools": () => null,
      "../components/DeleteAccount": () => null,
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
    assert.match(ui.text(), /NotificationsUnavailable/);
  } finally {
    await ui.cleanup();
  }
});

async function profileScreen(overrides = {}) {
  // Profile is a page beside the tabs now, one folder up from them.
  const mocks = {
    "../../context/AuthContext": { useAuth: () => ({ accessMode: "online", admissionEpoch: 1 }) },
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
    "../../components/InitialsAvatar": host("Initials"),
    "../../components/SheetConfirmation": host("Confirm"),
    // Subject breakdowns have their own tests.
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
    assert.match(ui.text(), /0mLearning/, "each category shows its time, not a level");
    assert.doesNotMatch(ui.text(), /Lv \d|XP|leaderboard/);
    assert.doesNotMatch(
      ui.text(),
      /Connect areas|No Life areas connected|Explore your progress/,
    );
    await ui.press("Edit name");
    const sheet = ui.renderer.root.findByType("Sheet");
    // Only the name lives here now, so the sheet is compact and rides above the keyboard.
    assert.equal(sheet.props.compact, true);
    assert.notEqual(sheet.props.expanded, true);
    assert.equal(sheet.props.keyboardBehavior, "interactive");
    assert.equal(sheet.props.androidKeyboardInputMode, "adjustPan");
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

test("Profile renders one Wellbeing row in the shared direction order with its combined time", async () => {
  const rows = [
    {...area(1,1,0),title:"General"}, {...area(2,3,20),title:"Fitness & Health"},
    {...area(3,1,0),title:"Life Admin"}, {...area(4,1,0),title:"Creativity"},
    {...area(5,1,0),title:"Work & projects"}, {...area(6,1,0),title:"Knowledge"},
    {...area(7,2,40),title:"Grooming & Vitality"}, {...area(8,1,15),title:"Wellbeing"},
  ];
  const ui = await profileScreen({"../../hooks/useCharacterData":{useCharacterData:()=>({data:{areas:rows,sessions:[]},loading:false,error:false,refresh:async()=>{}})}});
  try {
    const displayed = ui.renderer.root.findAllByType("Button").filter(node => typeof node.props.accessibilityLabel === "string" && node.props.accessibilityLabel.endsWith(" in total. View details"));
    assert.deepEqual(displayed.map(node => node.props.accessibilityLabel.split(", ")[0]),
      ["Learning","Work & projects","Creativity","Everyday life","Wellbeing","Everyday focus"]);
    const wellbeing = displayed[4];
    assert.equal(wellbeing.props.accessibilityLabel,"Wellbeing, 0m in total. View details", "time, never a level or XP");
    assert.equal(wellbeing.findByType("Meter").props.value,0);
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
    const tile = ui.renderer.root.findAllByType("Button").find(node => String(node.props.accessibilityLabel).startsWith("Wellbeing, "));
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

test("Profile subject breakdown uses the same completed aliases as its category details", async () => {
  const rows = [{...area(1,1,0),title:"Knowledge"}, {...area(2,1,0),title:"Learning"}];
  const stamp = new Date(Date.now() - 3600_000).toISOString();
  const sessions = [
    {id:"alias",subject_id:1,activity_type:"study",duration_seconds:60,completed_at:stamp},
    {id:"canonical",subject_id:2,activity_type:"study",duration_seconds:120,completed_at:stamp},
    {id:"canonical",subject_id:2,activity_type:"study",duration_seconds:120,completed_at:stamp},
    {id:"ended",subject_id:2,activity_type:"study",duration_seconds:900,completed_at:stamp,status:"abandoned"},
    {id:"old",subject_id:1,activity_type:"study",duration_seconds:300,completed_at:new Date(Date.now() - 50 * 86400_000).toISOString()},
  ];
  const ui = await profileScreen({"../../hooks/useCharacterData":{useCharacterData:()=>({data:{areas:rows,sessions},loading:false,error:false,refresh:async()=>{}})}});
  try {
    const tile = ui.renderer.root.findAllByType("Button").find(node => String(node.props.accessibilityLabel).startsWith("Learning, "));
    await act(async () => tile.props.onPress());
    const sheet = ui.renderer.root.findByType("AreaSheet").props;
    assert.equal(sheet.detail.seconds, 480, "all-time category detail retains the older session");
    const recent = sheet.extra.props.sessions;
    assert.deepEqual(recent.map(session => session.id), ["alias", "canonical"], "the six-week subject view keeps both aliases, one saved ID each, and completed rows only");
    assert.equal(recent.reduce((sum, session) => sum + session.duration_seconds, 0), 180);
  } finally { await ui.cleanup(); }
});


test("Profile protects edited drafts and preserves the editor through discard dismissal", async () => {
  const ui = await profileScreen();
  try {
    await ui.press("Edit name");
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
  // Pages slide on one shared offset; hold the slide out until the test finishes it.
  globalThis.__onSlide = (to, done) => { if (to === 360) finish = () => done?.(); else done?.(); };
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
    globalThis.__onSlide = undefined;
    await act(async () => renderer.unmount());
  }
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
  await ui.run(v=>v.updateProfile('  Soon Teck  ','⭐'));assert.equal(ui.value().profile.username,'Soon Teck');
  await ui.run(v=>v.updateProfile('A'.repeat(15),'⭐'));assert.equal(ui.value().profile.username.length,15);
  for(const invalid of [' ','A'.repeat(16)])await assert.rejects(ui.value().updateProfile(invalid,'⭐'),/1 and 15/);
  assert.equal(ui.value().profile.username.length,15);
 }finally{await ui.cleanup();}
 const names=load('src/constants/profile.ts');assert.equal(load('src/constants/onboarding.ts').ONBOARDING_NAME_LIMIT,names.PROFILE_NAME_LIMIT);
});

test("profile name sheet stays above the keyboard and rejects over-limit pasted drafts beside the field",async()=>{
 const saves=[];const ui=await profileScreen({'../../context/UserContext':{useUser:()=>({profile:{id:'u',username:'Soon Teck',avatar:'⭐',class_title:'Scholar',level:1,current_xp:0,timezone:'Asia/Kuala_Lumpur'},updateProfile:async(...args)=>saves.push(args),reloadProfile:async()=>{}})}});
 try{
  await ui.press('Edit name');assert.equal(ui.renderer.root.findByType('Sheet').props.keyboardBehavior,'interactive');
  assert.equal(ui.renderer.root.findByType('Input').props.maxLength,15);assert.ok(ui.renderer.root.findByType('Input').props.onFocus);
  await ui.input('Profile name','A'.repeat(16));await ui.press('Save changes');assert.equal(saves.length,0);assert.match(ui.text(),/1 and 15/);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,true);
  await ui.input('Profile name','Soon Teck');await ui.press('Save changes');assert.equal(saves[0][0],'Soon Teck');
 }finally{await ui.cleanup();}
});

test("onboarding profile validation rejects too-long names before the RPC and preserves internal spaces",async()=>{
 const queries=[];const api=load('src/services/onboardingService.ts',{'../../lib/supabase':{supabase:{rpc:async(name,args)=>{queries.push([name,args]);return {data:true,error:null};}}}});
 await assert.rejects(api.saveOnboardingProfile('A'.repeat(16),'⭐',60),/1 and 15/);assert.equal(queries.length,0);
 await api.saveOnboardingProfile('  Soon Teck  ','⭐',60);assert.equal(queries[0][0],'complete_onboarding');assert.equal(queries[0][1].p_class_title,null,'the old class title is no longer sent');assert.equal(queries[0][1].p_username,'Soon Teck');
});

test("Profile shows your initials and all-time totals from your own history, with no level, badges or outfits",async()=>{
 const routes=[];
 const session=(id,day,seconds)=>({id,completed_at:`2026-10-${day}T03:00:00Z`,duration_seconds:seconds,subject_id:1,status:'completed'});
 const ui=await profileScreen({'expo-router':{useRouter:()=>({navigate:r=>routes.push(r)}),useFocusEffect:fn=>React.useEffect(fn,[fn])},
  '../../hooks/useCharacterData':{useCharacterData:()=>({data:{areas:[{id:1,title:'Knowledge',level:2,current_xp:12}],sessions:[session('a','01',1800),session('b','02',1800),session('c','04',1800)]},loading:false,error:false,refresh:async()=>{}})}});
 try{
  assert.match(ui.text(),/1h 30mTime focused/);assert.match(ui.text(),/3Focus days/);assert.match(ui.text(),/2 daysBest streak/);
  assert.equal(ui.renderer.root.findByType('Initials').props.name,'Soon');
  assert.doesNotMatch(ui.text(),/Badges|Level \d|XP|Outfits|Level journey/);
  assert.match(ui.text(),/My Categories/);assert.deepEqual(routes,[]);
 }finally{await ui.cleanup();}
});

test('an open profile draft stays editable offline, labels Save as needing internet, and fences stale saves',async()=>{
 const auth={accessMode:'online',admissionEpoch:1},saves=[];
 const ui=await profileScreen({'../../context/AuthContext':{useAuth:()=>auth},'../../context/UserContext':{useUser:()=>({
  profile:{id:'u',username:'Soon',avatar:'⭐',class_title:'Scholar',level:3,current_xp:20,timezone:'UTC'},
  reloadProfile:async()=>{},updateProfile:async(...args)=>saves.push(args),
 })}});
 try{
  await ui.press('Edit name');await ui.input('Profile name','New name');
  const save=()=>ui.renderer.root.findAllByType('Button').find(n=>text(n)==='Save changes');
  const outgoing=save().props.onPress;
  auth.accessMode='local-only';await ui.update();
  assert.equal(ui.renderer.root.findByType('Sheet').props.visible,true);
  assert.equal(save().props.disabled,true);assert.match(ui.text(),/Needs internet/);
  assert.equal(ui.renderer.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Profile name').props.value,'New name');
  await ui.input('Profile name','Kept draft');await act(async()=>outgoing());await ui.press('Save changes');assert.deepEqual(saves,[]);
  auth.accessMode='online';await ui.update();await act(async()=>outgoing());assert.deepEqual(saves,[]);
  assert.equal(save().props.disabled,false);await ui.press('Save changes');
  assert.deepEqual(saves,[['Kept draft','⭐']]);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,false);
 }finally{await ui.cleanup();}
});

test("the name sheet only edits the name, and the old companion field stays saved for older versions",async()=>{
 let fail=true;const saves=[],routes=[];
 const ui=await profileScreen({'expo-router':{useRouter:()=>({navigate:r=>routes.push(r)}),useFocusEffect:fn=>React.useEffect(fn,[fn])},
  '../../context/UserContext':{useUser:()=>({profile:{id:'u',username:'Soon Teck',avatar:'⭐',class_title:'Scholar',level:3,current_xp:20,timezone:'UTC'},reloadProfile:async()=>{},updateProfile:async(...args)=>{saves.push(args);if(fail)throw Error('Offline');}})}});
 try{
  assert.equal(ui.renderer.root.findByType('Initials').props.name,'Soon Teck');
  await ui.press('Edit name');assert.deepEqual(routes,[]);
  await ui.input('Profile name','Soon');await ui.press('Save changes');assert.match(ui.text(),/Couldn’t save/);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,true);
  fail=false;await ui.press('Save changes');assert.deepEqual(saves.at(-1),['Soon','⭐']);assert.equal(ui.renderer.root.findByType('Sheet').props.visible,false);
 }finally{await ui.cleanup();}
});

