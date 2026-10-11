/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file); if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = [".ts", ".tsx"].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, cache);
  }, mod, mod.exports); return mod.exports;
}
const memory = () => { const values = new Map(); return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } }; };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const storeModule = storage => load("src/services/notificationOnboardingStore.ts", { "@react-native-async-storage/async-storage": storage });

test("notification invitations require genuine onboarding preparation and remain handled after another guide", async () => {
  const storage = memory(), { createNotificationOnboardingStore, notificationInvitationKey } = storeModule(storage);
  const store = createNotificationOnboardingStore(storage);
  await store.finishGuide("existing", () => true);
  assert.equal(await store.read("existing", () => true), null);
  await store.prepare("new"); assert.equal(await store.read("new", () => true), "pending-guide");
  await store.finishGuide("new", () => true); assert.equal(await store.read("new", () => true), "ready");
  await store.dismiss("new", () => true); await store.prepare("new"); await store.finishGuide("new", () => true);
  assert.equal(storage.values.get(notificationInvitationKey("new")), "handled");
  storage.values.set(notificationInvitationKey("malformed"), "enabled-by-another-user");
  assert.equal(await store.read("malformed", () => true), null);
});

test("owner-scoped invitation writes serialize and stale reads cannot prepare or dismiss another account", async () => {
  const storage = memory(), api = storeModule(storage), store = api.createNotificationOnboardingStore(storage);
  await Promise.all([store.prepare("alice"), store.finishGuide("alice", () => true)]);
  assert.equal(await store.read("alice", () => true), "ready");
  const read = storage.getItem, wait = deferred(); let current = true;
  storage.getItem = async key => key === api.notificationInvitationKey("alice") ? wait.promise : read(key);
  const pending = store.dismiss("alice", () => current);
  await Promise.resolve(); current = false; wait.resolve("ready"); await pending;
  assert.equal(storage.values.get(api.notificationInvitationKey("alice")), "ready");
  assert.equal(storage.values.has(api.notificationInvitationKey("bob")), false);
  await store.prepare("bob", () => false);
  assert.equal(storage.values.has(api.notificationInvitationKey("bob")), false);
});

async function promptHarness(options = {}) {
  const storage = options.storage ?? memory(), cache = new Map();
  let owner = options.owner ?? "alice", epoch = 1, pathname = options.route ?? "/", tourActive = options.tourActive ?? false, revision = 0;
  let timer = options.timer ?? {}, renderer;
  const permission = options.permission ?? { label: "Not allowed", action: "enable", supported: true, granted: false };
  const counts = { reads: 0, requests: 0, settings: 0 };
  const mocked = {
    "@react-native-async-storage/async-storage": storage,
    "react-native": { View: host("View"), AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
    "@gorhom/bottom-sheet": { BottomSheetView: host("Body") }, "@expo/vector-icons": { Ionicons: host("Icon") },
    "expo-router": { usePathname: () => pathname }, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 24 }) },
    "../context/AuthContext": { useAuth: () => ({ user: { id: owner }, admissionEpoch: epoch, accessMode: "online" }) },
    "../context/UserContext": { useUser: () => ({ profile: { id: owner, onboarding_completed: true } }) },
    "../context/TimerContext": { useTimer: () => timer },
    "../services/notificationPermissionService": {
      readNotificationPermission: async () => { counts.reads++; return options.readWait ? options.readWait : permission; },
      enableNotifications: async () => { counts.requests++; if (options.enableError) throw Error("Network"); return options.enableWait ? options.enableWait : permission; },
      openNotificationSettings: async () => { counts.settings++; },
    },
    "./AppSheet": host("Sheet"), "./AppText": { Text: host("Text") }, "./PersonalUI": { p: {}, PersonalButton: host("Button") },
  };
  const store = load("src/services/notificationOnboardingStore.ts", mocked, cache).notificationOnboardingStore;
  const sheets = load("src/utils/sheetActivity.ts", mocked, cache);
  if (options.prepared !== false) { await store.prepare(owner); if (options.guideDone !== false) await store.finishGuide(owner, () => true); }
  let otherSheet = options.otherSheet ? sheets.registerSheetActivity(Symbol("other-sheet")) : null;
  const Component = load("src/components/NotificationOnboardingPrompt.tsx", mocked, cache).default;
  const element = () => React.createElement(Component, { tourActive, revision });
  await act(async () => { renderer = create(element()); });
  return { storage, store, counts,
    visible: () => renderer.root.findByType("Sheet").props.visible,
    button: title => renderer.root.findAllByType("Button").find(node => node.props.title === title),
    text: () => renderer.root.findAllByType("Text").map(node => node.props.children).join(" "),
    change: values => act(async () => {
      if (values.owner) { owner = values.owner; epoch++; }
      if (values.route !== undefined) pathname = values.route;
      if (values.tourActive !== undefined) tourActive = values.tourActive;
      if (values.timer !== undefined) timer = values.timer;
      if (values.dismissOther && otherSheet) { otherSheet(); otherSheet = null; }
      revision++; renderer.update(element());
    }),
    refresh: () => act(async () => { revision++; renderer.update(element()); }),
    cleanup: () => act(async () => { renderer.unmount(); otherSheet?.(); }),
  };
}

test("existing accounts and unfinished guides receive no invitation and no permission query", async () => {
  for (const options of [{ prepared: false }, { guideDone: false }, { tourActive: true }]) {
    const ui = await promptHarness(options);
    try { assert.equal(ui.visible(), false); assert.equal(ui.counts.reads, 0); assert.equal(ui.counts.requests, 0); }
    finally { await ui.cleanup(); }
  }
});

test("finished new-user guide shows an optional invitation; Not now persists across restart without requesting permission", async () => {
  const storage = memory(), ui = await promptHarness({ storage });
  try {
    assert.equal(ui.visible(), true); assert.equal(ui.counts.requests, 0);
    assert.match(ui.text(), /change this anytime in Settings/);
    await act(async () => ui.button("Not now").props.onPress());
    assert.equal(ui.visible(), false); assert.equal(ui.counts.requests, 0);
  } finally { await ui.cleanup(); }
  const reopened = await promptHarness({ storage });
  try { assert.equal(reopened.visible(), false); assert.equal(reopened.counts.reads, 0); }
  finally { await reopened.cleanup(); }
});

test("already allowed notifications consume the invitation silently and unsupported Expo Go keeps it for an installed build", async () => {
  for (const [permission, handled] of [
    [{ label: "Allowed", action: "settings", supported: true, granted: true }, true],
    [{ label: "Unavailable", action: null, supported: false }, false],
  ]) {
    const ui = await promptHarness({ permission });
    try {
      assert.equal(ui.visible(), false); assert.equal(ui.counts.requests, 0);
      assert.equal(await ui.store.read("alice", () => true), handled ? "handled" : "ready");
    } finally { await ui.cleanup(); }
  }
});

test("Enable requests permission only after consent, ignores rapid taps and does not nag after a denied choice", async () => {
  const wait = deferred(), ui = await promptHarness({ enableWait: wait.promise });
  try {
    const handler = ui.button("Enable notifications").props.onPress;
    await act(async () => { handler(); handler(); });
    assert.equal(ui.counts.requests, 1); assert.equal(ui.button("Please wait…").props.disabled, true);
    await act(async () => wait.resolve({ granted: false, supported: true, action: "settings" }));
    assert.equal(ui.visible(), false); assert.equal(await ui.store.read("alice", () => true), "handled");
    await ui.refresh(); assert.equal(ui.visible(), false);
  } finally { await ui.cleanup(); }
});

test("a previously denied system permission opens notification settings instead of repeating an OS permission prompt", async () => {
  const ui = await promptHarness({ permission: { label: "Not allowed", supported: true, action: "settings", granted: false } });
  try {
    await act(async () => ui.button("Open notification settings").props.onPress());
    assert.equal(ui.counts.settings, 1); assert.equal(ui.counts.requests, 0); assert.equal(ui.visible(), false);
  } finally { await ui.cleanup(); }
});

test("late permission reads and saved UI callbacks cannot affect a different account", async () => {
  const wait = deferred(), ui = await promptHarness({ readWait: wait.promise });
  try {
    assert.equal(ui.visible(), false);
    await ui.change({ owner: "bob" });
    await act(async () => wait.resolve({ action: "enable", supported: true, granted: false }));
    assert.equal(ui.visible(), false); assert.equal(ui.counts.requests, 0);
    assert.equal(await ui.store.read("alice", () => true), "ready");
    assert.equal(await ui.store.read("bob", () => true), null);
  } finally { await ui.cleanup(); }
  const active = await promptHarness();
  try {
    const stale = active.button("Enable notifications").props.onPress;
    await active.change({ owner: "bob" });
    await act(async () => stale());
    assert.equal(active.counts.requests, 0); assert.equal(active.visible(), false);
    assert.equal(await active.store.read("alice", () => true), "ready");
  } finally { await active.cleanup(); }
});

test("the invitation defers while sessions, recovery, rewards, another page or another sheet are active", async () => {
  for (const options of [
    { timer: { hasOpenSession: true } }, { timer: { isRestoring: true } }, { timer: { restoreError: true } },
    { timer: { rewardsVisible: true } }, { timer: { isCompleted: true, sessionSummary: null } },
    { route: "/profile" }, { otherSheet: true },
  ]) {
    const ui = await promptHarness(options);
    try {
      assert.equal(ui.visible(), false); assert.equal(ui.counts.reads, 0);
      await ui.change({ timer: {}, route: "/", dismissOther: true });
      assert.equal(ui.visible(), true); assert.equal(ui.counts.requests, 0);
    } finally { await ui.cleanup(); }
  }
});

test("a failed permission action keeps a reachable retry and Not now choice", async () => {
  const ui = await promptHarness({ enableError: true });
  try {
    await act(async () => ui.button("Enable notifications").props.onPress());
    assert.equal(ui.visible(), true); assert.match(ui.text(), /Couldn’t finish that step/);
    assert.equal(ui.button("Not now").props.disabled, false);
    await act(async () => ui.button("Not now").props.onPress());
    assert.equal(ui.visible(), false);
  } finally { await ui.cleanup(); }
});

test("the sheet activity registry excludes its own invitation and releases blockers on close", () => {
  const api = load("src/utils/sheetActivity.ts"), a = Symbol("a"), b = Symbol("b");
  const releaseA = api.registerSheetActivity(a), releaseB = api.registerSheetActivity(b);
  assert.equal(api.activeSheetCount(a), 1); assert.equal(api.activeSheetCount(), 2);
  releaseB(); assert.equal(api.activeSheetCount(a), 0); releaseA(); assert.equal(api.activeSheetCount(), 0);
});

async function realSheetHarness(platform) {
  const cache = new Map();
  let sheetProps, renderer, dismissals = 0, closes = 0;
  const BottomSheet = React.forwardRef(function BottomSheet(props, ref) {
    sheetProps = props;
    React.useImperativeHandle(ref, () => ({ close() { closes++; } }));
    return React.createElement("Panel", props, props.children);
  });
  const mocked = {
    "@gorhom/bottom-sheet": { __esModule: true, default: BottomSheet, useBottomSheetSpringConfigs: value => value,
      useBottomSheetTimingConfigs: value => value, BottomSheetBackdrop: host("Backdrop"), BottomSheetFooter: host("Footer") },
    "react-native": { View: host("View"), Modal: host("Modal"), Pressable: host("Button"),
      Platform: { OS: platform }, StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ height: 800 }), Keyboard: { dismiss() {}, isVisible: () => false, addListener: () => ({ remove() {} }) } },
    "react-native-gesture-handler": { GestureHandlerRootView: host("GestureRoot") },
    "react-native-reanimated": { Easing: { out: value => value, cubic: value => value }, ReduceMotion: { System: "system" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 34 }) },
  };
  const registry = load("src/utils/sheetActivity.ts", mocked, cache);
  const Component = load("src/components/AppSheet.tsx", mocked, cache).default;
  const element = visible => React.createElement(Component, { visible, label: "goal", header: null,
    onRequestClose() {}, onDismiss() { dismissals++; } }, React.createElement("Content"));
  await act(async () => { renderer = create(element(true)); });
  return { count: () => registry.activeSheetCount(), visible: () => renderer.root.findByType("Modal").props.visible,
    nativeDismiss: () => renderer.root.findByType("Modal").props.onDismiss,
    close: () => act(async () => sheetProps.onClose()), change: visible => act(async () => renderer.update(element(visible))),
    dismissals: () => dismissals, closes: () => closes, cleanup: () => act(async () => renderer.unmount()) };
}

test("real AppSheet retains the iOS blocker until native dismissal and ignores an older dismissal after reopen", async () => {
  const ui = await realSheetHarness("ios");
  try {
    assert.equal(ui.count(), 1);
    await ui.change(false); assert.equal(ui.closes(), 1); assert.equal(ui.visible(), true); assert.equal(ui.count(), 1);
    const oldDismiss = ui.nativeDismiss();
    await ui.close(); assert.equal(ui.visible(), false); assert.equal(ui.count(), 1); assert.equal(ui.dismissals(), 0);
    await ui.change(true); assert.equal(ui.visible(), true); assert.equal(ui.count(), 1);
    await act(async () => oldDismiss());
    assert.equal(ui.count(), 1); assert.equal(ui.dismissals(), 0);
    await ui.change(false); await ui.close(); assert.equal(ui.count(), 1);
    const dismissal = ui.nativeDismiss();
    await act(async () => dismissal());
    assert.equal(ui.count(), 0); assert.equal(ui.dismissals(), 1);
    await act(async () => dismissal()); assert.equal(ui.dismissals(), 1);
  } finally { await ui.cleanup(); }
});

test("real AppSheet releases Android/web blockers on close and releases every platform on component unmount", async () => {
  for (const platform of ["android", "web", "ios"]) {
    const ui = await realSheetHarness(platform);
    const dismissAfterUnmount = ui.nativeDismiss();
    try {
      await ui.change(false); await ui.close();
      assert.equal(ui.count(), platform === "ios" ? 1 : 0);
      if (platform !== "ios") assert.equal(ui.dismissals(), 1);
      await ui.change(true); assert.equal(ui.count(), 1);
    } finally { await ui.cleanup(); }
    assert.equal(ui.count(), 0);
    const before = ui.dismissals();
    await act(async () => dismissAfterUnmount());
    assert.equal(ui.dismissals(), before);
  }
});
