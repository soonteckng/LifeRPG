const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer'); global.IS_REACT_ACT_ENVIRONMENT = true;
const host = type => props => React.createElement(type, props, props.children);
// Mocks match an exact module name, or any import path ending in a "/name" key.
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    const key = Object.keys(mocks).find(k => k === name || k.startsWith('/') && name.endsWith(k));
    if (key) return mocks[key];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + suffix), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return key(d); };
const areas = [{ id: 1, title: 'General', color_code: null }, { id: 2, title: 'Learning', color_code: null }];
const course = { kind: 'course', id: id(1), revision: 1, name: 'Maths', focusAreaId: 2, deletedAt: null, totalSeconds: 4000 };
const exam = { kind: 'exam', id: id(2), revision: 1, title: 'Calculus final', courseId: id(1), examDate: inDays(12), deletedAt: null };
const rn = { View: host('View'), ScrollView: host('HScroll'), Switch: host('Switch'), StyleSheet: { create: v => v, hairlineWidth: 1 }, Platform: { OS: 'android' }, Keyboard: { dismiss: () => {} } };
const editMode = {Wiggle:props=>React.createElement('View',{style:props.style,testID:props.active?'wiggling':undefined},props.children),EditBadges:props=>React.createElement('View',{testID:'edit-badges'},props.onEdit&&React.createElement('Press',{accessibilityLabel:`Edit ${props.name}`,onPress:props.onEdit}),props.onRemove&&React.createElement('Press',{accessibilityLabel:`Remove ${props.name}`,onPress:props.onRemove}))};
const base = () => ({
  '/EditMode': editMode,
  // The guide's anchor is a plain wrapper here; the guide has its own tests.
  '/FeatureTour': { TourAnchor: props => React.createElement('View', { testID: `tour-anchor-${props.id}` }, props.children), TourScrollView: props => React.createElement('Scroll', props, props.children), useFeatureTour: () => null },
  'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') },
  '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  '/AppText': { Text: host('Text') }, '/MotionPressable': host('Press'), '/SheetConfirmation': host('Confirm'),
  '/AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.footer, props.overlay),
  '/notificationPermissionService': { readNotificationPermission: async () => ({ granted: true }), enableNotifications: async () => ({ granted: true }) },
  '/tapHaptics': { tapHaptic: () => {}, tapHapticsEnabled: () => false },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
});
// Just focus and the study launcher read the saved session length; their stores stay out of the way here.
const startMocks = starts => ({
  '/useGuidedPreference': { useGuidedPreference: () => ({ ready: true, busy: false, error: false, value: { enabled: false, invited: true }, save: async () => true }) },
  '/useFocusDurationPreference': { useFocusDurationPreference: () => ({ ready: true, selectedSeconds: 1800, value: { customSeconds: null }, error: false, choose: async () => {} }) },
  '/UserContext': { useUser: () => ({ profile: { id: 'me', timezone: 'Asia/Kuala_Lumpur' }, hapticsEnabled: false }) },
  '/AuthContext': { useAuth: () => ({ accessMode: 'online' }) }, '/SessionProtectionControl': host('Protection'), '/useTabDockInset': { useTabDockInset: () => 100 },
  'expo-haptics': { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: {} },
  '/TimerContext': { useTimer: () => ({ hasOpenSession: false, startFreeTimer: async (...a) => { starts.push(a); return true; } }) },
});
const presses = (root, label) => root.findAllByType('Press').filter(x => x.props.accessibilityLabel === label);
const byText = (root, text) => root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === text));
const texts = root => root.findAllByType('Text').map(t => [].concat(t.props.children).join(''));

test('exam sheet asks for a name, picks any subject, creates a typed one only on save and confirms removal', async () => {
  const Sheet = load('src/components/StudyExamSheet.tsx', { ...base(), '/SheetTouchable': host('Press') }).default;
  const saved = [], removed = [], ensured = []; let closed = 0, ui;
  const props = { visible: true, exam: null, courses: [course], onSave: async (...a) => { saved.push(a); return true; }, onEnsureSubject: async name => { ensured.push(name); return id(9); }, onRemove: async () => true, onClose: () => closed++ };
  await act(async () => { ui = create(React.createElement(Sheet, props)); });
  const subject = () => presses(ui.root, 'Choose subject')[0];
  await act(async () => byText(ui.root, 'Save exam').props.onPress());
  assert.ok(texts(ui.root).includes('Give your exam a name first.')); assert.equal(saved.length, 0);
  await act(async () => ui.root.findByType('Input').props.onChangeText('  Calculus final  '));
  await act(async () => subject().props.onPress());
  assert.equal(presses(ui.root, 'Save exam').length + texts(ui.root).filter(t => t === 'Save exam').length, 0, 'picking hides the footer');
  assert.ok(presses(ui.root, 'Mathematics').length, 'common subjects are offered beside yours');
  await act(async () => presses(ui.root, 'Maths')[0].props.onPress());
  assert.equal(subject().props.accessibilityValue.text, 'Maths');
  await act(async () => byText(ui.root, 'Save exam').props.onPress());
  assert.deepEqual(saved[0], [{ title: 'Calculus final', courseId: id(1), examDate: inDays(14), examMinute: null, remind: true }, undefined]); assert.equal(closed, 1);
  assert.deepEqual(ensured, [], 'an existing subject is reused');
  // A typed subject names an untitled exam and is only created when the exam is saved.
  await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: false })));
  await act(async () => ui.update(React.createElement(Sheet, props)));
  await act(async () => subject().props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText('Quantum Mechanics'));
  await act(async () => presses(ui.root, 'Add “Quantum Mechanics”')[0].props.onPress());
  assert.equal(ui.root.findByType('Input').props.value, 'Quantum Mechanics exam'); assert.deepEqual(ensured, []);
  await act(async () => byText(ui.root, 'Save exam').props.onPress());
  assert.deepEqual(ensured, ['Quantum Mechanics']); assert.equal(saved[1][0].courseId, id(9)); assert.equal(saved[1][0].title, 'Quantum Mechanics exam');
  await act(async () => ui.update(React.createElement(Sheet, { ...props, exam, onRemove: async x => { removed.push(x); return true; } })));
  await act(async () => presses(ui.root, 'Remove exam')[0].props.onPress());
  assert.equal(removed.length, 0, 'removal asks first');
  await act(async () => ui.root.findByType('Confirm').props.onConfirm());
  assert.deepEqual(removed, [id(2)]);
  await act(async () => ui.unmount());
});

test('subject sheet shows the week and studies; a new subject opens straight into editing', async () => {
  const Sheet = load('src/components/StudySubjectSheet.tsx', { ...base(), '/FocusAreaPicker': host('Areas') }).default;
  const calls = []; let ui;
  const props = { visible: true, course, areas, defaultAreaId: 2, recent: [{ courseId: id(1), completedAt: Date.now(), seconds: 1800 }], exams: [exam], sessionOpen: false,
    onSave: async (...a) => { calls.push(['save', ...a]); return true; }, onRemove: async () => true, onStudy: c => calls.push(['study', c.id]), onAddExam: () => {}, onEditExam: () => {}, onClose: () => calls.push(['close']) };
  await act(async () => { ui = create(React.createElement(Sheet, props)); });
  assert.ok(texts(ui.root).includes('30m')); assert.ok(texts(ui.root).includes('1h 06m in total'));
  assert.ok(texts(ui.root).includes('Calculus final'));
  await act(async () => presses(ui.root, 'Study Maths')[0].props.onPress());
  assert.deepEqual(calls.at(-1), ['study', id(1)]);
  await act(async () => ui.update(React.createElement(Sheet, { ...props, visible: false })));
  await act(async () => ui.update(React.createElement(Sheet, { ...props, course: null })));
  assert.equal(ui.root.findByType('Input').props.accessibilityLabel, 'Subject name');
  await act(async () => ui.root.findByType('Input').props.onChangeText('Physics'));
  await act(async () => byText(ui.root, 'Save subject').props.onPress());
  assert.deepEqual(calls.find(c => c[0] === 'save'), ['save', { name: 'Physics', focusAreaId: 2 }, undefined]);
  await act(async () => ui.unmount());
});

// Study has no setup form now: subjects (a shelf), then exams (one card).
class AnimatedValue { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} interpolate(config) { return { source: this, config }; } }
const animatedRn = { ...rn, Animated: { View: host('Animated'), Value: AnimatedValue, timing: () => ({}), sequence: () => ({}), loop: () => ({ start() {}, stop() {} }), spring: () => ({ start() {} }) },
  Easing: { inOut: f => f, quad: x => x }, useWindowDimensions: () => ({ width: 390, height: 800 }) };
const withRevision = [...areas, { id: 3, title: 'Revision', color_code: null }];
function studyScreen(plan, timer = {}) {
  const calls = [];
  const Screen = load('src/app/(tabs)/study.tsx', {
    ...base(), 'react-native': animatedRn, '/useReducedMotion': { useReducedMotion: () => true }, '/useTabDockInset': { useTabDockInset: () => 100 },
    '/MoreMenu': props => React.createElement('Menu', props),
    'expo-router': { useRouter: () => ({ navigate: to => calls.push(['nav', to]) }), useFocusEffect: () => {} },
    '/ContentReveal': host('Reveal'), '/PersonalUI': { PersonalPage: props => React.createElement('Page', props, props.action, props.children) },
    '/StudyExamSheet': host('ExamSheet'), '/StudySubjectSheet': { __esModule: true, default: host('SubjectSheet') }, '/SubjectPicker': host('Picker'), '/SheetHeader': host('Header'),
    '/StudyLifecycle': { requestStudySync: () => {} }, '/QuestContext': { useQuests: () => ({ subjects: withRevision }) },
    '/TimerContext': { useTimer: () => ({ hasOpenSession: false, setNotes: () => calls.push('notes'), setLinkedTaskId: () => {}, setTargetAttributeId: v => calls.push(['area', v]), setDurationInSeconds: () => {}, ...timer }) },
    '/useStudyPlan': { useStudyPlan: () => ({ ready: true, error: null, courses: [], exams: [], recent: [], saveCourse: async d => { calls.push(['course', d]); return true; }, saveExam: async () => true,
      remove: async (kind, removed) => { calls.push(['remove', kind, removed]); return true; }, ...plan }) },
    '/studySelection': { studySelection: { get: () => null, subscribe: () => () => {}, choose: v => calls.push(['subject', v]) } },
    '/setupMode': { setupMode: { choose: v => calls.push(['mode', v]) } }, '/SheetTouchable': host('Press'),
    '/useFocusDurationPreference': startMocks([])['/useFocusDurationPreference'], '/UserContext': startMocks([])['/UserContext'],
  }).default;
  return { Screen, calls };
}
const within = (root, testID) => root.findAll(x => x.props.testID === testID && typeof x.type === 'string')[0];

test('a new Study tab starts with My Subjects, then My Exams; a subject chip just adds it, with an exam one tap away', async () => {
  const ensured = [];
  const { Screen } = studyScreen({ ensureCourse: async (name, area) => { ensured.push([name, area]); return id(5); } }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  const all = texts(ui.root);
  for (const title of ['My Subjects', 'Your study space', 'My Exams', 'Got an exam coming up?']) assert.ok(all.includes(title), title);
  assert.ok(all.indexOf('My Subjects') < all.indexOf('My Exams'), 'subjects come first');
  assert.equal(ui.root.findAll(x => x.props.testID === 'home-start-focus').length, 0, 'no setup form or pinned Start here');
  assert.ok(presses(ui.root, 'Add a subject').length && presses(ui.root, 'New exam').length, 'both sections add with the same + button');
  const sheet = label => ui.root.findAllByType('Sheet').find(x => x.props.label === label);
  await act(async () => presses(ui.root, 'How Study works')[0].props.onPress());
  assert.equal(sheet('how study works').props.visible, true); assert.ok(texts(ui.root).includes('Add your exams'));
  await act(async () => presses(ui.root, 'Add Mathematics')[0].props.onPress());
  assert.deepEqual(ensured, [['Mathematics', 2]], 'a new subject counts toward Learning without asking');
  assert.equal(ui.root.findByType('ExamSheet').props.visible, false, 'adding a subject never forces an exam');
  assert.ok(texts(ui.root).includes('Mathematics added'));
  await act(async () => presses(ui.root, 'Add an exam for Mathematics')[0].props.onPress());
  const exams = ui.root.findByType('ExamSheet').props;
  assert.equal(exams.visible, true); assert.equal(exams.initialCourseId, id(5)); assert.equal(exams.initialTitle, 'Mathematics exam');
  await act(async () => presses(ui.root, 'Add an exam')[0].props.onPress());
  assert.equal(ui.root.findByType('ExamSheet').props.initialCourseId, null);
  await act(async () => ui.unmount());
});
test('subjects with an exam come first, soonest first; exams share one card; studying a subject with an exam counts as Revision', async () => {
  const art = { ...course, id: id(3), name: 'Art' }, physics = { ...course, id: id(4), name: 'Physics' };
  const physicsExam = { ...exam, id: id(5), title: 'Physics mock', courseId: id(4), examDate: inDays(5) };
  const extra = [6, 7, 8].map(n => ({ ...exam, id: id(n), title: `Paper ${n}`, courseId: id(1), examDate: inDays(20 + n) }));
  const { Screen, calls } = studyScreen({ courses: [art, course, physics], exams: [exam, ...extra, physicsExam] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  const shelf = within(ui.root, 'subject-shelf');
  const order = shelf.findAllByType('Press').map(x => x.props.accessibilityLabel).filter(label => /Open subject$/.test(label ?? '')).map(label => label.split(',')[0]);
  assert.deepEqual(order, ['Physics', 'Maths', 'Art'], 'nearest exam first, then the rest as added');
  // Subjects with an exam wear their colour; with fewer than four, the grid ends with Add.
  const tileOf = name => shelf.findAllByType('Press').find(x => x.props.accessibilityLabel?.startsWith(`${name},`));
  assert.ok([].concat(tileOf('Physics').props.style).some(style => style && style.borderWidth === 1.5), 'an exam subject stands out');
  assert.ok(![].concat(tileOf('Art').props.style).some(style => style && style.borderWidth === 1.5), 'one without an exam stays calm');
  assert.ok(shelf.findAll(x => x.props.testID === 'subject-add-tile').length > 0, 'Add a subject sits at the end of the grid');
  {
    const bio = { ...course, id: id(9), name: 'Biology' };
    const four = studyScreen({ courses: [art, course, physics, bio], exams: [] }); let full;
    await act(async () => { full = create(React.createElement(four.Screen)); });
    assert.equal(within(full.root, 'subject-shelf').findAll(x => x.props.testID === 'subject-add-tile').length, 0, 'from four subjects the + beside My Subjects is enough');
    await act(async () => full.unmount());
  }
  const card = within(ui.root, 'exams-card');
  const rows = card.findAll(x => x.props.testID === 'exam-row' && typeof x.type === 'string');
  assert.equal(rows.length, 5); assert.ok(card.props.style.some(style => style && style.height > 0), 'a long list scrolls inside its card');
  assert.match(rows[0].findAllByType('Press')[0].props.accessibilityLabel, /^Physics mock/, 'soonest exam first');
  assert.equal(card.findAllByType('Press').some(x => /^Study /.test(x.props.accessibilityLabel ?? '')), false, 'exams have no second Study button; studying starts from the subject');
  await act(async () => shelf.findAllByType('Press').find(x => x.props.accessibilityLabel === 'Study Physics').props.onPress());
  assert.deepEqual(calls.filter(c => Array.isArray(c)), [['area', 3], ['subject', id(4)], ['mode', 'study'], ['nav', '/session']], 'an exam coming up makes it Revision');
  calls.length = 0;
  await act(async () => shelf.findAllByType('Press').find(x => x.props.accessibilityLabel === 'Study Art').props.onPress());
  assert.deepEqual(calls.filter(c => Array.isArray(c))[0], ['area', 2], 'no exam, so Learning');
  await act(async () => ui.unmount());
});

test('hold a subject to edit them all: each shows −, removing asks first and says its minutes stay', async () => {
  const art = { ...course, id: id(3), name: 'Art' };
  const { Screen, calls } = studyScreen({ courses: [course, art], exams: [] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  const tile = name => within(ui.root, 'subject-shelf').findAllByType('Press').find(x => x.props.accessibilityLabel?.startsWith(`${name},`));
  await act(async () => tile('Art').props.onLongPress());
  assert.equal(presses(ui.root, 'Remove Maths').length + presses(ui.root, 'Remove Art').length, 2, 'every card can be removed');
  assert.equal(presses(ui.root, 'Study Art').length, 0, 'editing hides the play buttons');
  await act(async () => presses(ui.root, 'Remove Art')[0].props.onPress());
  const confirm = ui.root.findByType('Confirm').props;
  assert.equal(confirm.title, 'Remove Art?'); assert.match(confirm.message, /minutes stay saved/);
  assert.equal(calls.filter(c => c[0] === 'remove').length, 0, 'nothing is removed before you confirm');
  await act(async () => confirm.onConfirm());
  assert.deepEqual(calls.filter(c => c[0] === 'remove'), [['remove', 'course', id(3)]]);
  await act(async () => presses(ui.root, 'Done editing subjects')[0].props.onPress());
  assert.equal(presses(ui.root, 'Remove Maths').length, 0);
  await act(async () => ui.unmount());
});
test('the shared Subject row picks or creates any subject and moves the session to Learning, then stays fixed', async () => {
  const selection = { value: null, listeners: new Set() }, ensured = [];
  const plan = { ready: true, courses: [course], exams: [exam], ensureCourse: async (name, area) => { ensured.push([name, area]); return id(7); } };
  const Row = load('src/components/SubjectSetupRow.tsx', { ...base(), '/SheetHeader': host('Header'), '/SheetTouchable': host('Press'),
    '/useStudyPlan': { useStudyPlan: () => plan },
    '/studySelection': { studySelection: { get: () => selection.value, subscribe: fn => { selection.listeners.add(fn); return () => selection.listeners.delete(fn); }, choose: v => { selection.value = v; selection.listeners.forEach(fn => fn()); } } },
  }).default;
  const areasSeen = [], props = { areas, areaId: 1, generalId: 1, learningId: 2, onArea: id => areasSeen.push(id) }; let ui;
  await act(async () => { ui = create(React.createElement(Row, props)); });
  const row = () => presses(ui.root, 'Choose subject')[0];
  const fixed = () => ui.root.findAll(x => x.props.testID === 'session-subject' && x.type === 'View')[0];
  assert.equal(row().props.accessibilityValue.text, 'None'); assert.ok(texts(ui.root).includes('Choose'));
  // A typed subject is added to My Subjects under Learning.
  await act(async () => row().props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText('Quantum Mechanics'));
  await act(async () => presses(ui.root, 'Add “Quantum Mechanics”')[0].props.onPress());
  assert.deepEqual(ensured, [['Quantum Mechanics', 2]], 'a typed subject joins My Subjects under Learning'); assert.equal(selection.value, id(7));
  selection.value = null;
  await act(async () => ui.update(React.createElement(Row, { ...props })));
  await act(async () => row().props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText(''));
  await act(async () => presses(ui.root, 'Maths')[0].props.onPress());
  assert.deepEqual(areasSeen, [2, 2], 'a typed subject and Maths both move the session to Learning'); assert.equal(selection.value, id(1));
  await act(async () => ui.update(React.createElement(Row, { ...props, areaId: 2 })));
  assert.equal(presses(ui.root, 'Choose subject').length, 0, 'once set, the subject can’t be changed here');
  assert.equal(fixed().props.accessibilityValue.text, 'Maths, Calculus final in 12 days');
  assert.ok(texts(ui.root).includes('Calculus final in 12 days'));
  assert.equal(fixed().findAllByType('Icon').some(x => x.props.name === 'chevron-forward'), false, 'no chevron on a fixed row');
  plan.courses = []; selection.value = null;
  await act(async () => ui.update(React.createElement(Row, { ...props, areaId: 2 })));
  assert.equal(presses(ui.root, 'Choose subject').length, 1, 'the row stays even before any subject exists');
  await act(async () => ui.unmount());
});
test('Home shows exams within a week: tap edits, hold wiggles into edit mode; and peeks at your squad before its tab', async () => {
  const plan = { exams: [], courses: [course], recent: [] }, squads = { squads: [], online: true }, nav = [], timer = [];
  const sections = load('src/components/HomeSections.tsx', { ...base(),
    'react-native': {...rn, AppState:{addEventListener:()=>({remove(){}})}},
    'expo-router': { useRouter: () => ({ navigate: to => nav.push(to) }), useFocusEffect: callback => React.useEffect(callback, [callback]) }, '/useStudyPlan': { useStudyPlan: () => plan }, '/useSquads': { useSquads: () => squads },
    '/MoreMenu': props => React.createElement('Menu', props), '/StudyExamSheet': host('ExamSheet'), '/MilestonesRow': host('Milestones'),
    '/SquadsSection': { SquadSummary: host('Summary') }, '/SquadSheets': { SquadFace: host('Face'), SquadJoinSheet: host('JoinSheet') }, '/SheetHeader': host('Header'),
    '/QuestContext': { useQuests: () => ({ subjects: withRevision }) }, '/UserContext': { useUser: () => ({ profile: { id: 'me', timezone: 'UTC' } }) },
    '/TimerContext': { useTimer: () => ({ sessionSummary: null, setNotes() {}, setLinkedTaskId() {}, setTargetAttributeId: v => timer.push(v), setDurationInSeconds() {} }) },
    '/useFocusDurationPreference': startMocks([])['/useFocusDurationPreference'],
    '/useProgressData': { useProgressData: () => ({ data: null }) } });
  const home = () => React.createElement('Home', null, ...['HomeExams', 'HomeSquad', 'HomeWeek'].map(name => React.createElement(sections[name], { key: name })));
  let ui; await act(async () => { ui = create(home()); });
  const rerender = () => act(async () => ui.update(home()));
  const section = testID => within(ui.root, testID);
  // The test sheet stub draws even while closed, so rows inside sheets are left out.
  const inSheet = node => { for (let at = node.parent; at; at = at.parent) if (at.type === 'Sheet') return true; return false; };
  const rows = () => section('home-exams').findAll(x => x.props.testID === 'exam-row' && typeof x.type === 'string').filter(row => !inSheet(row));
  for (const title of ['Upcoming Exams', 'Got an exam coming up?', 'My Squad', 'Focus with friends', 'This Week']) assert.ok(texts(ui.root).includes(title), title);
  assert.equal(texts(ui.root).some(t => /^(Study|Squads|Progress)$/.test(t)), false, 'no green text links; each section has a grey See all');
  await act(async () => presses(ui.root, 'Add an exam')[0].props.onPress());
  assert.equal(section('home-exams').findByType('ExamSheet').props.visible, true, 'adding an exam happens right here');
  plan.exams = [exam, ...[2, 3, 5, 6].map(n => ({ ...exam, id: id(10 + n), title: `Paper ${n}`, examDate: inDays(n) }))];
  squads.squads = [{ id: id(8), name: 'Library crew', code: 'K7Q4PX', goalMinutes: null, members: [{ id: id(9), name: 'Aina', weekSeconds: 3600, focusingNow: true, isYou: false, level: 2 }] }];
  await rerender();
  assert.equal(rows().length, 3, 'the nearest three within a week');
  const main = () => rows()[0].findAllByType('Press')[0];
  assert.match(main().props.accessibilityLabel, /^Paper 2.*\. Edit exam$/);
  await act(async () => main().props.onPress());
  const editor = () => section('home-exams').findByType('ExamSheet').props;
  assert.equal(editor().visible, true); assert.equal(editor().exam.title, 'Paper 2', 'tapping an exam opens it to edit, like Study');
  assert.deepEqual(timer, []); assert.equal(nav.length, 0, 'tapping never starts a session');
  await act(async () => editor().onClose());
  await act(async () => main().props.onLongPress());
  // Holding wiggles the list into edit mode, the same as subjects and routines.
  assert.ok(section('home-exams').findAll(x => x.props.testID === 'wiggling').length > 0, 'holding an exam starts edit mode');
  assert.ok(presses(rows()[0], 'Edit Paper 2').length && presses(rows()[0], 'Remove Paper 2').length, '✎ and − appear on each exam');
  await act(async () => presses(rows()[0], 'Remove Paper 2')[0].props.onPress());
  const confirm = section('home-exams').findAllByType('Sheet').find(x => x.props.label === 'remove exam');
  assert.equal(confirm.props.visible, true, 'removing asks first');
  await act(async () => confirm.props.onRequestClose());
  await act(async () => presses(section('home-exams'), 'Done editing exams')[0].props.onPress());
  assert.equal(section('home-exams').findAll(x => x.props.testID === 'wiggling').length, 0);
  assert.equal(presses(rows()[0], 'Study Maths').length, 0, 'an exam row edits; studying starts from its subject');
  // A grey "See all ›" with a small count badge beside the title lists them all.
  const seeAll = presses(section('home-exams'), 'See all 5 exams')[0];
  assert.ok(texts(seeAll).includes('See all'));assert.ok(texts(seeAll).some(t => String(t) === '5'), 'the hidden count shows as a badge');
  await act(async () => seeAll.props.onPress());
  assert.equal(section('home-exams').findAllByType('Sheet').find(x => x.props.label === 'all exams').props.visible, true, 'the full list opens here, not in Study');
  assert.equal(ui.root.findAllByType('Menu').length, 0, 'no ••• on Home sections');
  await act(async () => section('home-squad-section').findAll(x => x.props.testID === 'home-squad' && x.type === 'Press')[0].props.onPress());
  const peek = section('home-squad-section').findAllByType('Sheet').find(x => x.props.label === 'squad peek');
  assert.equal(peek.props.visible, true, 'a tap peeks at the leaderboard');
  await act(async () => { presses(peek, 'See the whole squad')[0].props.onPress(); await new Promise(resolve => setTimeout(resolve, 260)); });
  assert.equal(nav.at(-1), '/squads', 'in one squad, the Squads tab is that squad, so it opens there');
  await act(async () => section('home-squad-section').findAll(x => x.props.testID === 'home-squad' && x.type === 'Press')[0].props.onPress());
  await act(async () => { section('home-squad-section').findAll(x => x.props.testID === 'home-squad-open' && x.type === 'Press')[0].props.onPress(); await new Promise(resolve => setTimeout(resolve, 260)); });
  assert.equal(nav.filter(to => to === '/squads').length, 2, 'the squad card in the peek opens it too, so its arrow works');
  await act(async () => presses(section('home-week'), 'This week is loading. Show by category')[0].props.onPress());
  assert.equal(section('home-week').findAllByType('Sheet').find(x => x.props.label === 'this week').props.visible, true);
  await act(async () => ui.unmount());
});
test('offline, the last saved squad stays readable on Home; only joining or starting one needs internet', async () => {
  for (const hasSquad of [false, true]) {
    const squad = { id: id(8), name: 'Library crew', code: 'K7Q4PX', members: [], goalMinutes: null };
    const squads = { squads: hasSquad ? [squad] : [], online: true }, calls = [];
    const { HomeSquad } = load('src/components/HomeSections.tsx', { ...base(),
      'expo-router': { useRouter: () => ({ navigate: to => calls.push(['navigate', to]) }) },
      '/useSquads': { useSquads: () => squads }, '/useStudyPlan': {}, '/useStudyLauncher': {}, '/useProgressData': {},
      '/QuestContext': {}, '/UserContext': {}, '/TimerContext': {}, '/ExamRow': host('Exam'), '/ExamsCard': host('Exams'),
      '/MilestonesRow': host('Milestones'), '/StudyExamSheet': host('ExamSheet'),
      '/SquadsSection': { SquadSummary: host('Summary') }, '/SquadSheets': { SquadFace: host('Face'), SquadJoinSheet: host('JoinSheet') },
      '/SheetHeader': host('Header'), '/SectionHeader': { __esModule: true, default: host('Section'), SeeAll: host('SeeAll') },
      '/squadSelection': { squadSelection: { get: () => null, choose: id => calls.push(['choose', id]) } },
    });
    let ui; await act(async () => { ui = create(React.createElement(HomeSquad)); });
    const rerender = () => act(async () => ui.update(React.createElement(HomeSquad)));
    const card = () => ui.root.findAllByType('Press').find(node => node.props.testID === (hasSquad ? 'home-squad' : 'home-squad-empty'));
    try {
      if (!hasSquad) {
        await act(async () => card().props.onPress()); assert.equal(ui.root.findByType('JoinSheet').props.visible, true);
        await act(async () => ui.root.findByType('JoinSheet').props.onClose?.());
      }
      squads.online = false; await rerender();
      if (hasSquad) {
        assert.equal(ui.root.findByType('Section').props.subtitle, 'Offline · last saved');
        await act(async () => card().props.onPress());
        assert.equal(ui.root.findAllByType('Sheet').find(node => node.props.label === 'squad peek').props.visible, true, 'the saved leaderboard still opens');
        await act(async () => ui.root.findByType('Section').props.onPress());
        assert.deepEqual(calls, [['choose', id(8)], ['navigate', '/squads']], 'the Squads tab shows the saved squad too');
      } else {
        assert.equal(card().props.disabled, true, 'joining or starting needs internet');
        assert.ok(texts(ui.root).includes('Needs internet to start or join a squad.'));
        assert.equal(ui.root.findByType('JoinSheet').props.visible, false);
        squads.online = true; await rerender();
        assert.equal(card().props.disabled, false);
      }
    } finally { await act(async () => ui.unmount()); }
  }
});

test('the Routines tab starts with Just focus, holds every routine, and starts old routines the same way Home does', async () => {
  const calls = [];
  const Screen = load('src/app/(tabs)/routines.tsx', { ...base(), ...startMocks(calls), 'expo-router': { useRouter: () => ({ navigate: to => calls.push(['nav', to]) }), useFocusEffect: () => {} },
    '/ContentReveal': host('Reveal'), '/PersonalUI': { PersonalPage: host('Page') }, '/SavedRoutinesCard': host('Routines'),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '/setupMode': { setupMode: { choose: v => calls.push(['mode', v]), chooseRoutine: v => calls.push(['routine', v]) } },
    '/QuestContext': { useQuests: () => ({ tasks: [{ id: 5 }], subjects: areas, refresh: async () => {} }) }, '/SheetTouchable': host('Press'),
    '/TimerContext': { useTimer: () => ({ hasOpenSession: false, setNotes: () => {}, setLinkedTaskId: v => calls.push(['quest', v]), setDurationInMinutes: v => calls.push(['minutes', v]), setDurationInSeconds: v => calls.push(['seconds', v]), setTargetAttributeId: v => calls.push(['area', v]), startFreeTimer: async (...a) => { calls.push(['start', ...a]); return true; } }) },
  }).default;
  let ui; await act(async () => { ui = create(React.createElement(Screen)); });
  const card = ui.root.findByType('Routines').props;
  assert.equal(ui.root.findByType('Page').props.title, 'Routines'); assert.equal(card.active, true); assert.ok(card.limit > 100, 'nothing is cut off here');
  assert.ok(texts(ui.root).includes('Just focus')); assert.equal(texts(ui.root).includes('Quick focus'), false, 'the old quick focus card is gone');
  const help = ui.root.findByType('Page').props.action;
  assert.equal(help.props.label, 'How Routines work', 'a ? beside the title, like Study');
  await act(async () => help.props.onPress());
  const how = ui.root.findAllByType('Sheet').find(x => x.props.label === 'how routines work');
  assert.equal(how.props.visible, true); assert.equal(/\battached\b/.test(Object.keys(how.props).join(' ')), false, 'info only, so it floats');
  await act(async () => card.onStartLegacy({ id: 5, target_minutes: 25, subject_id: 2 }));
  assert.deepEqual(calls.filter(c => c[0] !== 'mode'), [['quest', 5], ['minutes', 25], ['area', 2], ['nav', '/session']]);
  calls.length = 0;
  await act(async () => ui.root.findAll(x => x.props.testID === 'routines-just-focus' && x.type === 'Press')[0].props.onPress());
  assert.deepEqual(calls, [['quest', null], ['area', 1], ['seconds', 1800], ['mode', 'routine'], ['routine', null], ['nav', '/session']], 'Just focus opens the session in Everyday focus at your saved length, starting nothing yet');
  await act(async () => ui.unmount());
});
test('the exam name follows the subject until it is edited, and a typed subject stays pickable', async () => {
  const Sheet = load('src/components/StudyExamSheet.tsx', { ...base(), '/SheetTouchable': host('Press') }).default;
  let ui;
  await act(async () => { ui = create(React.createElement(Sheet, { visible: true, exam: null, courses: [course], onSave: async () => true, onEnsureSubject: async () => id(9), onRemove: async () => true, onClose: () => {} })); });
  const name = () => ui.root.findAllByType('Input').find(x => x.props.accessibilityLabel === 'Exam name').props.value;
  const pickSubject = async label => { await act(async () => presses(ui.root, 'Choose subject')[0].props.onPress()); await act(async () => presses(ui.root, label)[0].props.onPress()); };
  assert.equal(ui.root.findAllByType('Press').some(x => /AM$|PM$|No time/.test(x.props.accessibilityLabel ?? '')), false, 'no time to pick, just the day');
  await pickSubject('Maths'); assert.equal(name(), 'Maths exam');
  assert.ok(texts(ui.root).includes('Named after the subject. Tap the name to change it.'));
  await pickSubject('Mathematics'); assert.equal(name(), 'Mathematics exam', 'changing the subject renames an untouched exam');
  await act(async () => presses(ui.root, 'Choose subject')[0].props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText('Quantum Mechanics'));
  await act(async () => presses(ui.root, 'Add “Quantum Mechanics”')[0].props.onPress());
  assert.equal(name(), 'Quantum Mechanics exam');
  await act(async () => presses(ui.root, 'Choose subject')[0].props.onPress());
  assert.equal(presses(ui.root, 'Quantum Mechanics · new').length, 1, 'the subject you typed is listed under My subjects');
  await act(async () => presses(ui.root, 'Maths')[0].props.onPress());
  await act(async () => ui.root.findAllByType('Input').find(x => x.props.accessibilityLabel === 'Exam name').props.onChangeText('Paper 2'));
  await pickSubject('Mathematics'); assert.equal(name(), 'Paper 2', 'a name you typed is kept');
  await act(async () => ui.unmount());
});

test('every category explains where its time goes, Everyday focus first, in one shared list', () => {
  const areasApi = load('src/utils/focusAreas.ts', {});
  const subjects = [{ id: 1, title: 'General' }, { id: 2, title: 'Learning' }, { id: 3, title: 'Fitness & Health' }, { id: 4, title: 'Work' }];
  const choices = areasApi.focusAreaChoices(subjects, null);
  assert.equal(areasApi.focusAreaTitle(choices[0].title), 'Everyday focus'); assert.equal(choices[0].id, 1);
  assert.equal(choices.filter(c => areasApi.focusAreaTitle(c.title) === 'Everyday focus').length, 1, 'no duplicate Everyday focus');
  for (const choice of choices) assert.ok(areasApi.focusAreaHint(choice.title).length > 10, `${choice.title} has a description`);
});

test('Revision and Learning break down by subject; untagged time is Other and sits last', () => {
  const { subjectSeconds } = load('src/components/SubjectBreakdown.tsx', { ...base(), '/studyPlanService': { listSessionCourses: async () => [] } });
  const sessions = [{ client_session_id: 'a', duration_seconds: 600 }, { client_session_id: 'b', duration_seconds: 1800 }, { client_session_id: 'c', duration_seconds: 300 }, { client_session_id: null, duration_seconds: 900 }];
  const rows = subjectSeconds(sessions, [{ clientSessionId: 'a', courseId: id(1), name: 'Maths' }, { clientSessionId: 'b', courseId: id(2), name: 'Physics' }, { clientSessionId: 'c', courseId: id(1), name: 'Maths' }]);
  assert.deepEqual(rows.map(row => [row.name, row.seconds]), [['Physics', 1800], ['Maths', 900], ['Other', 900]]);
});

test('subject breakdown reports a failed lookup and fences a late reply from another account', async () => {
  const pending = [], calls = [];
  const Breakdown = load('src/components/SubjectBreakdown.tsx', { ...base(), '/studyPlanService': {
    listSessionCourses: owner => new Promise((resolve, reject) => { calls.push(owner); pending.push({resolve,reject}); }),
  } }).default;
  const sessions = [{id:'saved',client_session_id:'saved',duration_seconds:60,completed_at:'2026-10-27T01:00:00Z'}];
  let ui;
  await act(async () => { ui = create(React.createElement(Breakdown, {owner:'a',sessions})); });
  try {
    await act(async () => pending[0].reject(new Error('Offline')));
    assert.ok(texts(ui.root).includes('Couldn’t load subjects. Reconnect and try again.'), 'a current failure must not become a blank card');
    assert.ok(!texts(ui.root).includes('Loading subjects…'));
    assert.deepEqual(calls, ['a'], 'a failed read does not poll');
    await act(async () => ui.update(React.createElement(Breakdown, {owner:'b',sessions})));
    assert.ok(texts(ui.root).includes('Loading subjects…'), 'a previous account failure never flashes for the next owner');
    await act(async () => ui.update(React.createElement(Breakdown, {owner:'c',sessions})));
    await act(async () => pending[2].resolve([{clientSessionId:'saved',courseId:id(1),name:'Maths'}]));
    await act(async () => pending[1].resolve([{clientSessionId:'saved',courseId:id(2),name:'Private B'}]));
    assert.ok(texts(ui.root).includes('Maths')); assert.ok(!texts(ui.root).includes('Private B'));
  } finally { await act(async () => ui.unmount()); }
});

test('Today’s card shows the goal up close; changing it lives in its ••• menu', async () => {
  const calls = [];
  const Sheet = load('src/components/TodaySheet.tsx', { ...base(), '/MoreMenu': props => React.createElement('Menu', props), '/ProgressRing': host('Ring'),
    '/HomeSections': { useWeekProgress: () => ({ week: { seconds: 5400, goalDays: 2 } }), WeekBars: host('Bars'), WEEK_LEGEND: 'legend' } }).default;
  let ui; await act(async () => { ui = create(React.createElement(Sheet, { visible: true, onClose: () => calls.push('close'), completedSeconds: 1500, goalMinutes: 60, streak: 4, complete: false,
    onChangeGoal: () => calls.push('goal'), onOpenProgress: () => calls.push('progress') })); });
  for (const value of ['25', '4', '1h 30m', '2/7']) assert.ok(texts(ui.root).includes(value), value);
  assert.ok(texts(ui.root).includes('35 min to your goal'));
  const options = ui.root.findByType('Menu').props.options;
  assert.deepEqual(options.map(option => option.label), ['Change daily goal', 'Open your rhythm']);
  await act(async () => { options[0].onPress(); await new Promise(resolve => setTimeout(resolve, 260)); });
  assert.deepEqual(calls, ['close', 'goal'], 'the card closes before the goal editor opens');
  await act(async () => ui.update(React.createElement(Sheet, { visible: false, onClose() {}, completedSeconds: 1500, goalMinutes: 60, streak: 4, complete: false,
    onChangeGoal() {}, onOpenProgress() {} })));
  assert.equal(ui.root.findAllByType('Menu').length, 0, 'a closed Today sheet cannot retain a native options menu above the offline surface');
  await act(async () => ui.unmount());
});

test('a one-time tip shows until it is dismissed or its gesture is used, then never again', async () => {
  const store = { values: new Map() };
  const prefs = load('src/services/appPreferences.ts', { '@react-native-async-storage/async-storage': { getItem: async key => store.values.get(key) ?? null, setItem: async (key, value) => { store.values.set(key, value); } } });
  const cache = new Map([[require('node:path').resolve(__dirname, '..', 'src/services/appPreferences.ts'), { exports: prefs }]]);
  const Hint = load('src/components/OneTimeHint.tsx', { ...base() }, cache).default;
  let ui; await act(async () => { ui = create(React.createElement(Hint, { id: 'subject-hold', text: 'Hold a subject to remove subjects.' })); });
  assert.ok(texts(ui.root).includes('Hold a subject to remove subjects.'));
  await act(async () => presses(ui.root, 'Got it')[0].props.onPress());
  assert.equal(ui.root.findAllByType('Text').length, 0, 'dismissed for good');
  assert.deepEqual(JSON.parse(store.values.get('liferpg:app-preferences:v1')).hints, ['subject-hold']);
  await act(async () => { await prefs.appPreferences.retireHint('routine-hold'); await prefs.appPreferences.retireHint('routine-hold'); });
  assert.deepEqual(prefs.appPreferences.get().hints, ['subject-hold', 'routine-hold'], 'using the gesture retires a tip once');
  await act(async () => ui.unmount());
});

test('a small squad shows open seats that invite, and the invite stays last on the page', async () => {
  const Board = load('src/components/SquadBoard.tsx', { ...base(), '/SquadSheets': { SquadFace: host('Face'), SquadMemberSheet: host('MemberSheet') }, '/OneTimeHint': host('Hint'), '/SquadsSection': { daysLeftInWeek: () => 3 } }).default;
  const member = (n, extra = {}) => ({ id: id(20 + n), name: `Friend ${n}`, weekSeconds: 600 * n, focusingNow: false, isYou: false, level: 1, ...extra });
  const squad = members => ({ id: id(8), name: 'Library crew', code: 'K7Q4PX', goalMinutes: null, ownerIsYou: true, members });
  let invites = 0, ui;
  const render = members => React.createElement(Board, { squad: squad(members), busy: false, onSetGoal: () => {}, onRemove: () => {}, onInvite: () => invites++ });
  await act(async () => { ui = create(render([member(1, { isYou: true })])); });
  const seats = () => ui.root.findAll(x => x.props.testID === 'squad-open-seat' && x.type === 'Press');
  assert.equal(seats().length, 3, 'one person still sees a full-looking board');
  await act(async () => seats()[0].props.onPress());
  assert.equal(invites, 1, 'a seat is an invite');
  const buttons = ui.root.findAllByType('Press');
  assert.equal(buttons.at(-1).props.accessibilityLabel, 'Invite friends', 'invite sits at the bottom');
  await act(async () => ui.update(render([1, 2, 3, 4].map(n => member(n)))));
  assert.equal(seats().length, 0, 'four or more members need no placeholders');
  await act(async () => ui.unmount());
});

test('offline shows one calm status: saved on this phone, or how many sessions wait to sync; tapping checks the connection', async () => {
  const auth = { accessMode: 'local-only', admissionEpoch: 1, localOwner: { id: 'me', backendId: 'b' }, retrySessionVerification: async () => { checks++; } };
  const timer = { unsyncedSessionCount: 0, actionBusy: false, isRestoring: false };
  let checks = 0, ui;
  const Status = load('src/components/OfflineStatus.tsx', { ...base(), '/AuthContext': { useAuth: () => auth }, '/TimerContext': { useTimer: () => timer } }).default;
  await act(async () => { ui = create(React.createElement(Status)); });
  const pill = () => ui.root.findAll(x => x.props.testID === 'offline-status' && x.type === 'Press')[0];
  assert.equal(pill().props.accessibilityLabel, 'Offline. Saved on this phone. Check connection');
  timer.unsyncedSessionCount = 2; await act(async () => ui.update(React.createElement(Status)));
  assert.ok(texts(ui.root).includes('· 2 sessions to sync'));
  await act(async () => { await pill().props.onPress(); });
  assert.equal(checks, 1);
  await act(async () => { await pill().props.onPress(); });
  assert.equal(checks, 1, 'at most one check every few seconds');
  auth.accessMode = 'online'; await act(async () => ui.update(React.createElement(Status)));
  assert.equal(ui.toJSON(), null, 'nothing shows online');
  await act(async () => ui.unmount());
});

test('Home’s saved numbers are only used for the same day and survive bad data', async () => {
  const store = new Map();
  const api = load('src/services/homeSnapshot.ts', { '@react-native-async-storage/async-storage': { getItem: async k => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); } } });
  const snap = { day: '2026-10-19', completedSeconds: 1500, goalMinutes: 60, goalCompleted: false, streak: 8, savedAtMs: Date.now() - 1000 };
  await api.saveHomeSnapshot('me', snap);
  assert.deepEqual(await api.readHomeSnapshot('me', '2026-10-19'), snap);
  assert.equal(await api.readHomeSnapshot('me', '2026-10-20'), null, 'yesterday’s minutes never show as today’s');
  assert.equal(await api.readHomeSnapshot('someone-else', '2026-10-19'), null);
  store.set('liferpg:home-today:v1:me', '{bad json');
  assert.equal(await api.readHomeSnapshot('me', '2026-10-19'), null);
});

test('one sheet rule: short sheets float, editors and tall lists dock to the screen edges', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const sheet = read('src/components/AppSheet.tsx');
  assert.match(sheet, /attached = expanded,/, 'full-height sheets are attached by default');
  assert.match(sheet, /const floating = !attached;/);
  for (const [file, label] of [['src/components/StudyExamSheet.tsx', 'exam editor'], ['src/components/StudySubjectSheet.tsx', 'subject']])
    assert.match(read(file), new RegExp(`<AppSheet[^\\n]*attached [^\\n]*label="${label}"`), `${label} docks to the screen edges`);
  // Details and lists can run long: they dock and size to their content, so there is no blank pull-up.
  for (const [file, label] of [['src/components/FocusAreaDetailSheet.tsx', '${title} focus area'], ['src/app/(tabs)/study.tsx', 'add subject'], ['src/components/SubjectSetupRow.tsx', 'subject choices'], ['src/components/HomeSections.tsx', 'all exams'], ['src/components/SavedRoutinesCard.tsx', 'routines'], ['src/components/HomeSections.tsx', 'squad peek'], ['src/components/HomeSections.tsx', 'this week'], ['src/components/TodaySheet.tsx', 'today'], ['src/components/QuestSheet.tsx', 'quests']]) {
    const tag = read(file).split('<AppSheet').find(part => part.includes(`label="${label}"`) || part.includes(`label={\`${label}\`}`));
    assert.ok(tag && /\battached\b/.test(tag) && /\bcompact\b/.test(tag), `${label} is attached and content-sized`);
  }
  assert.match(read('src/components/SessionProtectionControl.tsx'), /<AppSheet[^\n]*attached compact[^\n]*session protection/, 'session protection details are attached');
  const progress = read('src/app/(tabs)/progress.tsx').split('<AppSheet')[1];
  assert.match(progress, /label="progress details"\s+compact\s+attached/, 'category details on Progress are attached and content-sized');
  assert.match(read('src/components/DailyGoalSheet.tsx'), /<AppSheet[^\n]*attached compact[^\n]*daily goal/, 'the daily goal editor is full width, like the other editors');
  for (const file of ['src/components/ItemActionSheet.tsx', 'src/components/FocusDurationSheet.tsx'])
    assert.doesNotMatch(read(file), /\battached\b|\bexpanded\b/, `${file} stays a floating card`);
});

test('an exam row shows its date as a calendar tile and the days left in words, so the number never reads as a date', async () => {
  const Row = load('src/components/ExamRow.tsx', base()).default;
  const date = new Date(); date.setDate(date.getDate() + 13);
  let ui; await act(async () => { ui = create(React.createElement(Row, { exam: { ...exam, examDate: inDays(13) }, course, onPress: () => {} })); });
  try {
    const textOf = node => node.findAllByType('Text').map(t => [].concat(t.props.children).join(''));
    const tile = ui.root.findAll(n => n.props.testID === 'exam-date-tile' && typeof n.type === 'string')[0];
    assert.deepEqual(textOf(tile), [date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(), String(date.getDate())]);
    const left = ui.root.findAll(n => n.props.testID === 'exam-days-left' && n.type === 'Text')[0];
    assert.equal(left.props.children, '13 days left');
  } finally { await act(async () => ui.unmount()); }
  for (const [days, words] of [[0, 'Today'], [1, 'Tomorrow']]) {
    let row; await act(async () => { row = create(React.createElement(Row, { exam: { ...exam, examDate: inDays(days) }, course, onPress: () => {} })); });
    try { assert.equal(row.root.findAll(n => n.props.testID === 'exam-days-left' && n.type === 'Text')[0].props.children, words); } finally { await act(async () => row.unmount()); }
  }
});

test('with exams but no subjects, My Subjects still offers the Add subject tile', async () => {
  const { Screen } = studyScreen({ courses: [], exams: [{ ...exam, courseId: null }] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  try { assert.ok(ui.root.findAll(x => x.props.testID === 'subject-add-tile').length > 0, 'never an empty gap under My Subjects'); }
  finally { await act(async () => ui.unmount()); }
});

test('removing a subject with an exam coming up says so first; one without an exam asks as before', async () => {
  const art = { ...course, id: id(3), name: 'Art' };
  const { Screen } = studyScreen({ courses: [course, art], exams: [exam] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  try {
    const tile = name => within(ui.root, 'subject-shelf').findAllByType('Press').find(x => x.props.accessibilityLabel?.startsWith(`${name},`));
    await act(async () => tile('Maths').props.onLongPress());
    await act(async () => presses(ui.root, 'Remove Maths')[0].props.onPress());
    let confirm = ui.root.findByType('Confirm').props;
    assert.equal(confirm.title, 'Maths has an exam coming up');
    assert.match(confirm.message, /Calculus final is in 12 days/); assert.match(confirm.message, /Are you sure you want to remove Maths\?/);
    await act(async () => confirm.onCancel());
    await act(async () => presses(ui.root, 'Remove Art')[0].props.onPress());
    confirm = ui.root.findByType('Confirm').props;
    assert.equal(confirm.title, 'Remove Art?', 'no exam, the usual question');
  } finally { await act(async () => ui.unmount()); }
});
test('Home squad tile: one tap layer covers the whole card and opens the leaderboard; the contents never take the tap', async () => {
  const squad = { id: id(8), name: 'Library crew', code: 'K7Q4PX', goalMinutes: 300, members: [{ id: id(9), name: 'Aina', weekSeconds: 3600, focusingNow: false, isYou: true, level: 2 }] };
  const { HomeSquad } = load('src/components/HomeSections.tsx', { ...base(),
    'expo-router': { useRouter: () => ({ navigate() {} }) },
    '/useSquads': { useSquads: () => ({ squads: [squad], online: true }) }, '/useStudyPlan': {}, '/useStudyLauncher': {}, '/useProgressData': {},
    '/QuestContext': {}, '/UserContext': {}, '/TimerContext': {}, '/ExamRow': host('Exam'), '/ExamsCard': host('Exams'),
    '/MilestonesRow': host('Milestones'), '/StudyExamSheet': host('ExamSheet'),
    '/SquadsSection': { SquadSummary: host('Summary'), daysLeftInWeek: () => 4, yourPlace: () => null }, '/SquadSheets': { SquadFace: host('Face'), SquadJoinSheet: host('JoinSheet') },
    '/SheetHeader': host('Header'), '/SectionHeader': { __esModule: true, default: host('Section'), SeeAll: host('SeeAll') },
    '/squadSelection': { squadSelection: { get: () => null, choose() {} } },
  });
  let ui; await act(async () => { ui = create(React.createElement(HomeSquad, { tile: true })); });
  try {
    const outsideSheets = node => { for (let at = node.parent; at; at = at.parent) if (at.type === 'Sheet') return false; return true; };
    const presses = ui.root.findAllByType('Press').filter(outsideSheets);
    assert.equal(presses.length, 1, 'exactly one tap target on the card');
    const tap = presses[0];
    assert.equal(tap.props.testID, 'home-squad'); assert.equal(tap.props.style.position, 'absolute'); assert.equal(tap.props.style.top, 0); assert.equal(tap.props.style.bottom, 0);
    assert.equal(tap.props.children, undefined, 'nothing inside the layer can catch the touch');
    await act(async () => tap.props.onPress());
    assert.equal(ui.root.findAllByType('Sheet').find(x => x.props.label === 'squad peek').props.visible, true);
    assert.ok(ui.root.findAllByType('Face').length > 0, 'the gap shows your squad');
  } finally { await act(async () => ui.unmount()); }
});
