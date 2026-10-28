/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.resolve(__dirname,'..'),host=type=>function Host(props){return React.createElement(type,props,props.children);};
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
function loader(mocks={},compiled=false){const cache=new Map();function load(file){const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename).exports;
 const mod={exports:{}};cache.set(filename,mod);let source=fs.readFileSync(filename,'utf8');
 if(compiled&&/(DeveloperRewardTests|useRewards)\.(tsx|ts)$/.test(filename)) source=require('@babel/core').transformSync(source,{filename,configFile:false,babelrc:false,
  parserOpts:{plugins:['typescript','jsx']},plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',js)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e));return load(target+ext);},mod,mod.exports);return mod.exports;}return load;}
const state=()=>({stardust:831,nextFindSeconds:1740,owned:['field_jacket','tote','bg_dusk'],earned:['field_jacket'],
 avatar:{look:{skin:'3',hair:'short',hairColor:'brown',glasses:false},equipped:{top:'field_jacket'},background:'bg_dusk',frame:null,title:null,revision:8},
 pack:{date:'2026-10-27',claimed:true,goalReached:true,tier:2,daysInARow:7},today:{date:'2026-10-27',seconds:60,finds:0},trail:{findSeconds:1800,stops:4,complete:false}});

test('test collection is ephemeral, isolated by owner/admission, serialised and cannot reopen after a late reply',async()=>{
 const {createDeveloperRewardLab,emptyTestRewards}=loader()('src/services/developerRewardLab.ts');
 const lab=createDeveloperRewardLab(),real=state(),seed=emptyTestRewards(real),original=JSON.stringify(real),wait=deferred();
 assert.deepEqual(seed.earned,[]);assert.equal(seed.stardust,500);assert.deepEqual(seed.avatar.equipped,{});
 assert.ok(!seed.owned.includes('tote'));assert.equal(JSON.stringify(real),original);
 const first=lab.run('dev:1',seed,()=>wait.promise);
 assert.equal((await lab.run('dev:1',seed,async()=>{throw Error('must not run');})).ok,false);
 assert.equal(lab.snapshot('normal:2').state,null);assert.equal(lab.snapshot('dev:3').state,null);
 lab.end('dev:1');wait.resolve({state:{...seed,stardust:999},gifts:[]});assert.equal((await first).ok,false);assert.equal(lab.snapshot('dev:1').state,null);
 await lab.run('dev:1',seed,async()=>({state:seed,gifts:[]}));lab.ownAll('dev:1',true);assert.equal(lab.snapshot('dev:1').allOwned,true);
 lab.reset('dev:1',seed);assert.equal(lab.snapshot('dev:1').allOwned,false);assert.equal(lab.snapshot('dev:1').state.stardust,500);
 assert.equal(createDeveloperRewardLab().snapshot('dev:1').state,null,'a new app run has no test wallet');
 assert.equal(JSON.stringify(real),original);
});
test('missing review-only SQL fails calmly without authorising a local test inventory',async()=>{
 const {createDeveloperRewardLab,emptyTestRewards}=loader()('src/services/developerRewardLab.ts'),lab=createDeveloperRewardLab();
 const r=await lab.run('dev:1',emptyTestRewards(state()),async()=>{throw{message:'Could not find dev_reward_lab_v1 in the schema cache'};});
 assert.equal(r.ok,false);assert.match(r.message,/Round 75/);assert.equal(lab.snapshot('dev:1').state,null);assert.equal(lab.snapshot('dev:1').busy,false);
});
test('developer picker close uses the shared haptic sheet button, explicit label and test ID',async()=>{
 let closed=0;
 const Header=loader({'react-native':{View:host('View'),StyleSheet:{create:v=>v}},'@expo/vector-icons':{Ionicons:host('Icon')},
  './AppText':{Text:host('Text')},'./SheetTouchable':host('SheetButton')})('src/components/SheetHeader.tsx').default;
 let ui;await act(async()=>{ui=create(React.createElement(Header,{title:'Choose a reward',closeTestID:'dev-test-picker-close',closeLabel:'Close developer reward test',onClose:()=>{closed++;}}));});
 try{const button=ui.root.findByType('SheetButton');assert.equal(button.props.testID,'dev-test-picker-close');assert.equal(button.props.accessibilityRole,'button');
  assert.equal(button.props.accessibilityLabel,'Close developer reward test');assert.equal(button.props.hitSlop,8);await act(async()=>button.props.onPress());assert.equal(closed,1);
 }finally{await act(async()=>ui.unmount());}
});

for(const compiled of [false,true]) {
 test(`real rewards hook: test purchases never change Home, real cache, real avatar or claim queue${compiled?' (compiled)':''}`,async()=>{
  let owner='dev',epoch=1,latest,home,calls=[];const saved=new Map();
  const load=loader({'@react-native-async-storage/async-storage':{getItem:async key=>saved.get(key)??null,setItem:async(key,value)=>saved.set(key,value)},
   '../context/AuthContext':{useAuth:()=>({user:{id:owner},accessMode:'online',admissionEpoch:epoch,verifyCurrentOwner:async()=>({id:owner})})},
   '../../lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push([name,args]);if(name==='get_rewards_v1')return{data:state(),error:null};
    if(name==='dev_reward_lab_v1'){let value=args.p_snapshot;if(args.p_action==='buy')value={...value,stardust:value.stardust-60,owned:[...value.owned,'tote'],earned:[...value.earned,'tote']};
     if(args.p_action==='avatar')value={...value,avatar:{...value.avatar,...args.p_avatar,revision:value.avatar.revision+1}};
     return{data:{state:value,gifts:[]},error:null};}throw Error(`Unexpected real mutation ${name}`);}}}},compiled);
  const {useRewards}=load('src/hooks/useRewards.ts');
  function Harness(){latest=useRewards({developerLab:true});home=useRewards();return null;}
  let ui;await act(async()=>{ui=create(React.createElement(Harness));});
  try{
   const originalCache=new Map(saved),realLook=JSON.stringify(home.equipped);
   await act(async()=>{assert.equal((await latest.lab.start()).ok,true);});
   assert.equal(latest.lab.active,true);assert.equal(latest.stardust,500);assert.ok(!latest.owned.includes('tote'));
   assert.equal(home.stardust,831);assert.ok(home.owned.includes('tote'));
   await act(async()=>{latest.lab.ownAll(true);});assert.ok(latest.owned.includes('pet_fox'));
   await act(async()=>{latest.lab.ownAll(false);});assert.ok(!latest.owned.includes('tote'));
   await act(async()=>{assert.equal((await latest.buy('tote')).ok,true);});assert.equal(latest.stardust,440);assert.ok(latest.owned.includes('tote'));
   await act(async()=>{assert.equal((await latest.saveAvatar({...latest.state.avatar,equipped:{bag:'tote'}})).ok,true);});
   assert.equal(latest.equipped.bag,'tote');assert.equal(JSON.stringify(home.equipped),realLook);
   assert.deepEqual(saved,originalCache);assert.deepEqual(home.reveals,[]);assert.deepEqual(home.moments,[]);
   await act(async()=>{latest.lab.end();});assert.equal(latest.stardust,831);assert.equal(latest.lab.active,false);
   assert.ok(!calls.some(([name])=>['buy_reward_item_v1','save_avatar_v1','dev_rewards_v1'].includes(name)));
   await act(async()=>{owner='normal';epoch=2;ui.update(React.createElement(Harness));});assert.equal(latest.lab.active,false);
   await act(async()=>{owner='dev';epoch=3;ui.update(React.createElement(Harness));});assert.equal(latest.lab.active,false);
  }finally{await act(async()=>ui.unmount());}
 });
}

async function uiHarness(compiled=false){
 let owner='dev',epoch=1,session=false,reduced=false,tree,taps=0;const calls=[],events=new Set();
 const real=state(),rewards={...real,state:real,owner,admissionEpoch:epoch,online:true,busy:false,look:real.avatar.look,equipped:real.avatar.equipped,background:'bg_dusk',frame:null,
  lab:{active:false,allOwned:false,start:async()=>{calls.push(['start']);rewards.lab.active=true;return{ok:true};},end:()=>{calls.push(['end']);rewards.lab.active=false;},reset:()=>calls.push(['reset']),
   ownAll:value=>{calls.push(['all',value]);rewards.lab.allOwned=value;},run:async(action,item,amount)=>{calls.push([action,item,amount]);return{ok:true,value:{state:real,gifts:[{item:item??'tote',rarity:'common',new:action!=='duplicate',stardust:action==='duplicate'?5:0}],
    pack:{tier:amount,daysInARow:[1,3,7,14][amount],items:[{item:'bg_forest',rarity:'common',new:true,stardust:0}],stardust:10}}};}}};
 const mocks={'react-native':{View:host('View'),ScrollView:host('Scroll'),Modal:host('Modal'),StyleSheet:{create:v=>v,hairlineWidth:1},
  AppState:{addEventListener:(_name,fn)=>{events.add(fn);return{remove:()=>events.delete(fn)};}}},
  '@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('SheetScroll')},
  'expo-router':{useRouter:()=>({navigate:route=>calls.push(['navigate',route])})},
  './MotionPressable':function Press(props){return React.createElement('Button',{...props,onPress:()=>{if(!props.disabled){taps++;props.onPress?.();}}},props.children);},
  './AppText':{Text:host('Text')},'./AppSheet':host('Sheet'),'./SheetHeader':host('Header'),
  './PostSessionCelebration':{DailyAchievementMoment:host('Achievement')},'./SessionResultSheet':host('Result'),'./session/SessionBackdrop':host('Backdrop'),
  './RewardMoments':{Moment:host('Moment')},'./rewards/RevealScreens':{ExpeditionReveal:host('Expedition'),PackReveal:host('Pack')},
  '../hooks/useRewards':{useRewards:()=>({...rewards,owner,admissionEpoch:epoch})},'../hooks/useReducedMotion':{useReducedMotion:()=>reduced},
  '../context/UserContext':{useUser:()=>({profile:{id:owner,level:3,current_xp:10,streak_count:3}})},'../context/TimerContext':{useTimer:()=>({hasOpenSession:session})}};
 const Component=loader(mocks,compiled)('src/components/DeveloperRewardTests.tsx').default;
 await act(async()=>{tree=create(React.createElement(Component));});
 const update=()=>act(async()=>tree.update(React.createElement(Component)));
 return{tree,rewards,calls,get taps(){return taps;},press:async id=>{const button=tree.root.findAllByType('Button').find(n=>n.props.testID===id);assert.ok(button,id);
  assert.equal(button.props.accessibilityRole,'button');assert.ok(button.props.accessibilityLabel);await act(async()=>button.props.onPress());},
  scope:async(nextOwner,nextEpoch)=>{owner=nextOwner;epoch=nextEpoch;await update();},running:async value=>{session=value;await update();},reduce:async()=>{reduced=true;await update();},
  background:()=>act(async()=>{for(const listener of events)listener('background');}),cleanup:()=>act(async()=>tree.unmount())};
}
for(const compiled of [false,true]) {
 test(`developer controls reuse all real achievement/result/trail components, have haptics and respect live sessions${compiled?' (compiled)':''}`,async()=>{
  const ui=await uiHarness(compiled);try{
   for(const [id,achievements] of [['dev-first-session',{firstSession:true,dailyGoal:false}],['dev-daily-goal',{firstSession:false,dailyGoal:true}],['dev-first-and-goal',{firstSession:true,dailyGoal:true}]]){
    await ui.press(id);assert.deepEqual(ui.tree.root.findByType('Achievement').props.achievements,achievements);await act(async()=>ui.tree.root.findByType('Achievement').props.onClose());
   }
   await ui.press('dev-walk-result');assert.equal(ui.tree.root.findByType('Backdrop').props.returning,true);
   await act(async()=>ui.tree.root.findByType('Backdrop').props.onReturnEnd());assert.equal(ui.tree.root.findByType('Result').props.preview,true);
   await act(async()=>ui.tree.root.findByType('Result').props.onClose());assert.equal(ui.tree.root.findAllByType('Expedition').length,0,'result must finish closing first');
   await act(async()=>ui.tree.root.findByType('Result').props.onDismiss());assert.equal(ui.tree.root.findByType('Expedition').props.reveal.trail.seconds,60);
   await ui.press('dev-trail-complete');let trail=ui.tree.root.findByType('Expedition').props.reveal.trail;assert.equal(trail.complete,true);assert.equal(trail.finds,4);assert.equal(trail.seconds,7200);assert.equal(trail.nextFindSeconds,0);
   await ui.press('dev-trail-after-end');trail=ui.tree.root.findByType('Expedition').props.reveal.trail;assert.equal(trail.fromSeconds,7200);assert.equal(trail.complete,true);
   for(const [id,prop] of [['dev-ended-result','ending'],['dev-offline-result','offline'],['dev-rejected-result','rejected']]){await ui.press(id);assert.equal(ui.tree.root.findByType('Result').props[prop],true);}
   await ui.running(true);assert.equal(ui.tree.root.findAllByType('Result').length,0);assert.ok(ui.tree.root.findAllByType('Button').find(n=>n.props.testID==='dev-first-session').props.disabled);
   await ui.running(false);assert.equal(ui.tree.root.findAllByType('Result').length,0);await ui.reduce();await ui.press('dev-walk-result');assert.equal(ui.tree.root.findByType('Result').props.visible,false,'the card waits for the scenery window');
   await act(async()=>ui.tree.root.findAllByType('Modal').find(n=>n.props.onShow).props.onShow());assert.equal(ui.tree.root.findByType('Result').props.visible,true);
   await ui.background();assert.equal(ui.tree.root.findAllByType('Result').length,0);assert.ok(ui.taps>=10);assert.deepEqual(ui.calls,[],'presentations never award real activity or rewards');
  }finally{await ui.cleanup();}
 });
}
test('purchase-test controls cover all pack tiers, exact balances, every milestone, duplicates, locks and restoration',async()=>{
 const ui=await uiHarness();try{
  await ui.press('dev-test-inventory');assert.ok(ui.calls.some(call=>call[0]==='start'));
  await ui.press('dev-test-inventory');assert.ok(ui.calls.some(call=>call[0]==='navigate'));
  await ui.press('dev-test-own-all');assert.ok(ui.calls.some(call=>call[0]==='all'&&call[1]===true));
  await ui.press('dev-test-balance');for(const amount of [0,60,120,240,500,5000])assert.ok(ui.tree.root.findAllByType('Button').some(n=>n.props.testID===`dev-test-balance-${amount}`));
  await ui.press('dev-test-balance-60');assert.ok(ui.calls.some(call=>call[0]==='stardust'&&call[2]===60));
  for(let tier=0;tier<4;tier++){await ui.press(`dev-test-pack-${tier}`);assert.equal(ui.tree.root.findByType('Pack').props.reveal.tier,tier);}
  const normalRun=ui.rewards.lab.run;
  ui.rewards.lab.run=async()=>({ok:true,value:{pack:{tier:0,daysInARow:1,stardust:10,items:[{item:'bg_forest',rarity:'common',new:false,stardust:5}]}}});
  await ui.press('dev-test-pack-0');assert.equal(ui.tree.root.findByType('Pack').props.reveal.stardust,15,'the test pack must include duplicate refunds just like the real pack');
  ui.rewards.lab.run=normalRun;
  await ui.press('dev-test-grant');await ui.press('dev-test-item-frame_streak_365');assert.equal(ui.tree.root.findByType('Moment').props.item.id,'frame_streak_365');
  for(const id of ['tote','bg_forest','decor_easel']){
   await ui.press('dev-test-grant');await ui.press(`dev-test-item-${id}`);
   assert.equal(ui.tree.root.findAllByType('Moment').length,0,'ordinary items use the animated finds screen');
   assert.equal(ui.tree.root.findByType('Expedition').props.reveal.finds[0].item,id);
  }
  for(const id of ['pet_owl','title_artist']){
   await ui.press('dev-test-grant');await ui.press(`dev-test-item-${id}`);assert.equal(ui.tree.root.findByType('Moment').props.item.id,id);
  }
  await ui.press('dev-test-duplicate');await ui.press('dev-test-item-tote');assert.equal(ui.tree.root.findByType('Expedition').props.reveal.finds[0].new,false);
  await ui.press('dev-test-find');assert.ok(ui.calls.some(call=>call[0]==='find'));
  await ui.press('dev-test-lock-again');assert.ok(ui.calls.some(call=>call[0]==='reset'));
  await ui.press('dev-test-restore');assert.ok(ui.calls.some(call=>call[0]==='end'));
 }finally{await ui.cleanup();}
});
test('late test rewards and open previews cannot appear after changing account admission',async()=>{
 const ui=await uiHarness(),pending=deferred();try{
  ui.rewards.lab.active=true;ui.rewards.lab.run=()=>pending.promise;
  await ui.press('dev-test-pack-3');await ui.scope('normal',2);
  await act(async()=>pending.resolve({ok:true,value:{pack:{tier:3,daysInARow:14,items:[],stardust:60}}}));
  assert.equal(ui.tree.root.findAllByType('Pack').length,0);
  await ui.scope('dev',3);assert.equal(ui.tree.root.findAllByType('Pack').length,0);
 }finally{await ui.cleanup();}
});
