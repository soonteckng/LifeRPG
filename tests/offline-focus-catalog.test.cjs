/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file, mocks, clock, modules = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = {exports:{}}; modules.set(filename,mod);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  class ClockDate extends Date { static now() { return clock.now; } }
  new Function('require','module','exports','Date',code)(name => {
    if (Object.hasOwn(mocks,name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename),name);
    const ext = ['', '.ts'].find(value => fs.existsSync(target+value));
    return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,clock,modules);
  },mod,mod.exports,ClockDate);
  return mod.exports;
}
const scope = {ownerId:'11111111-1111-4111-8111-111111111111',backendId:'catalog-project'};
function fixture() {
  const values = new Map(), clock = {now:1_800_000_000_000};
  const api = load('src/services/offlineFocusCatalog.ts', {
    '@react-native-async-storage/async-storage': {getItem:async key => values.get(key) ?? null,setItem:async (key,value) => values.set(key,value)},
  },clock);
  return {api,values,clock};
}

test('offline area cache stores only display metadata, keeps real IDs and isolates owner and backend', async () => {
  const {api,values} = fixture();
  const row = {id:26,title:'Wellbeing',color_code:'#F4AA88',current_xp:300,level:5,token:'never-cache'};
  await api.cacheOfflineFocusAreas(scope,[row]);
  assert.deepEqual(await api.readOfflineFocusAreas(scope), [{id:26,title:'Wellbeing',color_code:'#F4AA88'}]);
  assert.equal(values.size,1); assert.doesNotMatch([...values.values()][0], /current_xp|level|token|never-cache/);
  assert.deepEqual(await api.readOfflineFocusAreas({...scope,ownerId:'22222222-2222-4222-8222-222222222222'}), []);
  assert.deepEqual(await api.readOfflineFocusAreas({...scope,backendId:'another-project'}), []);
});

test('expired or future-dated cached IDs are unavailable rather than attributed to an invented area', async () => {
  const {api,clock} = fixture();
  await api.cacheOfflineFocusAreas(scope,[{id:5,title:'Learning',color_code:null}]);
  clock.now += 7 * 86400000 + 1; assert.deepEqual(await api.readOfflineFocusAreas(scope),[]);
  clock.now = 1_800_000_000_000 - 1; assert.deepEqual(await api.readOfflineFocusAreas(scope),[]);
});

test('invalid catalogue writes leave a previously valid area cache intact', async () => {
  const {api} = fixture();
  const areas = [{id:5,title:'Learning',color_code:null}];
  await api.cacheOfflineFocusAreas(scope,areas);
  for (const invalid of [{id:-1,title:'Learning',color_code:null}, {id:5,title:'',color_code:null}, {id:5,title:'Learning',color_code:'url://bad'}]) await api.cacheOfflineFocusAreas(scope,[invalid]);
  await api.cacheOfflineFocusAreas(scope,Array.from({length:101},() => areas[0]));
  assert.deepEqual(await api.readOfflineFocusAreas(scope),areas);
});

test('a copied, corrupt or oversized persisted catalogue cannot cross an owner boundary', async () => {
  const {api,values} = fixture();
  await api.cacheOfflineFocusAreas(scope,[{id:5,title:'Learning',color_code:null}]);
  const key = [...values.keys()][0], saved = JSON.parse(values.get(key));
  values.set(key,JSON.stringify({...saved,scope:{...scope,ownerId:'22222222-2222-4222-8222-222222222222'}}));
  assert.deepEqual(await api.readOfflineFocusAreas(scope),[]);
  values.set(key,'{not-json'); assert.deepEqual(await api.readOfflineFocusAreas(scope),[]);
  values.set(key,' '.repeat(32769)); assert.deepEqual(await api.readOfflineFocusAreas(scope),[]);
});
