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
  let currentTasks, failSave = false;
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
    setTaskCompletion: async (item, complete) => ({ ...item, is_completed_today: complete, is_completed: complete }),
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
    calls, alerts, button, tasks: () => currentTasks, failSave: () => { failSave = true; },
    sheets: () => renderer.root.findAllByType("Sheet"),
    count: () => currentTasks.filter((item) => item.is_due_today && !item.is_completed_today).length,
    press: async (label) => { const node = button(label); assert.ok(node, `Missing button: ${label}`); await act(async () => node.props.onPress()); },
    type: async (label, value) => { await act(async () => renderer.root.findAllByType("Input").find((node) => node.props.accessibilityLabel === label).props.onChangeText(value)); },
    input: (label) => renderer.root.findAllByType("Input").find((node) => node.props.accessibilityLabel === label)?.props.value,
    alertAction: async (label) => { const action = button(label); assert.ok(action); await act(async () => action.props.onPress()); },
    dismiss: async () => { await act(async () => renderer.root.findAllByType("Sheet").at(-1).props.onRequestClose()); },
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

test("complete, reopen, and delete update today's count immediately", async () => {
  const ui = await setup([task()]);
  await ui.press("Mark complete: Read a chapter");
  assert.equal(ui.count(), 0);
  assert.match(ui.output(), /All done for today/);
  assert.equal(ui.button("Start Read a chapter"), undefined);
  await ui.press("Mark unfinished: Read a chapter");
  assert.equal(ui.count(), 1);
  await ui.press("Delete Read a chapter");
  await ui.alertAction("Delete quest");
  assert.equal(ui.tasks().length, 0);
  assert.equal(ui.count(), 0);
  await ui.cleanup();
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
  assert.equal(ui.button("Mark complete: Read a chapter").props.disabled, true);
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
      return React.createElement("Panel", props, React.createElement(props.handleComponent), props.children);
    });
    const AppSheet = load("src/components/AppSheet.tsx", {
      "@gorhom/bottom-sheet": { __esModule: true, default: BottomSheet, BottomSheetBackdrop: host("Backdrop") },
      "react-native": { ...native, Modal: host("Modal"), Platform: { OS: platform },
        PanResponder: { create: (handlers) => ({ panHandlers: handlers }) }, useWindowDimensions: () => ({ height: 800 }) },
      "react-native-gesture-handler": { GestureHandlerRootView: host("GestureRoot") },
      "react-native-reanimated": { ReduceMotion: { System: "system" } },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    }).default;
    const props = { visible: true, label: "quests", header: React.createElement("Text", null, "Today's quests"),
      onDismiss: () => { didDismiss++; }, onRequestClose: () => { requestedClose++; } };
    let renderer;
    await act(async () => { renderer = create(React.createElement(AppSheet, props)); });
    assert.equal(sheetProps.enableDynamicSizing, true);
    assert.equal(sheetProps.enablePanDownToClose, true);
    assert.equal(sheetProps.overrideReduceMotion, "system");
    assert.equal(sheetProps.android_keyboardInputMode, "adjustResize");
    // Native back and backdrop use the same guarded request, before any unmount.
    await act(async () => renderer.root.findByType("Modal").props.onRequestClose());
    assert.equal(requestedClose, 1);
    await act(async () => renderer.update(React.createElement(AppSheet, { ...props, guardDismiss: true })));
    assert.equal(sheetProps.enablePanDownToClose, false);
    assert.equal(sheetProps.enableContentPanningGesture, true);
    assert.equal(sheetProps.enableHandlePanningGesture, true);
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
  let refresh, failed = false, progressMinutes = 25, summary = null;
  const name = "A long welcoming username with several words";
  const reloadProfile = async () => true;
  const refreshQuests = async () => {};
  const Home = load("src/app/(tabs)/index.tsx", {
    "react-native": { ...native, ScrollView: host("ScrollView"), TouchableOpacity: host("Pressable"), useWindowDimensions: () => ({ height: 640, width: 320, fontScale: 2 }) },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "expo-haptics": {}, "expo-router": { useRouter: () => ({ push() {} }) },
    "react-native-safe-area-context": { SafeAreaView: host("View"), useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    "../../components/QuestSheet": () => null,
    "../../context/QuestContext": { useQuests: () => ({ tasks: [], error: false, refresh: refreshQuests }) },
    "../../context/TimerContext": { useTimer: () => ({ hasOpenSession: false, sessionSummary: summary }) },
    "../../context/UserContext": { useUser: () => ({ profile: { username: name, level: 2, current_xp: 20 }, reloadProfile, hapticsEnabled: false }) },
    "../../services/progressService": { getFocusStreak: async () => 2 },
    "../../services/dailyProgressService": { getTodayProgress: async () => { if (failed) throw Error("Offline"); return { completed_minutes: progressMinutes }; } },
    "../../hooks/useHomeLifecycle": { useHomeLifecycle: (callback) => { refresh = callback; return 5; } },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Home)); });
  const output = () => JSON.stringify(renderer.toJSON());
  const retry = () => renderer.root.findAllByType("Pressable").find((node) => node.props.accessibilityLabel === "Retry loading Home");
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


