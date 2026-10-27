/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports',source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['.ts','.tsx'].find(extension => fs.existsSync(target + extension));
    return load(target + suffix, mocks, cache);
  }, module, module.exports);
  return module.exports;
}

async function setup({consumers=1}={}) {
  const history = [], renders = [], values = [];
  let value, focus, blur, focused = true, renderer;
  let props = {owner:'owner-a',completion:null,cloud:0};
  const hooks = load('src/hooks/useProgressData.ts', {
    'expo-router':{useFocusEffect:callback => React.useEffect(() => {
      focus = callback;
      if (focused) blur = callback();
      return () => { blur?.(); blur = undefined; };
    }, [callback])},
    'react-native':{AppState:{addEventListener:() => ({remove(){}})}},
    '../utils/afterTransition':{afterTransition:callback => { callback(); return () => {}; }},
    '../services/progressService':{
      getCompletedSessions:(since,until,owner) => new Promise(resolve => history.push({since,until,owner,resolve})),
      getProgressGoals:async () => [],getProgressSubjects:async () => [],
      getFocusStreak:async () => 0,getLongestFocusStreak:async () => 0,
    },
  });
  const analytics = load('src/utils/progressAnalytics.ts', {});
  const now = new Date(), timeZone = 'UTC';
  const period = analytics.periodFor('week', analytics.dateKey(now,timeZone),timeZone,now);
  function Capture(current) {
    value = hooks.useProgressData(period,timeZone,current.completion,current.owner,current.clouds?.[current.index] ?? current.cloud);
    values[current.index ?? 0] = value;
    renders.push({owner:current.owner,ids:value.data?.sessions.map(session => session.id) ?? null});
    return null;
  }
  const content = () => React.createElement(React.Fragment,null,Array.from({length:consumers},(_,index)=>React.createElement(Capture,{...props,index,key:index})));
  const render = () => renderer.update(content());
  return {
    history,renders,values,get value(){return value;},
    prefetch:owner => hooks.prefetchProgress(owner,timeZone,now),
    async mount(changes={}) { props={...props,...changes}; await act(async () => { renderer=create(content()); }); },
    async update(changes) { props={...props,...changes}; await act(async () => render()); },
    async resolve(index,rows) { await act(async () => history[index].resolve(rows)); },
    async focus(next) { focused=next; await act(async () => { if(next) blur=focus(); else { blur?.(); blur=undefined; } render(); }); },
    async cleanup() { if(renderer) await act(async () => renderer.unmount()); },
  };
}
const row = id => ({id,duration_seconds:2700,completed_at:new Date().toISOString(),subject_id:null,activity_type:'general',xp_earned:45});

test('completion cannot reuse or later cache a pre-completion Progress prefetch', async () => {
  const ui=await setup();
  try {
    ui.prefetch('owner-a'); await ui.mount(); assert.equal(ui.history.length,1);
    await ui.update({completion:{sessionId:'saved-45-minutes'}});
    assert.equal(ui.history.length,2,'one fresh history read must start after the completion');
    await ui.resolve(1,[row('saved-45-minutes')]);
    await ui.resolve(0,[]);
    assert.equal(ui.value.data.sessions[0].id,'saved-45-minutes');
    await ui.focus(false);await ui.focus(true);
    assert.equal(ui.history.length,2,'the late prefetch must not replace the new cache');
    assert.equal(ui.value.data.sessions[0].id,'saved-45-minutes');
  } finally { await ui.cleanup(); }
});

test('first Progress mount with a saved completion detaches an older Home prefetch before focus loads', async () => {
  const ui=await setup();
  try {
    ui.prefetch('owner-a');
    await ui.mount({completion:{sessionId:'already-saved'}});
    assert.equal(ui.history.length,2,'one old prefetch and one post-completion read, without duplicate focus reads');
    await ui.resolve(0,[]);
    assert.equal(ui.value.data,null,'the old reply cannot be presented as fresh completion history');
    await ui.resolve(1,[row('already-saved')]);
    assert.equal(ui.value.data.sessions[0].id,'already-saved');
  } finally { await ui.cleanup(); }
});

test('off-tab completion fences old prefetch remember and finally without deleting a newer prefetch', async () => {
  const ui=await setup();
  try {
    ui.prefetch('owner-a');await ui.mount();await ui.focus(false);
    await ui.update({completion:{sessionId:'background-saved'}});
    ui.prefetch('owner-a');assert.equal(ui.history.length,2);
    await ui.resolve(0,[]);
    await ui.focus(true);
    assert.equal(ui.history.length,2,'focus must join the replacement prefetch, not start a third read');
    assert.equal(ui.value.data,null,'no empty stale cache may reappear while the new read waits');
    await ui.resolve(1,[row('background-saved')]);
    assert.equal(ui.value.data.sessions[0].id,'background-saved');
  } finally { await ui.cleanup(); }
});

test('ordinary prefetch and focus still coalesce without a new completion', async () => {
  const ui=await setup();
  try {
    ui.prefetch('owner-a');ui.prefetch('owner-a');await ui.mount();
    assert.equal(ui.history.length,1);
    await ui.resolve(0,[row('cached')]);
    await ui.focus(false);await ui.focus(true);
    assert.equal(ui.history.length,1,'fresh cached visits should not add requests');
    assert.equal(ui.value.data.sessions[0].id,'cached');
  } finally { await ui.cleanup(); }
});

test('switching owners in the same period never renders the previous account history', async () => {
  const ui=await setup();
  try {
    await ui.mount();await ui.resolve(0,[row('private-owner-a')]);
    assert.equal(ui.value.data.sessions[0].id,'private-owner-a');
    await ui.update({owner:'owner-b'});
    assert.equal(ui.history[1].owner,'owner-b');
    assert.equal(ui.value.data,null,'matching period dates are not matching ownership');
    assert.ok(ui.renders.filter(render => render.owner==='owner-b').every(render => render.ids===null),
      'the outgoing account cannot flash even on the first new-owner render');
    await ui.resolve(1,[row('private-owner-b')]);
    assert.equal(ui.value.data.sessions[0].id,'private-owner-b');
  } finally { await ui.cleanup(); }
});

test('completion invalidation is scoped to its owner and keeps another account cache fresh', async () => {
  const ui=await setup();
  try {
    ui.prefetch('owner-b');await ui.resolve(0,[row('private-owner-b')]);
    await ui.mount();await ui.resolve(1,[row('private-owner-a')]);
    await ui.update({completion:{sessionId:'new-owner-a'}});
    await ui.resolve(2,[row('new-owner-a')]);
    await ui.update({owner:'owner-b'});
    assert.equal(ui.history.length,3,'another account completion must not invalidate owner-b history');
    assert.equal(ui.value.data.sessions[0].id,'private-owner-b');
  } finally { await ui.cleanup(); }
});

test('dismissed offline sync refreshes Progress without a summary or manual refresh',async()=>{
  const ui=await setup();
  try {
    await ui.mount();await ui.resolve(0,[row('before-sync')]);
    await ui.update({cloud:1});
    assert.equal(ui.history.length,2,'the existing cloud-save signal invalidates the cached period');
    await ui.resolve(1,[row('before-sync'),row('imported')]);
    assert.equal(ui.value.data.sessions.length,2);
    await ui.focus(false);await ui.focus(true);
    assert.equal(ui.history.length,2,'ordinary refocus keeps the refreshed cloud version');
    await ui.update({completion:{sessionId:'online-save'},cloud:2});
    assert.equal(ui.history.length,3,'one save with both signals starts one existing refresh');
    await ui.resolve(2,[row('online-save')]);
    await ui.update({completion:null});
    assert.equal(ui.history.length,3,'Done starts no extra history read');
  } finally {await ui.cleanup();}
});

test('off-tab cloud sync fences old Progress prefetches and keeps other owners private',async()=>{
  const ui=await setup();
  try {
    ui.prefetch('owner-a');await ui.mount();await ui.focus(false);
    await ui.update({cloud:1});await ui.resolve(0,[row('obsolete-a')]);
    await ui.focus(true);
    assert.equal(ui.history.length,2,'an old pre-sync prefetch cannot be treated as post-sync data');
    await ui.update({owner:'owner-b',cloud:0});
    assert.equal(ui.history.length,3);assert.equal(ui.value.data,null);
    await ui.resolve(1,[row('private-import-a')]);
    assert.equal(ui.value.data,null);
    await ui.resolve(2,[row('private-b')]);
    assert.equal(ui.value.data.sessions[0].id,'private-b');
    assert.ok(ui.renders.filter(render=>render.owner==='owner-b').every(render=>render.ids===null||!render.ids.includes('private-import-a')));
  } finally {await ui.cleanup();}
});

test('multiple Home week consumers share a single matching history flight',async()=>{
  const ui=await setup({consumers:2});
  try {
    await ui.mount();
    assert.equal(ui.history.length,1,'Home week, its bars and Today reuse the same read');
    await ui.resolve(0,[row('recorded')]);
    assert.ok(ui.values.every(value=>value.data.sessions[0].id==='recorded'));
  }finally{await ui.cleanup();}
});

test('staggered cloud signals share the new Progress flight or adopt its completed cache',async()=>{
  for(const completedFirst of [false,true]) {
    const ui=await setup({consumers:2});
    try {
      await ui.mount();await ui.resolve(0,[row('before-sync')]);
      await ui.update({clouds:[1,0]});assert.equal(ui.history.length,2);
      if(completedFirst)await ui.resolve(1,[row('imported')]);
      await ui.update({clouds:[1,1]});
      assert.equal(ui.history.length,2,'a second consumer must not evict fresh matching work');
      if(!completedFirst)await ui.resolve(1,[row('imported')]);
      assert.ok(ui.values.every(value=>value.data.sessions[0].id==='imported'));
    }finally{await ui.cleanup();}
  }
});

test('returning to an account resets Progress cloud accounting before a new import reuses its counter',async()=>{
  const ui=await setup();
  try {
    await ui.mount();await ui.resolve(0,[row('a-before-sync')]);
    await ui.update({cloud:1});await ui.resolve(1,[row('a-old-admission')]);
    await ui.update({owner:'owner-b',cloud:0});await ui.resolve(2,[row('private-b')]);
    await ui.update({owner:'owner-a',cloud:0});
    assert.equal(ui.history.length,4,'the reset controller cannot reuse the old admitted cloud version');
    await ui.resolve(3,[row('a-new-admission')]);
    await ui.update({cloud:1});assert.equal(ui.history.length,5);
    await ui.resolve(4,[row('a-new-import')]);
    assert.equal(ui.value.data.sessions[0].id,'a-new-import');
  }finally{await ui.cleanup();}
});

test('a focused Progress controller reset fences the outgoing cloud read',async()=>{
  const ui=await setup();
  try {
    await ui.mount();await ui.resolve(0,[row('recorded')]);
    await ui.update({cloud:1});await ui.update({cloud:0});
    assert.equal(ui.history.length,3);
    await ui.resolve(1,[row('obsolete-admission')]);
    assert.equal(ui.value.data.sessions[0].id,'recorded');
    await ui.resolve(2,[row('current-admission')]);
    assert.equal(ui.value.data.sessions[0].id,'current-admission');
  }finally{await ui.cleanup();}
});
