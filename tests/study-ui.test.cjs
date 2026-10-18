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
const rn = { View: host('View'), StyleSheet: { create: v => v, hairlineWidth: 1 }, Platform: { OS: 'android' }, Keyboard: { dismiss: () => {} } };
const base = () => ({
  'react-native': rn, '@expo/vector-icons': { Ionicons: host('Icon') },
  '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll'), BottomSheetTextInput: host('Input'), TouchableOpacity: host('Press') },
  '/AppText': { Text: host('Text') }, '/MotionPressable': host('Press'), '/SheetConfirmation': host('Confirm'),
  '/AppSheet': props => React.createElement('Sheet', props, props.header, props.children, props.overlay),
});
const presses = (root, label) => root.findAllByType('Press').filter(x => x.props.accessibilityLabel === label);
const byText = (root, text) => root.findAllByType('Press').find(x => x.findAllByType('Text').some(t => t.props.children === text));
const texts = root => root.findAllByType('Text').map(t => [].concat(t.props.children).join(''));

test('exam sheet asks for a name, saves the trimmed exam with its subject and confirms removal', async () => {
  const Sheet = load('src/components/StudyExamSheet.tsx', base()).default;
  const saved = [], removed = []; let closed = 0, ui;
  await act(async () => { ui = create(React.createElement(Sheet, { visible: true, exam: null, courses: [course], onSave: async (...a) => { saved.push(a); return true; }, onRemove: async () => true, onClose: () => closed++ })); });
  await act(async () => byText(ui.root, 'Save exam').props.onPress());
  assert.ok(texts(ui.root).includes('Give your exam a name first.')); assert.equal(saved.length, 0);
  await act(async () => ui.root.findByType('Input').props.onChangeText('  Calculus final  '));
  await act(async () => presses(ui.root, 'Maths')[0].props.onPress());
  await act(async () => byText(ui.root, 'Save exam').props.onPress());
  assert.deepEqual(saved[0], [{ title: 'Calculus final', courseId: id(1), examDate: inDays(14) }, undefined]); assert.equal(closed, 1);
  await act(async () => ui.update(React.createElement(Sheet, { visible: true, exam, courses: [course], onSave: async () => true, onRemove: async x => { removed.push(x); return true; }, onClose: () => closed++ })));
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
    '/ContentReveal': host('Reveal'), '/PersonalUI': { PersonalPage: host('Page') },
    '/StudyExamSheet': host('ExamSheet'), '/StudySubjectSheet': { __esModule: true, default: host('SubjectSheet'), ExamTile: host('Tile') },
    '/StudyLifecycle': { requestStudySync: () => {} }, '/QuestContext': { useQuests: () => ({ subjects: areas }) },
    '/TimerContext': { useTimer: () => ({ hasOpenSession: false, setNotes: () => calls.push('notes'), setLinkedTaskId: () => {}, setTargetAttributeId: v => calls.push(['area', v]), ...timer }) },
    '/useStudyPlan': { useStudyPlan: () => ({ ready: true, error: null, courses: [], exams: [], recent: [], saveCourse: async d => { calls.push(['course', d]); return true; }, saveExam: async () => true, remove: async () => true, ...plan }) },
    '/useSquads': { useSquads: () => ({ ready: true, squads: plan.squads ?? [], online: true, refresh: async () => {}, join: async () => null, create: async () => null, leave: async () => null, remove: async () => null }) },
    '/SquadSheets': { SquadFace: host('Face'), SquadSheet: host('SquadSheet'), SquadJoinSheet: host('JoinSheet') },
    '/floatingTabInset': { floatingTabInset: () => 100 }, '/studySelection': { studySelection: { choose: v => calls.push(['subject', v]) } },
  }).default;
  return { Screen, calls };
}

test('an empty Study tab offers an exam card, one-tap subjects and how it works', async () => {
  const { Screen, calls } = studyScreen({}); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  assert.ok(texts(ui.root).includes('Got an exam coming up?')); assert.ok(texts(ui.root).includes('How it works'));
  await act(async () => presses(ui.root, 'Add Maths')[0].props.onPress());
  assert.deepEqual(calls.find(c => c[0] === 'course'), ['course', { name: 'Maths', focusAreaId: 2 }]);
  await act(async () => byText(ui.root, 'Add an exam').props.onPress());
  assert.equal(ui.root.findByType('ExamSheet').props.visible, true);
  await act(async () => ui.unmount());
});

test('with an exam, the hero counts down and Study picks the subject and opens a session', async () => {
  const { Screen, calls } = studyScreen({ courses: [course], exams: [exam] }); let ui;
  await act(async () => { ui = create(React.createElement(Screen)); });
  assert.ok(texts(ui.root).includes('12')); assert.ok(texts(ui.root).includes('Calculus final'));
  assert.equal(texts(ui.root).includes('How it works'), false);
  await act(async () => presses(ui.root, 'Study Maths')[0].props.onPress());
  assert.deepEqual(calls.filter(c => Array.isArray(c)), [['area', 2], ['subject', id(1)], ['nav', '/session']]);
  await act(async () => ui.unmount());
});
