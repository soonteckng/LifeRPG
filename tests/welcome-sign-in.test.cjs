/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ['.ts', '.tsx'].find(e => fs.existsSync(target + e));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
function screen(auth, { google = false } = {}) {
  const handoffs = [];
  const Frame = Object.assign(({ children, primary, onNext, title }) => React.createElement('Frame', { title },
    React.createElement('Button', { onPress: onNext, accessibilityLabel: primary }), children),
    { useOnboardingTransition: () => ({ opacity: {}, moving: false, change: fn => fn() }) });
  const Screen = load('src/components/AuthScreen.tsx', {
    'react-native': { View: host('View'), Keyboard: { dismiss() {} }, Platform: { OS: 'android' }, ActivityIndicator: host('Spinner') },
    './MotionPressable': host('Button'), './AppText': { Text: host('Text'), TextInput: host('Input') }, './PasswordInput': host('Input'),
    './CharacterPortrait': host('Portrait'), './PersonalUI': { p: {}, PersonalButton: ({ title, ...props }) => React.createElement('Button', { ...props, accessibilityLabel: title }, title) },
    './AuthFormFrame': props => React.createElement('Form', { title: props.title, progress: props.progress, onBack: props.onBack },
      props.children({ tight: false, active: null, focus() {}, blur() {}, layout() {} })),
    './OnboardingWelcome': ({ onDone }) => { React.useEffect(() => { onDone(); }, [onDone]); return null; },
    './OnboardingFrame': Frame, './IdeaAreaPicker': host('Areas'),
    '../services/authSettings': { useAuthSettings: () => ({ google }) },
    '../services/nativeFocusProtection': { getSessionProtectionModule: async () => null },
    '../services/introHandoff': { introHandoff: { set: areas => handoffs.push(areas), peek: () => null, restore: async () => null, clear() {} } },
    '@expo/vector-icons': { Ionicons: host('Icon') },
    '../context/AuthContext': { useAuth: () => auth },
  }).default;
  return { Screen, handoffs };
}
async function render(Screen, props) {
  let tree; await act(async () => { tree = create(React.createElement(Screen, props)); });
  const button = label => tree.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);
  const input = label => tree.root.findAllByType('Input').find(node => node.props.accessibilityLabel === label);
  return { tree, button, input, press: async label => act(async () => button(label).props.onPress()), type: async (label, value) => act(async () => input(label).props.onChangeText(value)),
    text: () => text(tree.root), cleanup: () => act(async () => tree.unmount()) };
}
const auth = (extra = {}) => ({ googleStatus: 'idle', clearGoogleStatus() {}, ...extra });

test('the Google button appears only once Google sign-in is switched on, and keeps the intro picks', async () => {
  for (const google of [false, true]) {
    let opened = 0;
    const { Screen, handoffs } = screen(auth({ signInWithGoogle: async () => { opened++; return { error: null }; } }), { google });
    const ui = await render(Screen, { initialMode: 'sign-up' });
    try {
      await ui.press('Skip for now');
      assert.equal(!!ui.button('Continue with Google'), google);
      if (google) {
        await ui.press('Continue with Google');
        assert.equal(opened, 1); assert.deepEqual(handoffs.at(-1), [], 'the intro picks travel with the Google sign-in');
      }
    } finally { await ui.cleanup(); }
  }
});

test('the sign-up code submits itself at 6 digits, a wrong code is cleared with a clear message, and resending waits', async () => {
  const codes = []; let resends = 0;
  const { Screen } = screen(auth({
    signUp: async () => ({ error: null, needsEmailConfirmation: true }),
    verifySignUpCode: async (email, code) => { codes.push([email, code]); return codes.length === 1 ? { error: { code: 'otp_expired', message: 'Token has expired' } } : { error: null }; },
    resendSignUpCode: async () => { resends++; return { error: null }; },
  }));
  const ui = await render(Screen, { initialMode: 'sign-up' });
  try {
    await ui.press('Skip for now');
    await ui.type('Email', 'new@example.com'); await ui.type('Password', 'long-password');
    await ui.press('Create account');
    assert.equal(ui.tree.root.findByType('Form').props.title, 'Check your email');
    assert.equal(ui.tree.root.findByType('Form').props.progress.step, 2, 'still the account step of the intro');
    await ui.type('6-digit code', '12a3 45');
    assert.equal(ui.input('6-digit code').props.value, '12345', 'only digits are kept');
    await ui.type('6-digit code', '123456');
    assert.deepEqual(codes[0], ['new@example.com', '123456']);
    assert.match(ui.text(), /That code has expired/); assert.equal(ui.input('6-digit code').props.value, '');
    assert.equal(ui.button('Send a new code in 60s').props.disabled, true, 'a new code waits a minute');
    assert.equal(resends, 0);
    await ui.type('6-digit code', '654321');
    assert.deepEqual(codes[1], ['new@example.com', '654321']);
  } finally { await ui.cleanup(); }
});

test('a username signs in as typed, an email is checked first, and a cancelled Google sign-in says so', async () => {
  const signIns = []; let status = 'idle';
  const live = auth({ signIn: async (name, password) => { signIns.push([name, password]); return { error: { code: 'invalid_credentials' } }; } });
  Object.defineProperty(live, 'googleStatus', { get: () => status });
  const { Screen } = screen(live);
  const ui = await render(Screen, { initialMode: 'sign-in' });
  try {
    await ui.type('Email or username', '  Soon Teck '); await ui.type('Password', 'pw');
    await ui.press('Sign in');
    assert.deepEqual(signIns, [['Soon Teck', 'pw']], 'a username is not mistaken for a bad email');
    assert.match(ui.text(), /don’t match/); assert.doesNotMatch(ui.text(), /Soon Teck.*exist|no account/i, 'never says whether a name exists');
    await ui.type('Email or username', 'bad..mail@example.com');
    await ui.press('Sign in');
    assert.equal(signIns.length, 1, 'a malformed email never reaches sign-in');
    status = 'cancelled';
    await act(async () => ui.tree.update(React.createElement(Screen, { initialMode: 'sign-in' })));
    assert.match(ui.text(), /Google sign-in was cancelled/);
  } finally { await ui.cleanup(); }
});

test('an email that was never confirmed gets a new code from Sign in and lands on the same code screen', async () => {
  const resent = [], codes = [];
  const { Screen } = screen(auth({
    signIn: async () => ({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }),
    resendSignUpCode: async email => { resent.push(email); return { error: null }; },
    verifySignUpCode: async (email, code) => { codes.push([email, code]); return { error: null }; },
  }));
  const ui = await render(Screen, { initialMode: 'sign-in' });
  try {
    await ui.type('Email or username', ' later@example.com '); await ui.type('Password', 'long-password');
    await ui.press('Sign in');
    assert.match(ui.text(), /Confirm your email first/);
    await ui.type('Email or username', 'other@example.com');
    assert.equal(ui.button('Send a new code'), undefined, 'a different email hides the offer');
    await ui.type('Email or username', ' later@example.com ');
    await ui.press('Sign in');
    await ui.press('Send a new code');
    assert.deepEqual(resent, ['later@example.com']);
    assert.equal(ui.tree.root.findByType('Form').props.title, 'Check your email');
    assert.equal(ui.button('Send a new code in 60s').props.disabled, true, 'a code was just sent, so the next one waits');
    await ui.type('6-digit code', '123456');
    assert.deepEqual(codes, [['later@example.com', '123456']]);
    await act(async () => ui.tree.root.findByType('Form').props.onBack());
    assert.equal(ui.tree.root.findByType('Form').props.title, 'Welcome back', 'Back returns to Sign in');
  } finally { await ui.cleanup(); }
});
