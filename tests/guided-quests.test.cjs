const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
const selectedCustomDuration = ui => ui.tree.root.findAllByType('Button').find(node => node.props.testID === 'focus-duration-chip' || node.props.accessibilityLabel === 'Set a custom focus duration').props.accessibilityValue.text;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename,module);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    // Home's quiet tab preloads are covered by the Progress and Profile tests.
    if(name.endsWith('/hooks/useCharacterData'))return{prefetchCharacterData(){}};
    if(name.endsWith('/hooks/useProgressData'))return{prefetchProgress(){}};
    if(name.endsWith('/SessionProtectionControl')) return Object.assign(()=>null,{ProtectionSettingsSheet:()=>null});
    if(name.endsWith('/SessionProtectionContext')) return {SessionProtectionProvider:props=>props.children};
    if(name.endsWith('/SavedRoutinesCard'))return host('SavedRoutinesCard');
    if(name.endsWith('/AuthContext'))return {useAuth:()=>({accessMode:'online'})};
    if(name.endsWith("/LevelTierSheet"))return props=>React.createElement("TierSheet",props);
      if (name.endsWith("/FeatureTour")) return {FeatureTourProvider: props=>props.children, TourAnchor: props=>props.children, TourScrollView: mocks["react-native"]?.ScrollView || (props=>React.createElement("ScrollView",props,props.children)), useFeatureTour:()=>({start(){}}), prepareFeatureTour:async()=>{}};
      if (name.endsWith("/DailyGoalSheet")) return props=>React.createElement("GoalSheet",props);
    if(name.endsWith("/OnboardingFrame"))return require("./onboarding-mocks.cjs").frame(React);
    if(name.endsWith("/OnboardingFinish"))return require("./onboarding-mocks.cjs").finish(React);
      if (name.endsWith("/OnboardingWelcome")) return require("./onboarding-mocks.cjs").finish(React);
    if(name.endsWith('/MotionPressable'))return host('Button');
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name);
    const ext=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
  },module,module.exports);
  return module.exports;
}
const Native = { View:host('View'), ScrollView:host('Scroll'), KeyboardAvoidingView:host('KeyboardArea'), Keyboard:{dismiss(){}}, StyleSheet:{create:s=>s,hairlineWidth:0.5}, Platform:{OS:'android'} };
function storage() { const values=new Map(); return {values,api:{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{values.set(key,value);}}}; }
function mocks(extra={}) {return {
  '@react-native-async-storage/async-storage':storage().api,
  'react-native':Native,
  'expo-haptics':{selectionAsync:async()=>{}},
  '../context/UserContext':{useUser:()=>({hapticsEnabled:false})},
  '../context/QuestContext':{useQuests:()=>({subjects:[{id:2,title:'Learning',color_code:null}]})},
  '../hooks/useSavedRoutines':{useSavedRoutines:()=>({ready:true,scope:{backendId:'fixture',ownerId:extra['../context/UserContext']?.useUser?.().profile?.id??'owner'},routines:[],save:async()=>true})},
  '../services/notificationPermissionService':{readNotificationPermission:async()=>({label:'Allowed',action:'settings',supported:true,granted:true}),enableNotifications:async()=>({granted:true}),openNotificationSettings:async()=>{}},
  '@expo/vector-icons':{Ionicons:host('Icon')},
  '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},
  'react-native-safe-area-context':{SafeAreaView:host('SafeArea'),useSafeAreaInsets:()=>({bottom:24,top:24})},
  './AppText':{Text:host('Text'),TextInput:host('Input')},'../components/AppText':{Text:host('Text'),TextInput:host('Input')},
  './ContentReveal':props=>props.children,
  './SheetConfirmation':host('Confirm'),
  './SlidingSelection':host('Selection'),
  './AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children,props.footer):null,
  './PersonalUI':{p:{button:{},secondaryButton:{},rowTitle:{},caption:{},error:{},title:{},body:{}}},
  '../components/PersonalUI':{p:{},PersonalButton:props=>React.createElement('Button',{...props},props.title)},
  '../components/CharacterPortrait':host('Portrait'),
  ...extra,
};}
async function render(Component,props={}) {let tree;await act(async()=>{tree=create(React.createElement(Component,props));});return{
 tree,press:async label=>{
 const find=value=>tree.root.findAllByType('Button').find(node=>text(node)===value||node.props.accessibilityLabel===value);
 const chip=()=>tree.root.findAllByType('Button').find(node=>node.props.testID==='focus-duration-chip');
 if(/^Use (30|60) minutes$/.test(label)&&!find(label)){
  await act(async()=>chip().props.onPress());
  await act(async()=>find('Set duration to '+label.split(' ')[1]+' minutes').props.onPress());
  await act(async()=>find('Use this duration').props.onPress());return;
 }
 await act(async()=>{const button=find(label)||(label==='Set a custom focus duration'?chip():null);assert.ok(button,`Missing ${label}`);assert.notEqual(button.props.disabled,true,`${label} disabled`);await button.props.onPress();});
},
 update:async props=>act(async()=>tree.update(React.createElement(Component,props))),cleanup:async()=>act(async()=>tree.unmount())};}

test('curated focus blocks support uninterrupted focus and a shorter option',()=>{
 const api=load('src/constants/guidedQuests.ts');
 assert.equal(new Set(api.STARTER_QUESTS.map(task=>task.id)).size,api.STARTER_QUESTS.length);
 for(const task of api.STARTER_QUESTS){const full=api.suggestedFocus(task.id),small=api.suggestedFocus(task.id,true);assert.equal(full.seconds,1800);assert.equal(small.seconds,600);assert.notEqual(small.instruction,full.instruction);assert.notEqual(small.title,full.title);assert.equal(api.readSuggestedFocus(api.encodeSuggestedFocus(small)).title,small.title);}
});
test('metadata preserves wording, rejects corrupt or unknown payloads and never interprets ordinary notes',()=>{
 const api=load('src/constants/guidedQuests.ts');
 const focus={...api.suggestedFocus('review-topic'),title:'Original saved wording',instruction:'Original saved instruction'};
 assert.deepEqual(api.readSuggestedFocus(api.encodeSuggestedFocus(focus)),focus);
 for(const value of [null,'normal notes','liferpg:suggested:v1:{','liferpg:suggested:v1:{"id":"missing","smaller":false}','liferpg:suggested:v1:{"id":"review-topic","smaller":"yes"}'])assert.equal(api.readSuggestedFocus(value),null);
});
test('preferences stay scoped to each account and corrupt stored data fails to free focus',async()=>{
 const db=storage(),api=load('src/services/guidedPreferenceService.ts',{'@react-native-async-storage/async-storage':db.api});
 await Promise.all([api.guidedPreferenceStore.load('alice'),api.guidedPreferenceStore.load('bob')]);
 const value={...api.DEFAULT_GUIDED_PREFERENCE,enabled:true,invited:true};
 assert.equal(await api.guidedPreferenceStore.save('alice',value),true);
 assert.equal(api.guidedPreferenceStore.snapshot('alice').value.enabled,true);
 assert.equal(api.guidedPreferenceStore.snapshot('bob').value.enabled,false);
 assert.deepEqual(api.parseGuidedPreference('{broken'),api.DEFAULT_GUIDED_PREFERENCE);
 assert.deepEqual(api.parseGuidedPreference(JSON.stringify({...value,need:'practice'})),api.DEFAULT_GUIDED_PREFERENCE);
 assert.equal(db.values.size,1);
});
test('failed preference writes retain the last choice and concurrent writes cannot overwrite it',async()=>{
 const pending=deferred();let writes=0;
 const api=load('src/services/guidedPreferenceService.ts',{'@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:()=>{writes++;return pending.promise;}}});
 await api.guidedPreferenceStore.load('owner');
 const first=api.guidedPreferenceStore.save('owner',{...api.DEFAULT_GUIDED_PREFERENCE,enabled:true});
 assert.equal(await api.guidedPreferenceStore.save('owner',{...api.DEFAULT_GUIDED_PREFERENCE,invited:true}),false);
 pending.reject(Error('disk full'));assert.equal(await first,false);
 assert.equal(writes,1);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.enabled,false);assert.equal(api.guidedPreferenceStore.snapshot('owner').error,true);
});
test('storage read failure is retryable and cannot silently overwrite unknown preferences',async()=>{
 let reads=0;const saved={version:1,enabled:true,invited:true,need:'practice',templateId:'practice-question',smaller:false};
 const api=load('src/services/guidedPreferenceService.ts',{'@react-native-async-storage/async-storage':{getItem:async()=>{if(++reads===1)throw Error('disk');return JSON.stringify(saved);},setItem:async()=>{}}});
 await api.guidedPreferenceStore.load('owner');assert.equal(api.guidedPreferenceStore.snapshot('owner').ready,false);
 assert.equal(await api.guidedPreferenceStore.save('owner',saved),false);
 await api.guidedPreferenceStore.load('owner');assert.deepEqual(api.guidedPreferenceStore.snapshot('owner').value,saved);
});
async function setTenMinuteCustom(ui) {
 await ui.press('Set a custom focus duration');
 await act(async()=>{ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Focus minutes').props.onChangeText('10');ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Focus seconds').props.onChangeText('0');});
 await ui.press('Use this duration');
}
function preferenceMock(overrides={}) { const initial={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false,...overrides};return()=>{const[value,setValue]=React.useState(initial);return{ready:true,error:false,busy:false,value,save:async next=>{setValue(next);return true;}}}; }

test('Home starter makes the task smaller and starts once with its title, instruction and area',async()=>{
 const pending=deferred(),calls=[];const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},
  '../context/TimerContext':{useTimer:()=>({startSuggestedTimer:(focus,area)=>{calls.push({focus,area});return pending.promise;}})},
 })).default;
 let opened=0;const props={owner:'owner',subjects:[{id:1,title:'General'},{id:2,title:'Knowledge'}],disabled:false,onStarted:()=>opened++,onFree(){},onQuest(){},onPreferences(){}};
 const ui=await render(Card,props);await setTenMinuteCustom(ui);assert.match(text(ui.tree.root),/A short review/);
 await ui.press('Use 30 minutes');assert.match(text(ui.tree.root),/Review your notes/);assert.doesNotMatch(text(ui.tree.root),/A short review/);
 await setTenMinuteCustom(ui);assert.match(text(ui.tree.root),/A short review/);
 await act(async()=>{const button=ui.tree.root.findAllByType('Button').find(n=>n.props.testID==='guided-start');void button.props.onPress();void button.props.onPress();});
 assert.equal(calls.length,1);assert.equal(calls[0].focus.seconds,600);assert.equal(calls[0].area,2);assert.equal(opened,1);
 await act(async()=>pending.resolve(true));assert.equal(opened,1);await ui.cleanup();
});
test('suggested focus uses its selected block and falls back to General when Knowledge is missing',async()=>{
 const calls=[];const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock({need:'practice',templateId:'practice-question'})},
  '../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async(focus,area)=>{calls.push([focus.templateId,area,focus.seconds]);return true;}})},
 })).default;
 const ui=await render(Card,{owner:'owner',subjects:[{id:1,title:'General'}],disabled:false,onStarted(){},onFree(){},onPreferences(){}});
 assert.match(text(ui.tree.root),/Suggested: Practise questions/);
 assert.equal(ui.tree.root.findAllByType('Button').some(b=>['Choose another','Free focus','Change suggestion preferences'].includes(b.props.accessibilityLabel)),false);
 await ui.press('Set a custom focus duration');
 assert.equal(ui.tree.root.findByType('Sheet').props.motionMode,'timed');
 const fields=ui.tree.root.findAllByType('Input');
 await act(async()=>{fields.find(n=>n.props.accessibilityLabel==='Focus minutes').props.onChangeText('45');fields.find(n=>n.props.accessibilityLabel==='Focus seconds').props.onChangeText('17');});
 await ui.press('Use this duration');
 assert.match(text(ui.tree.root),/Practise questions/);assert.doesNotMatch(text(ui.tree.root),/My assignment/);
 await ui.press('Start session');assert.deepEqual(calls,[['practice-question',1,2717]]);await ui.cleanup();
});
test('guided start opens immediately and retains its exact choice when the background start fails',async()=>{
 const calls=[];let opened=0;const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},
  '../context/TimerContext':{useTimer:()=>({actionError:'Offline',startSuggestedTimer:async(focus,area)=>{calls.push({focus,area});return calls.length>1;}})},
 })).default;
 const props={owner:'owner',subjects:[],disabled:false,onStarted(){opened++;},onFree(){},onQuest(){},onPreferences(){}};
 const ui=await render(Card,props);
 await ui.press('Set a custom focus duration');
 await act(async()=>{ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Focus minutes').props.onChangeText('45');ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Focus seconds').props.onChangeText('17');});
 await ui.press('Use this duration');
 await ui.press('Start session');assert.equal(calls[0].focus.seconds,2717);assert.equal(opened,1);assert.match(text(ui.tree.root),/Offline/);
 await ui.update({...props,subjects:[{id:2,title:'Knowledge'}]});
 await ui.press('Retry start');assert.deepEqual(calls[0],calls[1]);assert.equal(opened,2);await ui.cleanup();
});
test('new users can choose free focus and retain their badge through the seven-page journey',async()=>{
 const db=storage(),routes=[],calls=[];
 const Screen=load('src/app/onboarding.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  'expo-router':{useRouter:()=>({replace:route=>routes.push(route)})},
  '../context/UserContext':{useUser:()=>({profile:{id:'new-user',username:'Soon',avatar:'🌱',daily_goal_minutes:60},reloadProfile:async()=>true})},
  '../services/onboardingService':{saveOnboardingProfile:async(...args)=>calls.push(args),finishOnboarding:async()=>{}},
 })).default;
 const ui=await render(Screen);assert.doesNotMatch(text(ui.tree.root),/Skip suggestions/);await ui.press('Just let me focus');await ui.press('Continue');await ui.press('Continue');await ui.press('Continue');await ui.press('Continue');
 assert.deepEqual(routes,[]);await ui.press('Previous step');assert.equal(ui.tree.root.findByType('Frame').props.step,4);await ui.press('Continue');await ui.press('Continue');await ui.press('Continue');await ui.press('Start my journey');assert.deepEqual(routes,['/']);assert.equal(calls[0][1],'🌱');assert.equal(JSON.parse(db.values.get('liferpg:guided:v1:new-user')).enabled,false);await ui.cleanup();
});
test('new users can select a work direction before the introduction',async()=>{
 const db=storage();const Screen=load('src/app/onboarding.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,'expo-router':{useRouter:()=>({replace(){}})},
  '../context/UserContext':{useUser:()=>({profile:{id:'student',username:'Soon',avatar:'🌱',daily_goal_minutes:60},reloadProfile:async()=>true})},
  '../services/onboardingService':{saveOnboardingProfile:async()=>{},finishOnboarding:async()=>{}},
 })).default;
 const ui=await render(Screen);await ui.press('Help me choose a focus');await ui.press('Continue');await ui.press('Work & projects');await ui.press('Continue');await ui.press('Continue');await ui.press('Continue');
 assert.equal(db.values.has('liferpg:guided:v1:student'),false);await ui.press('Continue');await ui.press('Continue');await ui.press('Start my journey');const pref=JSON.parse(db.values.get('liferpg:guided:v1:student'));assert.equal(pref.enabled,true);assert.equal(pref.need,'work');assert.equal(pref.templateId,'project-next-step');await ui.cleanup();
});
test('Save as routine opens an editable draft and marks saved only after an explicit successful save',async()=>{
 const db=storage(),calls=[];
 const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic',true);
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  '../context/UserContext':{useUser:()=>({profile:{id:'owner'}})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId:'completed',durationSeconds:60,suggestion:focus}})},
  './RoutineEditorSheet':props=>React.createElement('RoutineEditor',props),
  '../services/taskService':{createTask:params=>{calls.push(params);}},
 })).default;
 const ui=await render(Save,{inSheet:true});await act(async()=>{const button=ui.tree.root.findAllByType('Button')[0];void button.props.onPress();void button.props.onPress();});
 assert.equal(calls.length,0);assert.equal(ui.tree.root.findAllByType('RoutineEditor').length,1);
 const editor=ui.tree.root.findByType('RoutineEditor');
 assert.equal(editor.props.initialName,focus.title);assert.equal(editor.props.initialSeconds,60);assert.equal(editor.props.initialAreaId,2);
 await act(async()=>{editor.props.onSaved({name:focus.title,durationSeconds:60});editor.props.onClose();});
 assert.equal(ui.tree.root.findByType('RoutineEditor').props.visible,false,'editor remains mounted for its closing animation');
 await act(async()=>ui.tree.root.findByType('RoutineEditor').props.onDismiss());
 assert.match(text(ui.tree.root),/Saved to your routines/);assert.equal(ui.tree.root.findAllByType('Button').length,0,'a completed save becomes a status instead of a disabled action');assert.equal(db.values.get('liferpg:saved-suggestion-routine:v1:["fixture","owner","completed"]'),'saved');await ui.cleanup();
});

test('creating a personal quest keeps the suggestion and its Start; the quest remains independently selectable below',async()=>{
 const db=storage(),pending=deferred(),routes=[];
 const quest={id:7,title:'My assignment',target_minutes:45,subject_id:2,is_due_today:true,is_completed:false,is_completed_today:false};
 let homeTasks=[];const setupCalls=[];
 db.values.set('liferpg:guided:v1:owner',JSON.stringify({version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false}));
 const Context=React.createContext(null);
 const Home=load('src/app/(tabs)/index.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  'react-native':{...Native,useWindowDimensions:()=>({height:800,width:390,fontScale:1})},
  '../../components/AppText':{Text:host('Text')},
  'expo-haptics':{},'expo-router':{useRouter:()=>({navigate:route=>routes.push(route)})},
  'expo-router/js-tabs':{useBottomTabBarHeight:()=>90},
  '../../components/GoalRing':host('GoalRing'), '../../components/ProgressRing':host('ProgressRing'),'../../components/CharacterMark':host('Mark'),'../../components/ContentReveal':props=>props.children,'../../components/QuestSheet':host('Quests'),
  '../../context/UserContext':{useUser:()=>({profile:{id:'owner',username:'Soon',level:1,daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
  '../../context/TimerContext':{useTimer:()=>React.useContext(Context)},'../context/TimerContext':{useTimer:()=>React.useContext(Context)},
  '../../context/QuestContext':{useQuests:()=>({tasks:homeTasks,subjects:[{id:2,title:'Knowledge'}],loading:false,refresh:async()=>{}})},
  '../../services/progressService':{getLastFreeSession:async()=>null,getFocusStreak:async()=>0},'../../services/dailyProgressService':{getTodayProgress:async()=>null},'../../hooks/useHomeLifecycle':{useHomeLifecycle:()=>12},
  '../../components/GuidedPreferenceSheet':()=>null,
 })).default;
 const api=load('src/constants/guidedQuests.ts');let starts=0;
 function Harness(){const[state,set]=React.useState({hasOpenSession:false,isRunning:false,actionBusy:false,notes:'',duration:600,timeLeft:600,targetAttributeId:null});return React.createElement(Context.Provider,{value:{...state,setNotes:()=>{},setLinkedTaskId:id=>setupCalls.push(['task',id]),setDurationInMinutes:minutes=>setupCalls.push(['minutes',minutes]),setTargetAttributeId:area=>setupCalls.push(['area',area]),startSuggestedTimer:async(focus,area)=>{starts++;assert.equal(focus.templateId,'review-topic');set({...state,hasOpenSession:true,isRunning:true,notes:api.encodeSuggestedFocus(focus),targetAttributeId:area});return pending.promise;}}},React.createElement(Home));}
 const ui=await render(Harness);
 homeTasks=[quest];await ui.update({});
 const card=()=>ui.tree.root.findAllByType('View').find(node=>node.props.testID==='guided-focus-card');
 assert.match(text(card()),/Suggested: Review your notes/);assert.doesNotMatch(text(card()),/My assignment|Open quest/);
 const routines=ui.tree.root.findByType('SavedRoutinesCard');assert.deepEqual(routines.props.legacyTasks,[quest]);
 await act(async()=>routines.props.onStartLegacy(quest));assert.deepEqual(setupCalls,[['task',7],['minutes',45],['area',2]]);assert.equal(starts,0);assert.deepEqual(routes,['/session']);routes.length=0;
 await act(async()=>{void ui.tree.root.findAllByType('Button').find(n=>n.props.testID==='guided-start').props.onPress();});
 assert.equal(starts,1);assert.equal(ui.tree.root.findAllByType('View').filter(node=>node.props.testID==='guided-focus-card').length,1);assert.deepEqual(routes,['/session']);
 await act(async()=>pending.resolve(true));assert.deepEqual(routes,['/session']);assert.ok(ui.tree.root.findAll(node=>node.props.accessibilityLabel==='Continue session'&&typeof node.props.onPress==='function').length>0);assert.match(text(ui.tree.root),/Session running/);await ui.cleanup();
});

test('an older matching record or old quest receipt cannot mark a newly completed suggestion as a saved routine',async()=>{
 const db=storage();let inserts=0;const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  '../context/UserContext':{useUser:()=>({profile:{id:'save-owner'}})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId:'save-session',suggestion:focus}})},
  '../context/QuestContext':{useQuests:()=>{const[tasks,setTasks]=React.useState([]);return{tasks,upsert(){},refresh:async()=>setTasks([{title:focus.title,subject_id:2,target_minutes:30,is_completed:false}])};}},
  '../services/taskService':{createTask:async()=>{inserts++;throw Error('response lost');}},
  './RoutineEditorSheet':props=>React.createElement('RoutineEditor',props),
 })).default;
 db.values.set('liferpg:saved-suggestion:save-owner:save-session','saved');
 const ui=await render(Save,{inSheet:true});assert.doesNotMatch(text(ui.tree.root),/Saved to your routines/);
 await ui.press('Save as routine');assert.equal(inserts,0);assert.doesNotMatch(text(ui.tree.root),/Saved to your routines/);
 await act(async()=>ui.tree.root.findByType('RoutineEditor').props.onClose());
 await act(async()=>ui.tree.root.findByType('RoutineEditor').props.onDismiss());
 assert.equal(inserts,0);assert.equal(db.values.size,1);assert.match(text(ui.tree.root),/Save as routine/);await ui.cleanup();
});

test('free and linked quest completions do not offer Save as routine',async()=>{
 for(const summary of [{sessionId:'free',durationSeconds:60},{sessionId:'quest',durationSeconds:60,questTitle:'Already completed'}]) {
  const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
   '@react-native-async-storage/async-storage':storage().api,
   '../context/UserContext':{useUser:()=>({profile:{id:'owner'}})},
   '../context/TimerContext':{useTimer:()=>({sessionSummary:summary,targetAttributeId:2})},
   './RoutineEditorSheet':host('RoutineEditor'),
  })).default;
  const ui=await render(Save,{inSheet:true});
  assert.equal(ui.tree.root.findAllByType('Button').length,0);assert.equal(ui.tree.root.findAllByType('RoutineEditor').length,0);
  await ui.cleanup();
 }
});

test('routine prefill uses accepted completed duration and preserves extra seconds exactly',async()=>{
 const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':storage().api,
  '../context/UserContext':{useUser:()=>({profile:{id:'owner'}})},
  '../context/TimerContext':{useTimer:()=>({duration:1800,targetAttributeId:2,sessionSummary:{sessionId:'short',durationSeconds:90,suggestion:focus}})},
  './RoutineEditorSheet':host('RoutineEditor'),
 })).default;
 const ui=await render(Save,{inSheet:true});await ui.press('Save as routine');
 const editor=ui.tree.root.findByType('RoutineEditor');
 assert.equal(editor.props.initialSeconds,90);assert.equal(editor.props.initialAreaId,2);assert.equal(editor.props.initialName,focus.title);
 await ui.cleanup();
});

test('a held completion keeps its original routine draft after live timer fields clear during dismissal',async()=>{
 const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 let timer={targetAttributeId:8,sessionSummary:null};
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':storage().api,
  '../context/UserContext':{useUser:()=>({profile:{id:'owner'}})},
  '../context/TimerContext':{useTimer:()=>timer},'./RoutineEditorSheet':host('RoutineEditor'),
 })).default;
 const completion={ownerId:'owner',sessionId:'original-result',suggestion:focus,durationSeconds:60,targetAttributeId:null};
 const ui=await render(Save,{inSheet:true,completion});
 try {
  timer={targetAttributeId:9,duration:1800,sessionSummary:null};await ui.update({inSheet:true,completion});
  await ui.press('Save as routine');const editor=ui.tree.root.findByType('RoutineEditor');
  assert.equal(editor.props.initialSeconds,60);assert.equal(editor.props.initialAreaId,null);
  assert.equal(editor.props.initialName,focus.title);
 }finally{await ui.cleanup();}
});

test('a late saved callback cannot mark another owner or session as saved',async()=>{
 const db=storage(),focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 let owner='first',sessionId='old';
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  '../context/UserContext':{useUser:()=>({profile:{id:owner}})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId,durationSeconds:60,suggestion:focus}})},
  './RoutineEditorSheet':host('RoutineEditor'),
 })).default;
 const ui=await render(Save,{inSheet:true});await ui.press('Save as routine');
 const lateCreated=ui.tree.root.findByType('RoutineEditor').props.onSaved;
 owner='second';sessionId='new';await ui.update({inSheet:true});
 assert.equal(ui.tree.root.findAllByType('RoutineEditor').length,0);
 await act(async()=>lateCreated({id:9}));
 assert.doesNotMatch(text(ui.tree.root),/Saved to your routines/);assert.equal(db.values.size,0);
 await ui.press('Save as routine');const secondCreated=ui.tree.root.findByType('RoutineEditor').props.onSaved;
 sessionId='newer';await ui.update({inSheet:true});await act(async()=>secondCreated({id:10}));
 assert.equal(ui.tree.root.findAllByType('RoutineEditor').length,0);assert.equal(db.values.size,0);
 await ui.cleanup();
});

test('the completed-suggestion action uses the real routine editor and waits for explicit Save routine',async()=>{
 const db=storage(),focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 const pending=deferred(),saves=[],creates=[];
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  'react-native':{...Native,Switch:host('Switch')},
  '../context/UserContext':{useUser:()=>({profile:{id:'owner'},hapticsEnabled:false})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId:'real-editor',durationSeconds:75,suggestion:focus}})},
  '../hooks/useSavedRoutines':{useSavedRoutines:()=>({ready:true,scope:{backendId:'fixture',ownerId:'owner'},save:(draft,id)=>{saves.push([draft,id]);return pending.promise;}})},
  '../services/taskService':{createTask:params=>{creates.push(params);throw Error('Must not create a task');}},
  './FocusLengthControl':host('Duration'),
  './AppSheet':function Sheet(props){
   React.useEffect(()=>{if(!props.visible&&props.label==='routine editor')props.onDismiss?.();},[props.visible]);
   return props.visible?React.createElement('Sheet',props,props.header,props.children,props.footer,props.overlay):null;
  },
 })).default;
 const ui=await render(Save,{inSheet:true});
 try {
  assert.equal(saves.length,0);assert.doesNotMatch(text(ui.tree.root),/Saved to your routines/);
  await ui.press('Save as routine');assert.equal(ui.tree.root.findAllByType('Sheet').length,1);
  assert.equal(ui.tree.root.findByType('Sheet').props.label,'routine editor');
  const field=label=>ui.tree.root.findAllByType('Input').find(node=>node.props.accessibilityLabel===label);
  assert.equal(field('Routine name').props.value,focus.title);assert.equal(ui.tree.root.findByType('Duration').props.seconds,75);
  await act(async()=>ui.tree.root.findByType('Sheet').props.onRequestClose());
  assert.equal(saves.length,0);assert.equal(ui.tree.root.findAllByType('Sheet').length,0);
  await ui.press('Save as routine');
  await act(async()=>{field('Routine name').props.onChangeText('My next review');ui.tree.root.findByType('Duration').props.onChange(300);});
  await act(async()=>{ui.tree.root.findAllByType('Button').find(node=>text(node)==='Save routine').props.onPress();});
  assert.deepEqual(saves,[[{name:'My next review',durationSeconds:300,focusAreaId:2,reminder:{enabled:false,hour:18,minute:0}},undefined]]);
  assert.equal(creates.length,0);assert.doesNotMatch(text(ui.tree.root),/Saved to your routines/);
  await act(async()=>pending.resolve(true));
  assert.equal(ui.tree.root.findAllByType('Sheet').length,0);
  assert.match(text(ui.tree.root),/Saved to your routines/);assert.equal(db.values.get('liferpg:saved-suggestion-routine:v1:["fixture","owner","real-editor"]'),'saved');
 } finally {await ui.cleanup();}
});

test('preference Save remains in a safe-area footer outside the scrolling choices and saves the selected need',async()=>{
 let value={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false},saved=null,closed=0;
 const Sheet=load('src/components/GuidedPreferenceSheet.tsx',mocks({
  './AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children,React.createElement('Footer',null,props.footer)):null,
  '../hooks/useGuidedPreference':{useGuidedPreference:()=>({value,ready:true,error:false,busy:false,save:async next=>{saved=next;return true;}})},
 })).default;
 const ui=await render(Sheet,{owner:'owner',visible:true,onClose:()=>closed++});
 const scroll=ui.tree.root.findByType('Scroll');assert.equal(scroll.props.enableFooterMarginAdjustment,true);assert.equal(scroll.props.showsVerticalScrollIndicator,true);
 assert.equal(scroll.findAllByType('Button').some(button=>text(button)==='Save preferences'),false);
 const footer=ui.tree.root.findByType('Footer');assert.equal(footer.findAllByType('Button').filter(button=>button.props.testID==='save-guided-preferences').length,1);
 assert.equal(footer.findByType('View').props.style.paddingBottom,36);
 await ui.press('Practise what you’re learning');await ui.press('Save preferences');assert.equal(saved.need,'practice');assert.equal(saved.templateId,'practice-question');assert.equal(closed,1);await ui.cleanup();
});

test('preference save failure keeps the draft and footer available for retry',async()=>{
 let attempts=0,closed=0;const initial={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const Sheet=load('src/components/GuidedPreferenceSheet.tsx',mocks({
  './AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children,React.createElement('Footer',null,props.footer)):null,
  '../hooks/useGuidedPreference':{useGuidedPreference:()=>{const[error,setError]=React.useState(false);return{value:initial,ready:true,error,busy:false,save:async next=>{assert.equal(next.need,'assignments');if(++attempts===1){setError(true);return false;}return true;}};}},
 })).default;
 const ui=await render(Sheet,{owner:'owner',visible:true,onClose:()=>closed++});await ui.press('Move an assignment forward');await ui.press('Save preferences');assert.equal(closed,0);assert.match(text(ui.tree.root),/Couldn’t save or load/);await ui.press('Save preferences');assert.equal(closed,1);assert.equal(attempts,2);await ui.cleanup();
});


test('legacy preferences map to work blocks while historical session snapshots retain their wording and duration',()=>{
 const api=load('src/constants/guidedQuests.ts');
 const prefs=load('src/services/guidedPreferenceService.ts',{'@react-native-async-storage/async-storage':storage().api});
 const pref=prefs.parseGuidedPreference(JSON.stringify({version:1,enabled:true,invited:true,need:'practice',templateId:'retry-mistake',smaller:true}));
 assert.equal(pref.templateId,'practice-question');assert.equal(pref.smaller,false);
 const old={templateId:'retry-mistake',need:'practice',title:'Retry a question you missed',instruction:'Try again.',seconds:300,smaller:true};
 assert.deepEqual(api.readSuggestedFocus(api.encodeSuggestedFocus(old)),old);
});

test('choosing a preset or custom duration never rewrites the saved suggestion default',async()=>{
 let saves=0;const initial={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:()=>({value:initial,ready:true,error:false,busy:false,save:async()=>{saves++;return true;}})},
  '../context/TimerContext':{useTimer:()=>({})},
 })).default;
 const props={owner:'owner',subjects:[],disabled:false,onStarted(){},onFree(){},onQuest(){},onPreferences(){}};
 let ui=await render(Card,props);await setTenMinuteCustom(ui);
 assert.match(text(ui.tree.root),/A short review/);
 await ui.press('Set a custom focus duration');
 await act(async()=>{ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel==='Focus minutes').props.onChangeText('42');});
 await ui.press('Use this duration');assert.equal(selectedCustomDuration(ui),'42 min');assert.equal(saves,0);assert.equal(initial.templateId,'review-topic');
 await ui.cleanup();ui=await render(Card,props);assert.match(text(ui.tree.root),/Review your notes/);await ui.cleanup();
});

test('Home keeps the compact layout across accounts, free/study choices, and preference loading failures',async()=>{
 let state={ready:false,error:false,value:{enabled:false,invited:true}},owner='loading';
 const Home=load('src/app/(tabs)/index.tsx',mocks({
  'react-native':{...Native,useWindowDimensions:()=>({height:800,width:390,fontScale:1})},
  '../../components/AppText':{Text:host('Text')},'expo-haptics':{},'expo-router':{useRouter:()=>({navigate(){}})},
  'expo-router/js-tabs':{useBottomTabBarHeight:()=>90},
  '../../components/GoalRing':host('OldRing'), '../../components/ProgressRing':host('ProgressRing'),'../../components/CharacterMark':host('Mark'),'../../components/ContentReveal':props=>props.children,'../../components/QuestSheet':host('Quests'),
  '../../components/GuidedFocusCard':props=>React.createElement('GuidedCard',props,props.goal,React.createElement('Button',{accessibilityLabel:'Change focus direction',onPress:props.onPreferences},'Change')),
  '../../components/GuidedPreferenceSheet':props=>props.visible?React.createElement('Preferences',props):null,
  '../../hooks/useGuidedPreference':{useGuidedPreference:()=>({...state,retry(){},save:async()=>true})},
  '../../context/UserContext':{useUser:()=>({profile:{id:owner,username:'Soon',daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
  '../../context/TimerContext':{useTimer:()=>({duration:1800,timeLeft:1800,hasOpenSession:false})},
  '../../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[],loading:false,refresh:async()=>{}})},
  '../../services/progressService':{getLastFreeSession:async()=>null,getFocusStreak:async()=>0},'../../services/dailyProgressService':{getTodayProgress:async()=>null},'../../hooks/useHomeLifecycle':{useHomeLifecycle:()=>12},
 })).default;
 const ui=await render(Home);
 try {
  for(const[account,ready,enabled,error]of[['loading',false,false,false],['free-account',true,false,false],['study-account',true,true,false],['failed-read',false,false,true]]){
   owner=account;state={ready,error,value:{enabled,invited:true}};await ui.update({});
   assert.equal(ui.tree.root.findAllByType('OldRing').length,0);
   assert.equal(ui.tree.root.findAllByType('View').filter(node=>node.props.testID==='home-compact-goal').length,1);
   assert.equal(ui.tree.root.findAllByType('GuidedCard').length,ready&&enabled?1:0);
   assert.equal(ui.tree.root.findAllByType('View').filter(node=>node.props.testID==='home-preference-loading').length,ready?0:1);
   assert.equal(ui.tree.root.findAllByType('Button').filter(node=>node.props.accessibilityLabel==='Change focus direction').length,1);
   assert.equal(ui.tree.root.findAll(node=>node.props.testID==='home-next-step').length,0);
   const routines=ui.tree.root.findAllByType('SavedRoutinesCard');assert.equal(routines.length,1);assert.equal(routines[0].props.active,true);
   await ui.press('Change focus direction');assert.equal(ui.tree.root.findByType('Preferences').props.owner,account);
   await act(async()=>ui.tree.root.findByType('Preferences').props.onClose());
  }
  assert.match(text(ui.tree.root),/Retry loading preferences/);
 }finally{await ui.cleanup();}
});

test('both idle focus modes open preferences in the card without starting or changing the selected session',async()=>{
 const calls=[],shared=mocks({'../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},'../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async(...args)=>calls.push(['start',...args])})}});
 const Free=load('src/components/FreeFocusCard.tsx',shared).default,Guided=load('src/components/GuidedFocusCard.tsx',shared).default;
 const free=await render(Free,{seconds:2717,area:'Work & projects',areaId:3,tint:'#fff',active:false,running:false,starting:false,disabled:false,changeDisabled:false,restoring:false,failed:false,onChange:id=>calls.push(['area',id]),onStart:()=>calls.push(['free']),onDuration:seconds=>calls.push(['duration',seconds]),onPreferences:()=>calls.push(['preferences','free'])});
 const guided=await render(Guided,{owner:'owner',subjects:[{id:2,title:'Learning'}],selectedSeconds:2717,disabled:false,onStarted:()=>calls.push(['entered']),onPreferences:()=>calls.push(['preferences','guided'])});
 try {
  for(const ui of [free,guided]){
   const change=ui.tree.root.findAllByType('Button').find(node=>node.props.testID==='focus-card-preferences');
   assert.equal(change.props.accessibilityRole,'button');assert.equal(change.props.accessibilityState.disabled,false);assert.equal(Object.assign({},...change.props.style.filter(Boolean)).minHeight,44);
   await ui.press('Change focus direction');assert.equal(selectedCustomDuration(ui),'45 min 17 sec');
  }
  const suggestion=guided.tree.root.findAllByType('View').find(node=>node.props.testID==='focus-card-suggestion');
  assert.equal(text(suggestion),'Suggested: Review your notes');assert.equal(suggestion.props.onPress,undefined);
  const title=suggestion.findByType('Text');assert.equal(title.props.numberOfLines,2);assert.notEqual(title.props.allowFontScaling,false);
  assert.equal(guided.tree.root.findAllByType('Button').some(node=>node.props.accessibilityLabel==='Choose focus area'),false);
  assert.deepEqual(calls,[['preferences','free'],['preferences','guided']]);
  assert.match(text(free.tree.root),/Work & projects/);assert.match(text(guided.tree.root),/Learning/);
 }finally{await free.cleanup();await guided.cleanup();}
});

test('a preferences read error keeps the in-card recovery action and current suggestion available',async()=>{
 let opened=0;const value={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const Card=load('src/components/GuidedFocusCard.tsx',mocks({'../hooks/useGuidedPreference':{useGuidedPreference:()=>({value,ready:false,busy:false,error:true})},'../context/TimerContext':{useTimer:()=>({})}})).default;
 const ui=await render(Card,{owner:'owner',subjects:[],selectedSeconds:1859,disabled:false,onStarted(){},onPreferences:()=>opened++});
 try{assert.match(text(ui.tree.root),/Tap Change to try again/);assert.doesNotMatch(text(ui.tree.root),/Find your next step/);await ui.press('Change focus direction');assert.equal(opened,1);assert.equal(selectedCustomDuration(ui),'30 min 59 sec');}finally{await ui.cleanup();}
});

test('free and suggested focus render one card structure with the same preset, custom and primary controls',async()=>{
 const shared=mocks({'../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},'../context/TimerContext':{useTimer:()=>({})}});
 const Free=load('src/components/FreeFocusCard.tsx',shared).default,Guided=load('src/components/GuidedFocusCard.tsx',shared).default;
 const free=await render(Free,{seconds:1800,area:'General',tint:'#fff',active:false,running:false,starting:false,disabled:false,changeDisabled:false,restoring:false,failed:false,onChange(){},onStart(){},onDuration(){}});
 const guided=await render(Guided,{owner:'owner',subjects:[],disabled:false,onStarted(){}});
 try {
  const view=(ui,id)=>ui.tree.root.findAllByType('View').find(n=>n.props.testID===id);
  assert.deepEqual(view(free,'home-quick-start').props.style,view(guided,'guided-focus-card').props.style);
  assert.equal(view(free,'focus-card-prompt').props.style.minHeight,view(guided,'focus-card-prompt').props.style.minHeight);
  const roles=ui=>ui.tree.root.findAllByType('Button').map(n=>n.props.accessibilityLabel?.replace(/^Start .*/, 'Start'));
  assert.deepEqual(roles(free),roles(guided));assert.equal(view(free,'home-quick-start').props.style.flexGrow,undefined);
  assert.match(text(free.tree.root),/Free focus/);assert.match(text(guided.tree.root),/Suggested: Review your notes/);
 }finally{await free.cleanup();await guided.cleanup();}
});

test('custom focus duration validates bounds and cancel leaves the chosen duration untouched',async()=>{
 const calls=[];let closed=0;const Sheet=load('src/components/FocusDurationSheet.tsx',mocks()).default;
 const ui=await render(Sheet,{seconds:1859,visible:true,disabled:false,onSave:s=>calls.push(s),onClose:()=>closed++});
 const input=label=>ui.tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel===label);
 try{
  const sheet=ui.tree.root.findByType('Sheet');
  assert.equal(sheet.props.compact,true);
  assert.equal(sheet.props.keyboardBehavior,'interactive','numeric keyboard must lift the short editor without stretching it to full screen');
  assert.equal(sheet.props.androidKeyboardInputMode,'adjustPan','Android must use the library keyboard offset rather than its adjustResize early exit');
  const scroll=ui.tree.root.findByType('Scroll');
  assert.equal(scroll.props.enableFooterMarginAdjustment,true);
  assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
  assert.equal(scroll.props.contentContainerStyle.paddingBottom,16,'the measured footer adds to a numeric bottom reservation');
  assert.equal(input('Focus minutes').props.value,'30');assert.equal(input('Focus seconds').props.value,'59');
  for(const [m,s] of [['0','0'],['480','1'],['20','60'],['','0'],['x','0']]){
   await act(async()=>{input('Focus minutes').props.onChangeText(m);input('Focus seconds').props.onChangeText(s);});await ui.press('Use this duration');assert.equal(calls.length,0);assert.match(text(ui.tree.root),/Seconds must be/);
  }
  await act(async()=>ui.tree.root.findByType('Sheet').props.onRequestClose());assert.equal(closed,1);assert.equal(calls.length,0);
  await act(async()=>{input('Focus minutes').props.onChangeText('480');input('Focus seconds').props.onChangeText('0');});await ui.press('Use this duration');assert.deepEqual(calls,[28800]);
 }finally{await ui.cleanup();}
});

test('switching focus modes changes the prompt while retaining the chosen timer and shared controls',async()=>{
 let preference={version:1,enabled:false,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const usePreference=()=>({ready:true,value:preference,busy:false,error:false});const startCalls=[];
 const timer={hasOpenSession:false,startFreeTimer:async(seconds)=>{startCalls.push(seconds);return true;}};
 const Home=load('src/app/(tabs)/index.tsx',mocks({
  'react-native':{...Native,useWindowDimensions:()=>({height:844,width:390,fontScale:1})},
  'expo-haptics':{},'expo-router':{useRouter:()=>({navigate(){}})},'expo-router/js-tabs':{useBottomTabBarHeight:()=>90},
  '../../components/AppText':{Text:host('Text')},'../../components/CharacterMark':host('Mark'),'../../components/ProgressRing':host('ProgressRing'),'../../components/ContentReveal':p=>p.children,'../../components/QuestSheet':host('Quests'),'../../components/GuidedPreferenceSheet':()=>null,
  '../../hooks/useGuidedPreference':{useGuidedPreference:usePreference},'../hooks/useGuidedPreference':{useGuidedPreference:usePreference},
  '../../context/UserContext':{useUser:()=>({profile:{id:'owner',username:'Soon Teck',daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
  '../../context/TimerContext':{useTimer:()=>timer},'../context/TimerContext':{useTimer:()=>timer},
  '../../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[],loading:false,refresh:async()=>{}})},
  '../../services/progressService':{getLastFreeSession:async()=>null,getFocusStreak:async()=>0},'../../services/dailyProgressService':{getTodayProgress:async()=>null},'../../hooks/useHomeLifecycle':{useHomeLifecycle:()=>12}
 })).default;
 const ui=await render(Home);const preset=label=>ui.tree.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);
 try{
  assert.match(text(ui.tree.root),/Soon Teck/);await setTenMinuteCustom(ui);
  preference={...preference,enabled:true};await ui.update({});assert.match(text(ui.tree.root),/A short review/);assert.equal(selectedCustomDuration(ui),'10 min');
  await ui.press('Use 30 minutes');preference={...preference,templateId:'practice-question',need:'practice'};await ui.update({});assert.equal(selectedCustomDuration(ui),'30 min');
  preference={...preference,enabled:false};await ui.update({});assert.match(text(ui.tree.root),/One thing at a time/);await ui.press('Start session');assert.deepEqual(startCalls,[1800]);
 }finally{await ui.cleanup();}
});

test('an explicit new direction replaces a failed suggestion while ordinary retries keep their exact draft',async()=>{
 const catalog=load('src/constants/guidedQuests.ts');let preference={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const Card=load('src/components/GuidedFocusCard.tsx',mocks({'../hooks/useGuidedPreference':{useGuidedPreference:()=>({value:preference,ready:true,busy:false,error:false})},'../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async()=>false})}})).default;
 const ui=await render(Card,{owner:'owner',subjects:[],disabled:false,onStarted(){}});
 try{await ui.press('Start session');assert.match(text(ui.tree.root),/Retry start/);preference={...preference,need:'work',templateId:catalog.defaultFocusId('work')};await ui.update({owner:'owner',subjects:[],disabled:false,onStarted(){}});assert.match(text(ui.tree.root),new RegExp(catalog.suggestedFocus(preference.templateId).title));assert.doesNotMatch(text(ui.tree.root),/Retry start/);}finally{await ui.cleanup();}
});

test('one Change action leaves the exact selected timer and confirmed setup intact until preferences are saved',async()=>{
 const calls=[];let opened=0;
 const Card=load('src/components/GuidedFocusCard.tsx',mocks({'../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},'../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async(focus,id)=>{calls.push([focus,id]);return true;}})}})).default;
 const ui=await render(Card,{owner:'owner',subjects:[{id:2,title:'Learning'},{id:3,title:'Work & projects'}],selectedSeconds:1859,disabled:false,onStarted(){},onPreferences:()=>opened++});
 try{assert.equal(ui.tree.root.findAllByType('Button').some(node=>node.props.accessibilityLabel==='Choose focus area'),false);await ui.press('Change focus direction');assert.equal(opened,1);assert.equal(calls.length,0);assert.equal(selectedCustomDuration(ui),'30 min 59 sec');assert.match(text(ui.tree.root),/Learning/);await ui.press('Start session');assert.equal(calls[0][0].seconds,1859);assert.equal(calls[0][1],2);}finally{await ui.cleanup();}
});

test('the single Home chooser saves direction and free focus without losing exact time, including save failures and Profile navigation',async()=>{
 const db=storage(),api=load('src/services/guidedPreferenceService.ts',{'@react-native-async-storage/async-storage':db.api});
 await api.guidedPreferenceStore.load('owner');
 const usePreference=load('src/hooks/useGuidedPreference.ts',{'../services/guidedPreferenceService':api}).useGuidedPreference;
 const routes=[],starts=[],subjects=[{id:1,title:'Everyday focus'},{id:2,title:'Learning'},{id:3,title:'Work & projects'},{id:4,title:'Creativity'}];
 const timer={hasOpenSession:false,startFreeTimer:async(seconds,id)=>{starts.push([seconds,id]);return true;}};
 const Home=load('src/app/(tabs)/index.tsx',mocks({
  'react-native':{...Native,useWindowDimensions:()=>({height:844,width:390,fontScale:1})},'expo-haptics':{},'expo-router':{useRouter:()=>({navigate:r=>routes.push(r)})},'expo-router/js-tabs':{useBottomTabBarHeight:()=>90},
  '../../components/AppText':{Text:host('Text')},'../../components/CharacterMark':host('Mark'),'../../components/ProgressRing':host('ProgressRing'),'../../components/ContentReveal':p=>p.children,'../../components/QuestSheet':()=>null,
  '../../hooks/useGuidedPreference':{useGuidedPreference:usePreference},'../hooks/useGuidedPreference':{useGuidedPreference:usePreference},
  '../../context/UserContext':{useUser:()=>({profile:{id:'owner',username:'Soon Teck',daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
  '../../context/TimerContext':{useTimer:()=>timer},'../context/TimerContext':{useTimer:()=>timer},
  '../../context/QuestContext':{useQuests:()=>({tasks:[],subjects,loading:false,refresh:async()=>{}})},
  '../../services/progressService':{getLastFreeSession:async()=>({duration_seconds:1859,subject_id:2,task_id:null}),getFocusStreak:async()=>0},'../../services/dailyProgressService':{getTodayProgress:async()=>null},'../../hooks/useHomeLifecycle':{useHomeLifecycle:()=>12}
 })).default;
 const ui=await render(Home);
 try{
  assert.equal(selectedCustomDuration(ui),'30 min');await ui.press('Change focus direction');await ui.press('Learning');await ui.press('Save preferences');assert.equal(selectedCustomDuration(ui),'30 min');
  await setTenMinuteCustom(ui);await ui.press('Change focus direction');await ui.press('Work & projects');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/A small project step/);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.areaId,undefined);
  await ui.press('Change focus direction');
  const radio=label=>ui.tree.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);
  assert.equal(radio('Work & projects').props.accessibilityState.checked,true);
  await ui.press('Creativity');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/A little room to create/);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.areaId,undefined);
  await ui.press('Change focus direction');await ui.press('Free focus');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/Free focus/);assert.match(text(ui.tree.root),/Everyday focus/);
  assert.equal(api.guidedPreferenceStore.snapshot('owner').value.areaId,null);
  assert.equal(api.parseGuidedPreference(db.values.get('liferpg:guided:v1:owner')).areaId,null);
  assert.equal(selectedCustomDuration(ui),'10 min');
  await ui.press('Change focus direction');await ui.press('Learning');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/A short review/);
  await ui.press('Change focus direction');await ui.press('Free focus');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/Free focus/);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.enabled,false);
  db.api.setItem=async()=>{throw Error('Offline');};await ui.press('Change focus direction');await ui.press('Work & projects');await ui.press('Save preferences');
  assert.match(text(ui.tree.root),/Couldn’t save or load your suggestion preferences/);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.enabled,false);assert.equal(api.guidedPreferenceStore.snapshot('owner').value.areaId,null);
  await act(async()=>ui.tree.root.findByType('Sheet').props.onRequestClose());
  await ui.press('Open Profile');assert.equal(routes.at(-1),'/profile');
  await ui.press('Start session');assert.deepEqual(starts,[[600,1]]);
  const stored=api.parseGuidedPreference(db.values.get('liferpg:guided:v1:owner'));assert.equal(stored.areaId,null);assert.equal(stored.enabled,false);
 }finally{await ui.cleanup();}
});

test('read-only activity and area cannot publish a second setup path or change attribution',async()=>{
 const calls=[],preference={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};
 const Card=load('src/components/GuidedFocusCard.tsx',mocks({'../hooks/useGuidedPreference':{useGuidedPreference:()=>({ready:true,value:preference,busy:false,error:false,save:async()=>false})},'../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async(focus,id)=>{calls.push([focus.templateId,id,focus.seconds]);return true;}})}})).default;
 const ui=await render(Card,{owner:'owner',subjects:[{id:2,title:'Learning'},{id:3,title:'Work & projects'}],selectedSeconds:2717,disabled:false,onStarted(){}});
 try{assert.equal(ui.tree.root.findAllByType('Button').some(node=>node.props.accessibilityLabel==='Choose focus area'),false);assert.equal(ui.tree.root.findByProps({testID:'focus-card-suggestion'}).props.onPress,undefined);assert.match(text(ui.tree.root),/Review your notes/);await ui.press('Start session');assert.deepEqual(calls,[['review-topic',2,2717]]);}finally{await ui.cleanup();}
});
