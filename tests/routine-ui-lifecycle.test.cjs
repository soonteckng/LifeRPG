const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
function loader(mocks) {
  const cache = new Map();
  return function load(file) {
    const filename = path.resolve(__dirname, '..', file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith('.')) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const ext = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
      return load(path.relative(path.resolve(__dirname, '..'), target + ext));
    }, module, module.exports);
    return module.exports;
  };
}
const scope = { ownerId: 'owner-a', backendId: 'fixture' };
const subjects = [{ id: 2, title: 'Learning', color_code: null }];
const routine = { id: 'routine-a', revision: 1, name: 'Review notes', durationSeconds: 75, focusAreaId: 2,
  reminder: { enabled: true, hour: 18, minute: 0 }, deletedAt: null };
function base() {
  return {
    'react-native': { View: host('View'), ScrollView: host('HScroll'), Platform: { OS: 'android' }, StyleSheet: { create: v => v, hairlineWidth: 1 },
      Keyboard: { dismiss() {} }, Switch: host('Switch'), AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@expo/vector-icons': { Ionicons: host('Icon') },
    '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
    // Swipe actions are a gesture layer over the same rows; render the row itself.
    'react-native-gesture-handler/ReanimatedSwipeable': { __esModule: true, default: props => props.children },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-haptics': { selectionAsync: async () => {} },
    './AppText': { Text: host('Text') }, './MotionPressable': host('Press'),
    '../hooks/useGuidedPreference': { useGuidedPreference: () => ({ value: { enabled: false } }) },
    // Edit mode's wiggle is motion only; render its rows and ✎/− buttons directly.
    './EditMode': {Wiggle:props=>React.createElement('View',{style:props.style,testID:props.active?'wiggling':undefined},props.children),EditBadges:props=>React.createElement('View',{testID:'edit-badges'},props.onEdit&&React.createElement('Press',{accessibilityLabel:`Edit ${props.name}`,onPress:props.onEdit}),props.onRemove&&React.createElement('Press',{accessibilityLabel:`Remove ${props.name}`,onPress:props.onRemove}))},
    './AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.footer, props.overlay),
    './RoutineEditorSheet': host('Editor'), './QuestSheet': host('LegacyEditor'),
    './FocusLengthControl': host('Duration'), './SheetConfirmation': host('Confirm'),
    '../services/routineWidgetService': { routineWidgetsSupported: async () => false, pinSavedRoutine: async () => true },
    '../context/UserContext': { useUser: () => ({ profile: { id: scope.ownerId }, hapticsEnabled: false, soundEnabled: false }) },
  };
}
async function pendingCard() {
  const calls = [], pending = [];
  let state = { ready: true, scope, admissionEpoch: 1, online: true, routines: [routine], pendingCount: 0, conflicts: [] };
  let props = { subjects, active: true }, timer = {};
  const load = loader({ ...base(),
    'expo-router': { useRouter: () => ({ push: route => calls.push(['route', route]) }) },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => state },
    '../context/TimerContext': { useTimer: () => ({ ...timer, setLinkedTaskId: v => calls.push(['task', v]), setTargetAttributeId: v => calls.push(['area', v]),
      setNotes: v => calls.push(['notes', v]), setDurationInSeconds: v => calls.push(['seconds', v]), reviewSummary() {} }) },
    '../services/savedRoutineService': { resolveSavedRoutine: () => new Promise(resolve => pending.push(resolve)) },
  });
  const Card = load('src/components/SavedRoutinesCard.tsx').default;
  let tree; await act(async () => { tree = create(React.createElement(Card, props)); });
  return { calls, pending,
    output: () => tree.root.findAllByType('Text').map(node => node.children.filter(child => typeof child === 'string').join('')).join(' '),
    // Play reads the latest routine, then opens the setup screen filled in with it.
    start: async () => {
      await act(async () => { tree.root.findAllByType('Press').find(n => n.props.accessibilityLabel === 'Start routine Review notes').props.onPress(); });
    },
    update: async change => { state = { ...state, ...change.state }; props = { ...props, ...change.props }; timer = { ...timer, ...change.timer };
      await act(async () => tree.update(React.createElement(Card, props))); },
    release: async index => act(async () => { pending[index](routine); }),
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('a delayed routine read cannot restart after a surface, account, admission or eligibility change', async () => {
  const changes = [
    [{ props: { active: false } }, { props: { active: true } }],
    [{ state: { scope: { ...scope, ownerId: 'owner-b' } } }, { state: { scope } }],
    [{ state: { admissionEpoch: 2 } }],
    [{ timer: { hasOpenSession: true } }],
    [{ state: { ready: false } }],
  ];
  for (const sequence of changes) {
    const ui = await pendingCard();
    try {
      await ui.start(); assert.equal(ui.pending.length, 1);
      for (const change of sequence) await ui.update(change);
      await ui.release(0); assert.deepEqual(ui.calls, []);
    } finally { await ui.cleanup(); }
  }
});

test('an old routine read cannot unlock a newer pending play or open setup twice', async () => {
  const ui = await pendingCard();
  try {
    await ui.start();
    await ui.update({ props: { active: false } }); await ui.update({ props: { active: true } });
    await ui.start(); assert.equal(ui.pending.length, 2);
    await ui.release(0); await ui.start(); assert.equal(ui.pending.length, 2);
    await ui.release(1);
    assert.deepEqual(ui.calls, [['task', null], ['area', 2], ['notes', 'liferpg:routine:v1:{"name":"Review notes"}'], ['seconds', 75], ['route', '/session']]);
  } finally { await ui.cleanup(); }
});

test('routine pending status distinguishes an active sync from a failed retry and clears after acknowledgement', async () => {
  const ui = await pendingCard();
  try {
    await ui.update({ state: { pendingCount: 1, busy: true, error: null } });
    assert.match(ui.output(), /Syncing routine changes/);
    await ui.update({ state: { busy: false, error: "Saved on this phone. We'll sync your routines when the connection returns." } });
    assert.doesNotMatch(ui.output(), /Syncing routine changes/);
    assert.match(ui.output(), /Couldn't sync yet. We'll retry automatically/);
    await ui.update({ state: { pendingCount: 0, error: null } });
    assert.doesNotMatch(ui.output(), /Saved on this phone/);
  } finally { await ui.cleanup(); }
});

function reminderHarness() {
  let granted = false;
  const scheduled = new Map(), calls = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 3, LOW: 2 }, SchedulableTriggerInputTypes: { DAILY: 'daily' },
    getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
    requestPermissionsAsync: async () => { calls.push('request-notifications'); granted = true; return { granted: true }; },
    setNotificationChannelAsync: async () => {}, getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    scheduleNotificationAsync: async request => { const id = `notification-${scheduled.size + 1}`; scheduled.set(id, { identifier: id, content: request.content }); calls.push(['schedule', request]); return id; },
    cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
  };
  const routines = { scope, ready: true, routines: [routine], pendingCount: 0, save: async () => true };
  const mocks = { ...base(), 'expo-notifications': notifications, 'expo': { isRunningInExpoGo: () => false },
    'expo-constants': { expoConfig: { android: { package: 'test.fixture' } } },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => routines },
    '../context/AuthContext': { useAuth: () => ({ accessMode: 'local-only', verifyCurrentOwner: async () => scope }) },
    '../services/savedRoutineService': { createRoutineTransport: () => ({}), savedRoutineStore: { sync: async () => {} } },
    '../utils/sessionNotifications': { getSessionNotifications: () => notifications },
    './nativeSessionCountdown': { getNativeSessionCountdownModule: async () => null },
    './sessionNotificationService': { ONGOING_CHANNEL_ID: 'fixture-channel' },
  };
  const load = loader(mocks);
  return { load, calls, scheduled, routines };
}

test('granting ordinary notification permission schedules an opted-in routine without another app foreground', async () => {
  const h = reminderHarness(), Lifecycle = h.load('src/components/RoutineLifecycle.tsx').default;
  const permissions = h.load('src/services/notificationPermissionService.ts');
  let tree;
  await act(async () => { tree = create(React.createElement(Lifecycle)); });
  try {
    assert.equal(h.scheduled.size, 0); assert.deepEqual(h.calls, []);
    await act(async () => { const result = await permissions.enableNotifications(); assert.equal(result.granted, true); });
    assert.equal(h.scheduled.size, 1);
    const request = h.calls.find(call => Array.isArray(call) && call[0] === 'schedule')[1];
    assert.equal(request.trigger.type, 'daily'); assert.equal(request.content.data.routineId, routine.id);
    assert.equal(h.calls.filter(call => call === 'request-notifications').length, 1);
    await act(async () => permissions.enableNotifications()); assert.equal(h.scheduled.size, 1, 'a repeated permission reply cannot duplicate reminders');
  } finally { await act(async () => tree.unmount()); }
});

test('routine editor requests no permission until chosen and preserves a reminder when notifications are declined', async () => {
  const h = reminderHarness(); let saved;
  h.routines.save = async draft => { saved = draft; return true; };
  const Editor = h.load('src/components/RoutineEditorSheet.tsx').default;
  let tree;
  await act(async () => { tree = create(React.createElement(Editor, { visible: true, subjects, routine, onClose() {} })); });
  try {
    assert.deepEqual(h.calls, []);
    const allow = tree.root.findAllByType('Press').find(node => node.props.children?.props?.children === 'Allow notifications');
    assert.ok(allow);
    const save = tree.root.findAllByType('Press').find(node => node.props.children?.props?.children === 'Save routine');
    await act(async () => save.props.onPress());
    assert.equal(saved.reminder.enabled, true); assert.equal(saved.durationSeconds, 75);
    assert.deepEqual(h.calls, [], 'saving a preference does not force a permission prompt');
  } finally { await act(async () => tree.unmount()); }
});
