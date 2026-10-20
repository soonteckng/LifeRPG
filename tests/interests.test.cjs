/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(mocks[name])return mocks[name];
  if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e));
  return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
 },module,module.exports);return module.exports;
}
const storage={'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async()=>null,setItem:async()=>{}}}};
const interests=load('src/utils/interests.ts',storage);
const service=load('src/services/guidedPreferenceService.ts',storage);
const {ROUTINE_IDEAS}=load('src/constants/routineIdeas.ts');
const base={version:1,enabled:false,invited:false,need:'revision',templateId:'review-topic',smaller:false};

test('every area has four ideas, each with a unique name',()=>{
 for(const kind of ['learning','work','creative','personal','wellbeing'])assert.equal(ROUTINE_IDEAS.filter(idea=>idea.area===kind).length,4,kind);
 assert.equal(new Set(ROUTINE_IDEAS.map(idea=>idea.name)).size,ROUTINE_IDEAS.length);
});
test('picking interests saves them in a fixed order; picking none means choose my own',()=>{
 const picked=interests.withInterests(base,['wellbeing','learning','wellbeing']);
 assert.deepEqual(picked.interests,['learning','wellbeing']);assert.equal(picked.enabled,true);assert.equal(picked.invited,true);
 assert.equal(picked.need,'revision','the first interest keeps a matching single suggestion');
 const none=interests.withInterests(picked,[]);
 assert.equal(none.enabled,false);assert.deepEqual(interests.interestsOf(none),[]);
 assert.equal(interests.withInterests(base,['work']).templateId,'project-next-step');
});
test('a choice saved before interests existed becomes one interest; saved interests survive the suggestion switch',()=>{
 assert.deepEqual(interests.interestsOf({...base,enabled:true,need:'work',templateId:'work-priority'}),['work']);
 assert.deepEqual(interests.interestsOf({...base,enabled:false,need:'work',templateId:'work-priority'}),[]);
 assert.deepEqual(interests.interestsOf({...base,enabled:false,interests:['creative']}),['creative']);
 // Stored and read back, including a stray value that is dropped.
 const raw=JSON.stringify({...base,enabled:true,invited:true,interests:['wellbeing','nonsense','learning']});
 assert.deepEqual(service.parseGuidedPreference(raw).interests,['learning','wellbeing']);
 assert.equal(service.parseGuidedPreference(JSON.stringify(base)).interests,undefined);
});
test('ideas from your interests come first, nothing is dropped, and today’s idea holds all day then moves on',()=>{
 const ordered=interests.orderedIdeas(['creative']);
 assert.deepEqual(ordered.slice(0,4).map(idea=>idea.area),['creative','creative','creative','creative']);
 assert.equal(ordered.length,ROUTINE_IDEAS.length);
 assert.equal(interests.ideaOfTheDay([],'2026-10-20'),null);
 const today=interests.ideaOfTheDay(['learning','work'],'2026-10-20');
 assert.ok(['learning','work'].includes(today.area));
 assert.equal(interests.ideaOfTheDay(['learning','work'],'2026-10-20'),today,'the same all day');
 assert.notEqual(interests.ideaOfTheDay(['learning','work'],'2026-10-21'),today,'a new one tomorrow');
});
