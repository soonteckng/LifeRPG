/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
function load(file,mocks,cache=new Map()){const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const m={exports:{}};cache.set(filename,m);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const p=path.resolve(path.dirname(filename),name),e=['.ts','.tsx'].find(e=>fs.existsSync(p+e));return load(path.relative(path.resolve(__dirname,'..'),p+e),mocks,cache);},m,m.exports);return m.exports;}
async function setup(){
 let owner='alice',epoch=1,accessMode='online',timer={hasOpenSession:false,isRunning:false,timeLeft:1800,sessionId:null,protectionSessionId:null,isRestoring:false,notes:''},value,renderer,serial=0,renders=0;
 const records=new Map(),starts=[],stops=[],reads=[],listeners=new Set(),calls={caps:0,apps:0,state:0};let nativeState={id:null,scope:null,status:'idle',secondsLeft:0,covers:0};
 const native={formatVersion:2,capabilities:async()=>{calls.caps++;return{supported:true,usage:true,overlay:true,notifications:true};},apps:async()=>{calls.apps++;return[];},state:async()=>{calls.state++;return nativeState;},start:async raw=>{const v=JSON.parse(raw);starts.push(v);nativeState={id:v.id,scope:v.scope,status:'active',secondsLeft:v.seconds,covers:0};return nativeState;},stop:async id=>{stops.push(id);nativeState={...nativeState,id:null,status:'stopped',secondsLeft:0};return nativeState;},pause:async()=>{nativeState={...nativeState,id:null,status:'paused'};return nativeState;}};
 const storage={getItem:async k=>{reads.push(k);return records.get(k)??null;},setItem:async(k,v)=>records.set(k,v)};
 const idle={id:null,scope:null,status:'idle',secondsLeft:0,covers:0};
 const appState={currentState:'active',addEventListener:(_,cb)=>{listeners.add(cb);return{remove:()=>listeners.delete(cb)}}};
 const mocks={'react-native':{AppState:appState},'@react-native-async-storage/async-storage':storage,'expo-modules-core':{uuid:{v4:()=>`lease-11111111-1111-4111-8111-${String(++serial).padStart(12,'0')}`}},'./AuthContext':{useAuth:()=>({user:accessMode==='online'?{id:owner}:null,localOwner:accessMode==='local-only'?{id:owner,backendId:'fixture'}:null,accessMode,admissionEpoch:epoch})},'./TimerContext':{useTimer:()=>timer},'../utils/sessionBackend':{sessionBackendIdentity:()=>({backendId:'fixture'})},'../constants/guidedQuests':{readSuggestedFocus:()=>null},'../utils/routineSession':{readRoutineSession:()=>null},'../services/nativeFocusProtection':{getSessionProtectionModule:async()=>native,idleProtection:idle},'./nativeFocusProtection':{getSessionProtectionModule:async()=>native,idleProtection:idle}};
 const api=load('src/context/SessionProtectionContext.tsx',mocks);function Capture(){value=api.useSessionProtection();renders++;return null;}
 const child=React.createElement(Capture),render=()=>React.createElement(api.SessionProtectionProvider,null,child);
 await act(async()=>{renderer=create(render());});
 // Mount effects schedule the permission read. Flush that turn explicitly;
 // waiting inside the initial act can finish before effects have even mounted.
 await act(async()=>{await new Promise(r=>setTimeout(r,0));});
 return{native,starts,stops,records,reads,calls,renders:()=>renders,setNativeState:patch=>{nativeState={...nativeState,...patch};},foreground:()=>act(async()=>{appState.currentState='active';for(const listener of listeners)listener('active');}),value:()=>value,update:async({account=owner,admission=epoch,mode=accessMode,...flags}={})=>{owner=account;epoch=admission;accessMode=mode;timer={...timer,...flags};await act(async()=>renderer.update(render()));},cleanup:()=>act(async()=>renderer.unmount())};
}
test('real provider saves an optional choice, protects the next actual session and releases it on End',async()=>{const f=await setup();try{assert.equal(f.value().loaded,true);assert.equal(f.starts.length,0);await act(async()=>assert.equal(await f.value().choose('allow-list',['study.notes']),true));assert.equal(f.starts.length,0,'choosing settings does not start a protection test');await f.update({hasOpenSession:true,isRunning:true,sessionId:'server-1',protectionSessionId:'client-1'});assert.equal(f.starts.length,1);assert.deepEqual(f.starts[0].allowed,['study.notes']);await f.update({isRunning:false,endingSession:true});assert.equal(f.stops.length,1);}finally{await f.cleanup();}});
test('public server ID reconciliation retains the same client binding and never restarts protection',async()=>{const f=await setup();try{await act(async()=>f.value().choose('essentials'));await f.update({hasOpenSession:true,isRunning:true,sessionId:'client-1',protectionSessionId:'client-1'});await f.update({sessionId:'server-1',timeLeft:1790});assert.equal(f.starts.length,1);}finally{await f.cleanup();}});
test('a captured choice handler and late permission reply cannot write a different account or admission',async()=>{const f=await setup();try{const oldChoose=f.value().choose,gate=deferred();f.native.capabilities=()=>gate.promise;let pending;await act(async()=>{pending=oldChoose('essentials');});await f.update({account:'bob',admission:2});await act(async()=>gate.resolve({supported:true,usage:true,overlay:true,notifications:true}));assert.equal(await pending,false);assert.equal([...f.records.keys()].some(k=>k.includes('bob')),false);await act(async()=>assert.equal(await oldChoose('normal'),false));assert.equal([...f.records.keys()].some(k=>k.includes('bob')),false);}finally{await f.cleanup();}});
test('turning protection off can cancel a pending protected-choice operation',async()=>{const f=await setup();try{const gate=deferred();f.native.capabilities=()=>gate.promise;let pending;await act(async()=>{pending=f.value().choose('essentials');});await act(async()=>assert.equal(await f.value().choose('normal'),true));await act(async()=>gate.resolve({supported:true,usage:true,overlay:true,notifications:true}));assert.equal(await pending,false);assert.equal(f.value().selection.mode,'normal');assert.equal(f.starts.length,0);}finally{await f.cleanup();}});
test('mount and foreground permission checks leave app inventory lazy; explicit chooser refresh coalesces scans',async()=>{const f=await setup();try{assert.ok(f.calls.caps>0);assert.equal(f.calls.apps,0,'opening the app does not enumerate installed app labels');await f.foreground();assert.equal(f.calls.apps,0,'returning to the timer does not enumerate apps');const gate=deferred();f.native.apps=()=>{f.calls.apps++;return gate.promise;};let first,second;await act(async()=>{first=f.value().refresh();second=f.value().refresh();});assert.equal(f.calls.apps,1,'overlapping chooser reads share one native scan');await act(async()=>{gate.resolve([{packageName:'study.notes',label:'Notes'}]);await Promise.all([first,second]);});assert.deepEqual(f.value().apps,[{packageName:'study.notes',label:'Notes'}]);await f.foreground();assert.equal(f.calls.apps,1);assert.equal(f.value().apps.length,1,'permission-only reads keep the loaded chooser inventory');}finally{await f.cleanup();}});
test('countdown numerals do not duplicate native polls or re-render protection consumers',async()=>{const f=await setup();try{await f.update({hasOpenSession:true,isRunning:true,sessionId:'server-1',protectionSessionId:'client-1'});const beforeCalls=f.calls.state,beforeRenders=f.renders(),beforeValue=f.value();await f.update({timeLeft:1799});await f.update({timeLeft:1798});assert.equal(f.calls.state,beforeCalls,'timer updates are not a second polling loop');assert.equal(f.renders(),beforeRenders);assert.equal(f.value(),beforeValue,'context identity survives numeral-only changes');f.setNativeState({secondsLeft:1798});await f.foreground();assert.equal(f.value(),beforeValue,'a native numeral-only response does not invalidate consumers');assert.equal(f.renders(),beforeRenders);f.setNativeState({id:null,status:'permission-lost',secondsLeft:0});await f.foreground();assert.equal(f.value().active,false);assert.equal(f.value().state.status,'permission-lost','real native interruptions remain visible immediately');assert.ok(f.renders()>beforeRenders);}finally{await f.cleanup();}});
test('session expiry still releases protection immediately without waiting for the native poll',async()=>{const f=await setup();try{await f.update({hasOpenSession:true,isRunning:true,timeLeft:1,sessionId:'server-1',protectionSessionId:'client-1'});assert.equal(f.starts.length,1);await f.update({timeLeft:0});assert.equal(f.stops.length,1);}finally{await f.cleanup();}});

test('a restored session publishes its saved app binding and cannot change modes or allowed apps mid-session',async()=>{
 const f=await setup();try{
  const owner=JSON.stringify(['fixture','alice']);
  f.records.set(`liferpg:session-protection:binding:v2:${owner}`,JSON.stringify({ownerKey:owner,sessionKey:'client-1',selection:{mode:'allow-list',allowed:['study.notes']}}));
  assert.equal(f.value().selection.mode,'essentials');
  await f.update({hasOpenSession:true,isRunning:true,sessionId:'server-1',protectionSessionId:'client-1'});
  assert.deepEqual(f.value().sessionSelection,{mode:'allow-list',allowed:['study.notes']});
  assert.deepEqual(f.starts[0].allowed,['study.notes']);
  const choiceKey=`liferpg:session-protection:choice:v2:${owner}`,before=f.records.get(choiceKey);
  for(const [mode,apps] of [['normal',[]],['essentials',[]],['allow-list',[]],['allow-list',['study.calculator']]]){
   await act(async()=>assert.equal(await f.value().choose(mode,apps),false));
  }
  assert.equal(f.records.get(choiceKey),before);assert.equal(f.stops.length,0);
  f.setNativeState({id:null,status:'interrupted'});await f.foreground();
  await act(async()=>assert.equal(await f.value().choose('allow-list',['study.notes']),true));
  assert.equal(f.starts.length,2);assert.deepEqual(f.starts[1].allowed,['study.notes']);
  await f.update({account:'bob',admission:2,isRestoring:true});
  assert.equal(f.value().sessionSelection,null,'the outgoing account binding cannot appear under another account');
 }finally{await f.cleanup();}
});

test('online to local-only admission keeps the same client lease through break and reconnection',async()=>{
 const f=await setup(),breaks=[],returns=[];try{
  f.native.takeBreak=async(id,ms)=>{breaks.push([id,ms]);return f.value().state;};
  f.native.endBreak=async id=>{returns.push(id);return f.value().state;};
  await f.update({hasOpenSession:true,protectedSession:true,isRunning:true,sessionId:'server-1',protectionSessionId:'client-1'});
  const lease=f.value().state.id;assert.ok(lease);assert.equal(f.value().active,true);
  await f.update({mode:'local-only',timeLeft:1790});await f.foreground();
  assert.equal(f.value().active,true);assert.equal(f.value().state.id,lease);assert.equal(f.stops.length,0);
  await f.update({isRunning:false,breakEndsAtMs:Date.now()+300000});assert.equal(breaks.length,1);
  await f.update({mode:'online',isRunning:true,breakEndsAtMs:Date.now()-1});
  assert.deepEqual(returns,[lease]);assert.equal(f.starts.length,1);assert.equal(f.stops.length,0);
  assert.equal(f.value().active,true);assert.equal(f.value().state.id,lease);
 }finally{await f.cleanup();}
});

test('native uncertainty while offline neither reports Protected nor discards or stops the real lease',async()=>{
 const f=await setup();try{
  await f.update({mode:'local-only',hasOpenSession:true,protectedSession:true,isRunning:true,sessionId:'client-offline',protectionSessionId:'client-offline'});
  assert.equal(f.starts.length,1);const lease=f.value().state.id,read=f.native.state;
  f.native.state=async()=>{throw Error('Bridge response unavailable');};await f.foreground();
  assert.equal(f.value().state.status,'checking');assert.equal(f.value().state.id,lease);assert.equal(f.value().active,false);
  assert.equal(f.stops.length,0);assert.equal(f.starts.length,1);assert.match(f.value().error,/Bridge response/);
  f.native.state=read;await f.foreground();
  assert.equal(f.value().state.status,'active');assert.equal(f.value().active,true);assert.equal(f.value().state.id,lease);
  assert.equal(f.value().error,'');assert.equal(f.starts.length,1);
 }finally{await f.cleanup();}
});
