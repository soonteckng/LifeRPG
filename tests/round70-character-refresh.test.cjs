/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

async function setup({prefetch=false,compiled=false,consumers=1}={}) {
  let owner='owner-a',summary=null,cloud=0,clouds=[],slot=0,focused=true,snapshot;
  const snapshots=[];
  const reads=[],listeners=new Set(),seen=[];
  const mocks={
    'expo-router':{useFocusEffect:fn=>{const active=focused;React.useEffect(()=>active?fn():undefined,[fn,active]);}},
    'react-native':{AppState:{addEventListener:(_name,listener)=>{listeners.add(listener);return{remove:()=>listeners.delete(listener)};}}},
    '../context/UserContext':{useUser:()=>({profile:{id:owner}})},
    '../context/TimerContext':{useTimer:()=>({sessionSummary:summary,cloudSaveVersion:clouds[slot]??cloud})},
    '../utils/afterTransition':{afterTransition:fn=>{fn();return()=>{};}},
    '../services/progressService':{getProgressSubjects:async userId=>[{id:1,user_id:userId,title:'Learning'}],
      getCompletedSessions:(_since,_until,userId)=>{const pending=deferred();reads.push({owner:userId,...pending});return pending.promise;}},
  };
  const filename=path.resolve(__dirname,'../src/hooks/useCharacterData.ts');
  let input=fs.readFileSync(filename,'utf8');
  if(compiled)input=require('@babel/core').transformSync(input,{filename,configFile:false,babelrc:false,parserOpts:{plugins:['typescript','jsx']},plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
  const source=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,module={exports:{}};
  new Function('require','module','exports',source)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),module,module.exports);
  const api=module.exports;
  function Consumer({index}){slot=index;snapshot=api.useCharacterData();snapshots[index]=snapshot;seen.push({owner,data:snapshot.data});return null;}
  const element=()=>React.createElement(React.Fragment,null,...Array.from({length:consumers},(_,index)=>React.createElement(Consumer,{key:index,index})));
  if(prefetch)api.prefetchCharacterData(owner,summary);
  let renderer;await act(async()=>{renderer=create(element());});
  const update=async changes=>{if(Object.hasOwn(changes,'owner'))owner=changes.owner;if(Object.hasOwn(changes,'summary'))summary=changes.summary;if(Object.hasOwn(changes,'cloud'))cloud=changes.cloud;if(Object.hasOwn(changes,'clouds'))clouds=changes.clouds;if(Object.hasOwn(changes,'focused'))focused=changes.focused;await act(async()=>renderer.update(element()));};
  return{api,reads,seen,snapshots,snapshot:()=>snapshot,update,
    resolve:async(index,sessions)=>act(async()=>reads[index].resolve(sessions)),
    reject:async(index)=>act(async()=>reads[index].reject(new Error('Unavailable'))),
    foreground:async()=>act(async()=>{for(const listener of listeners)listener('active');}),
    remount:async()=>{await act(async()=>renderer.unmount());await act(async()=>{renderer=create(element());});},
    cleanup:async()=>act(async()=>renderer.unmount())};
}

test('a completion detaches the pre-completion Profile prefetch instead of certifying its stale history',async()=>{
  for(const compiled of [false,true]) {
    const ui=await setup({prefetch:true,compiled});
    try {
      assert.equal(ui.reads.length,1,'the initial consumer reuses its matching prefetch');
      const summary={sessionId:'just-completed'};
      await ui.update({summary});
      assert.equal(ui.reads.length,2,'a new completion needs a new read');
      await ui.resolve(0,[]);
      assert.equal(ui.snapshot().data,null,'the old history cannot fill the new completion');
      assert.equal(ui.snapshot().loading,true,'old finally cannot clear the new pending read');
      ui.api.prefetchCharacterData('owner-a',summary);
      assert.equal(ui.reads.length,2,'old finally cannot detach the replacement prefetch');
      const history=[{id:'just-completed',duration_seconds:2700}];
      await ui.resolve(1,history);
      assert.deepEqual(ui.snapshot().data.sessions,history);
      await ui.remount();
      assert.equal(ui.reads.length,2,'the fresh result is cached for the next Profile/Milestones visit');
      assert.deepEqual(ui.snapshot().data.sessions,history);
    }finally{await ui.cleanup();}
  }
});

test('a late old prefetch cannot overwrite already refreshed Profile history or its shared cache',async()=>{
  const ui=await setup({prefetch:true});
  try {
    await ui.update({summary:{sessionId:'completed'}});
    assert.equal(ui.reads.length,2);
    const history=[{id:'completed',duration_seconds:2700}];
    await ui.resolve(1,history);await ui.resolve(0,[]);
    assert.deepEqual(ui.snapshot().data.sessions,history);
    await ui.remount();
    assert.equal(ui.reads.length,2);assert.deepEqual(ui.snapshot().data.sessions,history);
  }finally{await ui.cleanup();}
});

test('completion while Profile is blurred invalidates the old prefetch without starting hidden reads',async()=>{
  const ui=await setup({prefetch:true});
  try {
    await ui.update({focused:false});
    await ui.update({summary:{sessionId:'background-completed'}});
    assert.equal(ui.reads.length,1);
    await ui.resolve(0,[]);
    await ui.update({focused:true});
    assert.equal(ui.reads.length,2);
    await ui.resolve(1,[{id:'background-completed'}]);
    assert.equal(ui.snapshot().data.sessions[0].id,'background-completed');
  }finally{await ui.cleanup();}
});

test('matching foreground and refresh requests coalesce, and dismissing a summary does not discard the fresh read',async()=>{
  const ui=await setup({prefetch:true});
  try {
    await ui.update({summary:{sessionId:'completed'}});
    assert.equal(ui.reads.length,2);
    await ui.foreground();let first,second;
    await act(async()=>{first=ui.snapshot().refresh();second=ui.snapshot().refresh();});
    assert.equal(ui.reads.length,2,'one matching read serves all callers');
    await ui.update({summary:null});
    ui.api.prefetchCharacterData('owner-a',null);
    assert.equal(ui.reads.length,2,'Home clearing its summary also shares the fresh read');
    await ui.resolve(1,[{id:'completed'}]);await first;await second;
    assert.equal(ui.snapshot().data.sessions[0].id,'completed');assert.equal(ui.snapshot().loading,false);
    await ui.resolve(0,[]);assert.equal(ui.snapshot().data.sessions[0].id,'completed');
  }finally{await ui.cleanup();}
});

test('an old owner response cannot replace or settle the current owner Profile request',async()=>{
  const ui=await setup({prefetch:true});
  try {
    await ui.update({owner:'owner-b'});assert.equal(ui.reads.length,2);assert.equal(ui.snapshot().data,null);
    await ui.resolve(0,[{id:'private-a'}]);
    assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().loading,true);
    await ui.resolve(1,[{id:'private-b'}]);
    assert.equal(ui.snapshot().data.userId,'owner-b');assert.equal(ui.snapshot().data.sessions[0].id,'private-b');
    assert.ok(ui.seen.filter(value=>value.owner==='owner-b').every(value=>value.data===null||value.data.userId==='owner-b'));
    await ui.remount();assert.equal(ui.reads.length,2);assert.equal(ui.snapshot().data.userId,'owner-b');
  }finally{await ui.cleanup();}
});

test('Home can prefetch the new completion over an older cached Profile copy before its next visit',async()=>{
  const ui=await setup();
  try {
    await ui.resolve(0,[]);await ui.update({focused:false});
    const summary={sessionId:'background-completed'};
    await ui.update({summary});
    ui.api.prefetchCharacterData('owner-a',summary);ui.api.prefetchCharacterData('owner-a',summary);
    assert.equal(ui.reads.length,2,'one post-completion prefetch replaces the older cache');
    await ui.resolve(1,[{id:'background-completed'}]);await ui.remount();await ui.update({focused:true});
    assert.equal(ui.reads.length,2);assert.equal(ui.snapshot().data.sessions[0].id,'background-completed');
  }finally{await ui.cleanup();}
});

test('stale errors are ignored, current errors preserve cached history, and only an explicit retry reads again',async()=>{
  const ui=await setup();
  try {
    await ui.resolve(0,[{id:'already-recorded'}]);await ui.foreground();
    await ui.update({summary:{sessionId:'completed'}});assert.equal(ui.reads.length,3);
    await ui.reject(1);assert.equal(ui.snapshot().loading,true);assert.equal(ui.snapshot().error,false);
    await ui.reject(2);assert.equal(ui.snapshot().loading,false);assert.equal(ui.snapshot().error,true);
    assert.equal(ui.snapshot().data.sessions[0].id,'already-recorded');assert.equal(ui.reads.length,3,'no polling after a failed read');
    let retry;await act(async()=>{retry=ui.snapshot().refresh();});assert.equal(ui.reads.length,4);
    await ui.resolve(3,[{id:'already-recorded'},{id:'completed'}]);await retry;
    assert.equal(ui.snapshot().error,false);assert.equal(ui.snapshot().data.sessions.length,2);
  }finally{await ui.cleanup();}
});

test('a late prefetch for the previous owner cannot invalidate or evict the current owner read',async()=>{
  const ui=await setup({prefetch:true,compiled:true});
  try {
    await ui.update({owner:'owner-b'});assert.equal(ui.reads.length,2);
    ui.api.prefetchCharacterData('owner-a',null);
    assert.equal(ui.reads.length,2,'the previous owner still shares its own pending read');
    await ui.resolve(1,[{id:'private-b'}]);
    assert.equal(ui.snapshot().loading,false);assert.equal(ui.snapshot().data.userId,'owner-b');
    await ui.resolve(0,[{id:'private-a'}]);
    assert.equal(ui.snapshot().data.userId,'owner-b');
    await ui.remount();assert.equal(ui.reads.length,2,'late A cannot evict the cached B result');
    assert.equal(ui.snapshot().data.sessions[0].id,'private-b');
  }finally{await ui.cleanup();}
});

test('superseding another owner request fences only that owner in either response order',async()=>{
  for(const olderOwnerFirst of [false,true]) {
    const ui=await setup({prefetch:true});
    try {
      await ui.update({owner:'owner-b'});
      ui.api.prefetchCharacterData('owner-a',{sessionId:'a-completed'});assert.equal(ui.reads.length,3);
      await ui.resolve(0,[{id:'obsolete-a'}]);
      if(olderOwnerFirst)await ui.resolve(2,[{id:'new-a'}]);
      await ui.resolve(1,[{id:'private-b'}]);
      assert.equal(ui.snapshot().loading,false);assert.equal(ui.snapshot().error,false);
      assert.equal(ui.snapshot().data.userId,'owner-b');
      if(!olderOwnerFirst)await ui.resolve(2,[{id:'new-a'}]);
      await ui.remount();assert.equal(ui.reads.length,3);assert.equal(ui.snapshot().data.sessions[0].id,'private-b');
    }finally{await ui.cleanup();}
  }
});

test('a completion seen while blurred stays stale after Done clears its summary before refocus',async()=>{
  const ui=await setup({compiled:true});
  try {
    await ui.resolve(0,[]);await ui.update({focused:false});
    await ui.update({summary:{sessionId:'completed-offscreen'}});await ui.update({summary:null});
    assert.equal(ui.reads.length,1,'the hidden screen starts no request');
    await ui.update({focused:true});
    assert.equal(ui.reads.length,2,'Done cannot turn the pre-completion cache back into a fresh copy');
    await ui.resolve(1,[{id:'completed-offscreen'}]);
    assert.equal(ui.snapshot().data.sessions[0].id,'completed-offscreen');
  }finally{await ui.cleanup();}
});

test('a previous owner refresh error is hidden immediately while the next owner loads',async()=>{
  const ui=await setup({compiled:true});
  try {
    await ui.reject(0);assert.equal(ui.snapshot().error,true);
    await ui.update({owner:'owner-b'});
    assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().loading,true);assert.equal(ui.snapshot().error,false);
    await ui.resolve(1,[{id:'private-b'}]);assert.equal(ui.snapshot().error,false);
  }finally{await ui.cleanup();}
});

test('an offline result synced after Done invalidates Profile even with no summary',async()=>{
  for(const compiled of [false,true]) {
    const ui=await setup({compiled});
    try {
      await ui.resolve(0,[{id:'before-offline-sync'}]);
      await ui.update({cloud:1});
      assert.equal(ui.reads.length,2,'the existing cloud-save signal refreshes dismissed offline effort');
      await ui.foreground();
      assert.equal(ui.reads.length,2,'foreground shares the post-sync read');
      await ui.resolve(1,[{id:'before-offline-sync'},{id:'imported'}]);
      await ui.remount();
      assert.equal(ui.reads.length,2,'a fresh cloud version is not refreshed again on remount');
      assert.equal(ui.snapshot().data.sessions.length,2);
      await ui.update({summary:{sessionId:'online-completion'},cloud:2});
      assert.equal(ui.reads.length,3,'summary and cloud signal in one save start only one read');
      await ui.resolve(2,[{id:'online-completion'}]);
      await ui.update({summary:null});
      assert.equal(ui.reads.length,3,'Done does not make the cloud version stale again');
    } finally {await ui.cleanup();}
  }
});

test('an off-tab cloud save fences the old prefetch without mixing owner histories',async()=>{
  const ui=await setup({prefetch:true,compiled:true});
  try {
    await ui.update({focused:false});await ui.update({cloud:1});
    assert.equal(ui.reads.length,1,'a hidden profile starts no new read');
    await ui.resolve(0,[{id:'obsolete-a'}]);
    await ui.update({focused:true});
    assert.equal(ui.reads.length,2,'the old pre-sync prefetch cannot satisfy the new save');
    await ui.update({owner:'owner-b',cloud:0});
    assert.equal(ui.reads.length,3);assert.equal(ui.snapshot().data,null);
    await ui.resolve(1,[{id:'private-import-a'}]);
    assert.equal(ui.snapshot().data,null);assert.equal(ui.snapshot().loading,true);
    await ui.resolve(2,[{id:'private-b'}]);
    assert.equal(ui.snapshot().data.userId,'owner-b');
    assert.ok(ui.seen.filter(value=>value.owner==='owner-b').every(value=>value.data===null||value.data.userId==='owner-b'));
  } finally {await ui.cleanup();}
});

test('Profile and Milestones keep one matching cloud-save read when their signals arrive separately',async()=>{
  for(const completedFirst of [false,true]) {
    const ui=await setup({compiled:true,consumers:2});
    try {
      assert.equal(ui.reads.length,1);await ui.resolve(0,[{id:'before-sync'}]);
      await ui.update({clouds:[1,0]});assert.equal(ui.reads.length,2);
      if(completedFirst)await ui.resolve(1,[{id:'imported'}]);
      await ui.update({clouds:[1,1]});
      assert.equal(ui.reads.length,2,'a late consumer must join the matching new flight or ready copy, not evict it');
      if(!completedFirst)await ui.resolve(1,[{id:'imported'}]);
      assert.ok(ui.snapshots.every(snapshot=>snapshot.data.sessions[0].id==='imported'));
      assert.ok(ui.snapshots.every(snapshot=>!snapshot.loading));
      await ui.remount();assert.equal(ui.reads.length,2,'both consumers reuse the saved cloud version');
    }finally{await ui.cleanup();}
  }
});

test('a returning account cannot reuse an older admission with the same numeric cloud-save version',async()=>{
  const ui=await setup({compiled:true});
  try {
    await ui.resolve(0,[{id:'old-a'}]);
    await ui.update({cloud:1});await ui.resolve(1,[{id:'a-first-admission'}]);
    await ui.update({owner:'owner-b',cloud:0});await ui.resolve(2,[{id:'private-b'}]);
    await ui.update({owner:'owner-a',cloud:0});
    assert.equal(ui.snapshot().data.userId,'owner-a');
    assert.equal(ui.reads.length,4,'the recreated controller counter cannot certify an older admission');
    await ui.resolve(3,[{id:'a-new-admission'}]);
    await ui.update({cloud:1});
    assert.equal(ui.reads.length,5,'a new import reads again even when its counter equals the old admission');
    await ui.resolve(4,[{id:'a-new-admission'},{id:'a-new-import'}]);
    assert.equal(ui.snapshot().data.sessions.length,2);
    await ui.remount();
    assert.equal(ui.reads.length,5,'ordinary remounts with the same current counter keep their cache');
  }finally{await ui.cleanup();}
});

test('a controller counter reset on the focused account refreshes once and fences its older in-flight read',async()=>{
  const ui=await setup({compiled:true});
  try {
    await ui.resolve(0,[{id:'before-sync'}]);
    await ui.update({cloud:1});
    assert.equal(ui.reads.length,2);
    await ui.update({cloud:0});
    assert.equal(ui.reads.length,3,'a reset is a new controller admission, not another observation of the same save');
    await ui.resolve(1,[{id:'obsolete-admission'}]);
    assert.equal(ui.snapshot().loading,true,'the outgoing admission cannot settle the current read');
    assert.equal(ui.snapshot().data.sessions[0].id,'before-sync');
    await ui.resolve(2,[{id:'current-admission'}]);
    assert.equal(ui.snapshot().data.sessions[0].id,'current-admission');
    await ui.remount();assert.equal(ui.reads.length,3);
  }finally{await ui.cleanup();}
});
