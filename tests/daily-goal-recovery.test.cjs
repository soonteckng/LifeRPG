const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks={}, cache=new Map()) {
  const filename=path.resolve(__dirname,'..',file);
  if(cache.has(filename)) return cache.get(filename).exports;
  const mod={exports:{}}; cache.set(filename,mod);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(name.endsWith('/AppText'))return {Text:host('Text')};
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
  },mod,mod.exports); return mod.exports;
}
const host=name=>props=>React.createElement(name,props,props.children);
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const goal={user_id:'owner',local_date:'2026-10-12',next_effective_date:'2026-10-13',timezone:'Asia/Kuala_Lumpur',today_goal_minutes:60,next_goal_minutes:60,pending:false,scheduling_available:true,weekly_limit_available:true,can_change_goal:true,next_change_at:null};
const pending={...goal,next_goal_minutes:90,pending:true,can_change_goal:false,next_change_at:'2026-10-19T03:00:00Z'};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function fakeClock(run) {
  const previous={setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
  const timers=new Map();let now=0,id=0;
  global.setTimeout=(callback,milliseconds)=>{timers.set(++id,{at:now+milliseconds,callback});return id;};
  global.clearTimeout=key=>timers.delete(key);
  const advance=async amount=>{const target=now+amount;while(true){const next=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();await flush();}now=target;await flush();};
  try{await run({advance,timers});}finally{Object.assign(global,previous);}
}

test('goal reads time out at eight seconds, abort where supported and ignore a late answer',async()=>fakeClock(async clock=>{
  const read=defer();let signal;
  read.promise.abortSignal=value=>{signal=value;return read.promise;};
  const api=load('src/services/dailyGoalService.ts',{'../../lib/supabase':{supabase:{rpc:()=>read.promise}}});
  const outcome=api.getDailyGoalSettings('owner').then(value=>({value}),error=>({error}));
  await flush();await clock.advance(7999);assert.equal(signal.aborted,false);
  await clock.advance(1);const result=await outcome;assert.match(result.error.message,/check your goal in time/);assert.equal(signal.aborted,true);
  read.resolve({data:goal,error:null});await flush();assert.equal(await outcome,result);assert.equal(clock.timers.size,0);
}));

test('goal scheduling has one twenty-second deadline and a late server reply never becomes a successful result',async()=>fakeClock(async clock=>{
  const write=defer();let signal,writes=0;
  write.promise.abortSignal=value=>{signal=value;return write.promise;};
  const api=load('src/services/dailyGoalService.ts',{'../../lib/supabase':{supabase:{auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:()=>{writes++;return write.promise;}}}});
  const outcome=api.scheduleDailyGoal(90,'owner').then(value=>({value}),error=>({error}));
  await flush();assert.equal(writes,1);await clock.advance(19999);assert.equal(signal.aborted,false);
  await clock.advance(1);const result=await outcome;assert.match(result.error.message,/could not confirm|Could not confirm/);assert.equal(signal.aborted,true);
  write.resolve({data:pending,error:null});await flush();assert.equal(await outcome,result);assert.equal(writes,1);assert.equal(clock.timers.size,0);
}));

test('a stalled owner check is bounded and its late reply cannot initiate a write',async()=>fakeClock(async clock=>{
  const owner=defer();let writes=0;
  const api=load('src/services/dailyGoalService.ts',{'../../lib/supabase':{supabase:{auth:{getUser:()=>owner.promise},rpc:()=>{writes++;return Promise.resolve({data:pending,error:null});}}}});
  const outcome=api.scheduleDailyGoal(90,'owner').then(value=>({value}),error=>({error}));
  await flush();await clock.advance(8000);assert.match((await outcome).error.message,/Confirm your account/);assert.equal(writes,0);
  owner.resolve({data:{user:{id:'owner'}},error:null});await flush();assert.equal(writes,0);assert.equal(clock.timers.size,0);
}));

async function goalSheet(read,write) {
  let closes=0,saves=0,tree;
  const Sheet=props=>React.createElement('Sheet',props,props.header,props.children,props.footer);
  const Component=load('src/components/DailyGoalSheet.tsx',{
    'react-native':{View:host('View')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:20})},'./AppSheet':Sheet,'./PersonalUI':{p:{}},
    '../context/UserContext':{useUser:()=>({profile:{id:'owner',daily_goal_minutes:60,timezone:'Asia/Kuala_Lumpur'}})},
    '../services/dailyGoalService':{getDailyGoalSettings:read,scheduleDailyGoal:write,missingGoalAPI:()=>false},
  }).default;
  await act(async()=>{tree=create(React.createElement(Component,{visible:true,onClose:()=>closes++,onSaved:()=>saves++}));});
  return{tree,closes:()=>closes,saves:()=>saves,output:()=>text(tree.root),button:label=>tree.root.findAllByType('Button').find(node=>text(node)===label),cleanup:async()=>act(async()=>tree.unmount())};
}

test('an uncertain goal write with a failed status check is dismissible and check-only until a fresh successful read',async()=>{
  let reads=0,writes=0;
  const ui=await goalSheet(async()=>{reads++;if(reads===2)throw Error('Offline');return reads===1?goal:pending;},async()=>{writes++;throw Error('Lost reply');});
  try{
    await act(async()=>ui.tree.root.findByType('Input').props.onChangeText('90'));
    await act(async()=>ui.button('Save daily goal').props.onPress());
    assert.equal(writes,1);assert.equal(ui.button('Save daily goal').props.disabled,true);
    assert.equal(ui.tree.root.findByType('Sheet').props.guardDismiss,false);
    assert.match(ui.output(),/Couldn’t confirm/);assert.equal(ui.saves(),0);
    await act(async()=>ui.tree.root.findByType('Sheet').props.onRequestClose());assert.equal(ui.closes(),1);
    await act(async()=>ui.button('Save daily goal').props.onPress());assert.equal(writes,1);
    await act(async()=>ui.button('Retry goal check').props.onPress());
    assert.match(ui.output(),/90 minutes from 2026-10-13/);
    assert.equal(ui.button('Save daily goal').props.disabled,true);assert.equal(writes,1);
  }finally{await ui.cleanup();}
});

test('a lost reply followed by a saved pending schedule does not claim failure or submit another goal',async()=>{
  let reads=0,writes=0;
  const ui=await goalSheet(async()=>++reads===1?goal:pending,async()=>{writes++;throw Error('Lost reply');});
  try{
    await act(async()=>ui.tree.root.findByType('Input').props.onChangeText('90'));
    await act(async()=>ui.button('Save daily goal').props.onPress());
    assert.match(ui.output(),/90 minutes from 2026-10-13/);assert.match(ui.output(),/latest schedule/);
    assert.doesNotMatch(ui.output(),/write never happened|Goal saved/);assert.equal(ui.button('Save daily goal').props.disabled,true);
    await act(async()=>ui.button('Retry goal check').props.onPress());assert.equal(writes,1);
  }finally{await ui.cleanup();}
});

test('an unavailable scheduler never tells an onboarded user to finish setup',async()=>{
  const ui=await goalSheet(async()=>({...goal,scheduling_available:false,can_change_goal:false}),async()=>{throw Error('Must not write');});
  try{assert.match(ui.output(),/temporarily unavailable/);assert.doesNotMatch(ui.output(),/Finish setup/);assert.equal(ui.button('Save daily goal').props.disabled,true);}finally{await ui.cleanup();}
});

test('Settings immediately blocks another write while its lost-reply status check is pending and offers read-only retry',async()=>{
  let reads=0,writes=0,tree;const check=defer();
  const Button=({title,...props})=>React.createElement('Button',props,title);
  const Row=({title,subtitle,...props})=>React.createElement('Button',props,title,subtitle);
  const Component=load('src/app/settings.tsx',{
    'react-native':{View:host('View'),Switch:host('Switch'),Platform:{OS:'android'},AppState:{addEventListener:()=>({remove(){}})}},
    'expo-router':{useRouter:()=>({navigate(){}})},'../components/PersonalUI':{PersonalPage:host('Page'),PersonalButton:Button,PersonalRow:Row,p:{}},
    '../components/AppSheet':props=>React.createElement('Sheet',props,props.header,props.children),
    '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input')},
    '../context/UserContext':{useUser:()=>({profile:{id:'owner',username:'Hero',daily_goal_minutes:60,timezone:'Asia/Kuala_Lumpur'},setHapticsEnabled(){}})},
    '../context/AuthContext':{useAuth:()=>({user:{email:'synthetic@example.com'},signOut:async()=>({error:null})})},
    '../context/TimerContext':{useTimer:()=>({})},'../utils/afterTransition':{afterTransition:work=>{work();return()=>{};}},
    '../services/notificationPermissionService':{readNotificationPermission:async()=>({label:'Allowed'}),enableNotifications:async()=>({label:'Allowed'}),openAlarmSettings:async()=>{},openNotificationSettings:async()=>{}},
    '../services/dailyProgressService':{getTodayProgress:async()=>null},
    '../services/dailyGoalService':{getDailyGoalSettings:async()=>++reads<=2?goal:check.promise,missingGoalAPI:()=>false,scheduleDailyGoal:async()=>{writes++;throw Error('Lost reply');}},
  }).default;
  await act(async()=>{tree=create(React.createElement(Component));});
  const button=label=>tree.root.findAllByType('Button').find(node=>text(node)===label);
  try{
    await act(async()=>button('Daily goalToday: 60 min').props.onPress());
    await act(async()=>tree.root.findByType('Input').props.onChangeText('90'));
    await act(async()=>button('Save daily goal').props.onPress());
    assert.equal(writes,1);assert.equal(button('Save daily goal'),undefined);
    assert.ok(button('Retry goal check'));assert.equal(tree.root.findByType('Sheet').props.guardDismiss,false);
    assert.match(text(tree.root),/delayed change may still arrive/);
    await act(async()=>check.resolve(pending));
    assert.equal(button('Save daily goal'),undefined);assert.match(text(tree.root),/90 min from 2026-10-13/);
    assert.equal(writes,1);
  }finally{await act(async()=>tree.unmount());}
});
