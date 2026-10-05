/* global __dirname */
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
      if (name.endsWith("/MotionPressable")) return mocks["react-native"]?.Pressable || mocks["react-native"]?.TouchableOpacity || (props => React.createElement("Button", props, props.children));
      if (name.endsWith("/GlassSurface")) return props => React.createElement("View", {...props, testID:"glass-surface"});
      if (name.endsWith("/SlidingSelection")) return props => React.createElement("View", {...props, style:[props.style,{left:props.index === 0 ? "0%" : "50%"}]});
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
const recovery = load("src/utils/passwordRecovery.ts");
const callback = "liferpg://auth/recovery";
const session = { user: { id: "account-a" }, access_token: "fixture", refresh_token: "fixture" };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function provider(options = {}) {
  let value, authListener, linkListener, stored = options.marker ?? null;
  const calls = [], writes = [];
  const auth = {
    getUser: async () => ({ data: { user: session.user }, error: null }),
    getSession: async () => ({ data: { session: options.session ?? null }, error: null }),
    onAuthStateChange: fn => { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    setSession: async () => {
      calls.push("setSession");
      assert.equal(stored, "pending");
      if (options.linkError) return { data: { session: null }, error: options.linkError };
      authListener("SIGNED_IN", session);
      return { data: { session }, error: null };
    },
    verifyOtp: async input => {
      calls.push(["verifyOtp", input.type]);
      authListener("PASSWORD_RECOVERY", session);
      return { data: { session }, error: null };
    },
    exchangeCodeForSession: async () => {
      authListener(options.codeEvent ?? "PASSWORD_RECOVERY", session);
      return { data: { session }, error: null };
    },
    updateUser: async input => {
      calls.push(["updateUser", Object.keys(input)]);
      if (options.saveWait) await options.saveWait;
      return { error: options.saveError ?? null };
    },
    resetPasswordForEmail: async (email, options) => {
      calls.push(["reset", email, options.redirectTo]);
      return { error: null };
    },
    signOut: async input => {
      calls.push(["signOut", input.scope]);
      if (options.signOutError) return { error: options.signOutError };
      authListener("SIGNED_OUT", null);
      return { error: null };
    },
    ...options.auth,
  };
  const module = load("src/context/AuthContext.tsx", {
    "../../lib/supabase": { supabase: { auth } },
    "react-native": { Platform: { OS: "android" } },
    "expo-linking": {
      createURL: () => options.callback ?? callback, getInitialURL: async () => options.url ?? null,
      addEventListener: (_, fn) => { linkListener = fn; return { remove() {} }; },
    },
    "@react-native-async-storage/async-storage": {
      getItem: async () => stored,
      setItem: async (_, data) => { if (options.storageError) throw Error("Storage failed"); stored = data; writes.push(data); },
      removeItem: async () => { stored = null; writes.push(null); },
    },
  });
  function Consumer() { value = module.useAuth(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(module.AuthProvider, null, React.createElement(Consumer))); });
  return {
    value: () => value, calls, writes, stored: () => stored,
    event: async (event, data) => act(async () => { authListener(event, data); }),
    link: async url => act(async () => { linkListener({ url }); }),
    run: async fn => act(async () => fn(value)),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
test("callback parsing rejects foreign destinations and non-recovery tokens; validates forms", () => {
  assert.equal(recovery.parseRecoveryLink("https://evil.test/auth/recovery#type=recovery&access_token=a&refresh_token=b", callback), null);
  assert.equal(recovery.parseRecoveryLink("liferpg://session#type=recovery&access_token=a&refresh_token=b", callback), null);
  assert.equal(recovery.parseRecoveryLink(callback + "#type=signup&access_token=a&refresh_token=b", callback).kind, "invalid");
  assert.equal(recovery.parseRecoveryLink(callback + "#error_code=otp_expired", callback).kind, "invalid");
  assert.equal(recovery.validEmail("invalid"), false);
  assert.equal(recovery.validEmail(" hero@example.com "), true);
  assert.match(recovery.passwordValidation("short", "short"), /8 characters/);
  assert.match(recovery.passwordValidation("long-password", "different"), /do not match/);
  assert.equal(recovery.passwordValidation("long-password", "long-password"), "");
});

test("Expo Go LAN requests stop before email; hostname tunnel and installed-build requests use their exact callback", async () => {
  for (const target of ["exp://192.168.0.96:8081/--/auth/recovery", "exp://test.exp.direct/--/auth/recovery", callback]) {
    const ui = await provider({ callback: target });
    try {
      if (target.includes("192.168.")) {
        await assert.rejects(() => ui.value().requestPasswordReset("hero@example.com"), error => error.code === "unsupported_recovery_redirect");
        assert.equal(ui.calls.some(call => call[0] === "reset"), false);
        assert.match(recovery.recoveryError({ code: "unsupported_recovery_redirect" }), /--tunnel/);
      } else {
        await ui.value().requestPasswordReset("hero@example.com");
        assert.deepEqual(ui.calls.find(call => call[0] === "reset"), ["reset", "hero@example.com", target]);
      }
    } finally { await ui.cleanup(); }
  }
});
test("cold implicit callback latches recovery before SIGNED_IN and deduplicates warm delivery", async () => {
  const url = callback + "#type=recovery&access_token=a&refresh_token=b";
  const ui = await provider({ url });
  try {
    assert.equal(ui.value().recovery, "ready");
    assert.equal(ui.value().user.id, session.user.id);
    assert.equal(ui.stored(), session.user.id);
    await ui.link(url);
    assert.equal(ui.calls.filter(c => c === "setSession").length, 1);
  } finally { await ui.cleanup(); }
});
test("warm token-hash callback handles actual PASSWORD_RECOVERY", async () => {
  const ui = await provider();
  try {
    await ui.link(callback + "?type=recovery&token_hash=fixture");
    assert.equal(ui.value().recovery, "ready");
    assert.deepEqual(ui.calls, [["verifyOtp", "recovery"]]);
  } finally { await ui.cleanup(); }
});
test("actual PASSWORD_RECOVERY event enters the recovery gate without a URL", async () => {
  const ui = await provider();
  try {
    await ui.event("PASSWORD_RECOVERY", session);
    assert.equal(ui.value().recovery, "ready");
    assert.equal(ui.stored(), session.user.id);
  } finally { await ui.cleanup(); }
});
test("PKCE callbacks require the provider's recovery event, not a SIGNED_IN event", async () => {
  for (const codeEvent of ["PASSWORD_RECOVERY", "SIGNED_IN"]) {
    const ui = await provider({ url: callback + "?code=fixture", codeEvent });
    try { assert.equal(ui.value().recovery, codeEvent === "PASSWORD_RECOVERY" ? "ready" : "invalid"); }
    finally { await ui.cleanup(); }
  }
});
test("expired/missing links and storage failures never expose a normal session", async () => {
  for (const options of [
    { url: callback + "#error=access_denied&error_code=otp_expired" },
    { url: callback },
    { url: callback + "#type=recovery&access_token=a&refresh_token=b", linkError: { status: 401 } },
    { url: callback + "#type=recovery&access_token=a&refresh_token=b", storageError: true },
  ]) {
    const ui = await provider({ session, ...options });
    try {
      assert.equal(ui.value().recovery, "invalid");
      await assert.rejects(() => ui.value().saveRecoveryPassword("long-password"));
      assert.equal(ui.calls.some(c => Array.isArray(c) && c[0] === "updateUser"), false);
    } finally { await ui.cleanup(); }
  }
});
test("restarts restore recovery only for its matching account; pending marker fails closed", async () => {
  for (const marker of [session.user.id, "pending", "another-account"]) {
    const ui = await provider({ session, marker });
    try { assert.equal(ui.value().recovery, marker === session.user.id ? "ready" : "invalid"); }
    finally { await ui.cleanup(); }
  }
});
test("password update submits once, stays gated on success, and clears only after local logout", async () => {
  const wait = deferred();
  const ui = await provider({ session, marker: session.user.id, saveWait: wait.promise });
  try {
    let first;
    await act(async () => {
      first = ui.value().saveRecoveryPassword("long-password");
      await ui.value().saveRecoveryPassword("long-password");
    });
    assert.equal(ui.calls.filter(c => c[0] === "updateUser").length, 1);
    await act(async () => { wait.resolve(); await first; });
    assert.equal(ui.value().recovery, "success");
    assert.equal(ui.stored(), session.user.id);
    await ui.run(value => value.leaveRecovery());
    assert.equal(ui.value().recovery, "none");
    assert.equal(ui.value().user, null);
    assert.equal(ui.stored(), null);
    assert.ok(ui.calls.some(c => c[0] === "signOut" && c[1] === "local"));
  } finally { await ui.cleanup(); }
});
test("save and logout failures retain recovery guard and allow safe retry", async () => {
  const ui = await provider({ session, marker: session.user.id, saveError: { code: "weak_password" }, signOutError: Error("Offline") });
  try {
    await assert.rejects(() => ui.value().saveRecoveryPassword("long-password"));
    assert.equal(ui.value().recovery, "ready");
    await assert.rejects(() => ui.value().leaveRecovery());
    assert.equal(ui.value().recovery, "ready");
    assert.equal(ui.stored(), session.user.id);
  } finally { await ui.cleanup(); }
});
test("reset request trims email, supplies the real callback, and prevents rapid duplicate requests", async () => {
  const ui = await provider();
  try {
    await ui.value().requestPasswordReset(" hero@example.com ");
    await assert.rejects(() => ui.value().requestPasswordReset("hero@example.com"));
    assert.deepEqual(ui.calls, [["reset", "hero@example.com", callback]]);
  } finally { await ui.cleanup(); }
});
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
const native = {
  View: host("View"), Text: host("Text"), TextInput: host("Input"),
  Pressable: host("Button"), ScrollView: host("Scroll"), KeyboardAvoidingView: host("Keyboard"),
  ActivityIndicator: host("Spinner"), Platform: { OS: "android" },
};
const personalUI = { p: {}, PersonalButton: host("Button") };
async function recoveryScreen(auth, props = {}, options = {}) {
  const Component = load("src/components/RecoveryScreen.tsx", {
    "react-native": { ...native, Platform: { OS: options.os ?? "android" } },
    "react-native-safe-area-context": { SafeAreaView: host("Safe"), useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "./PersonalUI": personalUI,
    "../context/AuthContext": { useAuth: () => auth },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, props), {
    createNodeMock: element => element.type === "Scroll" ? { scrollTo: options.scrollTo ?? (() => {}) } : null,
  }); });
  return {
    renderer,
    input: async (label, value) => act(async () => renderer.root.findAllByType("Input").find(n => n.props.accessibilityLabel === label).props.onChangeText(value)),
    button: title => renderer.root.findAllByType("Button").find(n => n.props.title === title),
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
test("email-entry screen validates, blocks repeats, and confirms neutrally", async () => {
  let calls = 0;
  const wait = deferred();
  const ui = await recoveryScreen({ requestPasswordReset: async () => { calls++; await wait.promise; } }, { requestOnly: true });
  try {
    await act(async () => ui.button("Send recovery email").props.onPress());
    assert.equal(calls, 0);
    await ui.input("Email", "hero@example.com");
    let first;
    await act(async () => {
      const submit = ui.button("Send recovery email").props.onPress;
      first = submit(); submit();
    });
    assert.equal(calls, 1);
    assert.equal(ui.button("Requesting...").props.disabled, true);
    await act(async () => { wait.resolve(); await first; });
    assert.equal(ui.button("Recovery email requested").props.disabled, true);
    const text = ui.renderer.root.findAllByType("Text").map(n => n.props.children).join(" ");
    assert.match(text, /If an account exists/);
  } finally { await ui.cleanup(); }
});
test("new password screen validates confirmation and preserves drafts after provider failure", async () => {
  let calls = 0;
  const ui = await recoveryScreen({ recovery: "ready", saveRecoveryPassword: async () => { calls++; throw { code: "weak_password" }; } });
  try {
    await ui.input("New password", "long-password");
    await ui.input("Confirm new password", "different");
    await act(async () => ui.button("Save new password").props.onPress());
    assert.equal(calls, 0);
    await ui.input("Confirm new password", "long-password");
    await act(async () => ui.button("Save new password").props.onPress());
    assert.equal(calls, 1);
    assert.equal(ui.renderer.root.findAllByType("Input")[0].props.value, "long-password");
    assert.equal(ui.button("Save new password").props.disabled, false);
    assert.ok(ui.button("Request another recovery email"));
  } finally { await ui.cleanup(); }
});

test("recovery errors are inline once and reveal their field through keyboard and text layout changes", async () => {
  for (const os of ["android", "ios"]) {
    let calls = 0;
    const scrolls = [];
    const ui = await recoveryScreen({ recovery: "ready", saveRecoveryPassword: async () => {
      calls++; throw { status: 500 };
    } }, {}, { os, scrollTo: value => scrolls.push(value) });
    const input = label => ui.renderer.root.findAllByType("Input").find(n => n.props.accessibilityLabel === label);
    const field = label => {
      let node = input(label).parent;
      while (node && !(node.type === "View" && node.props.onLayout)) node = node.parent;
      return node;
    };
    const texts = message => ui.renderer.root.findAllByType("Text").filter(n => n.props.children === message);
    const place = (node, y, height) => node.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 272, height } } });
    try {
      const keyboard = ui.renderer.root.findByType("Keyboard");
      assert.equal(keyboard.props.behavior, os === "ios" ? "padding" : "height");
      assert.equal(keyboard.props.keyboardVerticalOffset, 24);
      const scroll = ui.renderer.root.findByType("Scroll");
      assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
      assert.equal(scroll.props.keyboardDismissMode, "none");
      assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
      assert.equal(scroll.findAllByType("Text").some(n => n.props.accessibilityRole === "header"), false);
      await ui.input("New password", "short");
      await ui.input("Confirm new password", "short");
      await act(async () => {
        scroll.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
        place(field("New password"), 320, 50);
        place(field("Confirm new password"), 386, 50);
        input("Confirm new password").props.onFocus();
        input("Confirm new password").props.onSubmitEditing();
      });
      assert.equal(calls, 0);
      const short = texts("Use at least 8 characters for your new password.");
      assert.equal(short.length, 1);
      assert.ok(field("New password").findAllByType("Text").includes(short[0]));
      assert.equal(input("New password").props.value, "short");
      assert.equal(input("Confirm new password").props.submitBehavior, "submit");
      assert.equal(scrolls.length, 0, "visible fields must not scroll to the top on focus or validation");
      // Simulate a small keyboard viewport and a reflowed, multi-line error.
      // These callbacks verify scroll targeting, not native pixel geometry.
      await act(async () => {
        place(field("New password"), 250, 150);
        scroll.props.onLayout({ nativeEvent: { layout: { height: 180 } } });
        scroll.props.onContentSizeChange(272, 1000);
      });
      assert.equal(scrolls.at(-1).y, 232);
      assert.equal(short[0].props.numberOfLines, undefined);
      await ui.input("New password", "long-password");
      await ui.input("Confirm new password", "different");
      await act(async () => ui.button("Save new password").props.onPress());
      assert.equal(calls, 0);
      assert.equal(texts("Use at least 8 characters for your new password.").length, 0);
      const mismatch = texts("Your passwords do not match.");
      assert.equal(mismatch.length, 1);
      assert.ok(field("Confirm new password").findAllByType("Text").includes(mismatch[0]));
      assert.equal(scrolls.at(-1).y, 268);
      await ui.input("Confirm new password", "long-password");
      await act(async () => ui.button("Save new password").props.onPress());
      assert.equal(calls, 1);
      assert.equal(texts("Your passwords do not match.").length, 0);
      const server = texts(recovery.recoveryError({ status: 500 }, true));
      assert.equal(server.length, 1);
      let row = server[0].parent;
      while (row && !(row.type === "View" && row.props.onLayout)) row = row.parent;
      assert.ok(row.findAllByType("Button").includes(ui.button("Save new password")));
      await act(async () => place(row, 500, 200));
      assert.equal(scrolls.at(-1).y, 488);
      assert.equal(input("New password").props.value, "long-password");
      assert.equal(input("Confirm new password").props.value, "long-password");
      assert.equal(ui.button("Save new password").props.disabled, false);
    } finally { await ui.cleanup(); }
  }
});
test("visibility control keeps the same input value and restores focus with accessible labels", async () => {
  let focusCalls = 0;
  const Component = load("src/components/PasswordInput.tsx", {
    "react-native": native, "@expo/vector-icons": { Ionicons: host("Icon") }, "./PersonalUI": personalUI,
  }).default;
  const originalFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = fn => { fn(); return 0; };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component, { value: "typed-value", accessibilityLabel: "Password", error: "Inline error" }), {
      createNodeMock: element => element.type === "Input" ? { isFocused: () => true, focus: () => { focusCalls++; } } : null,
    });
  });
  try {
    const input = renderer.root.findByType("Input");
    assert.equal(renderer.root.findByType("Text").props.children, "Inline error");
    assert.equal(input.parent.parent.findAllByType("Text").length, 0);
    assert.equal(input.props.secureTextEntry, true);
    await act(async () => {
      const button = renderer.root.findByType("Button");
      assert.equal(button.props.accessibilityLabel, "Show password");
      button.props.onPressIn(); button.props.onPress();
    });
    assert.equal(renderer.root.findByType("Input"), input);
    assert.equal(input.props.value, "typed-value");
    assert.equal(input.props.secureTextEntry, false);
    assert.equal(focusCalls, 1);
    await act(async () => renderer.root.findByType("Button").props.onPress());
    assert.equal(input.props.secureTextEntry, true);
    assert.equal(renderer.root.findByType("Button").props.accessibilityLabel, "Show password");
  } finally {
    global.requestAnimationFrame = originalFrame;
    await act(async () => renderer.unmount());
  }
});
test("root gate renders recovery before mounting account or onboarding providers", async () => {
  for (const recovery of ["none", "checking", "ready", "invalid", "success"]) {
    let accountMounts = 0;
    const Layout = load("src/app/_layout.tsx", {
      "expo-router": { Stack: host("Stack"), usePathname: () => "/", useRouter: () => ({}) },
      "react-native": native,
      "react-native-gesture-handler": { GestureHandlerRootView: host("Gesture") },
      "expo-constants": {},
      "../components/PersonalUI": personalUI,
      "../components/AuthScreen": host("Login"),
      "../components/RecoveryScreen": host("Recovery"),
      "../components/LaunchIntro": props => props.children,
      "../components/GlobalRewardListener": host("Reward"),
      "../context/AuthContext": {
        AuthProvider: props => props.children,
        useAuth: () => ({ user: recovery === "none" ? null : session.user, loading: false, recovery }),
      },
      "../context/UserContext": { UserProvider: () => { accountMounts++; return null; } },
      "../context/TimerContext": {}, "../context/QuestContext": {},
      "../hooks/useReducedMotion": {},
      "../utils/sessionTransition": {},
    }).default;
    let renderer;
    await act(async () => { renderer = create(React.createElement(Layout)); });
    try {
      assert.equal(renderer.root.findAllByType(recovery === "none" ? "Login" : "Recovery").length, 1);
      assert.equal(accountMounts, 0);
    } finally { await act(async () => renderer.unmount()); }
  }
});

test("LifeRPG intro covers signed-out and signed-in content and releases it after animation", async () => {
  for (const destination of ["Login", "Home"]) {
    let finish, hides = 0;
    const Component = load("src/components/LaunchIntro.tsx", {
      "react-native": { ...native, StyleSheet: { create: s => s, absoluteFill: {} },
        AccessibilityInfo: { isReduceMotionEnabled: async () => false },
        Animated: {
          Value: class { setValue() {} }, View: host("Animated"), timing: () => ({}), spring: () => ({}),
          parallel: () => ({}), delay: () => ({}), sequence: () => ({ start: fn => { finish = fn; }, stop() {} }),
        } },
      "expo-splash-screen": { preventAutoHideAsync: async () => {}, hideAsync: async () => { hides++; } },
    }).default;
    let renderer;
    await act(async () => { renderer = create(React.createElement(Component, null, React.createElement(destination))); });
    try {
      const overlay = renderer.root.findAllByType("View").find(n => n.props.testID === "launch-intro");
      assert.ok(overlay);
      assert.equal(renderer.root.findAllByType(destination).length, 1);
      assert.ok(renderer.root.findAllByType("View").some(n => n.props.importantForAccessibility === "no-hide-descendants"));
      await act(async () => overlay.props.onLayout());
      assert.equal(hides, 1);
      await act(async () => finish({ finished: true }));
      assert.equal(renderer.root.findAllByType("View").some(n => n.props.testID === "launch-intro"), false);
      assert.equal(renderer.root.findAllByType(destination).length, 1);
    } finally { await act(async () => renderer.unmount()); }
  }
});

test("reduced-motion launch skips animation and shows the app after a brief brand frame", async () => {
  let animations = 0;
  const Component = load("src/components/LaunchIntro.tsx", {
    "react-native": { ...native, StyleSheet: { create: s => s, absoluteFill: {} },
      AccessibilityInfo: { isReduceMotionEnabled: async () => true },
      Animated: { Value: class { setValue() {} }, View: host("Animated"), sequence: () => { animations++; } } },
    "expo-splash-screen": { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
  }).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, null, React.createElement("Home"))); });
  try {
    await act(async () => new Promise(resolve => setTimeout(resolve, 400)));
    assert.equal(animations, 0);
    assert.equal(renderer.root.findAllByType("View").some(n => n.props.testID === "launch-intro"), false);
  } finally { await act(async () => renderer.unmount()); }
});
test("an unrelated account sign-in during recovery invalidates password editing", async () => {
  const ui = await provider({ session, marker: session.user.id });
  try {
    await ui.event("SIGNED_IN", { user: { id: "another-account" } });
    assert.equal(ui.value().recovery, "invalid");
    await assert.rejects(() => ui.value().saveRecoveryPassword("long-password"));
    assert.equal(ui.calls.some(c => c[0] === "updateUser"), false);
  } finally { await ui.cleanup(); }
});
test("refreshing a scrubbed callback resumes a verified matching recovery session", async () => {
  const ui = await provider({ session, marker: session.user.id, url: callback });
  try { assert.equal(ui.value().recovery, "ready"); assert.equal(ui.calls.length, 0); }
  finally { await ui.cleanup(); }
});
test("Supabase static-render storage guard preserves persistent native/browser sessions", () => {
  const originalWindow = global.window;
  const storage = {};
  try {
    for (const os of ["web", "android", "ios", "browser"]) {
      if (os === "browser") global.window = {};
      else delete global.window;
      let options;
      load("lib/supabase.ts", {
        "react-native-url-polyfill/auto": {},
        "@react-native-async-storage/async-storage": storage,
        "react-native": { Platform: { OS: os === "browser" ? "web" : os } },
        "@supabase/supabase-js": { createClient: (_, __, input) => { options = input.auth; return {}; } },
      });
      assert.equal(options.persistSession, os !== "web");
      assert.equal(options.autoRefreshToken, os !== "web");
      assert.equal(options.storage, os === "web" ? undefined : storage);
      assert.equal(options.detectSessionInUrl, false);
      assert.equal(options.flowType, "implicit");
    }
  } finally {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});
test("duplicate registration confirmations never authenticate or update an existing account", async () => {
  for (const response of [
    { data: { user: { id: "obfuscated" }, session: null }, error: null },
    { data: { user: null, session: null }, error: { code: "user_already_exists" } },
  ]) {
    const ui = await provider({ auth: { signUp: async () => response } });
    try {
      const result = await ui.value().signUp("test@example.com", "long-password");
      assert.equal(result.error, null);
      assert.equal(result.needsEmailConfirmation, true);
      assert.equal(ui.value().user, null);
      assert.equal(ui.value().session, null);
      assert.equal(ui.calls.length, 0);
    } finally { await ui.cleanup(); }
  }
});
test("unverifiable restored sessions cannot expose authenticated access", async () => {
  const ui = await provider({ session, auth: { getUser: async () => ({ data: { user: null }, error: Error("Invalid token") }) } });
  try {
    assert.equal(ui.value().user, null);
    assert.equal(ui.value().sessionError, true);
    assert.equal(ui.value().loading, false);
  } finally { await ui.cleanup(); }
});
test("auth verification rejects an unrelated returned identity", async () => {
  const ui = await provider({ session, auth: { getUser: async () => ({ data: { user: { id: "other" } }, error: null }) } });
  try { assert.equal(ui.value().user, null); assert.equal(ui.value().sessionError, true); }
  finally { await ui.cleanup(); }
});
test("a malformed same-account session cannot reuse previously verified access", async () => {
  const ui = await provider({ session });
  try {
    assert.equal(ui.value().user.id, session.user.id);
    await ui.event("SIGNED_IN", { user: session.user });
    assert.equal(ui.value().user, null);
    assert.equal(ui.value().sessionError, true);
  } finally { await ui.cleanup(); }
});
test("late verification cannot overwrite a newer authenticated account", async () => {
  const old = deferred();
  const newer = { ...session, access_token: "new-fixture", user: { id: "new-account" } };
  const ui = await provider({ session, auth: {
    getUser: token => token === "new-fixture" ? Promise.resolve({ data: { user: newer.user }, error: null }) : old.promise,
  } });
  try {
    await ui.event("SIGNED_IN", newer);
    assert.equal(ui.value().user.id, "new-account");
    await act(async () => old.resolve({ data: { user: session.user }, error: null }));
    assert.equal(ui.value().user.id, "new-account");
  } finally { await ui.cleanup(); }
});
