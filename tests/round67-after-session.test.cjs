/* global __dirname */
// The whole way back from a finished session, with the real pieces: the timer
// screen, the result card's listener, the reward screens and the rewards store.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks,cache){
  const filename=path.resolve(__dirname,'..',file);
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',source)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(name.endsWith('/SessionProtectionControl')) return Object.assign(()=>null,{ProtectionSettingsSheet:()=>null});
    if(name.endsWith('/SessionProtectionContext')) return {SessionProtectionProvider:props=>props.children};
    { const study = require('./helpers/study-stubs.cjs')(name); if (study) return study; }
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext)&&fs.statSync(target+ext).isFile());
    return load(path.relative(path.resolve(__dirname,'..'),target+suffix),mocks,cache);
  },module,module.exports);return module.exports;
}
const host=type=>props=>React.createElement(type,props,props.children);
const wait=ms=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const oldState=seconds=>({stardust:10,nextFindSeconds:1500-seconds%1500,owned:[],earned:[],
  avatar:{look:{},equipped:{},frame:null,background:'bg_dusk',title:null,revision:1},
  pack:{date:'2026-10-25',goalReached:false,claimed:false,tier:0,daysInARow:0},today:{seconds,finds:0}});

async function setup({claimDelay=0,finds=[]}={}){
  const cache=new Map();
  let timer={duration:60,timeLeft:1,isRunning:true,isCompleted:false,hasOpenSession:true,endingSession:false,sessionEnded:false,
    actionBusy:false,isRestoring:false,actionError:null,syncStatus:'idle',summaryViewed:false,rewardsVisible:false,clientReported:false,
    sessionId:'S1',sessionSummary:null,linkedTaskId:null,targetAttributeId:1,notes:'',recoveredSession:false};
  let profile={id:'owner',level:3,current_xp:5,streak_count:1};let pathname='/session';const calls=[];let claims=0,given=false;
  const app={currentState:'active',addEventListener:()=>({remove(){}})};
  const auth={accessMode:'online',user:{id:'owner'},localOwner:null,admissionEpoch:1,verifyCurrentOwner:async()=>({id:'owner'}),retrySessionVerification:async()=>{}};
  const sheets=load('src/utils/sheetActivity.ts',{},cache);
  // The real result card is a sheet: it counts as open while it shows.
  function Result(props){const[id]=React.useState(()=>Symbol('result'));React.useLayoutEffect(()=>props.visible?sheets.registerSheetActivity(id):undefined,[props.visible,id]);return React.createElement('Result',props);}
  const api={acknowledgeSummary(){calls.push('viewed');timer={...timer,summaryViewed:true};},
    clearCompletionModal(){calls.push('clear');timer={...timer,hasOpenSession:false,isCompleted:false,sessionSummary:null,sessionId:null,duration:1800};},
    retryCompletion:async()=>{},retryAction:async()=>{},resetTimer:async()=>{},setDurationInSeconds(){},setDurationInMinutes(){},setTargetAttributeId(){},setLinkedTaskId(){},resolveQuestTitle(){}};
  const navigation={canGoBack:()=>true,isFocused:()=>pathname==='/session',getState:()=>({routes:[{key:'home'},{key:'session'}],index:1}),addListener:()=>()=>{},
    goBack:()=>{calls.push('route-close');pathname='/';}};
  const mocks={
    'expo-router':{usePathname:()=>pathname,useRouter:()=>({push(){}}),Stack:{Screen:host('Options')},useFocusEffect:effect=>React.useEffect(effect,[effect]),useNavigation:()=>navigation},
    'expo-router/react-navigation':{usePreventRemove(){}},
    './SessionResultSheet':Result,'./SaveSuggestedQuest':host('SaveQuest'),'./PostSessionCelebration':host('Celebration'),'./SessionSavingOverlay':host('Saving'),
    '../context/AuthContext':{useAuth:()=>auth},
    '../context/TimerContext':{useTimer:()=>Object.assign(timer,api)},
    '../context/UserContext':{useUser:()=>({profile,reloadProfile:async()=>{}})},
    '../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[{id:1,title:'Learning',color_code:'#60A5FA'}]})},
    '../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope:{ownerId:'owner'},ready:true,routines:[]})},
    '@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}},
    '../../lib/supabase':{supabase:{rpc:async name=>{
      if(name!=='claim_session_rewards_v1')return {data:oldState(0),error:null};
      claims++;const ready=timer.sessionSummary&&!given;if(ready)given=true;await new Promise(r=>setTimeout(r,claimDelay));
      return {data:{sessions:ready?[{sessionId:'S1',finds,minutesStardust:0,seconds:60}]:[],milestones:[],state:oldState(60)},error:null};}}},
    'react-native':{AppState:app,Modal:host('Modal'),Easing:{linear:0},View:host('View'),ScrollView:host('Scroll'),KeyboardAvoidingView:host('KeyboardView'),ActivityIndicator:host('Spinner'),
      StyleSheet:{create:styles=>styles,hairlineWidth:1},Platform:{OS:'android'},useWindowDimensions:()=>({width:390,height:844,fontScale:1}),
      Keyboard:{isVisible:()=>false,dismiss(){},addListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})},
      PanResponder:{create:handlers=>({panHandlers:handlers})},
      Animated:{View:host('Motion'),Value:class{constructor(value){this.value=value;}setValue(value){this.value=value;}stopAnimation(){}interpolate(){return this;}},
        timing:(value,config)=>({start(callback){value.setValue(config.toValue);callback?.({finished:true});},stop(){}})}},
    'react-native-safe-area-context':{SafeAreaView:host('SafeArea'),useSafeAreaInsets:()=>({top:24,bottom:20})},
    'react-native-svg':{__esModule:true,default:host('Svg'),G:host('G'),Path:host('Path')},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:host('SheetScroll'),TouchableOpacity:host('Button')},
    '@expo/vector-icons':{Ionicons:host('Icon')},
    './ArrivalBanner':require('./helpers/arrival-banner-mock.cjs'),'./MotionPressable':host('Button'),'./AppText':{Text:host('Text')},'./ProgressRing':host('Ring'),
    './AppHeader':host('Header'),'./AppSheet':host('Sheet'),'./SheetConfirmation':host('Confirm'),
    './SessionCountdown':host('Countdown'),'./session/SessionBackdrop':host('Backdrop'),'./FocusLengthControl':host('Length'),'./FocusDurationSheet':host('DurationSheet'),
    './adventurer/ItemArt':host('Art'),'./adventurer/ProfilePicture':host('Picture'),
    './rewards/RevealScreens':{ExpeditionReveal:host('Expedition'),PackReveal:host('Pack')},'./session/SessionReveal':host('SessionReveal'),
    '../hooks/useReducedMotion':{useReducedMotion:()=>false},'../utils/afterTransition':{afterTransition:()=>()=>{}},
    '../utils/sessionTransition':{traceSession(){}},'../utils/tapHaptics':{tapHaptic(){}},
  };
  const Presenter=load('src/components/GlobalRewardListener.tsx',mocks,cache).default;
  const Screen=load('src/components/SessionScreen.tsx',mocks,cache).default;
  const store=load('src/hooks/useRewards.ts',mocks,cache).rewardsStore;
  const Tree=()=>React.createElement(React.Fragment,null,pathname==='/session'&&React.createElement(Screen),React.createElement(Presenter));
  let renderer;await act(async()=>{renderer=create(React.createElement(Tree));});
  const update=async(changes={},nextProfile)=>{timer={...timer,...changes};if(nextProfile)profile={...profile,...nextProfile};await act(async()=>renderer.update(React.createElement(Tree)));};
  return{calls,claims:()=>claims,given:()=>given,store,update,root:()=>renderer.root,path:()=>pathname,
    modal:()=>renderer.root.findByProps({testID:'reward-moment'}),
    cleanup:async()=>act(async()=>renderer.unmount())};
}

for(const[label,options]of[['quick claim',{}],['claim slower than the walk',{claimDelay:2500}],['with finds',{finds:[{item:'tie',rarity:'common',new:true,stardust:0}]}]])
test(`after a session: walk back, the result card, then the finds and the trail (${label})`,async t=>{
  const ui=await setup(options);
  try{
    // The time is up and the server confirms it.
    await ui.update({hasOpenSession:false,isRunning:false,isCompleted:true,timeLeft:0,
      sessionSummary:{sessionId:'S1',durationSeconds:60,xpEarned:1,recovered:false,creditVersion:1,areaXpEarned:1,completedAtMs:Date.now()}},{current_xp:6});
    const backdrop=ui.root().findByType('Backdrop');
    assert.equal(backdrop.props.returning,true,'the walk back plays');
    await act(async()=>backdrop.props.onReturnEnd());
    await wait((options.claimDelay??0)+50);
    const result=ui.root().findByType('Result');
    assert.equal(result.props.visible,true,'the result card shows after the walk');
    assert.equal(ui.modal().props.visible,false,'the reveal waits for the card');
    await act(async()=>result.props.onClose());
    await act(async()=>result.props.onDismiss?.());
    await wait(600+(options.claimDelay??0)*2);
    assert.equal(ui.given(),true,'the session was claimed');
    // It shows on the session screen itself, never as a pop-up that something else could hold back.
    const shown=ui.root().findAllByType('SessionReveal');
    assert.equal(shown.length,1,'the finds / trail screen shows after Done');
    assert.equal(shown[0].props.reveal.finds.length,(options.finds??[]).length);
    assert.equal(shown[0].props.reveal.trail.seconds,60,'the trail walks to the new position');
    assert.equal(ui.modal().props.visible,false,'no second copy as a pop-up');
    assert.deepEqual(ui.calls.filter(c=>c==='route-close'),[],'the session waits while you look');
    t.mock.timers.enable({apis:['setTimeout']});
    await act(async()=>t.mock.timers.tick(30000));
    t.mock.timers.reset();
    assert.deepEqual(ui.calls.filter(c=>c==='route-close'),[],'however long you look: it never leaves under you');
    assert.equal(ui.root().findAllByType('SessionReveal').length,1);
    await act(async()=>shown[0].props.onClose());
    await wait(50);
    assert.deepEqual(ui.calls.filter(c=>c==='route-close'),['route-close'],'Continue on the trail leaves the session');
    assert.equal(ui.store.snapshot('owner').reveals.length,0);
    await wait(600);
    assert.equal(ui.modal().props.visible,false,'and it does not show again on Home');
  }finally{await ui.cleanup();}
});

test('reward pop-ups leave a session return screen to the session screen, and show it on Home if it arrives after you left',async()=>{
  const cache=new Map();let reveals=[{id:'return:S1',kind:'expedition',seconds:60,finds:[],stardust:0}];
  const rewards=()=>({owner:'owner',admissionEpoch:1,online:false,busy:false,reveals,moments:[],today:{seconds:60,finds:0},trail:{findSeconds:1500,stops:6,complete:false},
    nextFindSeconds:1440,look:{},equipped:{},background:'bg_dusk',frame:null,claimSessions:async()=>({ok:true,value:{sessions:[]}}),dismissReveal(){},dismissMoment(){}});
  const mocks={
    'react-native':{Modal:host('Modal'),View:host('View'),AppState:{currentState:'active',addEventListener:()=>({remove(){}})},StyleSheet:{create:v=>v},Animated:{},Easing:{}},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'expo-router':{usePathname:()=>'/session',useRouter:()=>({push(){}})},
    'react-native-svg':{__esModule:true,default:host('Svg'),G:host('G'),Path:host('Path')},
    './MotionPressable':host('Press'),'./AppText':{Text:host('Text')},'./adventurer/ItemArt':host('Art'),'./adventurer/ProfilePicture':host('Picture'),
    '../context/UserContext':{useUser:()=>({profile:{id:'owner',level:1,current_xp:0,streak_count:0}})},'../hooks/useRewards':{useRewards:()=>rewards()},
    '../hooks/useReducedMotion':{useReducedMotion:()=>true},'../services/launchIntroState':{launchIntroState:{subscribe:()=>()=>{},isDone:()=>true}},
    '../utils/sheetActivity':{registerSheetActivity:()=>()=>{},useActiveSheetCount:()=>0},'../utils/tapHaptics':{tapHaptic(){}},
    './rewards/RevealScreens':{ExpeditionReveal:host('Expedition'),PackReveal:host('Pack')},'./rewards/rarity':{RARITY_COLOR:{}},
  };
  const Moments=load('src/components/RewardMoments.tsx',mocks,cache).default;
  let ui;const render=props=>act(async()=>{if(ui)ui.update(React.createElement(Moments,props));else ui=create(React.createElement(Moments,props));});
  try{
    await render({insideSession:false,sessionRoute:true});await wait(500);
    assert.equal(ui.root.findByProps({testID:'reward-moment'}).props.visible,false,'the session screen shows it, not a pop-up');
    const host=load('src/services/sessionReturn.ts',mocks,cache).sessionRevealHost;
    let release;await act(async()=>{release=host.hold('return:S1');});
    await render({insideSession:false,sessionRoute:false});await wait(500);
    assert.equal(ui.root.findByProps({testID:'reward-moment'}).props.visible,false,'Outfits opened from the session return screen: no second copy on top');
    await act(async()=>release());await wait(500);
    assert.equal(ui.root.findByProps({testID:'reward-moment'}).props.visible,true,'arriving after you left: it shows on Home');
    assert.equal(ui.root.findAllByType('Expedition').length,1);
    reveals=[{id:'pack:1',kind:'pack',tier:1,daysInARow:1,items:[],stardust:5}];
    await render({insideSession:false,sessionRoute:true});await wait(500);
    assert.equal(ui.root.findAllByType('Pack').length,1,'other reward screens are unchanged');
  }finally{await act(async()=>ui.unmount());}
});

test('the session return screen is the real finds-and-trail screen, with your look, and Outfits opens on top of it',async()=>{
  const pushes=[];
  const mocks={
    'react-native':{Animated:{View:host('Motion'),Value:class{constructor(v){this.v=v;}setValue(v){this.v=v;}},timing:()=>({start(){},stop(){}})},Easing:{out:v=>v,quad:0},StyleSheet:{create:v=>v,absoluteFill:{}}},
    'expo-router':{useRouter:()=>({push:route=>pushes.push(route)})},
    '../rewards/RevealScreens':{ExpeditionReveal:host('Expedition')},
    '../../hooks/useRewards':{useRewards:()=>({look:{hair:'short'},equipped:{pet:'pet_fox'},background:'bg_forest',frame:null,today:{seconds:60,finds:0},nextFindSeconds:1440,trail:{findSeconds:1800,stops:4,complete:false}})},
    '../../context/UserContext':{useUser:()=>({profile:{level:12}})},'../../hooks/useReducedMotion':{useReducedMotion:()=>false},
  };
  const Reveal=load('src/components/session/SessionReveal.tsx',mocks,new Map()).default;
  const reveal={id:'return:S1',kind:'expedition',seconds:60,finds:[],stardust:0};let closed=0;
  let ui;await act(async()=>{ui=create(React.createElement(Reveal,{reveal,onClose:()=>closed++}));});
  try{
    const screen=ui.root.findByType('Expedition');
    assert.equal(screen.props.reveal,reveal);
    assert.deepEqual([screen.props.player.level,screen.props.player.equipped.pet,screen.props.player.trail.stops],[12,'pet_fox',4]);
    screen.props.onOutfits('tie');assert.deepEqual(pushes,[{pathname:'/outfits',params:{show:'tie'}}]);
    screen.props.onClose();assert.equal(closed,1);
  }finally{await act(async()=>ui.unmount());}
});
