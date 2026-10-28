/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, cache = new Map()) {
  const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
  const mod = {exports:{}}; cache.set(filename,mod);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),name)+'.ts'),cache):require(name),mod,mod.exports);
  return mod.exports;
}
const svc=load('src/services/dailyEffortCelebrationService.ts');
const now=Date.UTC(2026,9,29,2), owner='fixture-owner';
const receipt=(overrides={})=>({visible:true,pending:false,recovered:true,sessionId:'first',ownerId:owner,timeZone:'Asia/Kuala_Lumpur',creditedDate:'2026-10-29',creditVersion:1,durationSeconds:60,dailyCompletedSeconds:60,dailyGoalMinutes:2,...overrides});
const summarize=load('src/utils/offlineSyncSummary.ts');
const batch=results=>({id:'batch-fixture',entries:results.map((result,i)=>({clientSessionId:'client-'+i,setup:{},receipt:{sessionId:'receipt-'+i,durationSeconds:result.duration??60,result:{credit_version:1,credited_date:'2026-10-29',daily_goal_minutes:30,...result}}}))});

for(const [name,results,first,goal]of [
  ['first only',[{daily_completed_seconds:60},{daily_completed_seconds:120},{daily_completed_seconds:180}],true,false],
  ['goal only',[{daily_completed_seconds:1800}],false,true],
  ['both in different receipts',[{daily_completed_seconds:60},{daily_completed_seconds:1800}],true,true],
  ['both in one receipt',[{daily_completed_seconds:1800,duration:1800}],true,true],
  ['ordinary later sessions',[{daily_completed_seconds:1860}],false,false],
  ['yesterday',[{daily_completed_seconds:60,credited_date:'2026-10-28'}],false,false],
  ['legacy or unconfirmed',[{daily_completed_seconds:60,credit_version:undefined}],false,false],
])test('actual synced-receipt builder: '+name,()=>{
  const value=summarize.offlineSyncCelebration(batch(results),owner,'Asia/Kuala_Lumpur',now);
  assert.equal(!!value&&svc.firstDailyEffortEvidence(value,now),first);
  assert.equal(!!value&&svc.dailyGoalEvidence(value,now),goal);
});

test('one synced batch preserves independent confirmed first-session and daily-goal receipts',()=>{
  const first=receipt(), goal=receipt({sessionId:'goal',dailyCompletedSeconds:120});
  const evidence={...first,confirmedReceipts:[first,goal,receipt({sessionId:'later',dailyCompletedSeconds:180})]};
  assert.equal(svc.firstDailyEffortEvidence(evidence,now),true);
  assert.equal(svc.dailyGoalEvidence(evidence,now),true,'the later confirmed goal crossing must survive grouping');
  assert.equal(svc.dailyGoalEvidence({...evidence,visible:false},now),false,'the hidden host must not consume either ledger');
  assert.equal(svc.firstDailyEffortEvidence({...evidence,pending:true},now),false);
});

test('batch evidence cannot borrow a different day, owner, timezone or unconfirmed result',()=>{
  const ordinary=receipt({dailyCompletedSeconds:180});
  for(const invalid of [{creditedDate:'2026-10-28'},{ownerId:'other'},{timeZone:'UTC'},{creditVersion:undefined},{pending:true}]){
    const evidence={...ordinary,confirmedReceipts:[receipt(invalid),receipt({sessionId:'goal',dailyCompletedSeconds:120,...invalid})]};
    assert.equal(svc.firstDailyEffortEvidence(evidence,now),false,JSON.stringify(invalid));
    assert.equal(svc.dailyGoalEvidence(evidence,now),false,JSON.stringify(invalid));
  }
  assert.equal(svc.dailyGoalEvidence({...ordinary,durationSeconds:180,dailyCompletedSeconds:180},now),true,'ordinary same-session crossing remains valid');
});

test('the same date is celebrated once across a synced batch, later online receipt and restart',async()=>{
  const memory=new Map(), storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)};
  const claims=svc.createDailyEffortClaims(storage,'fixture-backend');
  const evidence={...receipt(),confirmedReceipts:[receipt(),receipt({dailyCompletedSeconds:120})]};
  assert.equal(svc.dailyGoalEvidence(evidence,now),true);
  assert.deepEqual(await Promise.all(['first-session','daily-goal'].map(kind=>claims.claim(owner,'2026-10-29',()=>true,kind))),[true,true]);
  const restart=svc.createDailyEffortClaims(storage,'fixture-backend');
  assert.deepEqual(await Promise.all(['first-session','daily-goal'].map(kind=>restart.claim(owner,'2026-10-29',()=>true,kind))),[false,false]);
});

test('batch enrichment does not drop a goal when the first receipt was already queued',()=>{
  const previous=Date.now;Date.now=()=>now;
  try{
    const queue=load('src/services/dailyAchievementQueue.ts').createDailyAchievementQueue();
    assert.equal(queue.enqueue(receipt()),true);const firstId=queue.snapshot().id;
    const goal=receipt({sessionId:'goal',dailyCompletedSeconds:120});
    assert.equal(queue.enqueue({...receipt(),confirmedReceipts:[receipt(),goal]}),true);
    const grouped=queue.snapshot();assert.notEqual(grouped.id,firstId);
    assert.equal(svc.firstDailyEffortEvidence(grouped.evidence,now),true);assert.equal(svc.dailyGoalEvidence(grouped.evidence,now),true);
    goal.dailyCompletedSeconds=10;assert.equal(svc.dailyGoalEvidence(grouped.evidence,now),true,'queued receipts are deep copied');
    queue.dismiss(firstId);assert.equal(queue.snapshot(),grouped,'an earlier fade cannot dismiss the enriched request');
  }finally{Date.now=previous;}
});

test('a hundred synced receipts reuse one timezone formatter instead of constructing it for every proof',()=>{
  const Original=Intl.DateTimeFormat;let constructed=0;
  Intl.DateTimeFormat=function(...args){constructed++;return new Original(...args);};
  try{
    const fresh=load('src/services/dailyEffortCelebrationService.ts');
    const receipts=Array.from({length:100},(_,i)=>receipt({sessionId:'receipt-'+i,dailyCompletedSeconds:(i+1)*60}));
    const value={...receipts[0],confirmedReceipts:receipts};
    assert.equal(fresh.firstDailyEffortEvidence(value,now),true);assert.equal(fresh.dailyGoalEvidence(value,now),true);
    assert.equal(constructed,1);
  }finally{Intl.DateTimeFormat=Original;}
});
