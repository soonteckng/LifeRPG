/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks={},cache=new Map()) {
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);},module,module.exports);return module.exports;
}
const scope={ownerId:'11111111-1111-4111-8111-111111111111',backendId:'round69-minimum'};
const id=n=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
const draft={name:'Read',durationSeconds:60,focusAreaId:1,reminder:{enabled:false,hour:18,minute:0}};
function routines(envelope) {
 const domain=load('src/utils/savedRoutine.ts'),values=new Map();let writes=0,sequence=100;
 if(envelope)values.set(domain.routineStorageKey(scope),JSON.stringify(envelope));
 const store=load('src/services/savedRoutineStore.ts').createSavedRoutineStore({getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{writes++;values.set(key,value);}},()=>id(++sequence));
 return{store,values,writes:()=>writes,domain};
}

test('new session and duration-field boundaries require one minute while retaining the eight-hour cap',()=>{
 const api=load('src/utils/sessionSetup.ts');
 for(const seconds of [0,1,30,59,-1,60.5,28801,NaN,Infinity])assert.equal(api.validSessionSeconds(seconds),false,`${seconds} must be refused`);
 for(const seconds of [60,61,930,28800])assert.equal(api.validSessionSeconds(seconds),true);
 for(const fields of [['0','1'],['0','59'],['0','0'],['480','1'],['1','60']])assert.equal(api.parseDurationFields(...fields),null);
 assert.equal(api.parseDurationFields('1','0'),60);assert.equal(api.parseDurationFields('1','1'),61);assert.equal(api.parseDurationFields('480','0'),28800);
});

test('new or edited sub-minute routines cannot enter the durable queue',async()=>{
 const f=routines();await f.store.load(scope);
 for(const seconds of [1,30,59])assert.equal(await f.store.save(scope,{...draft,durationSeconds:seconds}),false);
 assert.equal(f.writes(),0);assert.equal(f.store.snapshot(scope).routines.length,0);
 assert.equal(await f.store.save(scope,draft),true);
 const saved=f.store.snapshot(scope).routines[0],raw=[...f.values.values()][0];
 assert.equal(await f.store.save(scope,{...draft,durationSeconds:59},saved.id),false);
 assert.equal([...f.values.values()][0],raw,'a refused edit preserves the previous routine and queue');
 assert.equal(await f.store.save(scope,{...draft,durationSeconds:28800},saved.id),true);
});

test('existing short routine rows and queued operations remain readable and removable',async()=>{
 const domain=load('src/utils/savedRoutine.ts');
 const legacy={...draft,durationSeconds:1,id:id(1),revision:1,deletedAt:null};
 const pending={operationId:id(2),routineId:id(1),expectedRevision:1,draft:{...draft,durationSeconds:30},deleted:false};
 const envelope={...domain.emptyRoutineEnvelope(scope),routines:[legacy],pending:[pending]};
 const f=routines(envelope);await f.store.load(scope);
 assert.equal(f.store.snapshot(scope).ready,true);assert.equal(f.store.snapshot(scope).error,null);
 assert.equal(f.store.snapshot(scope).routines[0].durationSeconds,30);
 assert.equal(f.store.snapshot(scope).pendingCount,1);assert.equal(f.writes(),0,'loading never rewrites historical data');
 assert.equal(await f.store.remove(scope,id(1)),true,'a pre-minimum routine must still be removable');
 assert.equal(f.store.snapshot(scope).routines.length,0);
});

test('legacy journal and study history continue accepting recorded sub-minute sessions',()=>{
 const schema=load('src/utils/sessionJournalSchema.ts');
 assert.doesNotThrow(()=>schema.validateJournalSetup({targetSeconds:1,activityType:'learning',subjectId:1,taskId:null,title:null,notes:null}));
 assert.equal(load('src/utils/studyPlan.ts').validRecent({courseId:id(3),completedAt:1800000000000,seconds:1}),true);
});

test('legacy Custom preferences keep their preset and upgrade only the editable default to one minute',async()=>{
 const values=new Map([['liferpg:focus-duration:v1:owner',JSON.stringify({version:1,presetSeconds:3600,customSeconds:30})]]);
 const storage={getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)};
 const api=load('src/services/focusDurationPreference.ts',{'@react-native-async-storage/async-storage':storage}),store=api.createFocusDurationPreferenceStore(storage);
 await store.load('owner');assert.deepEqual(store.snapshot('owner').value,{version:1,presetSeconds:3600,customSeconds:60});
 assert.equal(store.snapshot('owner').selectedSeconds,3600);
 assert.equal(await store.choose('owner',59,true),false);assert.equal(await store.choose('owner',60,true),true);
});
