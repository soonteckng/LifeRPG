/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['', '.ts', '.tsx'].find(value => fs.existsSync(target + value));
    return load(path.relative(path.resolve(__dirname, '..'), target + suffix), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const NOW = Date.UTC(2026,9,13,2);
const evidence = (overrides = {}) => ({visible:true,pending:false,recovered:false,sessionId:'session-a',ownerId:'owner-a',timeZone:'Asia/Kuala_Lumpur',creditedDate:'2026-10-13',creditVersion:1,durationSeconds:60,dailyCompletedSeconds:60,...overrides});
const deferred = () => {let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve};};
function storage() {
  const values = new Map(), reads = [], writes = [];
  return {values,reads,writes,getItem:async key => {reads.push(key);return values.get(key)??null;},setItem:async(key,value)=>{writes.push([key,value]);values.set(key,value);}};
}
const host = type => props => React.createElement(type,props,props.children);

async function setup({insideSession = false, state = 'active', platform = 'android', saved = storage(), reduced = false} = {}) {
  const listeners = new Set(), cache = new Map(), animations = [];
  let profile = {id:'owner-a',timezone:'Asia/Kuala_Lumpur'}, route = insideSession, now = NOW, reducedMotion = reduced;
  const originalNow = Date.now; Date.now = () => now;
  class Value {
    constructor(value) {this.value=value;}
    setValue(value) {this.value=value;}
    interpolate(config) {return {source:this,config};}
    stopAnimation() {}
  }
  const appState = {currentState:state,addEventListener:(_event,listener)=>{listeners.add(listener);return {remove:()=>listeners.delete(listener)};}};
  const mocks = {
    'react-native':{AppState:appState,Modal:host('Modal'),Platform:{OS:platform},ScrollView:host('Scroll'),View:host('View'),StyleSheet:{create:value=>value},Animated:{Value,View:host('AnimatedView'),timing:(value,config)=>{
      const animation={value,config,callback:null,settled:false,stopped:false,
        start(callback){this.callback=callback;},
        stop(){if(this.settled)return;this.stopped=true;this.settled=true;this.callback?.({finished:false});},
        finish(finished=true){if(this.settled)return;this.settled=true;if(finished)value.setValue(config.toValue);this.callback?.({finished});},
      };animations.push(animation);return animation;
    }}},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:34})},
    '@react-native-async-storage/async-storage':saved,
    '../context/UserContext':{useUser:()=>({profile})},
    '../hooks/useReducedMotion':{useReducedMotion:()=>reducedMotion},
    './DailyEffortCelebration':host('Achievement'), './MotionPressable':host('Button'), './AppText':{Text:host('Text')},
  };
  const Component = load('src/components/PostSessionCelebration.tsx',mocks,cache).default;
  const queue = load('src/services/dailyAchievementQueue.ts',mocks,cache).dailyAchievementQueue;
  const sheets = load('src/utils/sheetActivity.ts',mocks,cache);
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Component,{insideSession:route}));});
  return {
    queue,sheets,saved,renderer,animations,
    moment:()=>renderer.root.findByProps({testID:'daily-achievement-moment'}),
    flags:()=>renderer.root.findByType('Achievement').props,
    enqueue:async value=>act(async()=>{queue.enqueue(value);}),
    update:async values=>act(async()=>{
      if ('insideSession' in values) route=values.insideSession;
      if ('owner' in values) profile={...profile,id:values.owner};
      if ('now' in values) now=values.now;
      if ('reduced' in values) reducedMotion=values.reduced;
      renderer.update(React.createElement(Component,{insideSession:route}));
    }),
    state:async next=>act(async()=>{appState.currentState=next;for(const listener of listeners)listener(next);}),
    beginClose:async()=>act(async()=>renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.onPress()),
    finishFade:async(finished=true)=>act(async()=>animations.findLast(animation=>!animation.settled)?.finish(finished)),
    continue:async()=>{
      await act(async()=>renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.onPress());
      await act(async()=>animations.findLast(animation=>!animation.settled)?.finish());
    },
    cleanup:async()=>{await act(async()=>renderer.unmount());Date.now=originalNow;assert.equal(sheets.activeSheetCount(),0);},
  };
}

test('post-result queue freezes confirmed evidence, deduplicates callbacks and ignores stale dismissals',()=>{
  const originalNow=Date.now;Date.now=()=>NOW;
  try {
    const queue=load('src/services/dailyAchievementQueue.ts').createDailyAchievementQueue();
    const value=evidence(); assert.equal(queue.enqueue(value),true);
    const first=queue.snapshot(); value.ownerId='replacement'; value.durationSeconds=120;
    assert.equal(first.evidence.ownerId,'owner-a');assert.equal(first.evidence.durationSeconds,60);
    assert.equal(Object.isFrozen(first),true);assert.equal(Object.isFrozen(first.evidence),true);
    assert.equal(queue.enqueue(evidence()),false,'a duplicate close callback cannot replace the same request');
    assert.equal(queue.snapshot(),first);
    assert.equal(queue.enqueue(evidence({pending:true,sessionId:'pending'})),false,'local work has no confirmed achievement');
    assert.equal(queue.enqueue(evidence({sessionId:'later',durationSeconds:60,dailyCompletedSeconds:1800,dailyGoalMinutes:30})),true);
    const later=queue.snapshot();queue.dismiss(first.id);assert.equal(queue.snapshot(),later);
    queue.dismiss(later.id);assert.equal(queue.snapshot(),null);
  } finally {Date.now=originalNow;}
});

test('global host waits for SessionScreen exit, then excludes its own native modal from the sheet gate',async()=>{
  const ui=await setup({insideSession:true});
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,false);assert.equal(ui.saved.reads.length,0);
    await ui.update({insideSession:false});assert.equal(ui.moment().props.visible,true);
    assert.equal(ui.flags().firstSession,true);assert.equal(ui.flags().dailyGoal,false);
    assert.equal(ui.saved.writes.length,1);assert.equal(ui.sheets.activeSheetCount(),1);
    await ui.continue();assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),0);
    await ui.enqueue(evidence());assert.equal(ui.queue.snapshot(),null,'a reopened result cannot replay the claimed achievement');
    assert.equal(ui.moment().props.visible,false);assert.equal(ui.saved.writes.length,1);
  } finally {await ui.cleanup();}
});

test('a pending ledger claim reserves the moment without mounting or animating its hidden hero',async()=>{
  const waiting=deferred(), saved=storage();saved.getItem=async key=>{saved.reads.push(key);return waiting.promise;};
  const ui=await setup({saved});
  try {
    await ui.enqueue(evidence());
    assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),1,'optional invitations see a presentation already reserved');
    assert.equal(ui.renderer.root.findAllByType('Achievement').length,0,'the entrance must not run before the moment appears');
    await act(async()=>waiting.resolve(null));
    assert.equal(ui.moment().props.visible,true);assert.equal(ui.sheets.activeSheetCount(),1);assert.equal(saved.writes.length,1);
    assert.equal(ui.renderer.root.findByType('Scroll').findAllByType('Button').length,0,'Continue is outside the scrollable artwork');
    await ui.continue();assert.equal(ui.sheets.activeSheetCount(),0);
  }finally{await ui.cleanup();}
});

test('a cancelled iOS preparation releases its reservation without waiting for an unshown native modal',async()=>{
  const waiting=deferred(), saved=storage();saved.getItem=async()=>waiting.promise;
  const ui=await setup({saved,platform:'ios'});
  try {
    await ui.enqueue(evidence());assert.equal(ui.sheets.activeSheetCount(),1);assert.equal(ui.moment().props.visible,false);
    await ui.update({owner:'owner-b'});assert.equal(ui.queue.snapshot(),null);assert.equal(ui.sheets.activeSheetCount(),0);
    await act(async()=>waiting.resolve(null));assert.equal(saved.writes.length,0);
  }finally{await ui.cleanup();}
});

test('an active editor delays all achievement claims until its actual sheet closes',async()=>{
  const ui=await setup();let release;
  try {
    await act(async()=>{release=ui.sheets.registerSheetActivity(Symbol('quest-editor'));});
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,false);assert.equal(ui.saved.reads.length,0);
    await act(async()=>release());release=null;
    assert.equal(ui.moment().props.visible,true);assert.equal(ui.saved.writes.length,1);
    await ui.continue();
  } finally {if(release)await act(async()=>release());await ui.cleanup();}
});

test('background does not start an unseen achievement, and an already shown moment survives returning',async()=>{
  const ui=await setup({state:'background'});
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,false);assert.equal(ui.saved.reads.length,0);
    await ui.state('active');assert.equal(ui.moment().props.visible,true);const reads=ui.saved.reads.length;
    await ui.state('background');assert.notEqual(ui.queue.snapshot(),null,'leaving the app does not dismiss the user\'s moment');
    await ui.state('active');assert.equal(ui.moment().props.visible,true);assert.equal(ui.flags().firstSession,true);
    assert.equal(ui.saved.reads.length,reads,'returning uses the held presentation instead of re-claiming a consumed ledger');
    await ui.continue();
  } finally {await ui.cleanup();}
});

test('an already shown moment restores after a later editor interruption without claiming twice',async()=>{
  const ui=await setup();let release;
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,true);const reads=ui.saved.reads.length;
    await act(async()=>{release=ui.sheets.registerSheetActivity(Symbol('later-editor'));});
    assert.equal(ui.moment().props.visible,false);assert.notEqual(ui.queue.snapshot(),null);
    await act(async()=>release());release=null;
    assert.equal(ui.moment().props.visible,true);assert.equal(ui.flags().firstSession,true);
    assert.equal(ui.saved.reads.length,reads);assert.equal(ui.saved.writes.length,1);
    await ui.continue();
  } finally {if(release)await act(async()=>release());await ui.cleanup();}
});

test('owner replacement during a delayed claim cannot publish or write the former owner\'s achievement',async()=>{
  const waiting=deferred(), saved=storage();saved.getItem=async key=>{saved.reads.push(key);return waiting.promise;};
  const ui=await setup({saved});
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,false);assert.equal(saved.reads.length,1);
    await ui.update({owner:'owner-b'});assert.equal(ui.queue.snapshot(),null);
    await act(async()=>waiting.resolve(null));assert.equal(ui.moment().props.visible,false);assert.equal(saved.writes.length,0);
  } finally {await ui.cleanup();}
});

test('a delayed claim crossing local midnight is cancelled before the old day can display',async()=>{
  const waiting=deferred(), saved=storage();saved.getItem=async key=>{saved.reads.push(key);return waiting.promise;};
  const ui=await setup({saved});
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,false);
    await ui.update({now:NOW+86400000});assert.equal(ui.queue.snapshot(),null);
    await act(async()=>waiting.resolve(null));assert.equal(ui.moment().props.visible,false);assert.equal(saved.writes.length,0);
  } finally {await ui.cleanup();}
});

test('an already held moment cannot follow an account switch or revive on the next local day',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());assert.equal(ui.moment().props.visible,true);
    await ui.update({owner:'owner-b'});assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);
    await ui.update({owner:'owner-a'});assert.equal(ui.moment().props.visible,false,'switching back does not replay the dismissed account\'s screen');
    await ui.enqueue(evidence({sessionId:'goal',durationSeconds:60,dailyCompletedSeconds:1800,dailyGoalMinutes:30}));assert.equal(ui.moment().props.visible,true);
    await ui.update({now:NOW+86400000});assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);
  } finally {await ui.cleanup();}
});

test('first-session and goal crossing share one moment and independent persisted claims across a remount',async()=>{
  const saved=storage(), input=evidence({durationSeconds:1800,dailyCompletedSeconds:1800,dailyGoalMinutes:30});
  const ui=await setup({saved});
  try {
    await ui.enqueue(input);assert.equal(ui.moment().props.visible,true);
    assert.equal(ui.renderer.root.findAllByType('Modal').filter(node=>node.props.visible).length,1);
    assert.equal(ui.flags().firstSession,true);assert.equal(ui.flags().dailyGoal,true);assert.equal(saved.writes.length,2);
    assert.ok(saved.writes.some(([key])=>key.startsWith('liferpg:daily-effort:v1:')));
    assert.ok(saved.writes.some(([key])=>key.startsWith('liferpg:daily-goal-celebration:v1:')));
    await ui.continue();
  } finally {await ui.cleanup();}
  const reopened=await setup({saved});
  try {await reopened.enqueue(input);assert.equal(reopened.moment().props.visible,false);assert.equal(reopened.queue.snapshot(),null);assert.equal(saved.writes.length,2);}
  finally {await reopened.cleanup();}
});

test('storage failures leave the already dismissed result unblocked and never show unclaimed congratulations',async()=>{
  for(const fault of ['read','write']) {
    const saved=storage();
    if(fault==='read')saved.getItem=async()=>{throw Error('unavailable');};
    else saved.setItem=async()=>{throw Error('unavailable');};
    const ui=await setup({saved});
    try {await ui.enqueue(evidence());assert.equal(ui.queue.snapshot(),null,fault);assert.equal(ui.moment().props.visible,false,fault);assert.equal(ui.sheets.activeSheetCount(),0,fault);}
    finally {await ui.cleanup();}
  }
});

test('iOS keeps its activity reservation through native dismissal and stale callbacks cannot release a reopened moment',async()=>{
  const ui=await setup({platform:'ios'});let release;
  try {
    await ui.enqueue(evidence());assert.equal(ui.sheets.activeSheetCount(),1);
    await act(async()=>{release=ui.sheets.registerSheetActivity(Symbol('editor'));});
    assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),2,'the native celebration modal is still dismissing');
    const delayedDismiss=ui.moment().props.onDismiss;
    await act(async()=>release());release=null;assert.equal(ui.moment().props.visible,true);
    await act(async()=>delayedDismiss());assert.equal(ui.sheets.activeSheetCount(),1,'an older dismiss callback cannot release the reopened modal');
    await ui.continue();assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),1);
    await act(async()=>ui.moment().props.onDismiss());assert.equal(ui.sheets.activeSheetCount(),0);
  } finally {if(release)await act(async()=>release());await ui.cleanup();}
});

test('Continue fades the whole moment before dismissing its queue and Android sheet reservation',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());const request=ui.queue.snapshot();
    await ui.beginClose();
    assert.equal(ui.queue.snapshot(),request,'the confirmed moment remains queued during its visual exit');
    assert.equal(ui.moment().props.visible,true);assert.equal(ui.sheets.activeSheetCount(),1);
    assert.equal(ui.animations.length,1);const fade=ui.animations[0];
    assert.equal(fade.config.toValue,0);assert.equal(fade.config.duration,200);assert.equal(fade.config.useNativeDriver,true);
    const page=ui.renderer.root.findByType('AnimatedView');
    assert.equal(page.props.pointerEvents,'none');assert.ok(page.props.style.some(style=>style.opacity===fade.value));
    assert.equal(page.findByProps({accessibilityLabel:'Continue from celebration'}).props.disabled,true,'the footer fades with the artwork');
    await ui.finishFade();
    assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),0);
  } finally {await ui.cleanup();}
});

test('rapid Continue, Back and accessibility escape requests share one guarded dismissal',async()=>{
  const ui=await setup();let changes=0;const unsubscribe=ui.queue.subscribe(()=>changes++);
  try {
    await ui.enqueue(evidence());const changesBeforeClose=changes;
    const press=ui.renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.onPress;
    const back=ui.moment().props.onRequestClose;
    const escape=ui.renderer.root.findByType('AnimatedView').props.onAccessibilityEscape;
    await act(async()=>{press();press();back();escape();});
    assert.equal(ui.animations.length,1);assert.equal(changes,changesBeforeClose);
    await ui.finishFade();assert.equal(changes,changesBeforeClose+1);assert.equal(ui.queue.snapshot(),null);
    await act(async()=>ui.animations[0].callback({finished:true}));assert.equal(changes,changesBeforeClose+1,'late native completion cannot dismiss again');
  } finally {unsubscribe();await ui.cleanup();}
});

test('Reduce Motion dismisses without starting an exit animation',async()=>{
  const ui=await setup({reduced:true});
  try {
    await ui.enqueue(evidence());let dismissals=0;const dismiss=ui.queue.dismiss;
    ui.queue.dismiss=id=>{dismissals++;dismiss(id);};
    const press=ui.renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.onPress;
    const back=ui.moment().props.onRequestClose;
    const escape=ui.renderer.root.findByType('AnimatedView').props.onAccessibilityEscape;
    await act(async()=>{press();press();back();escape();});
    assert.equal(ui.animations.length,0);assert.equal(ui.queue.snapshot(),null);
    assert.equal(dismissals,1,'synchronous close calls before a parent rerender are guarded too');
    assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),0);
  } finally {await ui.cleanup();}
});

test('route interruption cancels a pending exit and restores the same held moment safely',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());const request=ui.queue.snapshot(), writes=ui.saved.writes.length;
    await ui.beginClose();const fade=ui.animations[0], stale=fade.callback;
    await ui.update({insideSession:true});
    assert.equal(fade.stopped,true);assert.equal(ui.moment().props.visible,false);assert.equal(ui.queue.snapshot(),request);
    await ui.update({insideSession:false});
    assert.equal(ui.moment().props.visible,true);assert.equal(fade.value.value,1);
    assert.equal(ui.renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.disabled,false);
    await act(async()=>stale({finished:true}));assert.equal(ui.queue.snapshot(),request);
    assert.equal(ui.saved.writes.length,writes,'reopening does not claim an achievement twice');
    await ui.continue();assert.equal(ui.queue.snapshot(),null);
  } finally {await ui.cleanup();}
});

test('replacing a request while its fade is running protects the later daily-goal moment',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());await ui.beginClose();const stale=ui.animations[0].callback;
    await ui.enqueue(evidence({sessionId:'goal-later',durationSeconds:60,dailyCompletedSeconds:1800,dailyGoalMinutes:30}));
    const replacement=ui.queue.snapshot();assert.equal(ui.flags().dailyGoal,true);assert.equal(ui.flags().firstSession,false);
    assert.equal(ui.moment().props.visible,true);assert.equal(ui.animations[0].stopped,true);
    assert.equal(ui.renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.disabled,false);
    await act(async()=>stale({finished:true}));assert.equal(ui.queue.snapshot(),replacement,'old completion cannot dequeue a newer achievement');
    await ui.continue();assert.equal(ui.queue.snapshot(),null);
  } finally {await ui.cleanup();}
});

test('account replacement during the fade cannot dismiss the next account\'s moment',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());await ui.beginClose();const stale=ui.animations[0].callback;
    await ui.update({owner:'owner-b'});assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);
    await ui.enqueue(evidence({ownerId:'owner-b',sessionId:'session-b'}));const next=ui.queue.snapshot();
    assert.equal(ui.moment().props.visible,true);
    await act(async()=>stale({finished:true}));assert.equal(ui.queue.snapshot(),next);assert.equal(ui.moment().props.visible,true);
    await ui.continue();assert.equal(ui.queue.snapshot(),null);
  } finally {await ui.cleanup();}
});

test('backgrounding after Continue finishes the chosen close without stranding or replaying a faded modal',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());await ui.beginClose();const fade=ui.animations[0], stale=fade.callback;
    await ui.state('background');
    assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),0);
    assert.equal(fade.stopped,true);
    await act(async()=>stale({finished:true}));await ui.state('active');
    assert.equal(ui.moment().props.visible,false);assert.equal(ui.queue.snapshot(),null);
  } finally {await ui.cleanup();}
});

test('an interrupted animation keeps the moment visible and allows a fresh Continue',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());const request=ui.queue.snapshot();await ui.beginClose();
    const interrupted=ui.animations[0];interrupted.value.setValue(0.4);
    await ui.finishFade(false);
    assert.equal(ui.queue.snapshot(),request);assert.equal(ui.moment().props.visible,true);assert.equal(ui.sheets.activeSheetCount(),1);
    assert.equal(interrupted.value.value,1);assert.equal(ui.renderer.root.findByProps({accessibilityLabel:'Continue from celebration'}).props.disabled,false);
    await ui.continue();assert.equal(ui.animations.length,2);assert.equal(ui.queue.snapshot(),null);
  } finally {await ui.cleanup();}
});

test('iOS holds its reservation during the fade and until the native modal has actually dismissed',async()=>{
  const ui=await setup({platform:'ios'});
  try {
    await ui.enqueue(evidence());await ui.beginClose();
    assert.equal(ui.moment().props.visible,true);assert.notEqual(ui.queue.snapshot(),null);assert.equal(ui.sheets.activeSheetCount(),1);
    await ui.finishFade();
    assert.equal(ui.queue.snapshot(),null);assert.equal(ui.moment().props.visible,false);assert.equal(ui.sheets.activeSheetCount(),1);
    await act(async()=>ui.moment().props.onDismiss());assert.equal(ui.sheets.activeSheetCount(),0);
  } finally {await ui.cleanup();}
});

test('unmount invalidates a pending native fade callback before another request is queued',async()=>{
  const ui=await setup();
  try {
    await ui.enqueue(evidence());await ui.beginClose();const stale=ui.animations[0].callback;
    await act(async()=>ui.renderer.unmount());assert.equal(ui.sheets.activeSheetCount(),0);assert.equal(ui.queue.snapshot(),null);
    ui.queue.enqueue(evidence({sessionId:'next-host',dailyCompletedSeconds:1800,dailyGoalMinutes:30}));const next=ui.queue.snapshot();
    assert.notEqual(next,null);await act(async()=>stale({finished:true}));assert.equal(ui.queue.snapshot(),next);
  } finally {await ui.cleanup();}
});
