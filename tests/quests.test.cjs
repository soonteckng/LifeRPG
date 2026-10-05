const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

// Render the production components with native primitives and network boundaries
// replaced. These tests exercise state and actions, not native layout or gestures.
function load(relativePath, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith("/MotionPressable")) return mocks["react-native"]?.Pressable || mocks["react-native"]?.TouchableOpacity || (props => React.createElement("Button", props, props.children));
      if (name.endsWith("/GlassSurface")) return props => React.createElement("View", {...props, testID:"glass-surface"});
      if (name.endsWith("/SlidingSelection")) return props => React.createElement("View", {...props, style:[props.style,{left:props.index === 0 ? "0%" : "50%"}]});
      if (name === "expo-router/js-tabs") return {useBottomTabBarHeight: () => 90};
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ["", ".ts", ".tsx"].find((ext) => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + extension), mocks, cache);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

function task(overrides = {}) {
  return { id: 1, title: "Read a chapter", difficulty: "hard", target_minutes: 30, subject_id: 2,
    repeat_rule: "once", is_recurring: false, is_due_today: true, is_completed_today: false,
    is_completed: false, xp_awarded: 30, last_completed_date: null, created_at: "2026-09-30", updated_at: "2026-09-30", completed_at: null, ...overrides };
}
const subjects = [{ id: 1, title: "General" }, { id: 2, title: "Learning" }];
const host = (name) => (props) => React.createElement(name, props, props.children);
const Input = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({ focus() {} }));
  return React.createElement("Input", props);
});
const native = { View: host("View"), Text: host("Text"), Pressable: host("Pressable"), ActivityIndicator: host("Spinner"),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Keyboard: { dismiss() {}, isVisible: () => false, addListener: () => ({ remove() {} }) } };

async function setup(initialTasks = [], hasOpenSession = false) {
  const calls = [], alerts = [];
  let currentTasks, changeVisible, failSave = false;
  const Context = React.createContext(null);
  const timer = { hasOpenSession, linkedTaskId: hasOpenSession ? 1 : null,
    setLinkedTaskId: (value) => calls.push(["task", value]),
    setDurationInMinutes: (value) => calls.push(["duration", value]),
    setTargetAttributeId: (value) => calls.push(["area", value]) };
  const saved = (id, params) => task({ id, title: params.title, target_minutes: params.targetMinutes,
    subject_id: params.subjectId, repeat_rule: params.repeatRule, difficulty: params.difficulty,
    is_due_today: ["once", "daily"].includes(params.repeatRule) || params.repeatRule.includes("Wed") });
  const service = {
    createTask: async (params) => { calls.push(["create", params]); if (failSave) throw Error("Offline"); return saved(10, params); },
    updateTask: async (id, params) => { calls.push(["update", id, params]); if (failSave) throw Error("Offline"); return saved(id, params); },
    deleteTask: async (id) => { calls.push(["delete", id]); },
  };
  const QuestSheet = load("src/components/QuestSheet.tsx", {
    "react-native": { ...native, Alert: { alert: (...args) => alerts.push(args) } },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "@gorhom/bottom-sheet": { BottomSheetScrollView: host("ScrollView"), BottomSheetTextInput: Input, TouchableOpacity: host("Pressable") },
    "expo-haptics": {}, "expo-router": { useRouter: () => ({ push: (route) => calls.push(["navigate", route]) }) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "../context/QuestContext": { useQuests: () => React.useContext(Context) },
    "../context/TimerContext": { useTimer: () => timer },
    "../context/UserContext": { useUser: () => ({ hapticsEnabled: false }) },
    "../services/taskService": service,
    "./AppSheet": (props) => {
      React.useEffect(() => {
        if (!props.visible && props.label === "quest editor") props.onDismiss();
      }, [props.visible]);
      return React.createElement("Sheet", props, props.visible ? React.createElement(React.Fragment, null, props.header, props.children, props.footer, props.overlay) : null);
    },
  }).default;
  function Harness() {
    const [tasks, setTasks] = React.useState(initialTasks);
    const [visible, setVisible] = React.useState(true);
    changeVisible = setVisible;
    currentTasks = tasks;
    const value = { tasks, subjects, loading: false, refreshing: false, error: false,
      refresh: React.useCallback(async () => {}, []),
      upsert: (item) => setTasks((items) => items.some((t) => t.id === item.id) ? items.map((t) => t.id === item.id ? item : t) : [...items, item]),
      remove: (id) => setTasks((items) => items.filter((item) => item.id !== id)),
    };
    return React.createElement(Context.Provider, { value }, React.createElement(QuestSheet, { visible, onClose: () => setVisible(false) }));
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const text = (node) => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
  const button = (label) => renderer.root.findAllByType("Pressable").findLast((node) => node.props.accessibilityLabel === label || text(node) === label);
  return {
    calls, alerts, button, renderer, tasks: () => currentTasks, failSave: () => { failSave = true; },
    sheets: () => renderer.root.findAllByType("Sheet"),
    count: () => currentTasks.filter((item) => item.is_due_today && !item.is_completed_today).length,
    press: async (label) => { const node = button(label); assert.ok(node, `Missing button: ${label}`); await act(async () => node.props.onPress()); },
    type: async (label, value) => { await act(async () => renderer.root.findAllByType("Input").find((node) => node.props.accessibilityLabel === label).props.onChangeText(value)); },
    input: (label) => renderer.root.findAllByType("Input").find((node) => node.props.accessibilityLabel === label)?.props.value,
    alertAction: async (label) => { const action = button(label); assert.ok(action); await act(async () => action.props.onPress()); },
    dismiss: async () => { await act(async () => renderer.root.findAllByType("Sheet").at(-1).props.onRequestClose()); },
    reopen: async () => { await act(async () => changeVisible(true)); },
    finishDismiss: async () => { await act(async () => renderer.root.findByType("Sheet").props.onDismiss()); },
    output: () => text(renderer.root),
    cleanup: async () => { await act(async () => renderer.unmount()); },
  };
}

test("empty sheet adds a quest and immediately changes the unfinished count", async () => {
  const ui = await setup();
  assert.match(ui.output(), /Create your first quest/);
  assert.equal(ui.count(), 0);
  await ui.press("Add quest");
  await ui.type("Quest name", "  Walk outside  ");
  await ui.press("Create quest");
  assert.equal(ui.count(), 1);
  assert.equal(ui.tasks()[0].title, "Walk outside");
  assert.ok(ui.button("Edit Walk outside"));
  assert.equal(ui.calls.find(([action]) => action === "navigate"), undefined);
  await ui.cleanup();
});

test("editing preserves difficulty and saves an upcoming schedule without leaving the sheet", async () => {
  const ui = await setup([task()]);
  await ui.press("Edit Read a chapter");
  await ui.type("Quest name", "Read two chapters");
  await ui.press("Custom");
  await ui.type("Custom duration in minutes", "75");
  await ui.press("Selected days");
  await ui.press("Friday");
  await ui.press("Save changes");
  assert.equal(ui.count(), 0);
  assert.equal(ui.tasks()[0].difficulty, "hard");
  assert.equal(ui.tasks()[0].target_minutes, 75);
  assert.match(ui.output(), /You'll find it in All quests/);
  await ui.press("All quests");
  assert.ok(ui.button("Edit Read two chapters"));
  await ui.cleanup();
});

test("Cancel and sheet dismissal protect dirty drafts; discarding leaves saved data untouched", async () => {
  const ui = await setup([task()]);
  await ui.press("Edit Read a chapter");
  await ui.type("Quest name", "Unsaved title");
  await ui.press("Cancel");
  assert.match(ui.output(), /Discard changes\?/);
  await ui.alertAction("Keep editing");
  assert.equal(ui.input("Quest name"), "Unsaved title");
  await ui.dismiss();
  await ui.alertAction("Discard changes");
  assert.equal(ui.tasks()[0].title, "Read a chapter");
  assert.equal(ui.calls.length, 0);
  assert.ok(ui.button("Edit Read a chapter"));
  await ui.cleanup();
});

test("invalid custom duration and empty selected days never reach persistence", async () => {
  const ui = await setup();
  await ui.press("Add quest");
  await ui.type("Quest name", "Revision");
  await ui.press("Custom");
  await ui.type("Custom duration in minutes", "");
  await ui.press("Create quest");
  assert.match(ui.output(), /between 1 and 480/);
  await ui.type("Custom duration in minutes", "481");
  await ui.press("Create quest");
  assert.equal(ui.calls.length, 0);
  await ui.type("Custom duration in minutes", "30");
  await ui.press("Selected days");
  await ui.press("Create quest");
  assert.match(ui.output(), /Select at least one day/);
  assert.equal(ui.calls.length, 0);
  await ui.cleanup();
});

test("failed persistence retains the draft and exposes an actionable error", async () => {
  const ui = await setup([task()]);
  await ui.press("Edit Read a chapter");
  await ui.type("Quest name", "Keep this draft");
  ui.failSave();
  await ui.press("Save changes");
  assert.equal(ui.input("Quest name"), "Keep this draft");
  assert.match(ui.output(), /Couldn't update this quest/);
  assert.equal(ui.tasks()[0].title, "Read a chapter");
  await ui.cleanup();
});

test("list stays mounted beneath the editor and through scope changes", async () => {
  const ui = await setup([task()]);
  const list = ui.sheets()[0];
  await ui.press("All quests");
  assert.equal(ui.sheets()[0], list);
  await ui.press("Edit Read a chapter");
  assert.equal(ui.sheets()[0], list);
  assert.equal(ui.sheets().length, 2);
  const editor = ui.sheets()[1];
  assert.equal(editor.findAllByType("Pressable").some((node) => /^(Mark complete|Mark unfinished)/.test(node.props.accessibilityLabel ?? "")), false);
  await ui.press("Save changes");
  assert.equal(ui.sheets().length, 1);
  assert.equal(ui.sheets()[0], list);
  await ui.cleanup();
});

test("completed quests are hidden in both scopes, without manual completion controls", async () => {
  const ui = await setup([
    task({ title: "Finished once", is_completed: true, is_completed_today: true }),
    task({ id: 2, title: "Finished daily", is_recurring: true, is_completed: true, is_completed_today: true }),
    task({ id: 3, title: "Due again", is_recurring: true, is_completed: true, is_completed_today: false }),
  ]);
  try {
    assert.equal(ui.button("Edit Finished once"), undefined);
    assert.equal(ui.button("Edit Finished daily"), undefined);
    assert.ok(ui.button("Start Due again"));
    await ui.press("All quests");
    assert.equal(ui.button("Edit Finished once"), undefined);
    assert.equal(ui.button("Edit Finished daily"), undefined);
    assert.ok(ui.button("Edit Due again"));
    assert.equal(ui.renderer.root.findAllByType("Pressable").some(n => n.props.accessibilityRole === "checkbox"), false);
  } finally { await ui.cleanup(); }
});

test("Start configures a quest session and navigates only after dismissal", async () => {
  const ui = await setup([task({ target_minutes: 45 })]);
  await ui.press("Start Read a chapter");
  assert.deepEqual(ui.calls, [["task", 1], ["duration", 45], ["area", 2]]);
  await ui.finishDismiss();
  assert.deepEqual(ui.calls.at(-1), ["navigate", "/session"]);
  await ui.cleanup();
});

test("an open or paused session is continued without replacing its task, duration, or area", async () => {
  const ui = await setup([task(), task({ id: 2, title: "Another quest" })], true);
  assert.equal(ui.button("Start Another quest"), undefined);

  await ui.press("Delete Read a chapter");
  assert.match(ui.output(), /Finish or cancel its session/);
  await ui.alertAction("Keep quest");
  assert.equal(ui.button("Mark complete: Read a chapter"), undefined);
  await ui.press("Your current session is still open.Continue");
  assert.deepEqual(ui.calls, []);
  await ui.finishDismiss();
  assert.deepEqual(ui.calls, [["navigate", "/session"]]);
  await ui.cleanup();
});

test("many quests and long titles remain individually editable with distinct Start controls", async () => {
  const title = "A long quest title with room for details ".repeat(3);
  const ui = await setup(Array.from({ length: 30 }, (_, i) => task({ id: i + 1, title: title + i })));
  assert.equal(ui.count(), 30);
  assert.ok(ui.button("Edit " + title + 29));
  assert.ok(ui.button("Start " + title + 29));
  await ui.press("Edit " + title + 29);
  assert.equal(ui.input("Quest name"), title + 29);
  assert.deepEqual(ui.calls, []);
  await ui.cleanup();
});

test("an in-flight refresh cannot overwrite a successfully saved or deleted quest", async () => {
  let resolveTasks, state;
  const { QuestProvider, useQuests } = load("src/context/QuestContext.tsx", {
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
    "./TimerContext": { useTimer: () => ({ sessionSummary: null }) },
    "../services/taskService": { getTasks: () => new Promise((resolve) => { resolveTasks = resolve; }), getSubjects: async () => subjects },
  });
  function Capture() { state = useQuests(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(QuestProvider, null, React.createElement(Capture))); });
  let refresh;
  await act(async () => { refresh = state.refresh(); });
  await act(async () => { state.upsert(task({ title: "Fresh save" })); });
  await act(async () => { resolveTasks([task()]); await refresh; });
  assert.equal(state.tasks[0].title, "Fresh save");
  await act(async () => { refresh = state.refresh(); });
  await act(async () => { state.remove(1); });
  await act(async () => { resolveTasks([task()]); await refresh; });
  assert.deepEqual(state.tasks, []);
  await act(async () => renderer.unmount());
});

for (const platform of ["ios", "android"]) {
  test(`${platform}: sheet remains mounted through exit and defers navigation until modal dismissal`, async () => {
    let sheetProps, closeCalls = 0, didDismiss = 0, requestedClose = 0;
    const BottomSheet = React.forwardRef((props, ref) => {
      sheetProps = props;
      React.useImperativeHandle(ref, () => ({ close() { closeCalls++; } }));
      return React.createElement("Panel", props, React.createElement(props.handleComponent), props.children, props.footerComponent && React.createElement(props.footerComponent));
    });
    const AppSheet = load("src/components/AppSheet.tsx", {
      "@gorhom/bottom-sheet": { __esModule: true, default: BottomSheet, useBottomSheetSpringConfigs:c=>c,useBottomSheetTimingConfigs:c=>c, BottomSheetBackdrop: host("Backdrop"), BottomSheetFooter: host("SheetFooter") },
      "react-native": { ...native, Modal: host("Modal"), Platform: { OS: platform },
        PanResponder: { create: (handlers) => ({ panHandlers: handlers }) }, useWindowDimensions: () => ({ height: 800 }) },
      "react-native-gesture-handler": { GestureHandlerRootView: host("GestureRoot") },
      "react-native-reanimated": { Easing:{out:fn=>fn,cubic:v=>v}, ReduceMotion: { System: "system" } },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    }).default;
    const props = { visible: true, label: "quests", header: React.createElement("Text", null, "Today's quests"),
      onDismiss: () => { didDismiss++; }, onRequestClose: () => { requestedClose++; } };
    let renderer;
    await act(async () => { renderer = create(React.createElement(AppSheet, props)); });
    assert.equal(sheetProps.enableDynamicSizing, true);
    assert.equal(sheetProps.enablePanDownToClose, true);
    assert.equal(sheetProps.overrideReduceMotion, "system");
    assert.equal(sheetProps.animationConfigs.damping, 38);
    assert.equal(sheetProps.animationConfigs.overshootClamping, true);
    await act(async () => renderer.update(React.createElement(AppSheet, {...props, motionMode:"timed"})));
    assert.equal(sheetProps.animationConfigs.duration, 220);
    assert.equal(sheetProps.overrideReduceMotion, "system");

    assert.equal(sheetProps.android_keyboardInputMode, "adjustResize");
    // Native back and backdrop use the same guarded request, before any unmount.
    await act(async () => renderer.root.findByType("Modal").props.onRequestClose());
    assert.equal(requestedClose, 1);
    await act(async () => renderer.update(React.createElement(AppSheet, { ...props, guardDismiss: true })));
    assert.equal(sheetProps.enablePanDownToClose, false);
    assert.equal(sheetProps.enableContentPanningGesture, true);
    assert.equal(sheetProps.enableHandlePanningGesture, true);
    const originalHandle = sheetProps.handleComponent;
    await act(async () => renderer.update(React.createElement(AppSheet, { ...props, compact: true, header: React.createElement("Text", null, "Personalise") })));
    assert.equal(sheetProps.snapPoints, undefined);
    assert.equal(sheetProps.enableDynamicSizing, true);
    assert.equal(sheetProps.keyboardBehavior, "interactive");
    assert.equal(sheetProps.handleComponent, originalHandle);
    // The footer must not shift above its measured scroll reservation.
    await act(async () => renderer.update(React.createElement(AppSheet, { ...props, compact: true, footer: React.createElement("View", {style:{paddingBottom:34}}, "Save") })));
    assert.equal(renderer.root.findByType("SheetFooter").props.bottomInset, 0);
    const handle = renderer.root.findAllByType("View").find((node) => node.props.onAccessibilityAction);
    await act(async () => handle.props.onAccessibilityAction());
    assert.equal(requestedClose, 2);
    assert.equal(renderer.root.findByType("Modal").props.visible, true);
    await act(async () => renderer.update(React.createElement(AppSheet, { ...props, visible: false })));
    assert.equal(closeCalls, 1);
    assert.equal(renderer.root.findByType("Modal").props.visible, true);
    await act(async () => sheetProps.onClose());
    assert.equal(renderer.root.findByType("Modal").props.visible, false);
    if (platform === "ios") {
      assert.equal(didDismiss, 0);
      await act(async () => renderer.root.findByType("Modal").props.onDismiss());
    }
    assert.equal(didDismiss, 1);
    await act(async () => renderer.unmount());
  });
}

test("upcoming-only quests link to All without hiding Add", async () => {
  const ui = await setup([task({ is_due_today: false, repeat_rule: "Fri", is_recurring: true })]);
  assert.match(ui.output(), /Nothing scheduled for today/);
  assert.ok(ui.button("Add quest"));
  await ui.press("View all quests");
  assert.ok(ui.button("Edit Read a chapter"));
  await ui.cleanup();
});

test("rapid create taps submit once and a failed creation keeps the entered draft", async () => {
  const ui = await setup();
  await ui.press("Add quest");
  await ui.type("Quest name", "Keep my new quest");
  ui.failSave();
  const save = ui.button("Create quest").props.onPress;
  await act(async () => { save(); save(); });
  assert.equal(ui.calls.filter(([action]) => action === "create").length, 1);
  assert.equal(ui.input("Quest name"), "Keep my new quest");
  assert.match(ui.output(), /Couldn't update this quest/);
  await ui.cleanup();
});

test("continuing from a protected row waits for list dismissal", async () => {
  const ui = await setup([task()], true);
  await ui.press("Delete Read a chapter");
  await ui.alertAction("Continue session");
  assert.equal(ui.sheets().length, 1);
  assert.equal(ui.sheets()[0].props.visible, false);
  assert.deepEqual(ui.calls, []);
  await ui.finishDismiss();
  assert.deepEqual(ui.calls, [["navigate", "/session"]]);
  await ui.cleanup();
});

test("Home preserves loaded progress on failure and exposes a retry instead of a permanent refresh button", async () => {
  let refresh, failed = false, progressMinutes = 25, summary = null, creditFields = {}, homeTasks = [], openSession = false, homeFlags = {};
  const sessionCalls = [];
  const name = "A long welcoming username with several words";
  const reloadProfile = async () => true;
  const refreshQuests = async () => {};
  const Home = load("src/app/(tabs)/index.tsx", {
    "../hooks/useReducedMotion": {useReducedMotion: () => true},
    "react-native-svg": {__esModule:true, default:host("Svg"), Circle:host("Circle")},
    "react-native": { ...native, Animated: {createAnimatedComponent:c=>c, Value:class {constructor(value){this.value=value;} setValue(value){this.value=value;} stopAnimation(){} interpolate(config){return {source:this,config};}}}, ScrollView: host("ScrollView"), TouchableOpacity: host("Pressable"), useWindowDimensions: () => ({ height: 640, width: 320, fontScale: 2 }) },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "expo-haptics": {}, "expo-router": { useRouter: () => ({ navigate: route => sessionCalls.push(["navigate",route]) }) },
    "react-native-safe-area-context": { SafeAreaView: host("View"), useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    "../../components/QuestSheet": host("QuestPreviewSheet"),
    "../../components/ContentReveal": ({ children }) => children,
    "../../context/QuestContext": { useQuests: () => ({ tasks: homeTasks, subjects, error: false, refresh: refreshQuests }) },
    "../../context/TimerContext": { useTimer: () => ({ hasOpenSession: openSession, sessionSummary: summary, ...homeFlags,
      setLinkedTaskId: id => sessionCalls.push(["task",id]), setDurationInMinutes: minutes => sessionCalls.push(["duration",minutes]), setTargetAttributeId: id => sessionCalls.push(["area",id]), startTimer: () => sessionCalls.push(["start"]) }) },
    "../../context/UserContext": { useUser: () => ({ profile: { username: name, level: 2, current_xp: 20 }, reloadProfile, hapticsEnabled: false }) },
    "../../services/progressService": { getFocusStreak: async () => 2 },
    "../../services/dailyProgressService": { getTodayProgress: async () => { if (failed) throw Error("Offline"); return { completed_minutes: progressMinutes, ...creditFields }; } },
    "../../hooks/useHomeLifecycle": { useHomeLifecycle: (callback) => { refresh = callback; return 5; } },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Home)); });
  const output = () => JSON.stringify(renderer.toJSON());
  const retry = () => renderer.root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel === "Retry loading Home");
  homeTasks = [task({id: 12, title: "Completed earlier", is_completed: true}), task({id: 13, title: "Tomorrow", is_due_today: false}), task({id: 14, title: "Finished today", is_completed_today: true}), task({id: 15, title: "Read now"}), task({id: 16, title: "Repeat today", is_recurring: true, is_completed: true}), task({id: 17, title: "Third quest"}), task({id: 18, title: "Fourth quest"})];
  await act(async () => renderer.update(React.createElement(Home)));
  const previewRows = () => renderer.root.findAllByType("Pressable").filter(node => node.props.testID?.startsWith("home-quest-"));
  assert.deepEqual(previewRows().map(node => node.props.testID), ["home-quest-15", "home-quest-16", "home-quest-17"]);
  assert.ok(renderer.root.findByProps({testID: "home-quest-card"}));
  const openQuests = renderer.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === "Today's quests, 4 pending");
  assert.ok(openQuests);
  await act(async () => openQuests.props.onPress());
  assert.equal(renderer.root.findByType("QuestPreviewSheet").props.visible, true);
  await act(async () => previewRows()[0].props.onPress());
  assert.deepEqual(sessionCalls, [["task",15],["duration",30],["area",2],["navigate","/session"]]);
  assert.equal(renderer.root.findByType("QuestPreviewSheet").props.visible, false);
  sessionCalls.length = 0;

  homeTasks = homeTasks.map(item => item.id === 15 ? {...item, is_completed_today: true} : item);
  await act(async () => renderer.update(React.createElement(Home)));
  assert.deepEqual(previewRows().map(node => node.props.testID), ["home-quest-16", "home-quest-17", "home-quest-18"]);
  const viewportMargin = () => renderer.root.findByProps({testID: "home-viewport"}).props.style[1].marginBottom;
  const initialMargin = viewportMargin();
  openSession = true;
  await act(async () => renderer.update(React.createElement(Home)));
  assert.equal(viewportMargin(), initialMargin + 56);
  await act(async () => previewRows()[0].props.onPress());
  assert.deepEqual(sessionCalls, [["navigate","/session"]]);
  sessionCalls.length = 0;

  assert.equal(renderer.root.findByProps({testID: "home-layout"}).props.style[1].minHeight, 0);
  openSession = false;
  await act(async () => renderer.update(React.createElement(Home)));
  assert.equal(viewportMargin(), initialMargin);
  for (const flags of [{isRestoring:true},{restoreError:true},{actionBusy:true},{isCompleted:true}]) {
    homeFlags = flags;
    await act(async () => renderer.update(React.createElement(Home)));
    await act(async () => previewRows()[0].props.onPress());
    assert.deepEqual(sessionCalls, [["navigate","/session"]]);
    sessionCalls.length = 0;
  }
  homeFlags = {};
  await act(async () => renderer.update(React.createElement(Home)));
  assert.match(output(), new RegExp("Good morning, " + name));
  assert.equal(retry(), undefined);
  await act(async () => refresh());
  assert.match(output(), /25 \/ 60 min/);
  progressMinutes = 26;
  summary = { id: "saved-session" };
  await act(async () => renderer.update(React.createElement(Home)));
  assert.match(output(), /26 \/ 60 min/);
  failed = true;
  await act(async () => refresh());
  assert.match(output(), /26 \/ 60 min/);
  assert.ok(retry());
  failed = false;
  await act(async () => retry().props.onPress());
  assert.equal(retry(), undefined);
  creditFields = { credit_version: 1, completed_seconds: 30 };
  await act(async () => refresh());
  assert.match(output(), /30s \/ 60 min/);
  creditFields.completed_seconds = 60;
  await act(async () => refresh());
  assert.match(output(), /1m \/ 60 min/);
  creditFields.completed_seconds = 0;
  await act(async () => refresh());
  assert.match(output(), /0m \/ 60 min/);
  await act(async () => renderer.unmount());
});

test("greeting uses the requested local-hour boundaries and username fallback", () => {
  const { homeWelcome } = load("src/utils/homeWelcome.ts", {});
  for (const [hour, expected] of [[0, "Welcome back, Hero"], [4, "Welcome back, Hero"], [5, "Good morning, Hero"], [11, "Good morning, Hero"], [12, "Good afternoon, Hero"], [17, "Good afternoon, Hero"], [18, "Good evening, Hero"], [23, "Good evening, Hero"]]) {
    assert.equal(homeWelcome(hour), expected);
  }
  assert.equal(homeWelcome(0, "  Alex  "), "Welcome back, Alex");
  assert.equal(homeWelcome(12, " "), "Good afternoon, Hero");
  const name = "A very long username ".repeat(5);
  assert.equal(homeWelcome(5, name), "Good morning, " + name.trim());
});

test("concurrent refreshes share work and a completion refresh waits for stale work", async () => {
  const { singleFlight } = load("src/utils/singleFlight.ts", {});
  let calls = 0;
  const finishers = [];
  const refresh = singleFlight(() => {
    calls++;
    return new Promise((resolve) => finishers.push(resolve));
  });
  const first = refresh();
  assert.equal(refresh(), first);
  assert.equal(calls, 1);
  const fresh = refresh(true);
  finishers[0]("stale");
  assert.equal(await first, "stale");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  finishers[1]("fresh");
  assert.equal(await fresh, "fresh");
});

test("quest completion during an old refresh queues a fresh server read", async () => {
  let state, summary = null;
  const finishers = [];
  const { QuestProvider, useQuests } = load("src/context/QuestContext.tsx", {
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
    "./TimerContext": { useTimer: () => ({ sessionSummary: summary }) },
    "../services/taskService": { getTasks: () => new Promise(resolve => finishers.push(resolve)), getSubjects: async () => subjects },
  });
  function Capture() { state = useQuests(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(QuestProvider, null, React.createElement(Capture))); });
  try {
    let pending;
    await act(async () => { pending = state.refresh(); });
    summary = { id: "completed-session" };
    await act(async () => renderer.update(React.createElement(QuestProvider, null, React.createElement(Capture))));
    await act(async () => { finishers[0]([task()]); await pending; });
    assert.equal(finishers.length, 2);
    await act(async () => finishers[1]([task({ is_completed: true, is_completed_today: true })]));
    assert.equal(state.tasks[0].is_completed_today, true);
  } finally { await act(async () => renderer.unmount()); }
});

test("Home updates on focus, foreground and a clock boundary; unfocused Home does not fetch", async () => {
  const RealDate = global.Date;
  const realTimeout = global.setTimeout, realClear = global.clearTimeout;
  let hour = 4, foreground, onFocus, onTick, renderedHour, calls = 0;
  global.Date = class extends RealDate { getHours() { return hour; } };
  global.setTimeout = (callback) => { onTick = callback; return 1; };
  global.clearTimeout = () => {};
  const refresh = async () => { calls++; };
  const { useHomeLifecycle } = load("src/hooks/useHomeLifecycle.ts", {
    "expo-router": { useFocusEffect: (effect) => { onFocus = effect; React.useEffect(effect, [effect]); } },
    "react-native": { AppState: { addEventListener: (_, callback) => { foreground = callback; return { remove() {} }; } } },
  });
  let renderer;
  function Capture() { renderedHour = useHomeLifecycle(refresh); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(Capture)); });
    assert.equal(renderedHour, 4);
    assert.equal(calls, 1);
    hour = 5;
    await act(async () => onTick());
    assert.equal(renderedHour, 5);
    assert.equal(calls, 1);
    hour = 12;
    await act(async () => foreground("active"));
    assert.equal(renderedHour, 12);
    assert.equal(calls, 2);
    let blur;
    hour = 18;
    await act(async () => { blur = onFocus(); });
    assert.equal(renderedHour, 18);
    assert.equal(calls, 3);
    blur();
    await act(async () => foreground("active"));
    assert.equal(calls, 3);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    global.Date = RealDate; global.setTimeout = realTimeout; global.clearTimeout = realClear;
  }
});




test("Done today excludes older one-off completions when loaded from persistence", async () => {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur'}).format(new Date());
  const rows = [
    task({id:1, is_completed:true, last_completed_date:today, completed_at:new Date().toISOString()}),
    task({id:2, is_completed:true, last_completed_date:'2000-01-01', completed_at:'2000-01-01T12:00:00Z'}),
    task({id:3, is_completed:true, last_completed_date:null, completed_at:new Date().toISOString()}),
    task({id:4, is_completed:true, last_completed_date:null, completed_at:null}),
    task({id:5, is_recurring:true, repeat_rule:'daily', last_completed_date:'2000-01-01'}),
  ];
  const service = load('src/services/taskService.ts', {
    '../../lib/supabase': {supabase:{from:()=>({select:()=>({order:async()=>({data:rows,error:null})})})}},
  });
  const saved = await service.getTasks();
  assert.deepEqual(saved.filter(item=>item.is_completed_today).map(item=>item.id).sort(), [1,3]);
  const ui = await setup(saved);
  await ui.press('All quests');
  await ui.press('View completed quests');
  const json = ui.output();
  assert.match(json,/Done today/);
  assert.ok(ui.button('Edit Read a chapter'));
  assert.equal(ui.renderer.root.findAllByType('Pressable').filter(node=>node.props.accessibilityLabel==='Edit Read a chapter').length,2);
  await ui.cleanup();
});

test("clean quest editors use native drag dismissal, dirty drafts retain the discard guard", async () => {
  const ui=await setup([]);
  await ui.press('Add quest');
  const editor=()=>ui.renderer.root.findAllByType('Sheet').find(node=>node.props.label==='quest editor');
  assert.equal(editor().props.guardDismiss,false);
  assert.equal(editor().props.compact,true);
  await ui.type('Quest name','Unsaved quest');
  assert.equal(editor().props.guardDismiss,true);
  await act(async()=>editor().props.onRequestClose());
  assert.match(ui.output(),/Discard changes/);
  await ui.cleanup();
});

test('guarded sheet pull tracks the finger at the list top and leaves inner scrolling to the library', async () => {
  let handlers, closeRequests=0, libraryChanges=0;
  const shared = value => ({get:()=>value,set:next=>{value=next;}});
  const position=shared(300), scroll=shared({contentOffsetY:0});
  const Sheet=React.forwardRef((props, ref)=>{
    handlers=props.gestureEventsHandlersHook();
    React.useImperativeHandle(ref,()=>({close(){}}));
    return React.createElement('Panel',props,props.children);
  });
  const AppSheet=load('src/components/AppSheet.tsx',{
    '@gorhom/bottom-sheet': {__esModule:true,default:Sheet,useBottomSheetSpringConfigs:c=>c,useBottomSheetTimingConfigs:c=>c,BottomSheetBackdrop:host('Backdrop'),BottomSheetFooter:host('Footer'),GESTURE_SOURCE:{HANDLE:1,CONTENT:2},
      useBottomSheetInternal:()=>({animatedPosition:position,animatedScrollableState:scroll}),
      useGestureEventsHandlersDefault:()=>({handleOnStart(){},handleOnChange(){libraryChanges++;},handleOnEnd(){position.set(300);}})},
    'react-native': {...native,Modal:host('Modal'),Platform:{OS:'android'},useWindowDimensions:()=>({height:800})},
    'react-native-gesture-handler': {GestureHandlerRootView:host('GestureRoot')},
    'react-native-reanimated': {Easing:{out:fn=>fn,cubic:v=>v},ReduceMotion:{System:'system'},runOnJS:fn=>fn,useSharedValue:value=>React.useState(()=>shared(value))[0]},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  }).default;
  let tree;
  await act(async()=>{tree=create(React.createElement(AppSheet,{visible:true,guardDismiss:true,label:'editor',header:null,onRequestClose:()=>closeRequests++}));});
  handlers.handleOnStart(1,{translationY:0});
  handlers.handleOnChange(1,{translationY:90});
  assert.equal(position.get(),390);
  handlers.handleOnEnd(1,{translationY:90});
  assert.equal(position.get(),300);
  assert.equal(closeRequests,1);
  scroll.set({contentOffsetY:100});
  handlers.handleOnStart(2,{translationY:0});
  handlers.handleOnChange(2,{translationY:90});
  handlers.handleOnEnd(2,{translationY:90});
  assert.equal(closeRequests,1);
  assert.equal(libraryChanges,2);
  await act(async()=>tree.unmount());
});


test("Home and sheet share today's unfinished scope, preserving order and excluding historical one-off completions", () => {
  const { questLists } = load("src/utils/questLists.ts", {});
  const input = [task({id: 10, is_due_today: false}), task({id: 3}), task({id: 4, is_completed: true}), task({id: 5, is_completed_today: true}), task({id: 6, is_recurring: true, is_completed: true}), task({id: 7})];
  const {today, available, done} = questLists(input);
  assert.deepEqual(today.map(item => item.id), [3, 6, 7]);
  assert.deepEqual(available.map(item => item.id), [3, 6, 7, 10]);
  assert.deepEqual(done.map(item => item.id), [5]);
  assert.deepEqual(input.map(item => item.id), [10, 3, 4, 5, 6, 7]);
});


test("reopening Home's quest sheet restores Today after All or Done today", async () => {
  const ui = await setup([task(), task({id: 2, title: "Upcoming", is_due_today: false}), task({id: 3, title: "Already done", is_completed_today: true})]);
  await ui.press("All quests");
  assert.ok(ui.button("Edit Upcoming"));
  await ui.dismiss();
  await ui.finishDismiss();
  await ui.reopen();
  assert.equal(ui.button("Edit Upcoming"), undefined);
  assert.ok(ui.button("Edit Read a chapter"));
  await ui.press("View completed quests");
  assert.ok(ui.button("Edit Already done"));
  await ui.dismiss();
  await ui.finishDismiss();
  await ui.reopen();
  assert.equal(ui.button("Edit Already done"), undefined);
  assert.ok(ui.button("Edit Read a chapter"));
  await ui.cleanup();
});

test("Home dock clearance uses native height and rejects stale banner or text-scale measurements", async () => {
  const {FloatingDockProvider, useMeasureFloatingDock, useFloatingDockHeight, floatingDockKey} = load("src/context/FloatingDockContext.tsx", {});
  let banner = false, scale = 1, measure;
  const key = () => floatingDockKey(banner, 24, 390, scale);
  function Consumer() {
    measure = useMeasureFloatingDock();
    return React.createElement("DockSpace", {height: useFloatingDockHeight(key(), banner ? 154 : 98)});
  }
  function Harness() { return React.createElement(FloatingDockProvider, null, React.createElement(Consumer)); }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const height = () => renderer.root.findByType("DockSpace").props.height;
  assert.equal(height(), 98);
  await act(async () => measure(key(), 104));
  assert.equal(height(), 104);
  banner = true;
  await act(async () => renderer.update(React.createElement(Harness)));
  assert.equal(height(), 154);
  await act(async () => measure(key(), 180));
  assert.equal(height(), 180);
  await act(async () => measure(key(), 0));
  assert.equal(height(), 180);
  const oldKey = key();
  scale = 2;
  await act(async () => renderer.update(React.createElement(Harness)));
  assert.equal(height(), 154);
  await act(async () => measure(oldKey, 180));
  assert.equal(height(), 154);
  await act(async () => measure(key(), 210));
  assert.equal(height(), 210);
  banner = false;
  await act(async () => renderer.update(React.createElement(Harness)));
  assert.equal(height(), 98);
  await act(async () => renderer.unmount());
});


test("Today and All occupy equal native containers with identical full-width touch targets", async () => {
  const ui = await setup([task(), task({id:2, title:"Upcoming", is_due_today:false})]);
  const today = ui.button("Today"), all = ui.button("All quests");
  assert.equal(ui.sheets()[0].props.motionMode,"timed");
  assert.equal(today.props.style.width, "100%");
  assert.equal(today.props.style.flex, undefined);
  assert.deepEqual(today.props.style, all.props.style);
  const slots = ui.renderer.root.findAllByType("View").filter(node => node.props.style?.flex === 1 && node.props.style?.minWidth === 0 && node.findAllByType("Pressable").some(button => ["Today", "All quests"].includes(button.props.accessibilityLabel)));
  assert.equal(slots.length, 2);
  assert.deepEqual(slots[0].props.style, slots[1].props.style);
  assert.equal(today.props.accessibilityState.selected, true);
  assert.equal(all.props.accessibilityState.selected, false);
  await ui.press("All quests");
  assert.equal(ui.button("All quests").props.accessibilityState.selected, true);
  assert.ok(ui.button("Edit Upcoming"));
  await ui.press("Today");
  assert.equal(ui.button("Edit Upcoming"), undefined);
  await ui.cleanup();
});

async function quickHomeSetup(history = null, start = async () => true) {
  const calls=[];
  let owner="owner-a", timerFlags={}, historyValue=history;
  const setters = {
    setLinkedTaskId:v=>calls.push(["task",v]), setTargetAttributeId:v=>calls.push(["area",v]),
    setDurationInMinutes:v=>calls.push(["minutes",v]), setDurationInSeconds:v=>calls.push(["seconds",v]),
    setActivityType:v=>calls.push(["activity",v]), setNotes:v=>calls.push(["notes",v]),
  };
  const Home=load("src/app/(tabs)/index.tsx", {
    "react-native":{...native, ScrollView:host("ScrollView"), useWindowDimensions:()=>({height:800,width:390,fontScale:1})},
    "@expo/vector-icons":{Ionicons:host("Icon")}, "expo-haptics":{},
    "expo-router":{useRouter:()=>({navigate:route=>calls.push(["navigate",route])})},
    "react-native-safe-area-context":{SafeAreaView:host("View"),useSafeAreaInsets:()=>({top:24,bottom:24})},
    "../../components/GoalRing":host("GoalRing"), "../../components/CharacterMark":host("CharacterMark"),
    "../../components/ContentReveal":({children})=>children, "../../components/QuestSheet":host("QuestSheet"),
    "../../context/QuestContext":{useQuests:()=>({tasks:[],subjects,loading:false,refresh:async()=>{}})},
    "../../context/UserContext":{useUser:()=>({profile:{id:owner,username:"Soon",daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
    "../../context/TimerContext":{useTimer:()=>({...setters,...timerFlags,startFreeTimer:async(seconds,area)=>{calls.push(["start",seconds,area]);return start();}})},
    "../../services/progressService":{getFocusStreak:async()=>0,getLastFreeSession:async id=>{calls.push(["history",id]);return historyValue;}},
    "../../services/dailyProgressService":{getTodayProgress:async()=>null},
    "../../hooks/useHomeLifecycle":{useHomeLifecycle:()=>12},
  }).default;
  let renderer; await act(async()=>{renderer=create(React.createElement(Home));});
  return {calls,renderer,button:id=>renderer.root.findAllByType("Pressable").find(node=>node.props.testID===id),
    update:async(flags={},newOwner=owner,nextHistory=historyValue)=>{timerFlags=flags;owner=newOwner;historyValue=nextHistory;await act(async()=>renderer.update(React.createElement(Home)));},
    output:()=>JSON.stringify(renderer.toJSON()),cleanup:async()=>{await act(async()=>renderer.unmount());}};
}
test("Home Quick Start shows exact remembered choice, ignores rapid taps and navigates only after success", async()=>{
  let resolve; const pending=new Promise(r=>resolve=r);
  const ui=await quickHomeSetup({task_id:null,subject_id:2,duration_seconds:1859},()=>pending);
  try {
    assert.match(ui.output(),/30 min 59 sec/); assert.match(ui.output(),/Learning/);
    let first;
    await act(async()=>{first=ui.button("home-start-focus").props.onPress();ui.button("home-start-focus").props.onPress();});
    assert.deepEqual(ui.calls.filter(c=>c[0]==="start"),[["start",1859,2]]);
    assert.equal(ui.calls.filter(c=>c[0]==="navigate").length,0);
    assert.equal(ui.button("home-start-focus").props.disabled,true);
    await act(async()=>{resolve(true);await first;});
    assert.deepEqual(ui.calls.filter(c=>c[0]==="navigate"),[["navigate","/session"]]);
  }finally{await ui.cleanup();}
});
test("Home failure stays actionable and Change configures exact seconds instead of starting", async()=>{
  let succeeded=false; const ui=await quickHomeSetup(null,async()=>succeeded);
  try {
    assert.match(ui.output(),/30 min/);
    await act(async()=>ui.button("home-start-focus").props.onPress());
    assert.match(ui.output(),/Retry start/);
    assert.equal(ui.calls.filter(c=>c[0]==="navigate").length,0);
    succeeded=true;
    await act(async()=>ui.button("home-start-focus").props.onPress());
    assert.deepEqual(ui.calls.filter(c=>c[0]==="start"),[["start",1800,1],["start",1800,1]]);
    ui.calls.length=0;
    await act(async()=>ui.button("home-change-focus").props.onPress());
    assert.deepEqual(ui.calls,[["task",null],["area",1],["activity","other"],["notes",""],["seconds",1800],["navigate","/session"]]);
  }finally{await ui.cleanup();}
});
test("Home continues active or paused sessions and protects restoration/completion before starting",async()=>{
  const ui=await quickHomeSetup();
  try {
    for(const isRunning of [true,false]) {
      await ui.update({hasOpenSession:true,isRunning,timeLeft:125,targetAttributeId:2});
      assert.match(ui.output(),/2 min 5 sec/);
      await act(async()=>ui.button("home-start-focus").props.onPress());
      assert.equal(ui.calls.filter(c=>c[0]==="start").length,0);
      assert.equal(ui.button("home-change-focus"),undefined);
    }
    for(const flag of [{isRestoring:true},{restoreError:true},{actionBusy:true},{isCompleted:true}]) {
      await ui.update(flag);assert.equal(ui.button("home-start-focus").props.disabled,true);
      await act(async()=>ui.button("home-start-focus").props.onPress());
    }
    assert.equal(ui.calls.filter(c=>c[0]==="start").length,0);
  }finally{await ui.cleanup();}
});
test("Home history does not leak across accounts; missing areas fall back to General and tiny/quest rows are ignored",async()=>{
  const ui=await quickHomeSetup({task_id:null,subject_id:99,duration_seconds:1859});
  try {
    assert.equal(ui.button("home-start-focus").props.accessibilityLabel,"Start 30 min 59 sec, General");
    await ui.update({},"owner-b",null);
    assert.equal(ui.button("home-start-focus").props.accessibilityLabel,"Start 30 min, General");
    await ui.update({},"owner-c",{task_id:2,subject_id:2,duration_seconds:900});
    assert.equal(ui.button("home-start-focus").props.accessibilityLabel,"Start 30 min, General");
    await ui.update({},"owner-d",{task_id:null,subject_id:2,duration_seconds:30});
    assert.equal(ui.button("home-start-focus").props.accessibilityLabel,"Start 30 min, General");
  }finally{await ui.cleanup();}
});
