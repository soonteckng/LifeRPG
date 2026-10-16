const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file) {
  const filename = path.resolve(__dirname, '..', file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts'))) : require(name), module, module.exports);
  return module.exports;
}
const api = load('src/services/sessionProtection.ts');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { resolve, promise }; };
const base = { ownerKey: 'backend/alice', sessionKey: 'local-session', restoring: false, running: true, ending: false, seconds: 3600, title: 'Study', selection: { mode: 'allow-list', allowed: ['study.notes'] } };
function setup() {
  let state = { id: null, scope: null, status: 'idle', secondsLeft: 0, covers: 0 }, serial = 0;
  const starts = [], stops = [], pauses = [], events = [], data = new Map();
  const native = { formatVersion: 2,
    capabilities: async () => ({ supported: true, usage: true, overlay: true, notifications: true }),
    state: async () => state,
    start: async raw => { const input = JSON.parse(raw); starts.push(input); state = { id: input.id, scope: input.scope, status: 'active', secondsLeft: input.seconds, covers: 0 }; return state; },
    stop: async id => { stops.push(id); if (state.id === id) state = { ...state, id: null, status: 'stopped', secondsLeft: 0 }; return state; },
    pause: async id => { pauses.push(id); if (state.id === id) state = { ...state, id: null, status: 'paused', secondsLeft: 0 }; return state; },
  };
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value) };
  const controller = api.createSessionProtectionController({ storage, newId: () => `session-lease-${++serial}-11111111`, resolve: async () => native, publish: (state, error) => events.push({ state, error }) });
  return { native, controller, starts, stops, pauses, events, data, storage, state: () => state, setState: value => { state = value; } };
}
test('full-session protection uses the actual duration and one immutable choice snapshot', async () => {
  const f = setup(); await f.controller.update(base);
  assert.equal(f.starts[0].version, 2); assert.equal(f.starts[0].seconds, 3600);
  await f.controller.update({ ...base, seconds: 3500, selection: { mode: 'essentials', allowed: [] } });
  assert.equal(f.starts.length, 1); assert.deepEqual(f.starts[0].allowed, ['study.notes']);
  await f.controller.dispose();
});
test('pause releases apps, resume protects the saved selection and End releases it', async () => {
  const f = setup(); await f.controller.update(base);
  await f.controller.update({ ...base, running: false, seconds: 2100 }); assert.equal(f.pauses.length, 1);
  await f.controller.update({ ...base, seconds: 2100, selection: { mode: 'essentials', allowed: [] } });
  assert.equal(f.starts.length, 2); assert.equal(f.starts[1].seconds, 2100); assert.equal(f.starts[1].mode, 'allow-list');
  await f.controller.update({ ...base, running: false, ending: true }); assert.equal(f.state().id, null); assert.equal(f.stops.length, 1);
  await f.controller.dispose();
});
test('force-stop/reboot interruption never silently reactivates; explicit choice enables again', async () => {
  const f = setup(); f.setState({ id: null, scope: JSON.stringify([base.ownerKey, base.sessionKey]), status: 'interrupted', secondsLeft: 0, covers: 0 });
  await f.controller.update(base); await f.controller.update({ ...base, seconds: 3599 });
  assert.equal(f.starts.length, 0); assert.match(f.events.at(-1).error, /off for this session/);
  await f.controller.enable(base.selection); assert.equal(f.starts.length, 1);
  await f.controller.dispose();
});
test('revoking access releases protection and must not force a timer or reward mutation', async () => {
  const f = setup(); await f.controller.update(base);
  f.setState({ id: null, scope: JSON.stringify([base.ownerKey, base.sessionKey]), status: 'permission-lost', secondsLeft: 0, covers: 0 });
  await f.controller.update(base); assert.equal(f.starts.length, 1); assert.match(f.events.at(-1).error, /permission changed/);
  await f.controller.dispose();
});
test('journal restoration adopts a matching running lease and never invents a new countdown', async () => {
  const f = setup(); await f.controller.update(base); const id = f.state().id;
  await f.controller.update({ ...base, restoring: true, running: false }); assert.equal(f.state().id, id);
  await f.controller.update({ ...base, seconds: 3500 }); assert.equal(f.starts.length, 1);
  await f.controller.dispose();
});
test('an account change releases outgoing protection while the next journal is restoring', async () => {
  const f = setup(); await f.controller.update(base);
  await f.controller.update({ ...base, ownerKey: 'backend/bob', restoring: true, running: false, sessionKey: null });
  assert.equal(f.state().id, null); assert.equal(f.starts.length, 1);
  await f.controller.dispose();
});
test('a late native Start cannot re-protect after End or an account change', async () => {
  const f = setup(), entered = deferred(), pending = deferred(), realStart = f.native.start;
  f.native.start = async raw => { entered.resolve(); await pending.promise; return realStart(raw); };
  const starting = f.controller.update(base); await entered.promise;
  await f.controller.update({ ...base, ending: true, running: false }); pending.resolve(); await starting;
  assert.equal(f.state().id, null); assert.equal(f.stops.length, 1);
  await f.controller.dispose();
});
test('Stop is reachable while the native Start promise is pending', async () => {
  const f = setup(), entered = deferred(), pending = deferred(), realStart = f.native.start;
  f.native.start = async raw => { entered.resolve(); await pending.promise; return realStart(raw); };
  const starting = f.controller.update(base); await entered.promise; await f.controller.stop();
  assert.equal(f.stops.length, 1); pending.resolve(); await starting; assert.equal(f.state().id, null);
  await f.controller.dispose();
});
test('normal sessions never ask permissions or install protection', async () => {
  const f = setup(); f.native.capabilities = async () => { throw Error('Should not request capabilities'); };
  await f.controller.update({ ...base, selection: { mode: 'normal', allowed: [] } }); assert.equal(f.starts.length, 0); assert.equal(f.events.at(-1).error, '');
  await f.controller.dispose();
});
test('exact zero cannot install a new lease', async () => {
  const f = setup(); await f.controller.update({ ...base, seconds: 0 }); assert.equal(f.starts.length, 0);
  await f.controller.dispose();
});
test('malformed local app choices default safely to the normal timer', () => {
  for (const value of [null, { mode: 'anything', allowed: [] }, { mode: 'allow-list', allowed: ['../settings'] }, { mode: 'allow-list', allowed: Array(65).fill('social.app') }]) assert.deepEqual(api.readProtectionSelection(value), { mode: 'normal', allowed: [] });
});
test('a missing native v2 engine keeps the normal app available', async () => {
  const f = setup(), c = api.createSessionProtectionController({ storage: f.storage, newId: () => 'never', resolve: async () => null, publish() {} });
  await c.update(base); await c.dispose(); assert.equal(f.starts.length, 0);
});

test('a protected break retains its native lease and schedules its unlock exactly once', async()=>{
 const f=setup(),breaks=[],returns=[];f.native.takeBreak=async(id,ms)=>{breaks.push([id,ms]);return f.state();};f.native.endBreak=async id=>{returns.push(id);return f.state();};
 await f.controller.update(base);const id=f.state().id;const deadline=Date.now()+300000;
 await f.controller.update({...base,running:false,breakEndsAtMs:deadline});await f.controller.update({...base,running:false,breakEndsAtMs:deadline});
 assert.equal(f.state().id,id);assert.equal(f.pauses.length,0);assert.equal(breaks.length,1);assert.ok(breaks[0][1]>298000&&breaks[0][1]<=300000);
 await f.controller.update({...base,breakEndsAtMs:Date.now()-1});assert.ok(returns.includes(id));await f.controller.dispose();
});
test('changing accounts during a break releases the outgoing lease',async()=>{
 const f=setup();f.native.takeBreak=async()=>f.state();await f.controller.update(base);
 await f.controller.update({...base,running:false,breakEndsAtMs:Date.now()+300000});
 await f.controller.update({...base,ownerKey:'backend/other',sessionKey:null,running:false,restoring:true});assert.equal(f.state().id,null);await f.controller.dispose();
});
