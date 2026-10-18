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
const base = () => ({
  'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') },
  '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  '/AppText': { Text: host('Text') }, '/MotionPressable': host('Press'), '/SheetConfirmation': host('Confirm'),
  '/AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.footer, props.overlay),
  '/notificationPermissionService': { readNotificationPermission: async () => ({ granted: true }), enableNotifications: async () => ({ granted: true }) },
  '/tapHaptics': { tapHaptic: () => {}, tapHapticsEnabled: () => false },
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

function studyScreen(plan, timer = {}) {
  const calls = [];
  const Screen = load('src/app/(tabs)/study.tsx', {
    ...base(), 'expo-router': { useRouter: () => ({ navigate: to => calls.push(['nav', to]) }), useFocusEffect: () => {} },
    'expo-router/js-tabs': { useBottomTabBarHeight: () => 80 }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '/ContentReveal': host('Reveal'), '/PersonalUI': { PersonalPage: props => React.createElement('Page', props, props.action, props.children) },
    '/StudyExamSheet': host('ExamSheet'), '/StudySubjectSheet': { __esModule: true, default: host('SubjectSheet'), ExamTile: host('Tile') },
    '/StudyLifecycle': { requestStudySync: () => {} }, '/QuestContext': { useQuests: () => ({ subjects: areas }) },
    '/TimerContext': { useTimer: () => ({ hasOpenSession: false, setNotes: () => calls.push('notes'), setLinkedTaskId: () => {}, setTargetAttributeId: v => calls.push(['area', v]), ...timer }) },
    '/useStudyPlan': { useStudyPlan: () => ({ ready: true, error: null, courses: [], exams: [], recent: [], saveCourse: async d => { calls.push(['course', d]); return true; }, saveExam: async () => true, remove: async () => true, ...plan }) },
    '/useSquads': { useSquads: () => ({ ready: true, squads: plan.squads ?? [], online: true, refresh: async () => {}, join: async () => null, create: async () => null, leave: async () => null, remove: async () => null }) },
    '/SquadSheets': { SquadFace: host('Face'), SquadSheet: host('SquadSheet'), SquadJoinSheet: host('JoinSheet') },
    '/floatingTabInset': { floatingTabInset: () => 100 }, '/studySelection': { studySelection: { choose: v => calls.push(['subject', v]) } },
    '/setupMode': { setupMode: { choose: v => calls.push(['mode', v]) } }, '/SheetTouchable': host('Press'),
  }).default;
  return { Screen, calls };
}

test('an empty Study tab keeps My Exams, My Subjects and how it works; a subject chip just adds it, with an exam one tap away', async () => {
  const ensured = [];
  const { Screen } = studyScreen({ ensureCourse: async (name, area) => { ensured.push([name, area]); return id(5); } }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  for (const title of ['My Exams', 'Got an exam coming up?', 'My Subjects']) assert.ok(texts(ui.root).includes(title), title);
  assert.equal(texts(ui.root).includes('Squads'), false, 'squads live in Progress now');
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
  await act(async () => byText(ui.root, 'Add an exam').props.onPress());
  assert.equal(ui.root.findByType('ExamSheet').props.initialCourseId, null);
  await act(async () => ui.unmount());
});

test('every exam gets its own countdown card, and Study sets up a Study session for its subject', async () => {
  const physics = { ...course, id: id(3), name: 'Physics' }, mock = { ...exam, id: id(4), title: 'Physics mock', courseId: id(3), examDate: inDays(30) };
  const { Screen, calls } = studyScreen({ courses: [course, physics], exams: [exam, mock] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  assert.equal(ui.root.findAll(x => x.props.testID === 'study-exam-card' && typeof x.type === 'string').length, 2);
  assert.ok(texts(ui.root).includes('12')); assert.ok(texts(ui.root).includes('Calculus final')); assert.ok(texts(ui.root).includes('Physics mock'));
  assert.equal(presses(ui.root, 'How Study works').length, 1, 'help stays available once exams exist');
  assert.ok(texts(ui.root).includes('My Subjects'));
  await act(async () => presses(ui.root, 'Study Maths')[0].props.onPress());
  assert.deepEqual(calls.filter(c => Array.isArray(c)), [['area', 2], ['subject', id(1)], ['mode', 'study'], ['nav', '/session']]);
  await act(async () => ui.unmount());
});

test('the shared Subject row always shows, picks or creates any subject and moves the session to Learning', async () => {
  const selection = { value: null, listeners: new Set() }, ensured = [];
  const plan = { ready: true, courses: [course], exams: [exam], ensureCourse: async (name, area) => { ensured.push([name, area]); return id(7); } };
  const Row = load('src/components/SubjectSetupRow.tsx', { ...base(), '/SheetHeader': host('Header'), '/SheetTouchable': host('Press'),
    '/useStudyPlan': { useStudyPlan: () => plan },
    '/studySelection': { studySelection: { get: () => selection.value, subscribe: fn => { selection.listeners.add(fn); return () => selection.listeners.delete(fn); }, choose: v => { selection.value = v; selection.listeners.forEach(fn => fn()); } } },
  }).default;
  const areasSeen = [], props = { areas, areaId: 1, generalId: 1, learningId: 2, onArea: id => areasSeen.push(id) }; let ui;
  await act(async () => { ui = create(React.createElement(Row, props)); });
  const row = () => presses(ui.root, 'Choose subject')[0];
  assert.equal(row().props.accessibilityValue.text, 'None'); assert.ok(texts(ui.root).includes('Choose'));
  await act(async () => row().props.onPress());
  await act(async () => presses(ui.root, 'Maths')[0].props.onPress());
  assert.deepEqual(areasSeen, [2], 'picking Maths moves the session to Learning'); assert.equal(selection.value, id(1));
  await act(async () => ui.update(React.createElement(Row, { ...props, areaId: 2 })));
  assert.equal(row().props.accessibilityValue.text, 'Maths, Calculus final in 12 days');
  assert.ok(texts(ui.root).includes('Calculus final in 12 days'));
  await act(async () => row().props.onPress());
  await act(async () => ui.root.findByType('Input').props.onChangeText('Quantum Mechanics'));
  await act(async () => presses(ui.root, 'Add “Quantum Mechanics”')[0].props.onPress());
  assert.deepEqual(ensured, [['Quantum Mechanics', 2]], 'a typed subject joins My Subjects under Learning'); assert.equal(selection.value, id(7));
  plan.courses = []; selection.value = null;
  await act(async () => ui.update(React.createElement(Row, { ...props, areaId: 2 })));
  assert.equal(presses(ui.root, 'Choose subject').length, 1, 'the row stays even before any subject exists');
  await act(async () => ui.unmount());
});

test('Home shows My Exams before any exist, one card per exam, and your squad', async () => {
  const plan = { exams: [], courses: [course] }, squads = { squads: [] }, nav = [];
  const Strip = load('src/components/HomeStudyStrip.tsx', { ...base(), 'react-native': { ...rn, useWindowDimensions: () => ({ width: 390, height: 800 }) },
    'expo-router': { useRouter: () => ({ navigate: to => nav.push(to) }) }, '/useStudyPlan': { useStudyPlan: () => plan }, '/useSquads': { useSquads: () => squads },
    '/SquadSheets': { SquadFace: host('Face') } }).default;
  let ui; await act(async () => { ui = create(React.createElement(Strip)); });
  const cards = () => ui.root.findAll(x => x.props.testID === 'home-exam-card' && x.type === 'Press');
  assert.ok(texts(ui.root).includes('My Exams')); assert.ok(texts(ui.root).includes('Got an exam coming up?')); assert.equal(cards().length, 0);
  await act(async () => presses(ui.root, 'Add an exam in Study')[0].props.onPress()); assert.deepEqual(nav, ['/study']);
  plan.exams = [exam, { ...exam, id: id(4), title: 'Physics mock', examDate: inDays(30) }];
  squads.squads = [{ id: id(8), name: 'Library crew', members: [{ id: id(9), name: 'Aina', weekSeconds: 3600, focusingNow: true }] }];
  await act(async () => ui.update(React.createElement(Strip)));
  assert.equal(cards().length, 2, 'every exam is equally important'); assert.equal(texts(ui.root).includes('Got an exam coming up?'), false);
  assert.equal(ui.root.findAll(x => x.props.testID === 'home-squad' && x.type === 'Press').length, 1);
  await act(async () => ui.unmount());
});

test('the Routines tab lists every routine and starts old routines the same way Home does', async () => {
  const calls = [];
  const Screen = load('src/app/(tabs)/routines.tsx', { ...base(), 'expo-router': { useRouter: () => ({ navigate: to => calls.push(['nav', to]) }), useFocusEffect: () => {} },
    'expo-router/js-tabs': { useBottomTabBarHeight: () => 80 }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '/ContentReveal': host('Reveal'), '/PersonalUI': { PersonalPage: host('Page') }, '/SavedRoutinesCard': host('Routines'),
    '/AuthContext': { useAuth: () => ({ accessMode: 'online' }) }, '/QuestContext': { useQuests: () => ({ tasks: [{ id: 5 }], subjects: areas, refresh: async () => {} }) },
    '/UserContext': { useUser: () => ({ profile: { id: 'me', timezone: 'Asia/Kuala_Lumpur' } }) }, '/SheetTouchable': host('Press'),
    '/useProgressData': { useProgressData: () => ({ data: { sessions: [
      { id: 'a', subject_id: 2, task_id: null, notes: 'liferpg:routine:v1:{"name":"Read"}', duration_seconds: 1200, completed_at: new Date().toISOString() },
      { id: 'b', subject_id: 1, task_id: null, notes: null, duration_seconds: 600, completed_at: new Date().toISOString() }] } }) },
    '/floatingTabInset': { floatingTabInset: () => 100 },
    '/TimerContext': { useTimer: () => ({ hasOpenSession: false, setNotes: () => {}, setLinkedTaskId: v => calls.push(['quest', v]), setDurationInMinutes: v => calls.push(['minutes', v]), setTargetAttributeId: v => calls.push(['area', v]) }) },
  }).default;
  let ui; await act(async () => { ui = create(React.createElement(Screen)); });
  const card = ui.root.findByType('Routines').props;
  assert.equal(ui.root.findByType('Page').props.title, 'Routines'); assert.equal(card.active, true); assert.ok(card.limit > 100, 'nothing is cut off here');
  assert.ok(texts(ui.root).includes('20m'), 'only routines count toward the week total');
  assert.ok(texts(ui.root).includes('1 routine done'));
  await act(async () => card.onStartLegacy({ id: 5, target_minutes: 25, subject_id: 2 }));
  assert.deepEqual(calls, [['quest', 5], ['minutes', 25], ['area', 2], ['nav', '/session']]);
  calls.length = 0;
  await act(async () => presses(ui.root, 'Focus on Everyday focus, 10m this week. Set up a session')[0].props.onPress());
  assert.deepEqual(calls, [['quest', null], ['area', 1], ['nav', '/session']], 'a category opens setup with any activity');
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
