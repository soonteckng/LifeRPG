/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/migrations');
const ts=require('typescript');
function source(file,mocks){
  const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const catalogue=source('src/services/rewardCatalog.ts',{});
const oldService=source('src/services/rewardsService.ts',{'../../lib/supabase':{supabase:{}},'./rewardCatalog':catalogue});
const oldMessages=source('src/services/rewardsStore.ts',{'./rewardsService':oldService,'./rewardCatalog':catalogue});
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const filename=fs.readdirSync(dir).find(name=>name.endsWith('_round80_chosen_rewards.sql')),sql=read(filename);
test('chosen reward proposal has private permanent ledgers, explicit owner checks and no native/auth/history reset',()=>{
  for(const name of ['chosen_rollout','chosen_accounts','goal_day_credits','chosen_grants','chosen_offers','chosen_requests']){
    assert.ok(sql.includes(`alter table liferpg_reward_private.${name} enable row level security;`));
  }
  assert.match(sql,/primary key \(user_id, local_date\)/);
  assert.match(sql,/check \(spent_days = 5\)/);
  assert.doesNotMatch(sql,/alter table public\.|drop table|truncate|update public\.activity_sessions/i);
  assert.ok(sql.includes("'chosenGrants'"));assert.ok(sql.includes('p_expected_revision'));
  assert.ok(sql.includes('Reach your daily goal'),'old friendly-error matcher can display the retirement message');
});

if(process.env.SESSION_SQL_PGLITE_ROOT){
const {PGlite}=require(path.join(process.env.SESSION_SQL_PGLITE_ROOT,'@electric-sql/pglite'));
const a='80808080-8080-4080-8080-808080808080',b='81818181-8181-4181-8181-818181818181',dev='82828282-8282-4282-8282-828282828282';
const uid=n=>'83838383-8383-4383-8383-'+String(n).padStart(12,'0');
async function setup(){
 const db=new PGlite();await db.exec(fs.readFileSync(path.join(root,'tests/sql/progression-bootstrap.sql'),'utf8'));await db.exec("set time zone 'UTC'");
 await db.exec(`alter table public.activity_sessions add column if not exists client_session_id uuid;alter table public.activity_sessions add column if not exists credit_result jsonb;
 insert into auth.users(id) values('${a}'),('${b}'),('${dev}');
 insert into public.profiles(id,username,timezone,level) values('${a}','Fixture A','UTC',3),('${b}','Fixture B','Asia/Kuala_Lumpur',3),('${dev}','Developer fixture','UTC',3) on conflict(id) do nothing;
 update public.profiles set timezone=case when id='${b}' then 'Asia/Kuala_Lumpur' else 'UTC' end where id in ('${a}','${b}','${dev}');
 create schema liferpg_auth_private;create table liferpg_auth_private.developers(user_id uuid primary key);insert into liferpg_auth_private.developers values('${dev}');`);
 for(const n of ['20261018120000_study_plan','20261018140000_study_squads','20261018160000_study_extras','20261024090000_rewards_core','20261024100000_rewards_dev_tools','20261024110000_rewards_dev_unlocks','20261024120000_rewards_auto_frames'])await db.exec(read(n+'.sql'));
 const security=read('20261023090000_security_streak_dev_goal.sql'),at=security.indexOf('create or replace function liferpg_squad_private.focus_streak');
 await db.exec(security.slice(at,security.indexOf('$function$;',at)+11).replace(/\$function\$/g,'$$$$'));
 for(const n of ['20261024130000_squad_player_cards','20261024140000_round58_rewards_cards','20261024140100_round58_dev_protection','20261025090001_round66_daily_trail'])await db.exec(read(n+'.sql'));
 await db.exec(read(fs.readdirSync(dir).find(n=>n.endsWith('_round75_developer_reward_lab.sql'))));
 await db.exec(sql);return db;
}
test('chosen reward proposal: isolated real SQL rules and compatibility',async t=>{
 const db=await setup();
 const rootRole=()=>db.exec('reset role'),as=owner=>db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
 const call=async(expr,args=[]) => {
   await db.exec('savepoint rpc');
   try {const value=(await db.query('select '+expr+' r',args)).rows[0].r;await db.exec('release savepoint rpc');return value;}
   catch(error){await db.exec('rollback to savepoint rpc');await db.exec('release savepoint rpc');throw error;}
 };
 const state=async(owner=a)=>{await as(owner);return call('public.get_rewards_v1($1)',[owner]);};
 const activate=async(owner=a)=>{await rootRole();await db.query("update liferpg_reward_private.chosen_accounts set first_credit_date=current_date-40,starts_at=now()-interval '40 days' where user_id=$1",[owner]);};
 const days=async(n,owner=a)=>{await rootRole();await db.query(`insert into public.daily_progress(user_id,progress_date,goal_minutes,goal_completed)
 select $1,current_date-30+i,30,true from generate_series(1,$2::int) i on conflict(user_id,progress_date) do update set goal_completed=true`,[owner,n]);};
 const pick=async(s,item=s.chosen.offers[0].item,request=uid(1),owner=a)=>{await as(owner);return call('public.choose_reward_v1($1,$2,$3,$4)',[owner,item,s.chosen.revision,request]);};
 async function check(name,fn){await t.test(name,async()=>{await rootRole();await db.exec('begin');try{await fn();}finally{await db.exec('rollback');await rootRole();}});}
 try{
 await check('launch day keeps its current pack and records zero credits',async()=>{
  let s=await state();assert.equal(s.chosen.enabled,false);assert.equal(s.chosen.balance,0);
  await rootRole();await db.query('insert into public.daily_progress(user_id,progress_date,goal_minutes,goal_completed) values($1,current_date,30,true)',[a]);
  await as(a);const ready=await state();assert.equal(ready.pack.goalReached,true,JSON.stringify({pack:ready.pack,rows:(await db.query('select progress_date,goal_completed from public.daily_progress where user_id=$1',[a])).rows}));
  const opened=await call('public.open_daily_pack_v1($1)',[a]);assert.equal(opened.state.pack.claimed,true);assert.equal(opened.state.chosen.balance,0);
  await assert.rejects(call('public.open_daily_pack_v1($1)',[a]),/already opened/);
 });
 await check('cutoff is frozen even after timezone edits and new accounts get no fresh pack window',async()=>{
  await rootRole();const before=await call('(select to_jsonb(x) from liferpg_reward_private.chosen_accounts x where user_id=$1)',[b]);
  await db.query("update public.profiles set timezone='America/New_York' where id=$1",[b]);await state(b);await rootRole();
  const after=await call('(select to_jsonb(x) from liferpg_reward_private.chosen_accounts x where user_id=$1)',[b]);
  assert.deepEqual([after.launch_zone,after.first_credit_date,after.starts_at],[before.launch_zone,before.first_credit_date,before.starts_at]);
  await db.exec("update liferpg_reward_private.chosen_rollout set launched_at=now()-interval '7 days'");
  const fresh=uid(99);await db.query('insert into auth.users(id) values($1)',[fresh]);await db.query("insert into public.profiles(id,username,timezone,level) values($1,'New fixture','UTC',1)",[fresh]);
  const s=await state(fresh);assert.equal(s.chosen.enabled,true);await assert.rejects(call('public.open_daily_pack_v1($1)',[fresh]),/Reach your daily goal/);
 });
 await check('permanent dates survive replay and later loss of the mutable completion flag',async()=>{
  await activate();await days(1);await days(1);assert.equal((await state()).chosen.balance,1);
  await rootRole();await db.query('update public.daily_progress set goal_completed=false,goal_minutes=480 where user_id=$1',[a]);assert.equal((await state()).chosen.balance,1);
 });
 await check('five banked days grant once on selection, never auto-equip, replay spends nothing',async()=>{
  await activate();await days(5);const s=await state(),target=s.chosen.offers[0].item;
  const got=await pick(s,target);assert.equal(got.chosen.balance,0);assert.equal(got.chosen.target,null);assert.ok(got.owned.includes(target));assert.equal(got.chosen.grants.length,1);
  assert.deepEqual(got.avatar,s.avatar);assert.deepEqual((await pick(s,target)).chosen,got.chosen);
  await assert.rejects(pick(s,s.chosen.offers[1].item),/already used/);
 });
 await check('twelve days leave seven and never select a second target automatically',async()=>{
  await activate();await days(12);const s=await state(),got=await pick(s);assert.equal(got.chosen.balance,7);assert.equal(got.chosen.grants.length,1);assert.equal(got.chosen.target,null);
  assert.deepEqual((await state()).chosen,got.chosen);
 });
 await check('a selected target grants on the fifth accepted date and later reads do not grant twice',async()=>{
  await activate();await days(4);const s=await state(),selected=await pick(s);assert.equal(selected.chosen.target,s.chosen.offers[0].item);assert.equal(selected.chosen.balance,4);
  await days(5);const got=await state();assert.equal(got.chosen.grants.length,1);assert.equal(got.chosen.balance,0);assert.equal((await state()).chosen.grants.length,1);
 });
 await check('target change preserves days, stale competing selection is refused',async()=>{
  await activate();await days(4);const s=await state(),first=await pick(s);
  const second=await pick(first,s.chosen.offers[1].item,uid(2));assert.equal(second.chosen.balance,4);assert.equal(second.chosen.target,s.chosen.offers[1].item);
  await assert.rejects(pick(first,s.chosen.offers[2].item,uid(3)),/another device/);
 });
 await check('purchase winning first preserves days and only refills the acquired offer slot',async()=>{
  await activate();await days(4);const s=await state(),target=s.chosen.offers[0].item;await pick(s,target);
  await rootRole();await db.query('update liferpg_reward_private.wallets set stardust=10000 where user_id=$1',[a]);await as(a);
  const got=await call('public.buy_reward_item_v1($1,$2)',[a,target]);assert.equal(got.state.chosen.balance,4);assert.equal(got.state.chosen.target,null);
  assert.deepEqual(got.state.chosen.offers.slice(1),s.chosen.offers.slice(1));assert.notEqual(got.state.chosen.offers[0].item,target);
 });
 await check('a random acquisition preserves credits, chosen grant winning first cannot also charge a purchase',async()=>{
  await activate();await days(4);let s=await state(),target=s.chosen.offers[0].item;await pick(s,target);
  await rootRole();await call("liferpg_reward_private.give($1,$2,'find',null,null)",[a,target]);s=await state();assert.equal(s.chosen.balance,4);assert.equal(s.chosen.target,null);
  await days(5);s=await state();target=s.chosen.offers[0].item;await pick(s,target,uid(2));
  await assert.rejects(call('public.buy_reward_item_v1($1,$2)',[a,target]),/already have/);
 });
 await check('pre-cutoff dates and pack dates never credit, late eligible sync dates credit exactly once',async()=>{
  await activate();await rootRole();await db.query('update liferpg_reward_private.chosen_accounts set first_credit_date=current_date-3 where user_id=$1',[a]);
  await db.query('insert into liferpg_reward_private.pack_claims(user_id,pack_date,tier) values($1,current_date-2,0)',[a]);
  await db.query('insert into public.daily_progress(user_id,progress_date,goal_minutes,goal_completed) select $1,current_date-i,30,true from generate_series(1,5) i',[a]);
  assert.equal((await state()).chosen.balance,2);assert.equal((await state()).chosen.balance,2);
 });
 await check('ordinary developer bypass gives no real goal credits; old pack preview still works',async()=>{
  await activate(dev);const s=await state(dev);assert.equal(s.chosen.balance,0);assert.deepEqual(s.chosen.offers,[]);
  await assert.rejects(call('public.open_daily_pack_v1($1)',[dev]),/Reach your daily goal/);
  const snapshot={...s,owned:['glasses','bg_dusk'],earned:[],pack:{...s.pack,daysInARow:0},avatar:{...s.avatar,revision:1}};
  const r=await call('public.dev_reward_lab_v1($1,$2,$3,$4,$5)',[dev,'pack',snapshot,null,0]);assert.equal(r.pack.tier,0);
  assert.equal((await state(dev)).chosen.balance,0);
 });
 await check('new rolled-back developer preview uses earned inventory and real five-day core without changing real rows',async()=>{
  const real=await state(dev),snap={...real,earned:[],chosen:undefined};
  const fingerprint=async()=>{await rootRole();const r={};for(const name of ['wallets','inventory','avatars','events','pack_claims','chosen_accounts','goal_day_credits','chosen_grants','chosen_offers','chosen_requests'])r[name]=await call(`(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from liferpg_reward_private.${name} x)`);return r;};
  const before=await fingerprint(),lab=async(action,s,item=null)=>{await as(dev);return call('public.dev_chosen_reward_lab_v1($1,$2,$3,$4)',[dev,action,s,item]);};
  let s=await lab('load',snap);assert.equal(s.chosen.offers.length,4);const target=s.chosen.offers[0].item;
  s=await lab('select',s,target);for(let i=0;i<5;i++)s=await lab('day',s);
  assert.ok(s.earned.includes(target));assert.equal(s.chosen.balance,0);assert.equal(s.chosen.grants.length,1);assert.deepEqual(await fingerprint(),before);
  s=await lab('load',snap);assert.equal(s.chosen.balance,0);assert.ok(!s.earned.includes(target));assert.deepEqual(await fingerprint(),before);
  await assert.rejects(lab('select',s,'pet_owl'),/available rewards/);assert.deepEqual(await fingerprint(),before,'a failed preview rolls back its setup too');
 });
 await check('all collected retains saved days and a newly eligible catalogue item fills empty slots',async()=>{
  await activate();await days(12);await state();await rootRole();
  await db.query("insert into liferpg_reward_private.inventory(user_id,item_id,source) select $1,id,'milestone' from liferpg_reward_private.items where not is_free and kind in ('wearable','background','decor') on conflict do nothing",[a]);
  let s=await state();assert.equal(s.chosen.balance,12);assert.deepEqual(s.chosen.offers,[]);
  await rootRole();await db.exec("insert into liferpg_reward_private.items(id,kind,rarity,is_free,from_finds,from_packs,price) values('future_decoration','decor','common',false,false,false,60)");
  s=await state();assert.deepEqual(s.chosen.offers,[{slot:1,item:'future_decoration'}]);assert.equal(s.chosen.balance,12);
 });
 await check('anonymous access, cross-owner calls, private helpers and foreign acknowledgements are refused or ignored safely',async()=>{
  await activate();await days(5);const s=await state(),got=await pick(s),grant=got.chosen.grants[0].id;
  await as(b);await assert.rejects(call('public.choose_reward_v1($1,$2,$3,$4)',[a,s.chosen.offers[0].item,s.chosen.revision,uid(3)]),/Account changed/);
  await assert.rejects(call('liferpg_reward_private.chosen_refresh($1,true)',[b]),/permission denied/);
  await assert.rejects(call('public.dev_chosen_reward_lab_v1($1,$2,$3)',[b,'load',s]),/Only developer/);
  await call('public.acknowledge_chosen_rewards_v1($1,$2)',[b,[grant]]);assert.equal((await state()).chosen.grants.length,1);
  await call('public.acknowledge_chosen_rewards_v1($1,$2)',[a,[grant]]);assert.equal((await state()).chosen.grants.length,0);
  await db.exec('set role anon');await assert.rejects(call('public.choose_reward_v1($1,$2,$3,$4)',[a,null,1,uid(4)]),/permission denied/);
 });
 await check('old-client reply shape, wallet lock order, eligible pool and private RLS are preserved',async()=>{
  await activate();const s=await state();for(const [key,type]of Object.entries({date:'string',goalReached:'boolean',claimed:'boolean',tier:'number',daysInARow:'number'}))assert.equal(typeof s.pack[key],type);
  assert.deepEqual(oldService.parseRewardsState(s).pack,s.pack,'the actual existing parser accepts the additive state');
  let refusal;try{await call('public.open_daily_pack_v1($1)',[a]);}catch(error){refusal=error;}
  const friendly=oldMessages.rewardsErrorMessage(refusal);assert.match(friendly,/chosen rewards/);assert.doesNotMatch(friendly,/Couldn't reach/);
  await rootRole();const eligible=await call("(select count(*) from liferpg_reward_private.items where not is_free and kind in ('wearable','background','decor'))");assert.equal(eligible,24);
  const backgrounds=await call("(select count(*) from liferpg_reward_private.items where not is_free and kind='background' and not from_finds and price is not null)");assert.equal(backgrounds,5);
  for(const name of ['chosen_pick','chosen_refresh']){const body=await call("pg_get_functiondef(('liferpg_reward_private.'||$1)::regproc)",[name]);assert.ok(body.indexOf('wallet_for')<body.indexOf('chosen_boundary'));}
  const insecure=await call("(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='liferpg_reward_private' and c.relname in ('chosen_accounts','chosen_grants','goal_day_credits','chosen_offers','chosen_requests') and not c.relrowsecurity)");assert.equal(insecure,0);
 });
 }finally{await db.close();}
});
}
