const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host = name => props => React.createElement(name, props, props.children);
const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename,module);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(name.endsWith('/MotionPressable'))return host('Button');
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name);
    const ext=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
  },module,module.exports);
  return module.exports;
}
const Native = { View:host('View'), ScrollView:host('Scroll'), KeyboardAvoidingView:host('KeyboardArea'), StyleSheet:{create:s=>s,hairlineWidth:0.5}, Platform:{OS:'android'} };
function storage() { const values=new Map(); return {values,api:{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{values.set(key,value);}}}; }
function mocks(extra={}) {return {
  'react-native':Native,
  '@expo/vector-icons':{Ionicons:host('Icon')},
  '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),TouchableOpacity:host('Button')},
  'react-native-safe-area-context':{SafeAreaView:host('SafeArea'),useSafeAreaInsets:()=>({bottom:24,top:24})},
  './AppText':{Text:host('Text')},'../components/AppText':{Text:host('Text'),TextInput:host('Input')},
  './ContentReveal':props=>props.children,
  './AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children):null,
  './PersonalUI':{p:{button:{},secondaryButton:{},rowTitle:{},caption:{},error:{},title:{},body:{}}},
  '../components/PersonalUI':{p:{},PersonalButton:props=>React.createElement('Button',{...props},props.title)},
  '../components/CharacterPortrait':host('Portrait'),
  ...extra,
};}
async function render(Component,props={}) {let tree;await act(async()=>{tree=create(React.createElement(Component,props));});return{
 tree,press:async label=>act(async()=>{const button=tree.root.findAllByType('Button').find(node=>text(node)===label||node.props.accessibilityLabel===label);assert.ok(button,`Missing ${label}`);assert.notEqual(button.props.disabled,true,`${label} disabled`);await button.props.onPress();}),
 update:async props=>act(async()=>tree.update(React.createElement(Component,props))),cleanup:async()=>act(async()=>tree.unmount())};}

test('twelve curated suggestions have valid durations and a genuinely smaller workload',()=>{
 const api=load('src/constants/guidedQuests.ts');
 assert.equal(api.STARTER_QUESTS.length,12);assert.equal(new Set(api.STARTER_QUESTS.map(task=>task.id)).size,12);
 for(const task of api.STARTER_QUESTS){const full=api.suggestedFocus(task.id),small=api.suggestedFocus(task.id,true);assert.ok(full.seconds>=300);assert.ok(small.seconds<=full.seconds);assert.notEqual(small.instruction,full.instruction);assert.notEqual(small.title,full.title);assert.equal(api.readSuggestedFocus(api.encodeSuggestedFocus(small)).title,small.title);}
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
function preferenceMock() { const initial={version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false};return()=>{const[value,setValue]=React.useState(initial);return{ready:true,error:false,busy:false,value,save:async next=>{setValue(next);return true;}}}; }

test('Home starter makes the task smaller and starts once with its title, instruction and area',async()=>{
 const pending=deferred(),calls=[];const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},
  '../context/TimerContext':{useTimer:()=>({startSuggestedTimer:(focus,area)=>{calls.push({focus,area});return pending.promise;}})},
 })).default;
 let opened=0;const props={owner:'owner',subjects:[{id:1,title:'General'},{id:2,title:'Knowledge'}],disabled:false,onStarted:()=>opened++,onFree(){},onQuest(){},onPreferences(){}};
 const ui=await render(Card,props);await ui.press('Make it smaller');assert.match(text(ui.tree.root),/Read one page/);
 await act(async()=>{const button=ui.tree.root.findAllByType('Button').find(n=>n.props.testID==='guided-start');void button.props.onPress();void button.props.onPress();});
 assert.equal(calls.length,1);assert.equal(calls[0].focus.seconds,300);assert.equal(calls[0].area,2);assert.equal(opened,0);
 await act(async()=>pending.resolve(true));assert.equal(opened,1);await ui.cleanup();
});
test('explicitly choosing a starter overrides a scheduled quest; missing Knowledge honestly falls back to General',async()=>{
 const calls=[];const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},
  '../context/TimerContext':{useTimer:()=>({startSuggestedTimer:async(focus,area)=>{calls.push([focus.templateId,area]);return true;}})},
 })).default;
 let questOpens=0;const ui=await render(Card,{owner:'owner',subjects:[{id:1,title:'General'}],quest:{id:7,title:'My assignment',target_minutes:30,subject_id:1},disabled:false,onStarted(){},onFree(){},onQuest(){questOpens++;},onPreferences(){}});
 await ui.press('Open quest');assert.equal(questOpens,1);
 await ui.press('Choose another');await ui.press('Try one practice question10 minutes');
 assert.match(text(ui.tree.root),/Try one practice question/);assert.doesNotMatch(text(ui.tree.root),/My assignment/);
 await ui.press('Start focusing');assert.deepEqual(calls,[['practice-question',1]]);await ui.cleanup();
});
test('failed guided start retains the exact choice for Retry and never navigates on failure',async()=>{
 const calls=[];let opened=0;const Card=load('src/components/GuidedFocusCard.tsx',mocks({
  '../hooks/useGuidedPreference':{useGuidedPreference:preferenceMock()},
  '../context/TimerContext':{useTimer:()=>({actionError:'Offline',startSuggestedTimer:async(focus,area)=>{calls.push({focus,area});return calls.length>1;}})},
 })).default;
 const props={owner:'owner',subjects:[],disabled:false,onStarted(){opened++;},onFree(){},onQuest(){},onPreferences(){}};
 const ui=await render(Card,props);
 await ui.press('Start focusing');assert.equal(opened,0);assert.match(text(ui.tree.root),/Offline/);
 await ui.update({...props,subjects:[{id:2,title:'Knowledge'}]});
 await ui.press('Retry start');assert.deepEqual(calls[0],calls[1]);assert.equal(opened,1);await ui.cleanup();
});
test('new users can skip suggestions, retain their badge and reach the existing tutorial through the profile RPC',async()=>{
 const db=storage(),routes=[],calls=[];
 const Screen=load('src/app/onboarding.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  'expo-router':{useRouter:()=>({replace:route=>routes.push(route)})},
  '../context/UserContext':{useUser:()=>({profile:{id:'new-user',username:'Soon',avatar:'🌱',daily_goal_minutes:60},reloadProfile:async()=>true})},
  '../services/onboardingService':{saveOnboardingProfile:async(...args)=>calls.push(args)},
 })).default;
 const ui=await render(Screen);await ui.press('Skip suggestions');await ui.press('Continue to the introduction');
 assert.deepEqual(routes,['/tutorial']);assert.equal(calls[0][1],'🌱');assert.equal(JSON.parse(db.values.get('liferpg:guided:v1:new-user')).enabled,false);await ui.cleanup();
});
test('new users can select an assignment direction before the introduction',async()=>{
 const db=storage();const Screen=load('src/app/onboarding.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,'expo-router':{useRouter:()=>({replace(){}})},
  '../context/UserContext':{useUser:()=>({profile:{id:'student',username:'Soon',avatar:'🌱',daily_goal_minutes:60},reloadProfile:async()=>true})},
  '../services/onboardingService':{saveOnboardingProfile:async()=>{}},
 })).default;
 const ui=await render(Screen);await ui.press('Study and assignmentsA few manageable steps to help you begin.');await ui.press('Move an assignment forwardFind a manageable next step.');await ui.press('Continue');await ui.press('Continue to the introduction');
 const pref=JSON.parse(db.values.get('liferpg:guided:v1:student'));assert.equal(pref.enabled,true);assert.equal(pref.need,'assignments');await ui.cleanup();
});
test('Save for later writes one quest with the chosen area and duration, without touching session rewards',async()=>{
 const db=storage(),pending=deferred(),calls=[];let upserts=0;
 const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic',true);
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  '../context/UserContext':{useUser:()=>({profile:{id:'owner'}})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId:'completed',suggestion:focus}})},
  '../context/QuestContext':{useQuests:()=>({tasks:[],upsert:()=>upserts++,refresh:async()=>{}})},
  '../services/taskService':{createTask:params=>{calls.push(params);return pending.promise;}},
 })).default;
 const ui=await render(Save,{inSheet:true});await act(async()=>{const button=ui.tree.root.findAllByType('Button')[0];void button.props.onPress();void button.props.onPress();});
 assert.equal(calls.length,1);assert.deepEqual(calls[0],{title:focus.title,targetMinutes:5,subjectId:2,repeatRule:'once',difficulty:'easy'});
 await act(async()=>pending.resolve({id:9}));assert.equal(upserts,1);assert.match(text(ui.tree.root),/Saved to your quests/);assert.equal(db.values.get('liferpg:saved-suggestion:owner:completed'),'saved');await ui.cleanup();
});

test('Home keeps the guided card mounted while Start makes the timer active, then opens Session after success',async()=>{
 const db=storage(),pending=deferred(),routes=[];
 db.values.set('liferpg:guided:v1:owner',JSON.stringify({version:1,enabled:true,invited:true,need:'revision',templateId:'review-topic',smaller:false}));
 const Context=React.createContext(null);
 const Home=load('src/app/(tabs)/index.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  'react-native':{...Native,useWindowDimensions:()=>({height:800,width:390,fontScale:1})},
  '../../components/AppText':{Text:host('Text')},
  'expo-haptics':{},'expo-router':{useRouter:()=>({navigate:route=>routes.push(route)})},
  'expo-router/js-tabs':{useBottomTabBarHeight:()=>90},
  '../../components/GoalRing':host('GoalRing'),'../../components/CharacterMark':host('Mark'),'../../components/ContentReveal':props=>props.children,'../../components/QuestSheet':host('Quests'),
  '../../context/UserContext':{useUser:()=>({profile:{id:'owner',username:'Soon',level:1,daily_goal_minutes:60},reloadProfile:async()=>true,hapticsEnabled:false})},
  '../../context/TimerContext':{useTimer:()=>React.useContext(Context)},'../context/TimerContext':{useTimer:()=>React.useContext(Context)},
  '../../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[{id:2,title:'Knowledge'}],loading:false,refresh:async()=>{}})},
  '../../services/progressService':{getLastFreeSession:async()=>null,getFocusStreak:async()=>0},'../../services/dailyProgressService':{getTodayProgress:async()=>null},'../../hooks/useHomeLifecycle':{useHomeLifecycle:()=>12},
  '../../components/GuidedPreferenceSheet':()=>null,
 })).default;
 const api=load('src/constants/guidedQuests.ts');let starts=0;
 function Harness(){const[state,set]=React.useState({hasOpenSession:false,isRunning:false,actionBusy:false,notes:'',duration:600,timeLeft:600,targetAttributeId:null});return React.createElement(Context.Provider,{value:{...state,startSuggestedTimer:async(focus,area)=>{starts++;set({...state,hasOpenSession:true,isRunning:true,notes:api.encodeSuggestedFocus(focus),targetAttributeId:area});return pending.promise;}}},React.createElement(Home));}
 const ui=await render(Harness);
 await act(async()=>{void ui.tree.root.findAllByType('Button').find(n=>n.props.testID==='guided-start').props.onPress();});
 assert.equal(starts,1);assert.equal(ui.tree.root.findAllByType('View').filter(node=>node.props.testID==='guided-focus-card').length,1);assert.deepEqual(routes,[]);
 await act(async()=>pending.resolve(true));assert.deepEqual(routes,['/session']);assert.match(text(ui.tree.root),/Continue session/);await ui.cleanup();
});

test('ambiguous quest-save failure refreshes existing quests before another insert can be offered',async()=>{
 const db=storage();let inserts=0;const focus=load('src/constants/guidedQuests.ts').suggestedFocus('review-topic');
 const Save=load('src/components/SaveSuggestedQuest.tsx',mocks({
  '@react-native-async-storage/async-storage':db.api,
  '../context/UserContext':{useUser:()=>({profile:{id:'save-owner'}})},
  '../context/TimerContext':{useTimer:()=>({targetAttributeId:2,sessionSummary:{sessionId:'save-session',suggestion:focus}})},
  '../context/QuestContext':{useQuests:()=>{const[tasks,setTasks]=React.useState([]);return{tasks,upsert(){},refresh:async()=>setTasks([{title:focus.title,subject_id:2,target_minutes:10,is_completed:false}])};}},
  '../services/taskService':{createTask:async()=>{inserts++;throw Error('response lost');}},
 })).default;
 const ui=await render(Save,{inSheet:true});await ui.press('Save for later');assert.equal(inserts,1);assert.match(text(ui.tree.root),/Saved to your quests/);assert.equal(ui.tree.root.findAllByType('Button')[0].props.disabled,true);await ui.cleanup();
});
