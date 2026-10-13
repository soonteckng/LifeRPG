/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname,'../src/services/sessionOwnerVerification.ts'),'utf8');
const mod = {exports:{}};
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const {createSessionOwnerVerification} = mod.exports;
const scope = {ownerId:'owner-a',backendId:'fixture'};
const deferred = () => {let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject};};
function harness() {
  const h={scope:{...scope},epoch:1,calls:0,reply:async()=>({...scope})};
  h.verifier=createSessionOwnerVerification({scope,currentScope:()=>h.scope,currentEpoch:()=>h.epoch,verify:()=>{h.calls++;return h.reply();}});
  return h;
}
test('one operation shares a fresh verified owner across concurrent and sequential guarded calls',async()=>{
  const h=harness(),wait=deferred();h.reply=()=>wait.promise;h.verifier.beginOperation();
  const first=h.verifier.verify(),second=h.verifier.verify();await Promise.resolve();assert.equal(h.calls,1);
  wait.resolve({...scope});assert.deepEqual(await first,scope);assert.deepEqual(await second,scope);
  const third=await h.verifier.verify();assert.deepEqual(third,scope);assert.equal(h.calls,1);
  third.ownerId='mutated';assert.deepEqual(await h.verifier.verify(),scope);
  h.verifier.endOperation();h.reply=async()=>({...scope});h.verifier.beginOperation();
  assert.deepEqual(await h.verifier.verify(),scope);assert.equal(h.calls,2);
});
test('no proof is retained outside a controller operation or across an offline failure',async()=>{
  const h=harness();await h.verifier.verify();await h.verifier.verify();assert.equal(h.calls,2);
  h.verifier.beginOperation();h.reply=async()=>null;assert.equal(await h.verifier.verify(),null);
  h.reply=async()=>({...scope});assert.deepEqual(await h.verifier.verify(),scope);assert.equal(h.calls,4);
  h.verifier.endOperation();h.reply=async()=>null;assert.equal(await h.verifier.verify(),null);
});
test('account/backend changes and admission revocation fence cached and delayed proof',async()=>{
  for(const change of [h=>h.scope={...scope,ownerId:'owner-b'},h=>h.scope={...scope,backendId:'other'},h=>h.epoch++,h=>h.scope=null]) {
    const h=harness(),wait=deferred();h.reply=()=>wait.promise;h.verifier.beginOperation();
    const request=h.verifier.verify();await Promise.resolve();change(h);wait.resolve({...scope});assert.equal(await request,null);
    assert.equal(await h.verifier.verify(),null);
  }
  const h=harness();h.verifier.beginOperation();await h.verifier.verify();h.epoch++;
  h.reply=async()=>null;assert.equal(await h.verifier.verify(),null);assert.equal(h.calls,1);
  h.verifier.beginOperation();assert.equal(await h.verifier.verify(),null);assert.equal(h.calls,2);
});
test('ending or replacing an operation rejects late proof and cannot clear a newer request',async()=>{
  const h=harness(),old=deferred(),next=deferred();h.reply=()=>old.promise;h.verifier.beginOperation();
  const stale=h.verifier.verify();await Promise.resolve();h.verifier.endOperation();h.verifier.beginOperation();h.reply=()=>next.promise;
  const current=h.verifier.verify();await Promise.resolve();old.resolve({...scope});assert.equal(await stale,null);
  const joined=h.verifier.verify();assert.equal(h.calls,2);next.resolve({...scope});assert.deepEqual(await current,scope);assert.deepEqual(await joined,scope);
});
test('foreign or rejected verification never becomes reusable proof',async()=>{
  const h=harness();h.verifier.beginOperation();h.reply=async()=>({...scope,ownerId:'owner-b'});assert.equal(await h.verifier.verify(),null);
  h.reply=async()=>{throw Error('verification_failed');};await assert.rejects(h.verifier.verify(),/verification_failed/);
  h.reply=async()=>({...scope});assert.deepEqual(await h.verifier.verify(),scope);assert.equal(h.calls,3);
});
