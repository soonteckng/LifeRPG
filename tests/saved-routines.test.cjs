const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const api = load('src/services/savedRoutineStore.ts'), domain = load('src/utils/savedRoutine.ts');
const scope = { backendId: 'routines-fixture', ownerId: '11111111-1111-4111-8111-111111111111' };
const id = n => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
const draft = { name: 'Review notes', durationSeconds: 60, focusAreaId: 1, reminder: { enabled: true, hour: 18, minute: 30 } };
const deferred = () => { let resolve; const promise = new Promise(a => { resolve = a; }); return { promise, resolve }; };
function fixture(existing = new Map()) {
  let sequence = 0, failWrite = false;
  const storage = { getItem: async key => existing.get(key) ?? null, setItem: async (key,value) => { if (failWrite) throw Error('synthetic write failure'); existing.set(key,value); } };
  const store = api.createSavedRoutineStore(storage, () => id(++sequence));
  return { store, storage, existing, failWrite: () => { failWrite = true; } };
}
function remote() {
  const rows = new Map(), receipts = new Map(), calls = [];
  return { rows, calls, transport: {
    async apply(operation) {
      calls.push(operation);
      if (receipts.has(operation.operationId)) return receipts.get(operation.operationId);
      const current = rows.get(operation.routineId);
      const reply = current && current.revision !== operation.expectedRevision ? { status: 'conflict', routine: current }
        : { status: 'saved', routine: { ...operation.draft, id: operation.routineId, revision: operation.expectedRevision+1, deletedAt: operation.deleted ? 1234 : null } };
      if (reply.status === 'saved') rows.set(operation.routineId, reply.routine);
      receipts.set(operation.operationId,reply); return reply;
    }, async list() { return [...rows.values()].filter(row => row.deletedAt === null); },
  } };
}

test('routines persist offline edits with stable ids before exposing a saved result', async () => {
  const f = fixture(); await f.store.load(scope);
  assert.equal(await f.store.save(scope,draft),true);
  const raw = f.existing.get(domain.routineStorageKey(scope)), envelope = JSON.parse(raw);
  assert.equal(envelope.pending.length,1); assert.equal(envelope.pending[0].expectedRevision,0);
  const restarted = fixture(f.existing); await restarted.store.load(scope);
  assert.equal(restarted.store.snapshot(scope).routines[0].name,draft.name);
  assert.deepEqual(JSON.parse(f.existing.get(domain.routineStorageKey(scope))).pending,envelope.pending);
});
test('routine scope isolates accounts and backends; an unknown cache is preserved', async () => {
  const f = fixture(); await f.store.save(scope,draft);
  const other = { ...scope, ownerId: '22222222-2222-4222-8222-222222222222' };
  await f.store.load(other); await f.store.load({ ...scope,backendId:'other-backend' });
  assert.equal(f.store.snapshot(other).routines.length,0);
  assert.notEqual(domain.routineStorageKey(scope),domain.routineStorageKey(other));
  const key = domain.routineStorageKey(other); f.existing.set(key,'{"version":99}');
  const broken = fixture(f.existing); await broken.store.load(other);
  assert.equal(broken.store.snapshot(other).ready,false); assert.ok(broken.store.snapshot(other).error);
  assert.equal(f.existing.get(key),'{"version":99}'); assert.equal(await broken.store.save(other,draft),false);
});
test('local routine writes fail without publishing an edit or losing previous cache', async () => {
  const f = fixture(); await f.store.load(scope); f.failWrite();
  assert.equal(await f.store.save(scope,draft),false); assert.equal(f.store.snapshot(scope).routines.length,0); assert.equal(f.existing.size,0);
});
test('serial routine edits and tombstones sync exactly once in revision order', async () => {
  const f = fixture(), r = remote(); await f.store.save(scope,draft);
  const routine = f.store.snapshot(scope).routines[0];
  await f.store.save(scope,{ ...draft,name:'New name' },routine.id); await f.store.remove(scope,routine.id);
  assert.deepEqual(JSON.parse(f.existing.get(domain.routineStorageKey(scope))).pending.map(item => item.expectedRevision),[0,1,2]);
  await f.store.sync(scope,r.transport,()=>true); await f.store.sync(scope,r.transport,()=>true);
  assert.equal(r.calls.length,3); assert.equal(r.rows.get(routine.id).deletedAt,1234); assert.equal(f.store.snapshot(scope).routines.length,0); assert.equal(f.store.snapshot(scope).pendingCount,0);
});
test('a lost routine reply retains the same operation on restart and replay', async () => {
  const f = fixture(), r = remote(); await f.store.save(scope,draft);
  let lost = true;
  await f.store.sync(scope,{ ...r.transport, apply: async op => { const reply = await r.transport.apply(op); if (lost) { lost=false; throw Error('reply lost'); } return reply; } },()=>true);
  assert.equal(f.store.snapshot(scope).pendingCount,1);
  const restart = fixture(f.existing); await restart.store.load(scope); await restart.store.sync(scope,r.transport,()=>true);
  assert.equal(restart.store.snapshot(scope).pendingCount,0); assert.equal(r.calls[0].operationId,r.calls[1].operationId); assert.equal(r.rows.size,1); assert.equal([...r.rows.values()][0].revision,1);
});
test('routine replies after account departure never change the visible cache', async () => {
  const f = fixture(), hold = deferred(); await f.store.save(scope,draft);
  const prior = f.existing.get(domain.routineStorageKey(scope)); let active = true;
  const request = f.store.sync(scope,{ apply: () => hold.promise,list: async () => [] },()=>active);
  await new Promise(resolve => setImmediate(resolve)); active=false;
  const op = JSON.parse(prior).pending[0]; hold.resolve({ status:'saved', routine:{ ...draft,id:op.routineId,revision:1,deletedAt:null } }); await request;
  assert.equal(f.existing.get(domain.routineStorageKey(scope)),prior); assert.equal(f.store.snapshot(scope).pendingCount,1);
});
test('two-device routine conflicts preserve the last local choice for explicit resolution', async () => {
  const f = fixture(), r = remote(); await f.store.save(scope,draft); await f.store.sync(scope,r.transport,()=>true);
  const current = f.store.snapshot(scope).routines[0];
  await f.store.save(scope,{...draft,name:'My edit'},current.id); await f.store.save(scope,{...draft,name:'My final edit'},current.id);
  r.rows.set(current.id,{...current,name:'Other phone',revision:2});
  await f.store.sync(scope,r.transport,()=>true);
  const state = f.store.snapshot(scope); assert.equal(state.pendingCount,0); assert.equal(state.conflicts.length,1); assert.equal(state.conflicts[0].operation.draft.name,'My final edit'); assert.equal(state.routines[0].name,'Other phone');
  assert.equal(await f.store.resolveConflict(scope,state.conflicts[0].operation.operationId,true),true); await f.store.sync(scope,r.transport,()=>true);
  assert.equal(f.store.snapshot(scope).routines[0].name,'My final edit'); assert.equal(f.store.snapshot(scope).routines[0].revision,3);
});
test('a deleted routine cannot be silently revived by conflict resolution', async () => {
  const f = fixture(), r = remote(); await f.store.save(scope,draft); await f.store.sync(scope,r.transport,()=>true);
  const routine = f.store.snapshot(scope).routines[0]; await f.store.save(scope,{ ...draft,name:'Keep me' },routine.id);
  r.rows.set(routine.id,{...routine,revision:2,deletedAt:1234}); await f.store.sync(scope,r.transport,()=>true);
  const conflict = f.store.snapshot(scope).conflicts[0]; assert.equal(await f.store.resolveConflict(scope,conflict.operation.operationId,true),false);
  assert.equal(await f.store.resolveConflict(scope,conflict.operation.operationId,false),true); assert.equal(f.store.snapshot(scope).routines.length,0);
});
test('routine limits bound active records and unsynced queue without dropping work', async () => {
  const f = fixture(); for(let n=0;n<32;n++) assert.equal(await f.store.save(scope,{...draft,name:`Routine ${n}`}),true);
  const before = f.existing.get(domain.routineStorageKey(scope)); assert.equal(await f.store.save(scope,draft),false); assert.equal(f.existing.get(domain.routineStorageKey(scope)),before);
  const routine = f.store.snapshot(scope).routines[0];
  for(let n=0;n<32;n++) assert.equal(await f.store.save(scope,{...draft,name:`Edit ${n}`},routine.id),true);
  assert.equal(f.store.snapshot(scope).pendingCount,64); assert.equal(await f.store.remove(scope,routine.id),false); assert.equal(f.store.snapshot(scope).pendingCount,64);
});
test('routine validation rejects invalid timings, names, ids and wrong-owner caches', () => {
  for (const value of [{...draft,name:''},{...draft,name:' spaced '},{...draft,name:'bad\nname'},{...draft,durationSeconds:28801},{...draft,reminder:{enabled:true,hour:24,minute:0}},{...draft,focusAreaId:0}]) assert.equal(domain.validRoutineDraft(value),false);
  assert.equal(domain.validRoutineDraft({...draft,durationSeconds:1}),true); assert.equal(domain.validRoutineDraft({...draft,durationSeconds:28800}),true);
  assert.throws(()=>domain.parseRoutineEnvelope(JSON.stringify({...domain.emptyRoutineEnvelope(scope),scope:{...scope,ownerId:id(9)}}),scope));
});
test('routine cache commits preserve exact reminder preferences and exclude presentation-only row fields from queued drafts', async () => {
  const f = fixture(); await f.store.save(scope,draft); const routine=f.store.snapshot(scope).routines[0]; await f.store.remove(scope,routine.id);
  const queue=JSON.parse(f.existing.get(domain.routineStorageKey(scope))).pending;
  assert.deepEqual(Object.keys(queue[1].draft).sort(),['durationSeconds','focusAreaId','name','reminder']); assert.deepEqual(queue[1].draft.reminder,draft.reminder);
});
test('invalid saved replies retain queued routine work instead of acknowledging guessed revisions', async () => {
  for (const bad of [null,{...draft,id:id(1),revision:9,deletedAt:null},{...draft,id:id(1),revision:1,deletedAt:1234}]) {
    const f=fixture();await f.store.save(scope,draft);const before=f.existing.get(domain.routineStorageKey(scope));
    await f.store.sync(scope,{apply:async()=>({status:'saved',routine:bad}),list:async()=>[]},()=>true);
    assert.equal(f.store.snapshot(scope).pendingCount,1);assert.equal(f.existing.get(domain.routineStorageKey(scope)),before);
  }
});
test('capacity conflicts do not block later valid routine changes in the same queue', async () => {
  const f=fixture();await f.store.save(scope,draft);await f.store.save(scope,{...draft,name:'Second routine'});
  let calls=0;const r=remote();await f.store.sync(scope,{...r.transport,apply:async op=>{calls++;return calls===1?{status:'conflict',reason:'limit',routine:null}:r.transport.apply(op);}},()=>true);
  assert.equal(f.store.snapshot(scope).pendingCount,0);assert.equal(f.store.snapshot(scope).conflicts.length,1);assert.match(f.store.snapshot(scope).conflicts[0].reason,/32 routines/);assert.equal(f.store.snapshot(scope).routines[0].name,'Second routine');
});
