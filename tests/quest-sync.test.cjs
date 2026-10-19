const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
global.__DEV__ = false;

function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}, fileName:filename,
  }).outputText;
  new Function('require','module','exports',code)(name => {
    if (Object.hasOwn(mocks,name)) return mocks[name];
    if(name.endsWith('/SessionProtectionControl'))return ()=>null;
    { const study = require('./helpers/study-stubs.cjs')(name); if (study) return study; }
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename),name);
    const extension = ['','.ts','.tsx'].find(ext => fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+extension),mocks,cache);
  },module,module.exports);
  return module.exports;
}
const host = name => props => React.createElement(name,props,props.children);
const task = (overrides={}) => ({id:1,title:'Current quest',difficulty:'medium',is_completed:false,xp_awarded:30,
  is_recurring:false,repeat_rule:'once',target_minutes:30,subject_id:1,last_completed_date:null,
  created_at:'2026-10-01',updated_at:'2026-10-01',completed_at:null,is_due_today:true,is_completed_today:false,...overrides});
const subjects = [{id:1,title:'Everyday focus'}];
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

async function providerSetup() {
  const reads=[]; let state, summary=null;
  const module=load('src/context/QuestContext.tsx',{
    'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    './TimerContext':{useTimer:()=>({sessionSummary:summary})},
    '../services/taskService':{getTasks:()=>{const read=deferred();reads.push(read);return read.promise;},getSubjects:async()=>subjects},
  });
  function Capture(){state=module.useQuests();return null;}
  let renderer;
  const element=()=>React.createElement(module.QuestProvider,null,React.createElement(Capture));
  await act(async()=>{renderer=create(element());});
  return{reads,state:()=>state,refresh:async()=>{let pending;await act(async()=>{pending=state.refresh();});return{pending};},
    resolve:async(index,rows)=>{await act(async()=>{reads[index].resolve(rows);await new Promise(resolve=>setImmediate(resolve));});},
    mutate:async(fn)=>act(async()=>fn(state)),
    summary:async(value)=>{summary=value;await act(async()=>renderer.update(element()));},
    cleanup:async()=>{await act(async()=>renderer.unmount());}};
}


test('saving and deleting quests update one shared dataset even while older reads are outstanding',async()=>{
  const ui=await providerSetup();
  try{
    await ui.refresh();await ui.resolve(0,[task()]);
    await ui.refresh();
    await ui.mutate(state=>{state.upsert(task({id:2,title:'Saved suggestion'}));state.remove(1);});
    await ui.resolve(1,[task()]);
    assert.deepEqual(ui.state().tasks.map(row=>row.id),[2]);
    await ui.refresh();await ui.resolve(2,[task({id:2,title:'Saved suggestion'})]);
    assert.deepEqual(ui.state().tasks.map(row=>row.id),[2]);
  }finally{await ui.cleanup();}
});

test('completion invalidates an older actionable read and waits for the fresh completed dataset',async()=>{
  const ui=await providerSetup();
  try{
    await ui.refresh();await ui.resolve(0,[]);
    await ui.refresh();await ui.summary({sessionId:'finished'});
    await ui.resolve(1,[task()]);
    assert.deepEqual(ui.state().tasks,[],'pre-completion row must not reappear between reads');
    assert.equal(ui.reads.length,3);
    await ui.resolve(2,[task({is_completed:true,is_completed_today:true})]);
    assert.equal(ui.state().tasks[0].is_completed_today,true);
    assert.deepEqual(load('src/utils/questLists.ts').questLists(ui.state().tasks).today,[]);
  }finally{await ui.cleanup();}
});

test('outgoing account cannot queue another read or publish its old quest results after unmount',async()=>{
  const ui=await providerSetup();
  await ui.refresh();
  let fresh;await ui.mutate(state=>{fresh=state.refresh(true);});
  await ui.cleanup();
  await ui.resolve(0,[task({title:'Old account quest'})]);await fresh;
  assert.equal(ui.reads.length,1,'queued refresh is cancelled with the outgoing owner');
  assert.deepEqual(ui.state().tasks,[]);
  const incoming=await providerSetup();
  try{await incoming.refresh();await incoming.resolve(0,[task({id:9,title:'New account quest'})]);assert.equal(incoming.state().tasks[0].id,9);}
  finally{await incoming.cleanup();}
});

test('strict-mode owner remount still admits a fresh child-requested quest read',async()=>{
  let state, reads=0;
  const module=load('src/context/QuestContext.tsx',{
    'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    './TimerContext':{useTimer:()=>({sessionSummary:null})},
    '../services/taskService':{getTasks:async()=>{reads++;return[task()];},getSubjects:async()=>subjects},
  });
  function Capture(){state=module.useQuests();React.useEffect(()=>{void state.refresh();},[]);return null;}
  let renderer;
  try{
    await act(async()=>{renderer=create(React.createElement(React.StrictMode,null,React.createElement(module.QuestProvider,null,React.createElement(Capture))));});
    assert.ok(reads>0);assert.equal(state.loading,false);assert.equal(state.tasks[0].title,'Current quest');
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

function taskService(owners,rows){
  const calls=[];let check=0;
  const api=load('src/services/taskService.ts',{'../../lib/supabase':{supabase:{
    auth:{getUser:async()=>({data:{user:owners[Math.min(check++,owners.length-1)]?{id:owners[Math.min(check-1,owners.length-1)]}:null},error:null})},
    from:table=>({select:()=>({eq:(column,owner)=>{calls.push([table,column,owner]);return{order:async()=>({data:rows,error:null})};}})}),
  }}});
  return{api,calls};
}

test('quest read includes an explicit captured owner filter',async()=>{
  const {api,calls}=taskService(['owner-a'],[task()]);
  assert.equal((await api.getTasks()).length,1);
  assert.deepEqual(calls,[['tasks','user_id','owner-a']]);
});

test('quest read rejects data when the account changes before its response is admitted',async()=>{
  const {api}=taskService(['owner-a','owner-b'],[task()]);
  await assert.rejects(api.getTasks(),/Account changed while loading quests/);
});

test('persisted old one-off quests remain in history while a prior-day recurring quest becomes available again',async()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date());
  const {api}=taskService(['owner'],[
    task({id:1,is_completed:true,last_completed_date:'2000-01-01',completed_at:'2000-01-01T12:00:00Z'}),
    task({id:2,is_completed:true,is_recurring:true,repeat_rule:'daily',last_completed_date:'2000-01-01'}),
    task({id:3,is_completed:true,is_recurring:true,repeat_rule:'daily',last_completed_date:today}),
  ]);
  const rows=await api.getTasks();
  assert.equal(rows.length,3,'historical data is preserved');
  const lists=load('src/utils/questLists.ts').questLists(rows);
  assert.deepEqual(lists.today.map(row=>row.id),[2]);assert.deepEqual(lists.done.map(row=>row.id),[3]);
});

async function pickerSetup(rows,initial={}){
  const calls=[];let timer={duration:1800,timeLeft:1800,isRunning:false,isCompleted:false,hasOpenSession:false,
    endingSession:false,isRestoring:false,restoreError:false,actionBusy:false,actionError:null,rewardsVisible:false,
    awaitingStart:false,syncStatus:'idle',linkedTaskId:null,targetAttributeId:1,activityType:'other',sessionSummary:null,
    acknowledgeSummary(){},resolveQuestTitle(){},setNotes(){},setActivityType(){},
    setLinkedTaskId:id=>{timer={...timer,linkedTaskId:id};},setTargetAttributeId:id=>{timer={...timer,targetAttributeId:id};},
    setDurationInMinutes:minutes=>{timer={...timer,duration:minutes*60};},setDurationInSeconds:seconds=>{timer={...timer,duration:seconds};},
    startTimer:async()=>calls.push('start'),pauseTimer:async()=>{},resumeTimer:async()=>{},resetTimer:async()=>{},
    retryAction:async()=>{},retryRestore(){},retryCompletion:async()=>{},notes:'',...initial,
  };
  const navigation={getState:()=>({routes:[{},{}]}),canGoBack:()=>true,goBack(){},addListener:()=>()=>{}};
  const native={View:host('View'),ScrollView:host('Scroll'),KeyboardAvoidingView:host('KeyboardView'),ActivityIndicator:host('Spinner'),
    StyleSheet:{create:s=>s,hairlineWidth:1},Platform:{OS:'android'},useWindowDimensions:()=>({width:400,height:850,fontScale:1}),
    Keyboard:{isVisible:()=>false,dismiss(){},addListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})},
    PanResponder:{create:handlers=>({panHandlers:handlers})},
    Animated:{View:host('Animated'),Value:class{constructor(value){this.value=value;}setValue(value){this.value=value;}stopAnimation(){}interpolate(){return 0;}},
      timing:(value,config)=>({start(callback){value.setValue(config.toValue);callback?.({finished:true});},stop(){}})},
  };
  const mocks={
    'react-native':native,'@expo/vector-icons':{Ionicons:host('Icon')},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:host('SheetScroll'),TouchableOpacity:host('Button')},
    'expo-router':{Stack:{Screen:host('Options')},useNavigation:()=>navigation,useFocusEffect:effect=>React.useEffect(effect,[effect])},
    'expo-router/react-navigation':{usePreventRemove(){}},
    'react-native-safe-area-context':{SafeAreaView:host('SafeArea'),useSafeAreaInsets:()=>({top:0,bottom:24})},
    '../context/TimerContext':{useTimer:()=>timer},
    '../context/AuthContext':{useAuth:()=>({accessMode:'online',user:{id:'owner-a'},localOwner:{id:'owner-a',backendId:'test-backend'},admissionEpoch:1})},
    '../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope:{ownerId:'owner-a',backendId:'test-backend'},ready:true,routines:[]})},
    '../context/QuestContext':{useQuests:()=>({tasks:rows,subjects,loading:false,error:false,refresh:async fresh=>calls.push(['refresh',!!fresh])})},
    '../hooks/useReducedMotion':{useReducedMotion:()=>true},'./AppText':{Text:host('Text')},'./MotionPressable':host('Button'),
    './AppHeader':host('Header'),'./AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children):null,
    './CompletionDetails':{CompletionHero:host('Hero'),CompletionRows:host('Rows')},
  };
  for(const child of ['SaveSuggestedQuest','LevelUpModal','ProgressRing','SessionCountdown','FocusLengthControl','FocusDurationSheet','SheetConfirmation']) mocks[`./${child}`]=host(child);
  const Screen=load('src/components/SessionScreen.tsx',mocks).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Screen));});
  const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
  const press=async label=>{const button=renderer.root.findAllByType('Button').find(node=>node.props.accessibilityLabel===label||text(node)===label);assert.ok(button,label);await act(async()=>{button.props.onPress();renderer.update(React.createElement(Screen));});};
  return{calls,press,root:()=>renderer.root,update:async next=>{rows=next;await act(async()=>renderer.update(React.createElement(Screen)));},cleanup:async()=>act(async()=>renderer.unmount())};
}

test('Just focus has no routine chooser, and the quest lists still agree with Home for old completions, recurring and upcoming tasks',async()=>{
  const rows=[task({id:1,title:'Due now'}),task({id:2,title:'Completed yesterday',is_completed:true}),
    task({id:3,title:'Done today',is_completed:true,is_completed_today:true}),
    task({id:4,title:'Repeating today',is_recurring:true,is_completed:true}),task({id:5,title:'Upcoming',is_due_today:false,is_recurring:true})];
  const ui=await pickerSetup(rows);
  try{
    const labels=()=>ui.root().findAllByType('Button').map(node=>node.props.accessibilityLabel).filter(value=>value?.startsWith('Choose '));
    assert.deepEqual(labels(),['Choose category'],'a routine is started from its own play button, never picked inside Just focus');
    const lists=load('src/utils/questLists.ts').questLists(rows);
    assert.deepEqual(lists.today.map(row=>row.id),[1,4]);assert.ok(lists.available.some(row=>row.id===5),'All quests still includes legitimate upcoming tasks');
  }finally{await ui.cleanup();}
});
test('a linked quest that becomes completed before Start cannot start another session',async()=>{
  const ui=await pickerSetup([task()],{linkedTaskId:1});
  try{
    await ui.update([task({is_completed:true})]);
    const start=ui.root().findAllByType('Button').find(node=>node.props.accessibilityLabel==='Start');
    assert.ok(start);assert.equal(start.props.disabled,true);
    await act(async()=>start.props.onPress());assert.ok(!ui.calls.includes('start'));
  }finally{await ui.cleanup();}
});
