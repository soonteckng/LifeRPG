/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };

function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['', '.ts', '.tsx'].find(ext => fs.existsSync(target + ext));
    return load(path.relative(root, target + suffix), mocks, cache);
  }, module, module.exports);
  return module.exports;
}


const scope={backendId:'host-fixture',ownerId:'11111111-1111-4111-8111-111111111111'};
const id=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
// Round 83: the catch-up shows one summary card and Done acknowledges it; there is no map or celebration after it.
async function flow(){
 const seen=[],cache=new Map(),storage=new Map();let ui;
 const api=load('src/services/offlineSyncPresentation.ts',{},cache).offlineSyncPresentation;
 await api.bind(scope,{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)});
 const observer=api.begin(scope);
 for(let n=1;n<=3;n++)observer.accepted({clientSessionId:id(n),serverSessionId:id(n+10),state:'completed',completedAtMs:100000+n*60000,setup:{targetSeconds:60,activityType:'other',taskId:null,subjectId:1,notes:null,title:'Revision'},sync:{state:'synced',receipt:{sessionId:id(n+10),durationSeconds:60,result:{xp_earned:1,area_xp_earned:1,credited_date:'2026-10-28',daily_completed_seconds:n*60}}}});
 observer.finish();const batch=api.snapshot(scope).batch;
 const mocks={'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},'./SessionResultSheet':host('Receipt'),
  '../context/TimerContext':{useTimer:()=>({unsyncedSessionCount:0,hasOpenSession:false,protectionSessionId:id(3),acknowledgeSummary(){seen.push('timer-ack');},clearCompletionModal(){seen.push('timer-clear');}})},
  '../context/QuestContext':{useQuests:()=>({subjects:[{id:1,title:'Learning',color_code:null}]})},'../utils/sheetActivity':{useActiveSheetCount:()=>0}};
 const Component=load('src/components/OfflineSyncHost.tsx',mocks,cache).default;
 const render=b=>React.createElement(Component,{scope,batch:b,active:true});
 await act(async()=>{ui=create(render(batch));await new Promise(r=>setImmediate(r));});
 return{ui,api,batch,seen,render,cleanup:()=>act(async()=>ui.unmount())};
}

test('one catch-up card sums the sessions, and Done acknowledges every one of them exactly once',async()=>{
 const f=await flow();try{
  let receipt=f.ui.root.findByType('Receipt');
  assert.equal(receipt.props.visible,true);assert.equal(receipt.props.durationSeconds,180);assert.equal(receipt.props.recovered,true);
  assert.equal(receipt.props.syncSummary.sessionCount,3);assert.deepEqual(receipt.props.syncSummary.areas.map(a=>a.title),['Learning']);
  assert.equal(receipt.props.xpEarned,undefined,'no XP on the card since Round 83');
  await act(async()=>{receipt.props.onClose();receipt.props.onClose();});
  receipt=f.ui.root.findByType('Receipt');assert.equal(receipt.props.visible,false);
  assert.ok(f.api.snapshot(scope).batch,'not acknowledged until the card has faded');
  await act(async()=>receipt.props.onDismiss());
  assert.equal(f.api.snapshot(scope).batch,null);assert.equal(f.api.snapshot(scope).acknowledgedReceiptIds.length,3);
  assert.deepEqual(f.seen,['timer-ack','timer-clear'],'the underlying completed timer of this catch-up is released, so its own card never opens behind');
  await act(async()=>receipt.props.onDismiss());assert.deepEqual(f.seen,['timer-ack','timer-clear'],'a late dismissal does nothing twice');
 }finally{await f.cleanup();}
});

test('a dismissal without Done, or for a batch that is no longer current, acknowledges nothing',async()=>{
 const f=await flow();try{
  const receipt=f.ui.root.findByType('Receipt');
  await act(async()=>receipt.props.onDismiss());
  assert.ok(f.api.snapshot(scope).batch,'closing animation alone never acknowledges');assert.deepEqual(f.seen,[]);
 }finally{await f.cleanup();}
});
