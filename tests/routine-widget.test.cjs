const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks={},cache=new Map()){
  const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
  const mod={exports:{}};cache.set(filename,mod);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),ext=['','.ts','.tsx'].find(suffix=>fs.existsSync(target+suffix));
    return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
  },mod,mod.exports);return mod.exports;
}
const scope={backendId:'widget-fixture',ownerId:'11111111-1111-4111-8111-111111111111'},other={...scope,ownerId:'22222222-2222-4222-8222-222222222222'};
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001',nonce='bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const row={id,name:'Review notes',durationSeconds:1800,areaTitle:'Learning',color:'#AAB3FF'};
const api=load('src/services/routineWidgetService.ts',{
  'expo-modules-core':{uuid:{v4:()=>nonce}},'./nativeSessionCountdown':{getNativeSessionCountdownModule:async()=>null},
  './savedRoutineService':{savedRoutineStore:{}},'./offlineFocusCatalog':{readOfflineFocusAreas:async()=>[]}
});
const gate=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {resolve,promise};};
function fixture(overrides={}){
  let index=0,used=false;const calls=[];
  const module={routineWidgetVersion:1,
    activateRoutineWidgets:async(lease,owner)=>{calls.push(['activate',lease,JSON.parse(owner)]);return true;},
    publishRoutineWidgets:async(lease,rows)=>{calls.push(['publish',lease,JSON.parse(rows)]);return true;},
    clearRoutineWidgets:async lease=>{calls.push(['clear',lease]);return true;},
    pinRoutineWidget:async(lease,id)=>{calls.push(['pin',lease,id]);return true;},
    consumeRoutineWidgetLaunch:async(owner,token)=>{calls.push(['consume',JSON.parse(owner),token]);if(used)return null;used=true;return {scope:JSON.parse(owner),routineId:id};},...overrides};
  const bridge=api.createRoutineWidgetBridge({resolveModule:async()=>module,newLeaseId:()=>`cccccccc-cccc-4ccc-8ccc-${String(++index).padStart(12,'0')}`});
  return {module,bridge,calls};
}
test('old installed native builds gracefully keep routines usable without widget APIs',async()=>{
  const bridge=api.createRoutineWidgetBridge({resolveModule:async()=>({formatVersion:1}),newLeaseId:()=>nonce});bridge.selectOwner(scope);
  assert.equal(await bridge.supported(),false);assert.equal(await bridge.publish(scope,[row]),false);assert.equal(await bridge.pin(scope,id),false);assert.equal(await bridge.consume(scope,nonce),null);
});
test('concurrent cold catalogue and launch share activation and native proof is consumed once',async()=>{
  const {bridge,calls}=fixture();bridge.selectOwner(scope);
  const [saved,launch]=await Promise.all([bridge.publish(scope,[row]),bridge.consume(scope,nonce)]);
  assert.equal(saved,true);assert.deepEqual(launch,{scope,routineId:id});assert.equal(calls.filter(c=>c[0]==='activate').length,1);
  assert.equal(await bridge.consume(scope,nonce),null);assert.equal(calls.filter(c=>c[0]==='publish').length,1);
});
test('late native activation after logout clears its accepted lease and cannot publish old labels',async()=>{
  const reached=gate(),release=gate();let nativeLease=null;
  const {bridge,calls}=fixture({activateRoutineWidgets:async lease=>{nativeLease=lease;reached.resolve();await release.promise;return true;},clearRoutineWidgets:async lease=>{calls.push(['clear',lease]);if(nativeLease===lease)nativeLease=null;return true;}});
  bridge.selectOwner(scope);const publishing=bridge.publish(scope,[row]);await reached.promise;await bridge.clear(scope);release.resolve();
  assert.equal(await publishing,false);assert.equal(nativeLease,null);assert.ok(calls.some(c=>c[0]==='clear'));assert.equal(calls.some(c=>c[0]==='publish'),false);
});
test('outgoing owner reads and cleanup cannot replace a newer widget owner',async()=>{
  const {bridge,calls}=fixture();bridge.selectOwner(scope);await bridge.publish(scope,[row]);
  bridge.selectOwner(other);await bridge.publish(other,[{...row,name:'Different account'}]);
  assert.equal(await bridge.publish(scope,[row]),false);assert.equal(await bridge.clear(scope),false);assert.equal(await bridge.publish(other,[row]),true);
  assert.equal(calls.filter(c=>c[0]==='activate').length,2);assert.deepEqual(calls.filter(c=>c[0]==='activate').at(-1)[2],other);
});
test('a returned proof for another account or backend is refused',async()=>{
  const {bridge}=fixture({consumeRoutineWidgetLaunch:async()=>({scope:other,routineId:id})});bridge.selectOwner(scope);
  assert.equal(await bridge.consume(scope,nonce),null);assert.equal(await bridge.consume(scope,'not-an-issued-uuid'),null);
});
test('routine session names round-trip through existing notes without becoming suggested quests',()=>{
  const metadata=load('src/utils/routineSession.ts');
  assert.equal(metadata.readRoutineSession(metadata.encodeRoutineSession('Review my notes')),'Review my notes');
  for(const value of ['', ' padded ', 'a'.repeat(81), 'unsafe\nname'])assert.equal(metadata.encodeRoutineSession(value),null);
  for(const value of ['normal notes','liferpg:routine:v1:{"name":"ok","taskId":1}','liferpg:routine:v1:{"name":42}','liferpg:routine:v2:{"name":"new"}'])assert.equal(metadata.readRoutineSession(value),null);
  assert.equal(load('src/constants/guidedQuests.ts').readSuggestedFocus(metadata.encodeRoutineSession('A routine')),null);
});

test('a delayed category read cannot republish a routine after its newer edit or deletion',async()=>{
  const oldRead=gate(),calls=[];let reads=0;
  const publisher=api.createRoutineWidgetPublisher({readAreas:()=>++reads===1?oldRead.promise:Promise.resolve([]),publish:async(owner,rows)=>{calls.push([owner,rows]);return true;}});
  const routine={...row,focusAreaId:null,deletedAt:null,revision:1,reminder:{enabled:false,hour:18,minute:0}};
  publisher.selectOwner(scope);const old=publisher.publish(scope,[routine]);
  assert.equal(await publisher.publish(scope,[]),true);oldRead.resolve([]);
  assert.equal(await old,false);assert.deepEqual(calls,[[scope,[]]]);
});

test('an outgoing owner category read cannot cancel or overwrite a newer owner publication',async()=>{
  const oldRead=gate(),calls=[];
  const publisher=api.createRoutineWidgetPublisher({readAreas:owner=>owner.ownerId===scope.ownerId?oldRead.promise:Promise.resolve([]),publish:async(owner,rows)=>{calls.push([owner,rows]);return true;}});
  publisher.selectOwner(scope);const old=publisher.publish(scope,[]);
  publisher.selectOwner(other);assert.equal(await publisher.publish(other,[]),true);
  assert.equal(await publisher.publish(scope,[]),false);publisher.clear(scope);oldRead.resolve([]);
  assert.equal(await old,false);assert.deepEqual(calls,[[other,[]]]);
});
