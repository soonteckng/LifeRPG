/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const scope = (owner = 'alice', epoch = 1, backend = 'fixture') => JSON.stringify([backend, owner, epoch]);
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: () => resolve() }; };

async function fixture() {
  const filename = path.resolve(__dirname, '../src/hooks/useOfflineReconnect.ts'), module = { exports: {} };
  let time = 0, renderer, views = [], sequence = 0;
  const deadlines = new Map(), values = new Map(), calls = [];
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('require', 'module', 'exports', 'performance', 'setTimeout', code)(require, module, module.exports,
    { now: () => time }, (callback, delay) => { const id = ++sequence; deadlines.set(id, { at: time + delay, callback }); return id; });
  const useOfflineReconnect = module.exports.useOfflineReconnect;
  function Client({ id, ...options }) {
    const value = useOfflineReconnect({ scope: scope(), active: true, reconnect: async () => { calls.push(id); }, ...options });
    values.set(id, value); return null;
  }
  const render = () => React.createElement(React.Fragment, null, ...views.map(view => React.createElement(Client, { key: view.id, ...view })));
  await act(async () => { renderer = create(render()); });
  return { calls, value: id => values.get(id),
    views: async next => { views = next; await act(async () => renderer.update(render())); },
    advance: async ms => { await act(async () => { time += ms; for (const [id, deadline] of [...deadlines]) if (deadline.at <= time) { deadlines.delete(id); deadline.callback(); } }); },
    clock: value => { time = value; }, cleanup: () => act(async () => renderer.unmount()),
  };
}

test('Recovery and Workspace share one checking request and a five-second manual retry budget', async () => {
  const f = await fixture(), gate = deferred();
  try {
    await f.views([{ id: 'recovery', reconnect: async () => { f.calls.push('request'); await gate.promise; } }, { id: 'workspace' }]);
    let request;
    await act(async () => { request = f.value('recovery').retry(); void f.value('workspace').retry(); });
    assert.deepEqual(f.calls, ['request']); assert.equal(f.value('recovery').checking, true); assert.equal(f.value('workspace').checking, true);
    await act(async () => { gate.resolve(); await request; });
    assert.equal(f.value('workspace').checking, false); assert.equal(f.value('workspace').disabled, true);
    await f.advance(4999); await act(async () => f.value('workspace').retry()); assert.deepEqual(f.calls, ['request']);
    await f.advance(1); assert.equal(f.value('workspace').disabled, false);
    await act(async () => f.value('workspace').retry()); assert.deepEqual(f.calls, ['request', 'workspace']);
  } finally { gate.resolve(); await f.cleanup(); }
});

test('same-owner remount and admission-epoch changes cannot reset manual retry cooldown', async () => {
  const f = await fixture();
  try {
    await f.views([{ id: 'recovery' }]); await act(async () => f.value('recovery').retry());
    await f.views([]); await f.views([{ id: 'workspace', scope: scope('alice', 3) }]);
    assert.equal(f.value('workspace').disabled, true);
    await act(async () => f.value('workspace').retry()); assert.deepEqual(f.calls, ['recovery']);
    await f.advance(5000); await act(async () => f.value('workspace').retry()); assert.deepEqual(f.calls, ['recovery', 'workspace']);
  } finally { await f.cleanup(); }
});

test('a hanging request stays Checking after cooldown instead of allowing a parallel request', async () => {
  const f = await fixture(), gate = deferred();
  try {
    await f.views([{ id: 'workspace', reconnect: () => { f.calls.push('request'); return gate.promise; } }]);
    let request; await act(async () => { request = f.value('workspace').retry(); });
    await f.advance(20000); assert.equal(f.value('workspace').checking, true); assert.equal(f.value('workspace').disabled, true);
    await act(async () => f.value('workspace').retry()); assert.deepEqual(f.calls, ['request']);
    await act(async () => { gate.resolve(); await request; }); assert.equal(f.value('workspace').disabled, false);
  } finally { gate.resolve(); await f.cleanup(); }
});

test('hidden, blocked, missing-owner and captured outgoing-account retries cannot dispatch', async () => {
  const f = await fixture();
  try {
    await f.views([{ id: 'view' }]); const captured = f.value('view').retry;
    await f.views([{ id: 'view', scope: scope('bob', 2) }]); await act(async () => captured()); assert.deepEqual(f.calls, []);
    for (const options of [{ active: false }, { blocked: true }, { scope: null }]) {
      await f.views([{ id: 'view', ...options }]); assert.equal(f.value('view').disabled, true);
      await act(async () => f.value('view').retry()); assert.deepEqual(f.calls, []);
    }
    await f.views([{ id: 'view' }]); const unmounted = f.value('view').retry;
    await f.views([]); await act(async () => unmounted()); assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test('ordinary failure is calm and a backward clock cannot open an early retry window', async () => {
  const f = await fixture();
  try {
    await f.views([{ id: 'view', reconnect: async () => { f.calls.push('request'); throw Error('No internet'); } }]);
    f.clock(10000); await act(async () => f.value('view').retry()); assert.deepEqual(f.calls, ['request']);
    assert.equal(f.value('view').checking, false); assert.equal(f.value('view').disabled, true);
    f.clock(1000); await act(async () => f.value('view').retry()); assert.deepEqual(f.calls, ['request']);
    await f.views([{ id: 'view', scope: scope('bob', 2) }]);
    await act(async () => f.value('view').retry()); assert.deepEqual(f.calls, ['request', 'view']);
  } finally { await f.cleanup(); }
});

test('pathological unresolved callbacks cannot grow owner bookkeeping indefinitely or drop a live request guard',async()=>{
  const f=await fixture(),gate=deferred(),requests=[];
  try{
    for(let index=0;index<33;index++){
      await f.views([{id:'view',scope:scope(`owner-${index}`),reconnect:()=>{f.calls.push('request');return gate.promise;}}]);
      await act(async()=>{requests.push(f.value('view').retry());});
    }
    assert.equal(f.calls.length,32);assert.equal(f.value('view').disabled,true);
    await act(async()=>{gate.resolve();await Promise.all(requests);});
    await f.advance(5000);assert.equal(f.value('view').disabled,false);
    await act(async()=>f.value('view').retry());assert.equal(f.calls.length,33);
  }finally{gate.resolve();await f.cleanup();}
});
