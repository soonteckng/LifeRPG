/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.resolve(__dirname,'..'),host=type=>function Host(props){return React.createElement(type,props,props.children);};
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const profile={id:'st-test-owner',username:'St',timezone:'Asia/Kuala_Lumpur',daily_goal_minutes:60,level:1,current_xp:0};
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()));
const goal=()=>({user_id:profile.id,local_date:day(),timezone:profile.timezone,today_goal_minutes:30,next_goal_minutes:30,next_effective_date:'2026-10-28',pending:false,scheduling_available:true,weekly_limit_available:true,can_change_goal:true,next_change_at:null});
function loader(mocks){const cache=new Map();return function load(file){const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename).exports;const module={exports:{}};cache.set(filename,module);
  const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext)&&fs.statSync(target+ext).isFile());return load(path.relative(root,target+suffix));},module,module.exports);return module.exports;};}
async function setup(kind,{cached=null,fallback=null}={}){
  const read=deferred(),reads=[read],cache=new Map(cached?[[profile.id,cached]]:[]),requests=[],timer={cloudSaveVersion:0};let tree,owner=profile.id;
  const noop=async()=>true;
  const user={useUser:()=>({profile:{...profile,id:owner},reloadProfile:noop,hapticsEnabled:false})};
  const native={View:host('View'),TextInput:host('Input'),StyleSheet:{create:x=>x,hairlineWidth:1},Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Keyboard:{addListener:()=>({remove(){}})},Share:{share:noop},useWindowDimensions:()=>({width:390,height:844,fontScale:1})};
  const personal={PersonalPage:host('Page'),PersonalButton:({title,...props})=>React.createElement('Button',props,title),p:{}};
  const mocks={'react-native':native,'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({top:24,bottom:24})},'@expo/vector-icons':{Ionicons:host('Icon')},
    'expo-router':{useRouter:()=>({navigate(){}})},'expo-router/js-tabs':{useBottomTabBarHeight:()=>64},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},
    '../context/UserContext':user,'../../context/UserContext':user,
    '../context/AuthContext':{useAuth:()=>({user:null,accessMode:'online',admissionEpoch:1})},'../../context/AuthContext':{useAuth:()=>({accessMode:'online',admissionEpoch:1})},
    '../context/TimerContext':{useTimer:()=>timer},'../../context/TimerContext':{useTimer:()=>timer},
    '../hooks/useAppPreferences':{useAppPreferences:()=>({})},'../services/appPreferences':{appPreferences:{update:noop}},
    '../hooks/useFocusDurationPreference':{useFocusDurationPreference:()=>({ready:true,selectedSeconds:1800})},
    '../services/notificationPermissionService':{readNotificationPermission:async()=>null},
    '../services/dailyGoalService':{getDailyGoalSettings:()=>{requests.push('goal');return read.promise;},missingGoalAPI:()=>false,scheduleDailyGoal:()=>{throw Error('No writes');}},
    '../services/dailyProgressService':{getTodayProgress:async()=>owner===profile.id?fallback:null},
    '../utils/dailyGoalCache':{cachedDailyGoal:id=>{const value=cache.get(id);return value?.local_date===day()?value:null;},rememberDailyGoal:value=>cache.set(value.user_id,value),forgetDailyGoal:id=>cache.delete(id)},
    '../utils/afterTransition':{afterTransition:work=>{work();return()=>{};}},
    '../utils/tapHaptics':{setTapHapticsEnabled(){},tapHaptic(){}},'../../utils/tapHaptics':{tapHaptic(){}},
    '../services/sessionTrail':{readSessionTrail:async()=>''},
    '../components/PersonalUI':personal,'../components/SettingsList':{SettingsGroup:host('Group'),SettingsRow:props=>React.createElement('Row',props,props.title,props.value)},
    './AppSheet':props=>React.createElement('Sheet',props,props.header,props.children), './SheetHeader':props=>React.createElement('Header',props,props.subtitle),
    './SheetTouchable':host('Button'),'./SheetTextInput':host('Input'),'./AppText':{Text:host('Text')},'../components/AppText':{Text:host('Text')},'../../components/AppText':{Text:host('Text')},
    '../components/AppSheet':host('Sheet'),'../components/CharacterMark':()=>null,'../components/AppBuildInfo':()=>null,'../components/DeveloperTools':()=>null,'../components/DeleteAccount':()=>null,'../components/MotionPressable':host('Button'),
    '../../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[],refresh:noop})},
    '../../context/FloatingDockContext':{floatingDockKey:()=>'',useFloatingDockHeight:()=>120},
    '../../hooks/useStudyPlan':{useStudyPlan:()=>({courses:[],exams:[],recent:[],ready:true})},'../../hooks/useStudyLauncher':{useStudyLauncher:()=>({})},'../../hooks/useJustFocus':{useJustFocus:()=>({})},
    '../../hooks/useHomeLifecycle':{useHomeLifecycle:load=>{React.useEffect(()=>{void load();},[load]);return 12;}},
    '../../services/progressService':{getFocusStreak:async()=>0,getFocusStreakDetail:async()=>({current:0,longest:0,restDays:0,rested:[]})},'../../services/dailyProgressService':{getTodayProgress:()=>{const index=requests.length;requests.push('today');reads[index]??=deferred();return reads[index].promise;}},
    '../../services/homeSnapshot':{readHomeSnapshot:async()=>null,saveHomeSnapshot:noop},
    '../../hooks/useCharacterData':{prefetchCharacterData(){}},'../../hooks/useProgressData':{prefetchProgress(){}},
    '../../hooks/useRewards':{useRewards:()=>({stardust:0,pack:null,online:true})},'../../services/levelPreview':{useShownLevel:()=>({level:1})},
    '../../components/FeatureTour':{TourAnchor:props=>props.children,TourScrollView:host('Scroll')},
    '../../components/HomeSections':{HomeExams:()=>null,HomeMilestones:()=>null,HomeSquad:()=>null,HomeWeek:()=>null,HomeCircle:()=>null},
    '../../components/SectionHeader':{CircleButton:host('Button')},'../../components/adventurer/ItemArt':{StardustArt:()=>null},'../../components/rewards/PackArt':{__esModule:true,default:()=>null,PACK_COLORS:[]},
  };
  for(const name of ['LevelTierSheet','rewards/TrailSheet','DailyGoalSheet','CharacterMark','SavedRoutinesCard','TodaySheet','MoreMenu'])mocks[`../../components/${name}`]=host(name);
  mocks['../../components/rewards/ChosenReward']={ChosenRewardCard:props=>React.createElement("ChosenCard",props),ChosenRewardSheet:props=>React.createElement("ChosenSheet",props)};
  mocks['../../components/ContentReveal']=props=>props.children;mocks['../../components/MotionPressable']=host('Button');
  const files={sheet:'src/components/DailyGoalSheet.tsx',settings:'src/app/settings.tsx',goal:'src/app/settings-goal.tsx',home:'src/app/(tabs)/index.tsx'};
  const Component=loader(mocks)(files[kind]).default;
  const props=kind==='sheet'?{visible:true,onClose(){},onSaved(){}}:{};
  await act(async()=>{tree=create(React.createElement(Component,props));});
  return{tree,read,reads,requests,output:()=>text(tree.root),async updateTimer(next){Object.assign(timer,next);await act(async()=>tree.update(React.createElement(Component,props)));},async updateOwner(next){owner=next;await act(async()=>tree.update(React.createElement(Component,props)));},cleanup:async()=>act(async()=>tree.unmount())};
}

for(const kind of ['sheet','settings','goal','home'])test(`${kind} never presents the profile baseline as today's verified scheduled goal`,async()=>{
  const ui=await setup(kind);
  try{
    if(kind==='sheet')assert.match(ui.tree.root.findByType('Header').props.subtitle,/Checking/i);
    else if(kind==='settings')assert.match(ui.tree.root.findByProps({title:'Daily goal'}).props.value,/Checking/i);
    else if(kind==='goal')assert.match(ui.tree.root.findByProps({title:'Today'}).props.value,/Checking/i);
    else {assert.doesNotMatch(ui.output(),/60 min/);assert.match(ui.output(),/Checking/i);}
    assert.equal(ui.requests.length,1,'opening reuses exactly the existing read');
    await act(async()=>ui.read.resolve(kind==='home'?{goal_minutes:30,completed_seconds:360,completed_minutes:6,credit_version:1,goal_completed:false,progress_date:day()}:goal()));
    if(kind==='sheet')assert.equal(ui.tree.root.findByType('Header').props.subtitle,'Today stays at 30 min.');
    else if(kind==='settings')assert.equal(ui.tree.root.findByProps({title:'Daily goal'}).props.value,'30 min');
    else if(kind==='goal')assert.equal(ui.tree.root.findByProps({title:'Today'}).props.value,'30 min');
    else {assert.match(ui.output(),/30 min/);assert.equal(ui.tree.root.findByType('DailyGoalSheet').props.todayGoalMinutes,30);}
    assert.equal(ui.requests.length,1);
  }finally{await ui.cleanup();}
});

for(const kind of ['sheet','settings','goal','home'])test(`${kind} failed goal check stays unavailable instead of inventing today's baseline`,async()=>{
  const ui=await setup(kind);
  try{
    await act(async()=>ui.read.reject(Error('Offline')));
    if(kind==='sheet'){assert.match(ui.tree.root.findByType('Header').props.subtitle,/unavailable/i);assert.doesNotMatch(ui.output(),/60/);}
    else if(kind==='settings')assert.match(ui.tree.root.findByProps({title:'Daily goal'}).props.value,/unavailable/i);
    else if(kind==='goal')assert.match(ui.tree.root.findByProps({title:'Today'}).props.value,/unavailable/i);
    else {assert.match(ui.output(),/Goal unavailable/);assert.doesNotMatch(ui.output(),/60 min/);}
  }finally{await ui.cleanup();}
});

test('the Home goal sheet uses its existing authoritative cache during a delayed refresh',async()=>{
  const ui=await setup('sheet',{cached:goal()});
  try{assert.equal(ui.tree.root.findByType('Header').props.subtitle,'Today stays at 30 min.');assert.equal(ui.requests.length,1);}
  finally{await ui.cleanup();}
});

test('Today details never turn a not-yet-known goal into a zero-minute achievement',async()=>{
  const load=loader({'react-native':{View:host('View'),StyleSheet:{create:x=>x}},'@expo/vector-icons':{Ionicons:host('Icon')},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:16})},
    './AppSheet':props=>React.createElement('Sheet',props,props.header,props.children),'./MotionPressable':host('Button'),
    './ProgressRing':host('Ring'),'./MoreMenu':()=>null,'./AppText':{Text:host('Text')},'./HomeSections':{useWeekProgress:()=>({week:null}),WeekBars:()=>null,WEEK_LEGEND:''}});
  const Component=load('src/components/TodaySheet.tsx').default;let tree;
    await act(async()=>{tree=create(React.createElement(Component,{visible:true,onClose(){},completedSeconds:0,todayKnown:false,goalMinutes:0,goalKnown:false,streak:0,complete:false,onChangeGoal(){},onOpenProgress(){}}));});
  try{assert.equal(tree.root.findByType('Ring').props.progress,0);assert.match(text(tree.root),/Goal unavailable/);assert.doesNotMatch(text(tree.root),/of 0 min|0 min to your goal|Goal reached|0day streak|0 minthis week|0\/7/);assert.equal(tree.root.findByType('Ring').findAllByType('Text')[0].children.join(''),'–');}
  finally{await act(async()=>tree.unmount());}
});

test('goal settings fallback target belongs only to the account whose daily row was read',async()=>{
  const ui=await setup('goal',{fallback:{user_id:profile.id,progress_date:day(),goal_minutes:30}});
  try{
    await act(async()=>ui.read.reject(Error('Offline')));
    assert.equal(ui.tree.root.findByProps({title:'Today'}).props.value,'30 min');
    await ui.updateOwner('another-owner');
    assert.notEqual(ui.tree.root.findByProps({title:'Today'}).props.value,'30 min','an outgoing fallback must not follow an account change');
  }finally{await ui.cleanup();}
});

test('Home refreshes the saved daily ledger when a dismissed offline session finishes syncing',async()=>{
  const ui=await setup('home');
  try {
    const saved=seconds=>({user_id:profile.id,progress_date:day(),goal_minutes:30,completed_seconds:seconds,completed_minutes:seconds/60,credit_version:1,goal_completed:false});
    await act(async()=>ui.read.resolve(saved(360)));
    assert.equal(ui.tree.root.findByType('TodaySheet').props.completedSeconds,360);
    await ui.updateTimer({cloudSaveVersion:1,sessionSummary:null});
    assert.equal(ui.requests.length,2,'use the existing fresh daily read after cloud save, even after Done');
    await act(async()=>ui.reads[1].resolve(saved(420)));
    assert.equal(ui.tree.root.findByType('TodaySheet').props.completedSeconds,420);
    await ui.updateTimer({cloudSaveVersion:1});
    assert.equal(ui.requests.length,2,'unchanged signals never poll');
    await ui.updateTimer({cloudSaveVersion:2,sessionSummary:{sessionId:'online-completion'}});
    assert.equal(ui.requests.length,3,'summary and cloud signal from one save share one refresh');
    await act(async()=>ui.reads[2].resolve(saved(480)));
    await ui.updateTimer({sessionSummary:null});
    assert.equal(ui.requests.length,3,'Done does not repeat the existing cloud save');
  }finally{await ui.cleanup();}
});

test('the real goal cache rejects yesterday even when the reading is only two seconds old',()=>{
  const previous=Date.now;
  let clock=Date.parse('2026-10-27T23:59:59Z');
  Date.now=()=>clock;
  try {
    const api=loader({'../services/dailyGoalService':{getDailyGoalSettings:()=>{throw Error('No network');}}})('src/utils/dailyGoalCache.ts');
    const saved={...goal(),user_id:'midnight-owner',timezone:'UTC',local_date:'2026-10-27'};
    api.rememberDailyGoal(saved);
    assert.equal(api.cachedDailyGoal('midnight-owner'),saved);
    assert.equal(api.cachedDailyGoal('another-owner'),null);
    clock+=2000;
    assert.equal(api.cachedDailyGoal('midnight-owner'),null,'a new local day invalidates the old scheduled target before the normal TTL');
  }finally{Date.now=previous;}
});
