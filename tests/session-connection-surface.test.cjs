/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => function Host(props) { return React.createElement(name, props, props.children); };
function load(file, mocks, modules = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name), ext = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, '..'), target + ext), mocks, modules);
  }, mod, mod.exports);
  return mod.exports;
}
function motionHarness() {
  const transitions = [];
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
  return { transitions, Animated: {
    Value, View: host('AnimatedView'),
    timing: (value, config) => {
      const transition = { animations: [{ value, config }], stopped: false, callback: null };
      return { value, config, start(callback) { transition.callback = callback; transitions.push(transition); }, stop() { transition.stopped = true; } };
    },
    parallel: animations => {
      const transition = { animations, stopped: false, callback: null };
      return {
        start(callback) { transition.callback = callback; transitions.push(transition); },
        stop() { transition.stopped = true; },
      };
    },
  },
  async finish(index = transitions.length - 1) {
    const transition = transitions[index]; if (!transition) return;
    await act(async () => {
      if (!transition.stopped) for (const animation of transition.animations) animation.value.setValue(animation.config.toValue);
      // A queued native callback may arrive after stop; the component must fence it.
      transition.callback?.({ finished: true });
    });
  } };
}
async function surface(options = {}) {
  const motion = motionHarness(), counters = { mounts: 0, unmounts: 0 };
  let props = { localOnly: options.localOnly ?? false, onlineReady: options.onlineReady ?? true };
  function Navigation() {
    const token = React.useRef({});
    React.useEffect(() => { counters.mounts++; return () => { counters.unmounts++; }; }, []);
    return React.createElement('Navigation', { token: token.current });
  }
  const Surface = load('src/components/ConnectionSurface.tsx', {
    'react-native': { View: host('View'), Animated: motion.Animated, Easing: { out: curve => ({ out: curve }), cubic: 'cubic' }, StyleSheet: { create: value => value } },
    '../hooks/useReducedMotion': { useReducedMotion: () => options.reducedMotion ?? false },
  }).default;
  const render = () => React.createElement(Surface, { ...props, offline: active => React.createElement('Offline', { active }) }, React.createElement(Navigation));
  let tree; await act(async () => { tree = create(render()); });
  return { motion, counters, root: () => tree.root,
    update: async next => { props = { ...props, ...next }; await act(async () => { tree.update(render()); }); },
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('connectivity transitions preserve the navigation instance and suppress controls on the hidden surface', async () => {
  const ui = await surface();
  try {
    const navigation = ui.root().findByType('Navigation'), token = navigation.props.token;
    await ui.motion.finish();
    await ui.update({ localOnly: true });
    assert.equal(ui.root().findByType('Navigation'), navigation);
    assert.equal(ui.root().findByType('Navigation').props.token, token);
    const online = ui.root().findByProps({ testID: 'online-navigation-surface' });
    assert.equal(online.props.pointerEvents, 'none');
    assert.equal(online.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(ui.root().findByType('Offline').props.active, true);
    assert.equal(ui.root().findByProps({ testID: 'offline-connection-surface' }).props.pointerEvents, 'none', 'incoming controls wait until the fade completes');
    await ui.motion.finish();
    assert.equal(ui.root().findByProps({ testID: 'offline-connection-surface' }).props.pointerEvents, 'auto');
    await ui.update({ localOnly: false });
    const outgoing = ui.root().findByProps({ testID: 'offline-connection-surface' });
    assert.equal(outgoing.props.pointerEvents, 'none'); assert.equal(outgoing.props.accessibilityElementsHidden, true);
    assert.equal(ui.root().findByType('Offline').props.active, false);
    assert.equal(ui.root().findByType('Navigation'), navigation);
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Offline').length, 0);
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
  } finally { await ui.cleanup(); }
});

test('an obsolete fade callback cannot remove the active offline surface after a rapid reconnect and disconnect', async () => {
  const ui = await surface({ localOnly: true });
  try {
    await ui.motion.finish(); await ui.update({ localOnly: false });
    const stale = ui.motion.transitions.length - 1;
    await ui.update({ localOnly: true });
    assert.equal(ui.motion.transitions[stale].stopped, true);
    await ui.motion.finish(stale);
    assert.equal(ui.root().findByType('Offline').props.active, true);
    assert.equal(ui.root().findByProps({ testID: 'offline-connection-surface' }).props.pointerEvents, 'none');
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
    await ui.motion.finish();
    assert.equal(ui.root().findByType('Offline').props.active, true);
    assert.equal(ui.root().findByProps({ testID: 'offline-connection-surface' }).props.pointerEvents, 'auto');
  } finally { await ui.cleanup(); }
});

test('reduced motion switches instantly without scheduling or waiting for a fade', async () => {
  const ui = await surface({ localOnly: true, reducedMotion: true });
  try {
    assert.equal(ui.root().findByProps({testID:'offline-connection-surface'}).props.pointerEvents,'auto');
    await ui.update({ localOnly: false });
    assert.equal(ui.motion.transitions.length,0);
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
    assert.equal(ui.root().findAllByType('Offline').length, 0);
  } finally { await ui.cleanup(); }
});

test('a short ease-out offline fade always has an opaque online page beneath it', async () => {
  const ui = await surface();
  try {
    await ui.motion.finish(); await ui.update({localOnly:true});
    let [offline] = ui.motion.transitions.at(-1).animations;
    assert.equal(offline.config.toValue,1); assert.equal(offline.config.delay,undefined);
    assert.equal(offline.config.duration,160); assert.deepEqual(offline.config.easing,{out:'cubic'});
    assert.equal(ui.root().findByProps({testID:'online-navigation-surface'}).props.style[1].opacity.value,1);
    await ui.motion.finish(); await ui.update({localOnly:false});
    [offline] = ui.motion.transitions.at(-1).animations;
    assert.equal(offline.config.toValue,0); assert.equal(offline.config.delay,undefined);
    assert.equal(offline.config.duration,160);
    assert.equal(ui.root().findByProps({testID:'online-navigation-surface'}).props.style[1].opacity.value,1);
    assert.equal(ui.root().findByType('Offline').props.active,false);
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Offline').length,0);
  } finally { await ui.cleanup(); }
});

async function connection(options = {}) {
  const calls = [], motion = motionHarness();
  let accessMode = options.accessMode ?? 'local-only', pathname = options.pathname ?? '/session';
  let ownerId = options.ownerId ?? 'owner-a', nonce = options.nonce, protectionEnd = options.protectionEnd, protectionSession = options.protectionSession;
  let admissionEpoch=options.admissionEpoch??1;
  let timer = { hasOpenSession: false, isCompleted: false, endingSession: false, sessionEnded: false,
    awaitingStart: false, linkedTaskId: null, isRestoring: false, actionBusy: false, sessionId: 'session-a',
    consumeNotificationAction: async value => { calls.push(['consume', value]); return options.action ?? 'end'; },
    resetTimer: async () => { calls.push(['end']); return true; }, ...options.timer };
  const router = { replace: route => calls.push(route) };
  const Content = load('src/components/SessionConnectionContent.tsx', {
    'react-native': { View: host('View'), Text:host('Text'), Animated: motion.Animated, Easing: {out:curve=>({out:curve}),cubic:'cubic'}, StyleSheet: { create: value => value } },
    'react-native-safe-area-context': {useSafeAreaInsets:()=>({top:24,bottom:0})},
    'expo-router': { usePathname: () => pathname, useRouter: () => router, useGlobalSearchParams: () => ({countdownAction:nonce,protectionEnd,protectionSession}) },
    '../hooks/useReducedMotion': { useReducedMotion: () => options.reducedMotion ?? false },
    '../utils/sessionBackend':{sessionBackendIdentity:()=>({backendId:'fixture'})},
    '../context/AuthContext': { useAuth: () => ({ accessMode, user: accessMode === 'online' ? {id:ownerId} : null, localOwner:accessMode==='local-only'?{id:ownerId,backendId:'fixture'}:null,admissionEpoch }) },
    '../context/TimerContext': { useTimer: () => timer },
    './OfflineSessionRecovery': host('Recovery'),
    './SheetConfirmation': host('Confirmation'),
  }).default;
  const render = () => React.createElement(Content, null, React.createElement('Navigation'));
  let tree; await act(async () => { tree = create(render()); });
  return { calls, motion, root: () => tree.root,
    update: async next => {
      if (next.accessMode !== undefined) accessMode = next.accessMode;
      if (next.pathname !== undefined) pathname = next.pathname;
      if (next.ownerId !== undefined) ownerId = next.ownerId;
      if (next.admissionEpoch !== undefined) admissionEpoch=next.admissionEpoch;
      if (next.nonce !== undefined) nonce = next.nonce;
      if (next.protectionEnd !== undefined) protectionEnd=next.protectionEnd;
      if (next.protectionSession !== undefined) protectionSession=next.protectionSession;
      if (next.timer) timer = { ...timer, ...next.timer };
      await act(async () => tree.update(render()));
    },
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('reconnecting after offline Done replaces the stale session route before revealing online navigation', async () => {
  for (const pathname of ['/session', '/timer']) {
    const ui = await connection({ pathname });
    try {
      const navigation = ui.root().findByType('Navigation');
      await ui.update({ accessMode: 'online' });
      assert.deepEqual(ui.calls, ['/']);
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
      assert.equal(ui.root().findByType('Recovery').props.active, false);
      await ui.motion.finish();
      assert.equal(ui.root().findAllByType('Recovery').length, 1, 'retain the outgoing surface while the route is obsolete');
      await ui.update({ pathname: '/' });
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
      await ui.motion.finish();
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
      assert.equal(ui.root().findAllByType('Recovery').length, 0);
      assert.equal(ui.root().findByType('Navigation'), navigation);
      assert.deepEqual(ui.calls, ['/']);
    } finally { await ui.cleanup(); }
  }
});

test('valid quest setup, running timer and pending result routes survive reconnection', async () => {
  for (const timer of [{ linkedTaskId: 7 }, { hasOpenSession: true }, { isCompleted: true },
    { endingSession: true }, { sessionEnded: true }, { awaitingStart: true }]) {
    const ui = await connection({ timer });
    try {
      await ui.update({ accessMode: 'online' });
      assert.deepEqual(ui.calls, []);
      await ui.motion.finish();
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
      assert.equal(ui.root().findAllByType('Recovery').length, 0);
    } finally { await ui.cleanup(); }
  }
});

test('restoration holds the outgoing surface until a durable result decides whether to close the route', async () => {
  const ui = await connection({ timer: { isRestoring: true } });
  try {
    await ui.update({ accessMode: 'online' });
    assert.deepEqual(ui.calls, []);
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
    await ui.motion.finish(); assert.equal(ui.root().findAllByType('Recovery').length, 1);
    await ui.update({ timer: { isRestoring: false, hasOpenSession: true } });
    assert.deepEqual(ui.calls, []);
    await ui.motion.finish();
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
    assert.equal(ui.root().findAllByType('Recovery').length, 0);
  } finally { await ui.cleanup(); }
  const empty = await connection({ timer: { isRestoring: true } });
  try {
    await empty.update({ accessMode: 'online' }); await empty.update({ timer: { isRestoring: false } });
    assert.deepEqual(empty.calls, ['/']);
    assert.equal(empty.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
  } finally { await empty.cleanup(); }
});

test('a normal online setup and non-session destinations do not redirect merely because a session is absent', async () => {
  for (const options of [{ accessMode: 'online' }, { pathname: '/profile' }]) {
    const ui = await connection(options);
    try {
      await ui.update({ accessMode: 'online' }); assert.deepEqual(ui.calls, []);
      await ui.motion.finish();
      assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
    } finally { await ui.cleanup(); }
  }
});

test('verified reconnect shows a brief notice and only an actual pending operation says syncing',async()=>{
  const copy=node=>typeof node==='string'?node:(node.children??[]).map(copy).join('');
  for(const state of [
    {syncStatus:'rejected',unsyncedSessionCount:3,actionBusy:false,expected:'Back online'},
    {syncStatus:'waiting',unsyncedSessionCount:1,actionBusy:false,expected:'Back online'},
    {syncStatus:'waiting',unsyncedSessionCount:1,actionBusy:true,expected:'Back online · syncing'},
    {syncStatus:'waiting',unsyncedSessionCount:1,actionBusy:true,actionError:'No connection',expected:'Back online'},
  ]){
    const ui=await connection({timer:{hasOpenSession:true,...state}});
    try{
      assert.equal(ui.root().findAllByProps({testID:'connection-online-notice'}).length,0);
      await ui.update({accessMode:'online'});
      assert.equal(copy(ui.root().findByProps({testID:'connection-online-notice'})),state.expected);
      await ui.update({timer:{actionBusy:false}});
      assert.equal(copy(ui.root().findByProps({testID:'connection-online-notice'})),'Back online');
      await ui.update({accessMode:'local-only'});
      assert.equal(ui.root().findAllByProps({testID:'connection-online-notice'}).length,0);
      assert.deepEqual(ui.calls,[],'the notice never retries, starts, ends or changes session authority');
    }finally{await ui.cleanup();}
  }
});

test('ordinary online entry and another account never inherit a reconnect notice',async()=>{
  const fresh=await connection({accessMode:'online',pathname:'/'});
  try{assert.equal(fresh.root().findAllByProps({testID:'connection-online-notice'}).length,0);}finally{await fresh.cleanup();}
  const replacement=await connection({timer:{hasOpenSession:true}});
  try{
    await replacement.update({ownerId:'owner-b',accessMode:'online'});
    assert.equal(replacement.root().findAllByProps({testID:'connection-online-notice'}).length,0);
  }finally{await replacement.cleanup();}
});

test('a same-owner re-admission preserves the verified reconnect notice without borrowing another owner',async()=>{
  const ui=await connection({timer:{hasOpenSession:true}});
  try{
    await ui.update({accessMode:'online',admissionEpoch:3});
    assert.ok(ui.root().findByProps({testID:'connection-online-notice'}));
    await ui.update({ownerId:'owner-b',admissionEpoch:4});
    assert.equal(ui.root().findAllByProps({testID:'connection-online-notice'}).length,0);
  }finally{await ui.cleanup();}
});

test('the reconnect notice dismisses with timing ease-out and Reduce motion removes it instantly',async()=>{
  const realTimeout=global.setTimeout,realClear=global.clearTimeout,callbacks=new Map();let serial=0;
  global.setTimeout=(fn,delay)=>{const id=++serial;callbacks.set(id,{fn,delay});return id;};
  global.clearTimeout=id=>callbacks.delete(id);
  try{
    for(const reducedMotion of [false,true]){
      const ui=await connection({reducedMotion,timer:{hasOpenSession:true}});
      try{
        await ui.update({accessMode:'online'});await ui.motion.finish();
        const timeout=[...callbacks.values()].find(item=>item.delay===1200);assert.ok(timeout);
        await act(async()=>timeout.fn());
        if(reducedMotion){assert.equal(ui.motion.transitions.length,0);}
        else{
          const fade=ui.motion.transitions.at(-1).animations[0];
          assert.equal(fade.config.duration,140);assert.deepEqual(fade.config.easing,{out:'cubic'});
          await ui.motion.finish();
        }
        assert.equal(ui.root().findAllByProps({testID:'connection-online-notice'}).length,0);
      }finally{await ui.cleanup();callbacks.clear();}
    }
  }finally{global.setTimeout=realTimeout;global.clearTimeout=realClear;}
});

test('account verification keeps the outgoing offline page steady until online content is ready', async () => {
  const ui = await surface({ localOnly: true, onlineReady: false });
  try {
    await ui.motion.finish();
    const before = ui.motion.transitions.length;
    await ui.update({ localOnly: false });
    assert.equal(ui.motion.transitions.length, before, 'verification alone does not restart the outgoing fade');
    assert.equal(ui.root().findAllByType('Offline').length, 1);
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
    await ui.update({ onlineReady: true });
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'none');
    await ui.motion.finish();
    assert.equal(ui.root().findAllByType('Offline').length, 0);
    assert.equal(ui.root().findByProps({ testID: 'online-navigation-surface' }).props.pointerEvents, 'auto');
    assert.deepEqual(ui.counters, { mounts: 1, unmounts: 0 });
  } finally { await ui.cleanup(); }
});

test('notification End opens the stable confirmation offline and only confirmed End stops the timer', async () => {
  const ui = await connection({nonce:'nonce-a',timer:{hasOpenSession:true,isRunning:true}});
  try {
    assert.equal(ui.root().findAllByType('Confirmation').length,1);
    assert.deepEqual(ui.calls,[['consume','nonce-a']]);
    await ui.update({accessMode:'online'});
    assert.equal(ui.root().findAllByType('Confirmation').length,1,'confirmation survives reconnecting above the two surfaces');
    await ui.update({accessMode:'local-only'});
    await act(async () => ui.root().findByType('Confirmation').props.onCancel());
    await ui.update({timer:{actionBusy:true}}); await ui.update({timer:{actionBusy:false}});
    assert.equal(ui.root().findAllByType('Confirmation').length,0,'cancelling never reconsumes the same durable nonce');
    assert.deepEqual(ui.calls,[['consume','nonce-a']]);
    await ui.update({nonce:'nonce-b'});
    await act(async () => ui.root().findByType('Confirmation').props.onConfirm());
    assert.deepEqual(ui.calls,[['consume','nonce-a'],['consume','nonce-b'],['end']]);
    assert.equal(ui.root().findAllByType('Confirmation').length,0);
  } finally { await ui.cleanup(); }
});

test('accepted notification End survives a busy rerender while a delayed response is in flight', async () => {
  let resolve; const pending = new Promise(done => { resolve=done; });
  const ui = await connection({nonce:'nonce-a',timer:{hasOpenSession:true,consumeNotificationAction:() => pending}});
  try {
    await ui.update({timer:{actionBusy:true}});
    await act(async () => resolve('end'));
    assert.equal(ui.root().findByType('Confirmation').props.title,'End this session?');
    await act(async () => ui.root().findByType('Confirmation').props.onConfirm());
    assert.deepEqual(ui.calls,[],'busy controls cannot submit a second action');
    await ui.update({timer:{actionBusy:false}});
    await act(async () => ui.root().findByType('Confirmation').props.onConfirm());
    assert.deepEqual(ui.calls,[['end']]);
  } finally { await ui.cleanup(); }
});

test('late native End responses cannot prompt over a replaced session, another account or an expired timer', async () => {
  for (const replacement of [{timer:{sessionId:'session-b'}},{ownerId:'owner-b'},
    {timer:{hasOpenSession:false,isCompleted:true}}]) {
    let resolve; const pending = new Promise(done => { resolve=done; });
    const ui = await connection({nonce:'nonce-a',timer:{hasOpenSession:true,consumeNotificationAction:() => pending}});
    try {
      await ui.update(replacement); await act(async () => resolve('end'));
      assert.equal(ui.root().findAllByType('Confirmation').length,0);
      assert.deepEqual(ui.calls,[]);
    } finally { await ui.cleanup(); }
  }
});

test('notification End waits for restoration before consuming and ignores non-End actions', async () => {
  const ui = await connection({nonce:'nonce-a',action:'pause',timer:{hasOpenSession:true,isRestoring:true}});
  try {
    assert.deepEqual(ui.calls,[]); await ui.update({timer:{isRestoring:false}});
    assert.deepEqual(ui.calls,[['consume','nonce-a']]);
    assert.equal(ui.root().findAllByType('Confirmation').length,0);
  } finally { await ui.cleanup(); }
});

test('the protection cover opens one confirmation offline and keeps it through server-ID reconciliation', async () => {
  const ui = await connection({protectionEnd:'tap-1',protectionSession:'client-a',timer:{hasOpenSession:true,isRunning:true,protectionSessionId:'client-a'}});
  try {
    assert.equal(ui.root().findAllByType('Confirmation').length,1);assert.deepEqual(ui.calls,[]);
    await ui.update({accessMode:'online',timer:{sessionId:'server-confirmed'}});
    assert.equal(ui.root().findAllByType('Confirmation').length,1);
    await act(async()=>ui.root().findByType('Confirmation').props.onCancel());
    await ui.update({timer:{timeLeft:59}});assert.equal(ui.root().findAllByType('Confirmation').length,0);
    await ui.update({protectionEnd:'tap-2'});await act(async()=>ui.root().findByType('Confirmation').props.onConfirm());
    assert.deepEqual(ui.calls,[['end']]);
  } finally {await ui.cleanup();}
});

test('a protection End link waits for restoration and cannot target a replaced or expired session', async () => {
  const ui = await connection({protectionEnd:'tap-1',protectionSession:'client-a',timer:{hasOpenSession:true,isRestoring:true,protectionSessionId:'client-a'}});
  try {
    assert.equal(ui.root().findAllByType('Confirmation').length,0);
    await ui.update({timer:{isRestoring:false}});assert.equal(ui.root().findAllByType('Confirmation').length,1);
    await ui.update({ownerId:'owner-b',timer:{protectionSessionId:'client-b',sessionId:'server-b'}});
    assert.equal(ui.root().findAllByType('Confirmation').length,0);assert.deepEqual(ui.calls,[]);
    await ui.update({protectionEnd:'tap-2',protectionSession:'client-b',timer:{hasOpenSession:false,isCompleted:true}});
    assert.equal(ui.root().findAllByType('Confirmation').length,0);assert.deepEqual(ui.calls,[]);
  } finally {await ui.cleanup();}
});

test('a cold offline native End proof reaches the global confirmation after real journal re-admission without stopping automatically', async () => {
  const modules=new Map(),domain=load('src/utils/sessionJournal.ts',{},modules);
  const countdown=load('src/utils/sessionCountdown.ts',{},modules);
  const {createSessionCountdownCoordinator}=load('src/services/sessionCountdownCoordinator.ts',{},modules);
  const vectors=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/session-journal-v1.json'),'utf8'));
  const clock=vectors.clock,scope=vectors.scope,clientId=vectors.runningRecord.clientSessionId,serverId=vectors.runningRecord.serverSessionId;
  const apply=(journal,action)=>domain.applyJournalAction(journal,{epoch:journal.admission.epoch,expectedRevision:journal.revision,...action});
  let journal=apply(domain.createJournal(scope),{type:'admit',epoch:1});
  journal=apply(journal,{type:'prepare_start',operationId:'10000000-0000-4000-8000-000000000001',clientSessionId:clientId,setup:vectors.setup,clock});
  journal=apply(journal,{type:'acknowledge_start',operationId:'10000000-0000-4000-8000-000000000001',
    snapshot:{serverSessionId:serverId,state:'running',startedAtMs:clock.wallTimeMs,elapsedMs:0,observedClock:clock}});
  const nonce='10000000-0000-4000-8000-000000000005';
  const token={version:1,kind:'end',operationId:nonce,identity:countdown.projectSessionCountdown({journal,currentScope:scope,
    currentAdmissionEpoch:journal.admission.epoch,currentClientSessionId:clientId,clock}).identity};
  journal=apply(apply(journal,{type:'revoke'}),{type:'admit',epoch:3});
  let consumes=0;const mutations=[];
  const coordinator=createSessionCountdownCoordinator({scope,store:{load:async()=>({kind:'ready',journal})},
    native:{consumeAction:async()=>{consumes++;return token;}},currentScope:()=>scope,currentEpoch:()=>9,
    currentRecordId:()=>clientId,busy:()=>false,clock:()=>clock,
    controller:{pause:async()=>mutations.push('pause'),resume:async()=>mutations.push('resume'),tick:async()=>mutations.push('tick')}});
  const ui=await connection({nonce,ownerId:scope.ownerId,timer:{sessionId:serverId,hasOpenSession:true,isRestoring:true,
    consumeNotificationAction:value=>coordinator.action(value)}});
  try {
    assert.equal(consumes,0);await ui.update({timer:{isRestoring:false}});
    assert.equal(consumes,1);assert.equal(ui.root().findByType('Confirmation').props.title,'End this session?');
    assert.deepEqual(mutations,[]);assert.deepEqual(ui.calls,[],'issuing the prompt never ends the timer');
    await ui.update({accessMode:'online'});assert.equal(ui.root().findAllByType('Confirmation').length,1);
    await act(async()=>ui.root().findByType('Confirmation').props.onConfirm());assert.deepEqual(ui.calls,[['end']]);
    assert.equal(await coordinator.action(nonce),null,'the recovered proof cannot prompt twice');assert.deepEqual(mutations,[]);
  } finally {await ui.cleanup();}
});

async function questProvider(options = {}) {
  const calls = []; let online = options.online ?? false, state, foreground;
  let timer = { sessionSummary: null, cloudSaveVersion: 0 };
  const module = load('src/context/QuestContext.tsx', {
    'react-native': { AppState: { addEventListener: (_name, callback) => { foreground = callback; return { remove() {} }; } } },
    './TimerContext': { useTimer: () => timer },
    '../services/taskService': {
      getTasks: async () => { calls.push('tasks'); return options.tasks?.() ?? [{ id: 1, title: 'Current quest' }]; },
      getSubjects: async () => { calls.push('areas'); return options.areas?.() ?? [{ id: 7, title: 'Learning' }]; },
    },
  });
  function Capture() { state = module.useQuests(); return null; }
  const render = () => React.createElement(module.QuestProvider, { online }, React.createElement(Capture));
  let tree; await act(async () => tree = create(render()));
  return { calls, state: () => state,
    update: async next => {
      if (next.online !== undefined) online = next.online;
      if (next.timer) timer = { ...timer, ...next.timer };
      await act(async () => tree.update(render()));
    },
    refresh: () => act(async () => { await state.refresh(true); }),
    foreground: () => act(async () => foreground('active')),
    cleanup: () => act(async () => tree.unmount()),
  };
}

test('the retained quest provider performs no online reads while offline, including foreground and sync publications', async () => {
  const ui = await questProvider();
  try {
    await ui.refresh(); await ui.foreground(); await ui.update({ timer: { cloudSaveVersion: 1 } });
    assert.deepEqual(ui.calls, []);
    await ui.update({ online: true });
    assert.deepEqual(ui.calls, ['tasks', 'areas']);
    assert.equal(ui.state().tasks[0].title, 'Current quest');
    await ui.update({ online: false }); await ui.refresh(); await ui.foreground();
    assert.deepEqual(ui.calls, ['tasks', 'areas']);
    assert.equal(ui.state().tasks[0].title, 'Current quest', 'cached choices stay mounted beneath the offline surface');
  } finally { await ui.cleanup(); }
});

test('a pre-disconnect quest response cannot overwrite the retained catalogue after reconnect', async () => {
  let resolveOld, requests = 0;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const ui = await questProvider({ online: true, tasks: () => ++requests === 1 ? old : [{ id: 2, title: 'New quest' }] });
  try {
    assert.equal(ui.state().refreshing, true);
    await ui.update({ online: false });
    assert.equal(ui.state().refreshing, false);
    await ui.update({ online: true }); assert.equal(ui.state().tasks[0].title, 'New quest');
    await act(async () => resolveOld([{ id: 1, title: 'Obsolete quest' }]));
    assert.equal(ui.state().tasks[0].title, 'New quest');
    assert.equal(ui.state().refreshing, false); assert.equal(ui.state().error, false);
  } finally { await ui.cleanup(); }
});
