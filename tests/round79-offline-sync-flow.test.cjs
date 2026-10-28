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
async function flow(){
 const frames=[],seen=[],claims=[],cache=new Map(),storage=new Map();let ui;
 const baseMocks={};const api=load('src/services/offlineSyncPresentation.ts',baseMocks,cache).offlineSyncPresentation;
 await api.bind(scope,{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)});
 const observer=api.begin(scope);
 for(let n=1;n<=3;n++)observer.accepted({clientSessionId:id(n),serverSessionId:id(n+10),state:'completed',completedAtMs:100000+n*60000,setup:{targetSeconds:60,activityType:'other',taskId:null,subjectId:1,notes:null,title:'Revision'},sync:{state:'synced',receipt:{sessionId:id(n+10),durationSeconds:60,result:{xp_earned:1,area_xp_earned:1,credited_date:'2026-10-28',daily_completed_seconds:n*60}}}});
 observer.finish();const batch=api.snapshot(scope).batch;
 const state={today:{date:'2026-10-28',seconds:180,finds:0},trail:{findSeconds:1800,stops:4,complete:false},nextFindSeconds:1620,pack:{date:'2026-10-28'}};
 const rewardState={reveals:[],state,busy:false,online:true,look:{},equipped:{},today:state.today,trail:state.trail,nextFindSeconds:1620};
 rewardState.claimSessions=async()=>{claims.push(1);return{ok:true,value:{sessions:[],state}};};
 const mocks={'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})},StyleSheet:{create:v=>v,absoluteFill:{}},Animated:{View:host('Layer'),Value:class{setValue(){}stopAnimation(){}},timing:(_v,c)=>({start:done=>frames.push({c,done}),stop(){}})}},'expo-router':{usePathname:()=>'/','useRouter':()=>({push(){}})},'./SessionResultSheet':host('Receipt'),'./rewards/RevealScreens':{ExpeditionReveal:host('Map')},'../hooks/useRewards':{useRewards:()=>rewardState,rewardsStore:{snapshot:()=>rewardState,dismissReveal:(_owner,key)=>seen.push(key)}},'../context/UserContext':{useUser:()=>({profile:{level:1}})},'../context/TimerContext':{useTimer:()=>({unsyncedSessionCount:0,hasOpenSession:false,protectionSessionId:id(3),acknowledgeSummary(){},clearCompletionModal(){seen.push("timer-clear");}})},'../context/QuestContext':{useQuests:()=>({subjects:[{id:1,title:'Learning',color_code:null}]})},'../hooks/useReducedMotion':{useReducedMotion:()=>false},'../utils/sheetActivity':{useActiveSheetCount:()=>0,registerSheetActivity:()=>()=>{}}};
 const Component=load('src/components/OfflineSyncHost.tsx',mocks,cache).default;
 await act(async()=>{ui=create(React.createElement(Component,{scope,batch,active:true}));await new Promise(r=>setImmediate(r));});
 return{ui,api,batch,claims,frames,seen,cleanup:()=>act(async()=>ui.unmount())};
}
test('one actual catch-up host fades one aggregate receipt into one retained three-minute map',async()=>{
 const f=await flow();try{
 assert.equal(f.claims.length,1);let receipt=f.ui.root.findByType('Receipt');assert.equal(receipt.props.visible,true);assert.equal(receipt.props.durationSeconds,180);assert.equal(receipt.props.xpEarned,3);assert.equal(receipt.props.syncSummary.sessionCount,3);
 await act(async()=>{receipt.props.onClose();receipt.props.onClose();});
 let map=f.ui.root.findByType('Map');assert.equal(map.props.reveal.trail.seconds,180);assert.equal(map.props.reveal.trail.fromSeconds,0);assert.equal(map.props.walkDelay,60000);
 await act(async()=>map.props.onReady());receipt=f.ui.root.findByType('Receipt');assert.equal(receipt.props.visible,false);
 await act(async()=>receipt.props.onDismiss());map=f.ui.root.findByType('Map');assert.equal(map.props.walkDelay,650);assert.deepEqual(f.seen,["timer-clear"],"underlying completed timer exits behind the opaque map");
 await act(async()=>{map.props.onClose();map.props.onClose();});assert.equal(f.frames.filter(a=>a.c.duration===480).length,1);assert.ok(f.api.snapshot(scope).batch,'not acknowledged before final fade');
 await act(async()=>f.frames.find(a=>a.c.duration===480).done({finished:true}));assert.equal(f.api.snapshot(scope).batch,null);assert.equal(f.api.snapshot(scope).acknowledgedReceiptIds.length,3);
 }finally{await f.cleanup();}
});
