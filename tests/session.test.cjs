const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;
global.__DEV__ = false;

// Render the production components with native primitives and network boundaries
// replaced. These tests exercise state and actions, not native layout or gestures.
function load(relativePath, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ["", ".ts", ".tsx"].find((ext) => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + extension), mocks, cache);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

const host = (name) => (props) => React.createElement(name, props, props.children);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const result = { already_completed: false, xp_earned: 30, gold_earned: 5, minutes: 1, duration_seconds: 60, level: 2, leveled_up: false };

async function providerSetup(overrides = {}, notifications = null) {
  let state, show = true, tick, foreground;
  const calls = [];
  const realInterval = global.setInterval, realClear = global.clearInterval, realNow = Date.now;
  let now = 1_000_000;
  global.setInterval = (fn) => { tick = fn; return 1; };
  global.clearInterval = () => {};
  Date.now = () => now;
  const service = {
    getOpenActivitySession: async () => null,
    startActivitySession: async (params) => { calls.push(["start", params]); return "session-1"; },
    pauseActivitySession: async (id) => { calls.push(["pause",id]); },
    resumeActivitySession: async (id) => { calls.push(["resume",id]); },
    cancelActivitySession: async (id) => { calls.push(["cancel",id]); },
    completeActivitySession: async (id) => { calls.push(["complete",id]); return result; },
    ...overrides,
  };
  const reloadProfile = async () => true;
  const { TimerProvider, useTimer } = load("src/context/TimerContext.tsx", {
    "react-native": { Platform: { OS: "android" }, AppState: { addEventListener: (_, fn) => { foreground=fn; return { remove() {} }; } } },
    "expo": { isRunningInExpoGo: () => false },
    "expo-notifications": notifications,
    "expo-haptics": { notificationAsync: async () => {}, NotificationFeedbackType: { Success: "success" } },
    "../services/sessionService": service,
    "./UserContext": { useUser: () => ({ reloadProfile }) },
  });
  function Capture() { state = useTimer(); return null; }
  function Page() { return React.createElement("Page"); }
  function Harness() { return React.createElement(TimerProvider,null,React.createElement(Capture),show && React.createElement(Page)); }
  let renderer;
  await act(async () => { renderer=create(React.createElement(Harness)); });
  return {
    state: () => state, calls,
    run: async (fn) => { await act(async () => fn(state)); },
    advance: async (seconds) => { now += seconds*1000; await act(async () => tick?.()); },
    backgroundTime: (seconds) => { now += seconds*1000; },
    foreground: async () => { await act(async () => foreground("active")); },
    page: async (visible) => { show=visible; await act(async () => renderer.update(React.createElement(Harness))); },
    cleanup: async () => { await act(async () => renderer.unmount()); global.setInterval=realInterval; global.clearInterval=realClear; Date.now=realNow; },
  };
}

test("provider blocks repeated starts and preserves failed setup for retry", async () => {
  const pending = deferred();
  let starts = 0;
  const ui = await providerSetup({ startActivitySession: () => { starts++; return starts === 1 ? pending.promise : Promise.resolve("retry-session"); } });
  let first;
  await ui.run((s) => { first=s.startTimer(1800,"Read"); void s.startTimer(1800,"Read"); });
  assert.equal(starts,1);
  assert.equal(ui.state().actionBusy,true);
  await ui.run(async () => { pending.reject(Error("Offline")); await first; });
  assert.equal(ui.state().hasOpenSession,false);
  assert.match(ui.state().actionError,/start your session/);
  assert.equal(ui.state().actionBusy,false);
  await ui.run((s) => s.startTimer(1800,"Read"));
  assert.equal(starts,2);
  assert.equal(ui.state().hasOpenSession,true);
  assert.equal(ui.state().actionError,null);
  await ui.cleanup();
});

test("minimise/reopen keeps running and paused identity, settings and remaining time", async () => {
  const ui=await providerSetup();
  await ui.run((s)=> { s.setLinkedTaskId(7); s.setTargetAttributeId(3); s.setActivityType("read"); });
  await ui.run((s)=>s.startTimer(1800,"Read"));
  await ui.advance(10);
  await ui.page(false); await ui.page(true);
  assert.equal(ui.state().timeLeft,1790);
  assert.equal(ui.state().isRunning,true);
  await ui.run((s)=>s.pauseTimer());
  await ui.page(false); await ui.page(true);
  await ui.run((s)=> { s.setLinkedTaskId(99); s.setTargetAttributeId(99); s.setActivityType("work"); s.setDurationInMinutes(15); return s.startTimer(900); });
  assert.equal(ui.state().isRunning,false);
  assert.equal(ui.state().linkedTaskId,7);
  assert.equal(ui.state().targetAttributeId,3);
  assert.equal(ui.state().activityType,"read");
  assert.equal(ui.state().duration,1800);
  assert.equal(ui.state().timeLeft,1790);
  assert.equal(ui.calls.filter(([name])=>name==="start").length,1);
  await ui.run((s)=>s.resumeTimer());
  assert.equal(ui.state().timeLeft,1790);
  await ui.cleanup();
});

test("closing rewards preserves completed summary and never re-awards", async () => {
  const ui=await providerSetup();
  await ui.run((s)=>s.startTimer(60,"Read"));
  await ui.advance(61);
  assert.equal(ui.state().isCompleted,true);
  assert.equal(ui.state().rewardsVisible,true);
  const summary=ui.state().sessionSummary;
  await ui.run((s)=>s.clearCompletionModal());
  assert.equal(ui.state().rewardsVisible,false);
  assert.equal(ui.state().sessionSummary,summary);
  assert.equal(ui.state().summaryViewed,false);
  await ui.run((s)=>s.acknowledgeSummary());
  assert.equal(ui.state().summaryViewed,true);
  assert.equal(ui.state().sessionSummary,summary);
  assert.equal(ui.state().isCompleted,true);
  await ui.page(false); await ui.page(true);
  await ui.run((s)=>s.retryCompletion());
  assert.equal(ui.calls.filter(([name])=>name==="complete").length,1);
  await ui.run((s)=>s.resetTimer());
  assert.equal(ui.state().sessionSummary,null);
  assert.equal(ui.calls.filter(([name])=>name==="cancel").length,0);
  await ui.cleanup();
});

test("failed completion remains visible and retries the same session ID", async () => {
  let attempts=0;
  const ui=await providerSetup({ completeActivitySession: async(id)=>{ assert.equal(id,"session-1"); if (++attempts===1) throw Error("Offline"); return {...result,already_completed:true}; } });
  await ui.run((s)=>s.startTimer(60));
  await ui.advance(61);
  assert.equal(ui.state().isCompleted,true);
  assert.match(ui.state().actionError,/save your completed session/);
  await ui.run((s)=>s.retryCompletion());
  assert.equal(attempts,2);
  assert.equal(ui.state().rewardsVisible,false);
  assert.equal(ui.state().sessionSummary.xpEarned,30);
  await ui.cleanup();
});

test("failed end preserves the open session; Retry repeats cancellation", async () => {
  let attempts=0;
  const ui=await providerSetup({ cancelActivitySession: async()=>{ if(++attempts===1) throw Error("Offline"); } });
  await ui.run((s)=>s.startTimer(1800));
  await ui.run((s)=>s.resetTimer());
  assert.equal(ui.state().hasOpenSession,true);
  assert.equal(ui.state().isRunning,true);
  await ui.run((s)=>s.retryAction());
  assert.equal(attempts,2);
  assert.equal(ui.state().hasOpenSession,false);
  await ui.cleanup();
});

test("restored paused sessions cannot be replaced by Start", async () => {
  const ui=await providerSetup({getOpenActivitySession: async()=>({ id:"saved",task_id:4,subject_id:2,activity_type:"work",target_duration_seconds:1200,elapsed_seconds:60,status:"paused",notes:"keep" })});
  assert.equal(ui.state().isRestoring,false);
  assert.equal(ui.state().timeLeft,1140);
  await ui.run((s)=>s.startTimer(1800));
  assert.equal(ui.calls.length,0);
  assert.equal(ui.state().linkedTaskId,4);
  assert.equal(ui.state().notes,"keep");
  await ui.cleanup();
});

test("duration parser rejects ambiguous input rather than silently substituting",()=>{
  const {validatedSessionMinutes}=load("src/utils/sessionSetup.ts",{});
  for(const input of ["","0","481","2.5","20x","-5"]) assert.equal(validatedSessionMinutes(input),null);
  for(const input of ["1","30","480"]) assert.equal(validatedSessionMinutes(input),Number(input));
});

async function screenSetup(initial = {}, questOverrides = {}, deferExit = false, motionPreference = {value:true}, platform = "android") {
  const calls = [], keyboardListeners = {};
  let exitCallback;
  let keyboard = false, back;
  let state = {
    duration:1800,timeLeft:1800,isRunning:false,isCompleted:false,hasOpenSession:false,
    isRestoring:false,restoreError:false,actionBusy:false,actionError:null,rewardsVisible:false,
    linkedTaskId:null,targetAttributeId:1,activityType:"other",sessionSummary:null,
    startTimer: async(...args)=>{calls.push(["start",...args]);},
    pauseTimer: async()=>{calls.push(["pause"]);}, resumeTimer: async()=>{calls.push(["resume"]);},
    resetTimer: async()=>{calls.push(["reset"]);}, retryAction: async()=>{calls.push(["retry"]);},
    retryRestore:()=>{calls.push(["restore"]);}, retryCompletion:async()=>{calls.push(["complete"]);},
    setLinkedTaskId:(value)=>{calls.push(["task",value]);},setTargetAttributeId:(value)=>{calls.push(["area",value]);},
    setActivityType:(value)=>{calls.push(["activity",value]);},setDurationInMinutes:(value)=>{calls.push(["duration",value]);},setDurationInSeconds:(value)=>{calls.push(["seconds",value]);},
    setNotes:()=>{},resolveQuestTitle:()=>{},acknowledgeSummary:()=>calls.push(["summary-viewed"]),
    ...initial,
  };
  const router = {canGoBack:()=>true,goBack:()=>calls.push(["dismiss"]),getState:()=>({routes:[{},{}]}),addListener:()=>()=>{}};
  const quests = {tasks:[{id:7,title:"A long quest title worth finishing",target_minutes:30,subject_id:1,is_due_today:true,is_completed_today:false}],
    subjects:[{id:1,title:"General"}],loading:false,error:false,refresh:async()=>{},...questOverrides};
  const Screen=load("src/components/SessionScreen.tsx",{
    "react-native":{
      View:host("View"),Text:host("Text"),TextInput:host("Input"),TouchableOpacity:host("Button"),
      ScrollView:host("Scroll"),KeyboardAvoidingView:host("KeyboardView"),ActivityIndicator:host("Spinner"),
      PanResponder:{create:(handlers)=>({panHandlers:handlers})},
      Platform:{OS:platform},useWindowDimensions:()=>({height:640,width:320,fontScale:1.5}),
      StyleSheet:{create:(s)=>s,hairlineWidth:1,absoluteFill:{}},
      Keyboard:{isVisible:()=>keyboard,dismiss:()=>{keyboard=false;keyboardListeners.keyboardDidHide?.();calls.push(["keyboard"]);},addListener:(event,fn)=>{keyboardListeners[event]=fn;return{remove(){}};}},
      BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}};}},
      Animated:{Value:class {constructor(value){this.value=value;} setValue(value){this.value=value;} stopAnimation(){} interpolate(config){return {source:this,config};}},View:host("AnimatedView"),timing:(value,config)=>({start(callback){if(deferExit && config.toValue===0) exitCallback=callback;else { value.setValue(config.toValue); callback?.({finished:true}); }},stop(){}})},
    },
    "expo-router":{Stack:{Screen:host("Options")},useNavigation:()=>router,useFocusEffect:(effect)=>React.useEffect(effect,[effect])},
    "expo-router/react-navigation":{usePreventRemove:()=>{}},
    "@expo/vector-icons":{Ionicons:host("Icon")},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("SheetScroll"),TouchableOpacity:host("Button")},
    "react-native-safe-area-context":{SafeAreaView:host("SafeArea")},
    "./AppHeader":p=>React.createElement("Button",{onPress:p.onBack,accessibilityLabel:p.backLabel},p.title),
    "./AppSheet":(p)=>p.visible?React.createElement("Sheet",p,p.header,p.children):null,
    "./DurationPicker":{__esModule:true,default:p=>React.createElement("DurationControl",p,React.createElement("View",{testID:"session-countdown"}),p.interactive&&React.createElement("Button",{onPress:p.onEdit,accessibilityLabel:"Edit duration"},"Edit duration")),DurationEditor:p=>p.visible?React.createElement("DurationSheet",p):null},
    "./SheetConfirmation":(p)=>React.createElement("Confirm",p),
    "../context/TimerContext":{useTimer:()=>state},"../context/QuestContext":{useQuests:()=>quests},
    "../hooks/useReducedMotion":{useReducedMotion:()=>motionPreference.value},
  }).default;
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Screen));});
  const text=(node)=>typeof node==="string"?node:(node.children??[]).map(text).join("");
  const button=(label)=>renderer.root.findAllByType("Button").find((node)=>node.props.accessibilityLabel===label||text(node)===label);
  return {
    calls,button,root:()=>renderer.root,output:()=>text(renderer.root),
    press:async(label)=>{const node=button(label);assert.ok(node,label);await act(async()=>node.props.onPress());},
    update:async(changes)=>{state={...state,...changes};await act(async()=>renderer.update(React.createElement(Screen)));},
    keyboard:async()=>{keyboard=true;await act(async()=>keyboardListeners.keyboardDidShow());},
    back:async()=>{await act(async()=>back());},
    finishExit:async(finished=true)=>{await act(async()=>exitCallback?.({finished}));},
    cleanup:async()=>{await act(async()=>renderer.unmount());},
  };
}

test("opening the typed duration editor does not remount or alter the timer wheels",async()=>{
  const ui=await screenSetup();
  const before=ui.root().findByType("DurationControl").props;
  await ui.press("Edit duration");
  const after=ui.root().findByType("DurationControl").props;
  assert.equal(after.revision,before.revision);
  assert.equal(after.seconds,before.seconds);
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,1800);
  await ui.cleanup();
});

test("downward session swipe uses the existing animated close and inner sheets take priority",async()=>{
  for (const initial of [{},{hasOpenSession:true,isRunning:true},{hasOpenSession:true,isRunning:false},{isCompleted:true}]) {
    const ui=await screenSetup(initial);
    const safe=ui.root().findByType("SafeArea");
    assert.equal(safe.props.onMoveShouldSetPanResponderCapture({}, {y0:400,dy:40,dx:0}),true);
    await act(async()=>safe.props.onPanResponderRelease({}, {dy:100,vy:0.8}));
    assert.ok(ui.calls.some((call)=>call[0]==="dismiss"));
    await ui.cleanup();
  }
  const ui=await screenSetup();
  await ui.press("Edit duration");
  const safe=ui.root().findByType("SafeArea");
  assert.equal(safe.props.onMoveShouldSetPanResponderCapture({}, {y0:400,dy:40,dx:0}),false);
  await ui.cleanup();
});

test("timer anchor and countdown stay mounted with identical layout across setup, running and paused",async()=>{
  const ui=await screenSetup();
  const anchor=ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor");
  const countdown=ui.root().findAllByType("View").find((n)=>n.props.testID==="session-countdown");
  const layout=JSON.stringify(anchor.props.style);
  await ui.update({hasOpenSession:true,isRunning:true,timeLeft:1800});
  assert.equal(ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor"),anchor);
  assert.equal(JSON.stringify(anchor.props.style),layout);
  assert.equal(ui.root().findAllByType("View").find((n)=>n.props.testID==="session-countdown"),countdown);
  await ui.update({isRunning:false,timeLeft:1795});
  assert.equal(JSON.stringify(anchor.props.style),layout);
  assert.ok(ui.button("Resume"));
  assert.equal(ui.button("Choose activity"),undefined);
  await ui.cleanup();
});

test("saved completion displays focused duration while unsaved completion stays at zero",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,duration:1800});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,0);
  assert.match(ui.output(),/Saving your session/);
  await ui.update({actionError:"Couldn’t save completion"});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,0);
  assert.match(ui.output(),/Completion needs attention/);
  await ui.update({actionError:null,sessionSummary:{durationSeconds:1859,minutesSpent:30,xpEarned:30,goldEarned:5,questTitle:"Read"}});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1859);
  assert.equal(ui.root().findByType("DurationControl").props.interactive,false);
  assert.match(ui.output(),/Time focused/);
  await ui.update({isCompleted:false,hasOpenSession:true,isRunning:false,sessionSummary:null,timeLeft:900});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,900);
  await ui.cleanup();
});

test("quest setup is compact, keeps its association during loading, and never starts automatically",async()=>{
  const ui=await screenSetup({linkedTaskId:7,duration:2700,timeLeft:2700});
  assert.match(ui.output(),/A long quest title/);
  assert.equal(ui.button("Choose life area"),undefined);
  assert.equal(ui.button("15 minutes"),undefined);
  assert.ok(ui.button("Change quest"));
  assert.equal(ui.calls.length,0);
  await ui.press("Start");
  assert.deepEqual(ui.calls.at(-1),["start",2700,"A long quest title worth finishing"]);
  await ui.cleanup();
  const missing=await screenSetup({linkedTaskId:7},{tasks:[],loading:true});
  assert.match(missing.output(),/Loading quest/);
  assert.equal(missing.button("Start").props.disabled,true);
  assert.equal(missing.calls.length,0);
  await missing.cleanup();
});

test("custom picker changes setup only on confirm; Retry uses exact seconds",async()=>{
  const ui=await screenSetup();
  await ui.press("Edit duration");
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,1800);
  await ui.back();
  assert.equal(ui.calls.some(([action])=>action==="seconds"),false);
  await ui.press("Edit duration");
  await act(async()=>ui.root().findByType("DurationSheet").props.onConfirm(930));
  assert.deepEqual(ui.calls.at(-1),["seconds",930]);
  await ui.update({duration:930,timeLeft:930,actionError:"Couldn’t start your session."});
  await ui.press("Retry");
  assert.deepEqual(ui.calls.at(-1),["start",930,undefined]);
  await ui.press("Edit duration");
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,930);
  await ui.back();
  await ui.update({actionBusy:true});
  assert.equal(ui.button("Start").props.disabled,true);
  assert.equal(ui.root().findAllByType("Input").length,0);
  await ui.cleanup();
});

test("back dismisses keyboard, then picker, then the screen without resetting",async()=>{
  const ui=await screenSetup();
  await ui.press("Choose life area");
  await ui.keyboard();
  await ui.back();
  assert.equal(ui.root().findAllByType("Sheet").length,1);
  assert.equal(ui.calls.some(([name])=>name==="dismiss"),false);
  await ui.back();
  assert.equal(ui.root().findAllByType("Sheet").length,0);
  await ui.back(); await ui.back();
  assert.equal(ui.calls.filter(([name])=>name==="dismiss").length,1);
  assert.equal(ui.calls.some(([name])=>name==="reset"),false);
  await ui.cleanup();
});

test("completed screen offers Done and New session while retaining the summary",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,sessionSummary:{questTitle:"Read",minutesSpent:30,durationSeconds:1800,xpEarned:30,goldEarned:5}});
  assert.match(ui.output(),/30 min completed/);
  assert.ok(ui.button("Done")); assert.ok(ui.button("New session"));
  await ui.press("Done");
  assert.deepEqual(ui.calls,[["summary-viewed"],["dismiss"]]);
  assert.match(ui.output(),/30 min completed/);
  await ui.cleanup();
});
test("seconds survive countdown boundaries, pause, minimise and completion once", async()=>{
  const ui=await providerSetup({completeActivitySession:async(id)=>{ui.calls.push(["complete",id]);return {...result,minutes:15,duration_seconds:930,xp_earned:15,gold_earned:75};}});
  await ui.run(s=>s.startTimer(930));
  assert.equal(ui.calls[0][1].targetDurationSeconds,930);
  assert.equal(ui.calls[0][1].activityType,"other");
  await ui.advance(30);
  assert.equal(ui.state().timeLeft,900);
  await ui.advance(1);
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.pauseTimer());
  await ui.page(false);await ui.page(true);
  assert.equal(ui.state().duration,930);
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.resumeTimer());
  await ui.advance(899);
  assert.equal(ui.state().sessionSummary.durationSeconds,930);
  await ui.run(s=>s.retryCompletion());
  assert.equal(ui.calls.filter(([name])=>name==="complete").length,1);
  await ui.cleanup();
});

test("restoration retains sub-minute and mixed durations and legacy activity",async()=>{
  for(const [seconds,elapsed,status] of [[30,7,"paused"],[930,61,"paused"],[930,61,"active"]]){
    const ui=await providerSetup({getOpenActivitySession:async()=>({id:"saved",task_id:null,subject_id:1,activity_type:"general",target_duration_seconds:seconds,elapsed_seconds:elapsed,status,notes:"",last_resumed_at:new Date(1_000_000).toISOString()})});
    assert.equal(ui.state().duration,seconds);
    assert.equal(ui.state().timeLeft,seconds-elapsed);
    assert.equal(ui.state().activityType,"general");
    await ui.page(false);await ui.page(true);
    assert.equal(ui.state().timeLeft,seconds-elapsed);
    await ui.cleanup();
  }
});

test("bounds and exact duration labels reject zero and 480:59",()=>{
  const {validSessionSeconds,durationLabel,sessionTime}=load("src/utils/sessionSetup.ts",{});
  for(const value of [0,-1,28801,28859,1.5,NaN]) assert.equal(validSessionSeconds(value),false);
  for(const value of [30,60,930,28800]) assert.equal(validSessionSeconds(value),true);
  assert.equal(durationLabel(930),"15 min 30 sec");
  assert.equal(durationLabel(30),"30 sec");
  assert.equal(sessionTime(60),"01:00");
  assert.equal(sessionTime(59),"00:59");
});

test("Life area wins over neutral or historical activity; legacy missing-area labels remain readable",()=>{
  const {sessionCategory}=load("src/utils/sessionReporting.ts",{});
  const areas=[{id:2,title:"Knowledge"}];
  assert.equal(sessionCategory({subject_id:2,activity_type:"other"},areas),"Knowledge");
  assert.equal(sessionCategory({subject_id:2,activity_type:"code"},areas),"Knowledge");
  assert.equal(sessionCategory({subject_id:null,activity_type:"code"},areas),"Code");
  assert.equal(sessionCategory({subject_id:null,activity_type:"other"},areas),"General");
});

test("dock distinguishes running, paused, saving, failed and completed without completed countdown",()=>{
  const {sessionDockState}=load("src/utils/sessionReporting.ts",{});
  const state={isCompleted:false,isRunning:true,actionError:null,sessionSummary:null,timeLeft:930};
  assert.deepEqual(sessionDockState(state),{label:"Session running",detail:"15:30",icon:"play-outline"});
  assert.equal(sessionDockState({...state,isRunning:false}).icon,"pause-outline");
  assert.equal(sessionDockState({...state,isCompleted:true}).label,"Saving session…");
  assert.equal(sessionDockState({...state,isCompleted:true,actionError:"Offline"}).detail,"Retry");
  const completed=sessionDockState({...state,isCompleted:true,sessionSummary:{},timeLeft:0});
  assert.equal(completed.icon,"checkmark-circle-outline");
  assert.equal(completed.detail,"View summary");
});

test("free setup has one Life area category and a discoverable optional quest row",async()=>{
  const ui=await screenSetup();
  assert.ok(ui.button("Choose a quest"));
  assert.ok(ui.button("Choose life area"));
  assert.equal(ui.button("Choose activity"),undefined);
  assert.match(ui.output(),/Optional/);
  await ui.press("Choose a quest");
  assert.match(ui.output(),/30 min · General/);
  await ui.cleanup();
});

test("header close/minimise uses stack back once without changing active state",async()=>{
  for(const active of [false,true]){
    const ui=await screenSetup({hasOpenSession:active,isRunning:active,timeLeft:929,duration:930});
    const label=active?"Minimise session":"Close session";
    await ui.press(label);await ui.press(label);
    assert.deepEqual(ui.calls,[["dismiss"]]);
    await ui.cleanup();
  }
});

test("foreground recovery and notifications retain exact remaining seconds",async()=>{
  const scheduled=[];
  const notifications={
    AndroidImportance:{LOW:1,MAX:5},AndroidNotificationPriority:{MAX:5},SchedulableTriggerInputTypes:{TIME_INTERVAL:"timeInterval"},
    getPermissionsAsync:async()=>({status:"granted"}),setNotificationHandler:()=>{},
    setNotificationChannelAsync:async()=>{},addNotificationResponseReceivedListener:()=>({remove(){}}),
    dismissNotificationAsync:async()=>{},cancelScheduledNotificationAsync:async()=>{},
    scheduleNotificationAsync:async(request)=>{scheduled.push(request);return request.identifier;},
    getAllScheduledNotificationsAsync:async()=>scheduled,
  };
  const ui=await providerSetup({},notifications);
  await ui.run(s=>s.startTimer(930));
  assert.equal(scheduled.find(n=>n.trigger?.seconds).trigger.seconds,930);
  ui.backgroundTime(31);await ui.foreground();
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.pauseTimer());await ui.run(s=>s.resumeTimer());
  assert.equal(scheduled.filter(n=>n.trigger?.seconds).at(-1).trigger.seconds,899);
  await ui.cleanup();
});
function durationModule(calls = [], hapticsEnabled = false) {
  return load("src/components/DurationPicker.tsx",{
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("Scroll"),BottomSheetTextInput:host("Input")},
    "./AppSheet":function Sheet(props) {
      // Model completed dismissal so closing unmounts the abandoned draft.
      // Native animation/gesture behavior belongs to phone verification.
      React.useEffect(()=>{if(!props.visible) props.onDismiss?.();},[props.visible]);
      return props.visible ? React.createElement("Sheet",props,props.header,props.children) : null;
    },
    "react-native":{View:host("View"),Text:host("Text"),TouchableOpacity:host("Button"),TextInput:host("Input"),Modal:host("Modal"),ScrollView:host("Scroll"),KeyboardAvoidingView:host("KeyboardView"),
      Animated:{Value:class {constructor(value){this.value=value;} interpolate(config){return config;}},Text:host("AnimatedText"),FlatList:host("Wheel"),event:(_,config)=>Object.assign(event=>config.listener?.(event),{nativeDriver:config.useNativeDriver})},
      FlatList:host("Wheel"),Keyboard:{isVisible:()=>false,dismiss:()=>calls.push("keyboard")},Platform:{OS:"android"},StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:320,height:640,fontScale:2})},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({bottom:24}),SafeAreaView:host("SafeArea")},
    "expo-haptics":{selectionAsync:async()=>calls.push("haptic")},
    "../context/UserContext":{useUser:()=>({hapticsEnabled})},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},
  });
}

test("integrated wheels ignore programmatic scrolls, commit on settling, and keep digits fixed",async()=>{
  const calls=[],{default:Picker}=durationModule(calls);
  let props={seconds:930,interactive:true,revision:0,onCommit:s=>calls.push(["commit",s]),onBusy:b=>calls.push(["busy",b]),onValidity:v=>calls.push(["valid",v]),onEdit:()=>{}};
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Picker,props));});
  const wheels=()=>renderer.root.findAllByType("Wheel");
  const event=(index,value,velocity=0)=>({nativeEvent:{contentOffset:{y:value*wheels()[index].props.snapToInterval},velocity:{y:velocity}}});
  await act(async()=>wheels()[0].props.onScroll(event(0,0)));
  assert.deepEqual(calls,[]);
  await act(async()=>wheels()[0].props.onScrollBeginDrag());
  const scrollingProps=wheels()[0].props;
  assert.equal(scrollingProps.onScroll.nativeDriver,true);
  await act(async()=>wheels()[0].props.onScroll(event(0,100)));
  assert.equal(wheels()[0].props,scrollingProps,"scrolling digits must not depend on React rerenders");
  await act(async()=>wheels()[0].props.onScrollEndDrag(event(0,100,2)));
  assert.equal(calls.some(c=>c[0]==="commit"),false);
  await act(async()=>wheels()[0].props.onMomentumScrollEnd(event(0,100)));
  assert.ok(calls.some(c=>c[0]==="commit"&&c[1]===6030));
  assert.deepEqual(calls.at(-1),["busy",false]);
  assert.equal(calls.includes("haptic"),false);
  const digits=renderer.root.findAllByType("View").find(n=>n.props.testID==="session-countdown");
  const layout=JSON.stringify(digits.props.style);
  props={...props,seconds:6030,interactive:false};
  await act(async()=>renderer.update(React.createElement(Picker,props)));
  assert.equal(renderer.root.findAllByType("View").find(n=>n.props.testID==="session-countdown"),digits);
  assert.equal(JSON.stringify(digits.props.style),layout);
  assert.equal(wheels().length,0);
  for(const seconds of [1,30,930,6000,28800]){
    props={...props,seconds,interactive:true,revision:props.revision+1};
    await act(async()=>renderer.update(React.createElement(Picker,props)));
    assert.equal(wheels()[0].props.initialScrollIndex % 481,Math.floor(seconds/60));
    assert.equal(wheels()[1].props.initialScrollIndex % 60,seconds%60);
  }
  await act(async()=>renderer.unmount());
});

test("Start is blocked during momentum; preset changes reject stale wheel events",async()=>{
  const ui=await screenSetup();
  const oldWheel=ui.root().findByType("DurationControl").props;
  await act(async()=>oldWheel.onBusy(true));
  assert.equal(ui.button("Start").props.disabled,true);
  await ui.press("Start");
  assert.equal(ui.calls.some(c=>c[0]==="start"),false);
  await ui.press("15 minutes");
  await ui.update({duration:900,timeLeft:900});
  await act(async()=>{oldWheel.onCommit(6030);oldWheel.onBusy(true);oldWheel.onValidity(false);});
  assert.deepEqual(ui.calls.at(-1),["seconds",900]);
  assert.equal(ui.button("Start").props.disabled,false);
  await ui.press("Start");
  assert.deepEqual(ui.calls.at(-1),["start",900,undefined]);
  await ui.cleanup();
});

test("typed editor validates both fields without truncation; Cancel retains the applied value",async()=>{
  const calls=[],{DurationEditor:Editor}=durationModule(calls);
  let props={visible:true,seconds:930,onCancel:()=>calls.push("cancel"),onConfirm:s=>calls.push(["confirm",s])};
  let renderer;await act(async()=>{renderer=create(React.createElement(Editor,props));});
  const input=label=>renderer.root.findAllByType("Input").find(n=>n.props.accessibilityLabel===label);
  const text=n=>typeof n==="string"?n:(n.children??[]).map(text).join("");
  const button=label=>renderer.root.findAllByType("Button").find(n=>text(n)===label);
  const type=async(m,s)=>{await act(async()=>{input("Duration minutes").props.onChangeText(m);input("Duration seconds").props.onChangeText(s);});};
  assert.equal(input("Duration minutes").props.value,"15");
  assert.equal(input("Duration seconds").props.value,"30");
  assert.equal(input("Duration minutes").props.maxLength,undefined);
  for(const [m,s] of [["","30"],["0","0"],["480","59"],["481","00"],["15","60"],["1.5","00"],["1000","00"]]){
    await type(m,s);assert.equal(button("Set duration").props.disabled,true);
  }
  for(const [m,s,total] of [["0","1",1],["0","30",30],["15","30",930],["100","00",6000],["480","00",28800]]){
    await type(m,s);assert.equal(button("Set duration").props.disabled,false);
    await act(async()=>button("Set duration").props.onPress());
    assert.deepEqual(calls.at(-1),["confirm",total]);
  }
  await type("20","12");
  await act(async()=>button("Cancel").props.onPress());
  assert.equal(calls.at(-1),"cancel");
  props={...props,visible:false};
  await act(async()=>renderer.update(React.createElement(Editor,props)));
  props={...props,visible:true};
  await act(async()=>renderer.update(React.createElement(Editor,props)));
  assert.equal(input("Duration minutes").props.value,"15");
  assert.equal(input("Duration seconds").props.value,"30");
  await act(async()=>renderer.unmount());
});

test("looping wheels cross 59/00 both ways and tick only for changed user selections",async()=>{
  const calls=[],{default:Picker}=durationModule(calls,true);
  let renderer;await act(async()=>{renderer=create(React.createElement(Picker,{seconds:119,interactive:true,revision:0,onCommit:s=>calls.push(["commit",s]),onBusy:()=>{},onValidity:()=>{},onEdit:()=>{}}));});
  const wheel=()=>renderer.root.findAllByType("Wheel")[1];
  const event=i=>({nativeEvent:{contentOffset:{y:i*wheel().props.snapToInterval},velocity:{y:1}}});
  await act(async()=>wheel().props.onScrollBeginDrag());
  await act(async()=>wheel().props.onScroll(event(300)));
  await act(async()=>wheel().props.onScroll(event(300)));
  assert.equal(calls.filter(c=>c==="haptic").length,1);
  await act(async()=>wheel().props.onScrollEndDrag(event(300)));
  await act(async()=>wheel().props.onMomentumScrollEnd(event(300)));
  assert.deepEqual(calls.at(-1),["commit",60]);
  await act(async()=>wheel().props.onScroll(event(240)));
  assert.equal(calls.filter(c=>c==="haptic").length,1);
  await act(async()=>wheel().props.onScrollBeginDrag());
  await act(async()=>wheel().props.onScroll(event(239)));
  await act(async()=>wheel().props.onScrollEndDrag(event(239)));
  await act(async()=>wheel().props.onMomentumScrollEnd(event(239)));
  assert.deepEqual(calls.at(-1),["commit",119]);
  assert.equal(calls.filter(c=>c==="haptic").length,2);
  await act(async()=>renderer.unmount());
});

test("Session surface stays opaque while the reduced-motion preference resolves",async()=>{
  const preference={value:true};
  const ui=await screenSetup({}, {}, false, preference);
  const surface=()=>ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  assert.equal(surface().props.style.opacity.value,1);
  assert.match(surface().props.style.backgroundColor,/^#[0-9a-f]{6}$/i);
  preference.value=false;await ui.update({});
  assert.equal(surface().props.style.opacity.value,1);
  preference.value=true;await ui.update({});
  assert.equal(surface().props.style.opacity.value,1);
  await ui.cleanup();
});

test("Android keeps Session mounted until exit finishes and rejects repeated close",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true},{},true);
  await ui.press("Minimise session");await ui.back();
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.ok(ui.root().findByType("DurationControl"));
  await ui.finishExit(false);
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  await ui.back();
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>c[0]==="reset"||c[0]==="pause"),false);
  await ui.cleanup();
});

test("viewed completion hides its dock without hiding a running session",async()=>{
  let timer={hasOpenSession:false,isCompleted:true,sessionSummary:{},summaryViewed:false};
  const Dock=load("src/components/SessionTabBar.tsx",{
    "react-native":{View:host("View"),Text:host("Text"),TouchableOpacity:host("Button"),StyleSheet:{create:s=>s}},
    "expo-router":{useRouter:()=>({navigate:()=>{}})},"expo-router/js-tabs":{BottomTabBar:host("Tabs")},
    "@expo/vector-icons":{Ionicons:host("Icon")},"react-native-safe-area-context":{useSafeAreaInsets:()=>({bottom:0})},
    "../context/TimerContext":{useTimer:()=>timer},
  }).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Dock,{}));});
  assert.equal(renderer.root.findAllByType("Button").length,1);
  timer={...timer,summaryViewed:true};await act(async()=>renderer.update(React.createElement(Dock,{})));
  assert.equal(renderer.root.findAllByType("Button").length,0);
  timer={...timer,hasOpenSession:true,isCompleted:false,isRunning:true,timeLeft:30};await act(async()=>renderer.update(React.createElement(Dock,{})));
  assert.equal(renderer.root.findAllByType("Button").length,1);
  await act(async()=>renderer.unmount());
});

test("typed input and presets share applied seconds while linked quests stay read-only",async()=>{
  const ui=await screenSetup();
  await ui.press("Edit duration");
  await act(async()=>ui.root().findByType("DurationSheet").props.onConfirm(6000));
  await ui.update({duration:6000,timeLeft:6000});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,6000);
  await ui.press("30 minutes");await ui.update({duration:1800,timeLeft:1800});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1800);
  await ui.update({linkedTaskId:7,duration:930});
  assert.equal(ui.root().findByType("DurationControl").props.interactive,false);
  assert.equal(ui.button("Edit duration"),undefined);
  await ui.cleanup();
});






test("Session drag follows the finger, cancels back in place and retains timer state until exit", async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,timeLeft:1259},{},true,{value:false});
  const surface=()=>ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  const safe=()=>ui.root().findByType("SafeArea");
  const motion=surface().props.style.transform[0].translateY.source;
  const originalTimer=ui.root().findByType("DurationControl");
  await act(async()=>{
    safe().props.onPanResponderGrant();
    safe().props.onPanResponderMove({}, {dy:64});
  });
  assert.equal(motion.value,0.9); // 64 px of a 640 px screen.
  assert.equal(surface().props.style.opacity.value,0.982);
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  await act(async()=>safe().props.onPanResponderRelease({}, {dy:64,vy:0.1}));
  assert.equal(motion.value,1);
  assert.equal(ui.root().findByType("DurationControl"),originalTimer);
  await act(async()=>{
    safe().props.onPanResponderMove({}, {dy:180});
    safe().props.onPanResponderRelease({}, {dy:180,vy:0.2});
  });
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1259);
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>["pause","reset","seconds"].includes(c[0])),false);
  await ui.cleanup();
});

test("an interrupted Session drag settles back without navigation or timer mutation", async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:false,timeLeft:301},{},false,{value:false});
  const safe=ui.root().findByType("SafeArea");
  const surface=ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  await act(async()=>safe.props.onPanResponderMove({}, {dy:80}));
  assert.equal(surface.props.style.transform[0].translateY.source.value,0.875);
  await act(async()=>safe.props.onPanResponderTerminate());
  assert.equal(surface.props.style.transform[0].translateY.source.value,1);
  assert.equal(ui.calls.length,0);
  await ui.cleanup();
});


test("iOS Session uses one controlled vertical exit and preserves the running timer",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,timeLeft:77},{},true,{value:false},"ios");
  await ui.press("Minimise session");
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.equal(ui.root().findByType("DurationControl").props.seconds,77);
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>["pause","reset"].includes(c[0])),false);
  await ui.cleanup();
});
test("mounting the session provider does not prompt for denied notification permission", async () => {
  let prompts = 0;
  const ui = await providerSetup({}, {
    getPermissionsAsync: async () => ({ status: "denied", granted: false }),
    requestPermissionsAsync: async () => { prompts++; return { status: "granted" }; },
    addNotificationResponseReceivedListener: () => ({ remove() {} }),
  });
  try { assert.equal(prompts, 0); }
  finally { await ui.cleanup(); }
});

function notificationMock() {
  const requests = [], cancellations = [], dismissals = [], channels = [];
  return { requests, cancellations, dismissals, channels, api: {
    AndroidImportance: { LOW: 2, MAX: 5 }, AndroidNotificationPriority: { MAX: 5 },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
    getPermissionsAsync: async () => ({ granted: true, status: "granted" }),
    setNotificationHandler() {}, addNotificationResponseReceivedListener: () => ({ remove() {} }),
    setNotificationChannelAsync: async (id, config) => { channels.push([id, config]); },
    cancelScheduledNotificationAsync: async id => { cancellations.push(id); },
    dismissNotificationAsync: async id => { dismissals.push(id); },
    scheduleNotificationAsync: async request => { requests.push(request); return request.identifier; },
  } };
}
test("duration draft remains mounted until dismissal, then reopens from the applied value", async () => {
  const { DurationEditor } = load("src/components/DurationPicker.tsx", {
    "expo-haptics": {}, "react-native": { ...{ View: host("View"), Text: host("Text"), TouchableOpacity: host("Button") }, StyleSheet: { create: s => s } },
    "@gorhom/bottom-sheet": { BottomSheetScrollView: host("Scroll"), BottomSheetTextInput: host("Input") },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 24 }) },
    "../context/UserContext": {}, "../hooks/useReducedMotion": {},
    "./AppSheet": props => React.createElement("Sheet", props, props.children),
  });
  let renderer, props = { visible: false, seconds: 930, onCancel() {}, onConfirm() {} };
  await act(async () => { renderer = create(React.createElement(DurationEditor, props)); });
  try {
    assert.equal(renderer.toJSON(), null);
    props = { ...props, visible: true }; await act(async () => renderer.update(React.createElement(DurationEditor, props)));
    await act(async () => renderer.root.findAllByType("Input")[0].props.onChangeText("20"));
    props = { ...props, visible: false }; await act(async () => renderer.update(React.createElement(DurationEditor, props)));
    assert.equal(renderer.root.findAllByType("Input")[0].props.value, "20");
    await act(async () => renderer.root.findByType("Sheet").props.onDismiss());
    assert.equal(renderer.toJSON(), null);
    props = { ...props, visible: true }; await act(async () => renderer.update(React.createElement(DurationEditor, props)));
    assert.equal(renderer.root.findAllByType("Input")[0].props.value, "15");
    await act(async () => renderer.root.findByType("Sheet").props.onDismiss());
    assert.equal(renderer.root.findAllByType("Input").length, 2);
    props = { ...props, visible: false }; await act(async () => renderer.update(React.createElement(DurationEditor, props)));
    const staleDismiss = renderer.root.findByType("Sheet").props.onDismiss;
    props = { ...props, visible: true }; await act(async () => renderer.update(React.createElement(DurationEditor, props)));
    await act(async () => staleDismiss());
    assert.equal(renderer.root.findAllByType("Input").length, 2);
  } finally { await act(async () => renderer.unmount()); }
});
test("Android actual scheduling payloads route ongoing and timed alerts through preference channels", async () => {
  const api = load("src/services/sessionNotificationService.ts", {});
  for (const sound of [false, true]) for (const haptics of [false, true]) {
    const mock = notificationMock(), preferences = { sound, haptics };
    const lifecycle = api.createSessionNotificationLifecycle(mock.api, "android", preferences);
    await lifecycle.schedule(930, "Read");
    const [ongoing, completion] = mock.requests;
    assert.deepEqual(ongoing.trigger, { channelId: api.ONGOING_CHANNEL_ID });
    assert.equal(ongoing.content.channelId, undefined);
    assert.equal(ongoing.content.sound, false);
    assert.deepEqual(completion.trigger, { type: "timeInterval", seconds: 930, repeats: false, channelId: api.completionChannelId(preferences) });
    assert.equal(completion.content.channelId, undefined);
    assert.equal(completion.content.sound, sound ? "default" : false);
    assert.deepEqual(completion.content.data, { type: "COMPLETION" });
    const channel = mock.channels.find(([id]) => id === completion.trigger.channelId)[1];
    assert.equal(channel.sound, sound ? "default" : null);
    assert.equal(channel.enableVibrate, haptics);
    assert.equal(mock.channels.find(([id]) => id === api.ONGOING_CHANNEL_ID)[1].sound, null);
    await lifecycle.clear();
    assert.deepEqual(mock.cancellations.slice(-2), [api.ONGOING_NOTIFICATION_ID, api.COMPLETION_NOTIFICATION_ID]);
    assert.deepEqual(mock.dismissals.slice(-2), [api.ONGOING_NOTIFICATION_ID, api.COMPLETION_NOTIFICATION_ID]);
  }
});
test("iOS retains immediate and interval triggers without Android channel fields", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  await api.createSessionNotificationLifecycle(mock.api, "ios", { sound: false, haptics: false }).schedule(30);
  assert.equal(mock.requests[0].trigger, null);
  assert.deepEqual(mock.requests[1].trigger, { type: "timeInterval", seconds: 30, repeats: false });
  assert.equal(mock.requests[1].content.priority, undefined);
  assert.equal(mock.channels.length, 0);
});
test("effect reactivation restores scheduling and preference changes apply to the next alert", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  const lifecycle = api.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  await lifecycle.dispose(); await lifecycle.schedule(30);
  assert.equal(mock.requests.length, 0);
  lifecycle.activate(); lifecycle.setPreferences({ sound: false, haptics: false });
  await lifecycle.schedule(60);
  assert.equal(mock.requests.at(-1).trigger.channelId, api.completionChannelId({ sound: false, haptics: false }));
  assert.equal(mock.requests.at(-1).content.sound, false);
});
test("late native work and background refresh cannot resurrect notifications after teardown/account switch", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock(), pending = deferred();
  const schedule = mock.api.scheduleNotificationAsync;
  mock.api.scheduleNotificationAsync = async request => { await pending.promise; return schedule(request); };
  const oldAccount = api.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  const starting = oldAccount.schedule(60);
  await new Promise(resolve => setImmediate(resolve));
  const refresh = oldAccount.refreshOngoing();
  const clearing = oldAccount.clear();
  pending.resolve(); await Promise.all([starting, refresh, clearing]);
  assert.equal(mock.requests.some(r => r.identifier === api.COMPLETION_NOTIFICATION_ID), false);
  assert.equal(mock.cancellations.at(-1), api.COMPLETION_NOTIFICATION_ID);
  const nextAccount = api.createSessionNotificationLifecycle(mock.api, "android", { sound: false, haptics: false });
  await Promise.all([oldAccount.clear(), nextAccount.schedule(30)]);
  assert.equal(mock.requests.at(-1).trigger.seconds, 30);
  await oldAccount.dispose();
  await nextAccount.schedule(60);
  const count = mock.requests.length;
  // A late server RPC returning to the unmounted provider cannot replace alerts.
  await oldAccount.schedule(90);
  await oldAccount.refreshOngoing();
  assert.equal(mock.requests.length, count);
  assert.equal(mock.requests.at(-1).trigger.seconds, 60);
});
test("provider start/pause/resume/end and completion replace or clear both real notification identifiers", async () => {
  const mock = notificationMock(), ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(930, "Read"));
    assert.equal(mock.requests.at(-1).trigger.seconds, 930);
    await ui.advance(31); await ui.run(s => s.pauseTimer());
    assert.deepEqual(mock.cancellations.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
    await ui.run(s => s.resumeTimer());
    assert.equal(mock.requests.at(-1).trigger.seconds, 899);
    await ui.run(s => s.resetTimer());
    assert.deepEqual(mock.dismissals.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
    await ui.run(s => s.startTimer(30)); await ui.advance(31);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
    assert.equal(mock.cancellations.at(-1), "life-rpg-completion-timer");
  } finally { await ui.cleanup(); }
});
test("restore replaces active alerts and clears paused/absent stale alerts", async () => {
  for (const status of ["active", "paused", null]) {
    const mock = notificationMock(), ui = await providerSetup({ getOpenActivitySession: async () => status && ({
      id: "saved", task_id: null, subject_id: null, activity_type: "other", target_duration_seconds: 930,
      elapsed_seconds: 31, status, notes: "", last_resumed_at: new Date(1_000_000).toISOString(),
    }) }, mock.api);
    try {
      assert.deepEqual(mock.cancellations.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
      if (status === "active") assert.equal(mock.requests.at(-1).trigger.seconds, 899);
      else assert.equal(mock.requests.length, 0);
    } finally { await ui.cleanup(); }
  }
});
test("native scheduling/channel/cancellation failures never turn successful timer actions into failures", async () => {
  const mock = notificationMock();
  for (const name of ["setNotificationChannelAsync", "cancelScheduledNotificationAsync", "dismissNotificationAsync", "scheduleNotificationAsync"]) {
    mock.api[name] = async () => { throw Error("Native unavailable"); };
  }
  const ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(30)); assert.equal(ui.state().isRunning, true);
    await ui.run(s => s.pauseTimer()); assert.equal(ui.state().isRunning, false);
    await ui.run(s => s.resumeTimer()); assert.equal(ui.state().isRunning, true);
    await ui.advance(31);
    assert.equal(ui.state().actionError, null);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
    await ui.run(s => s.resetTimer()); assert.equal(ui.state().hasOpenSession, false);
  } finally { await ui.cleanup(); }
});
test("notification listener initialization failure leaves the timer usable", async () => {
  const mock = notificationMock();
  mock.api.addNotificationResponseReceivedListener = () => { throw Error("Unavailable native listener"); };
  const ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(30));
    assert.equal(ui.state().isRunning, true);
    await ui.advance(31);
    assert.equal(ui.state().actionError, null);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
  } finally { await ui.cleanup(); }
});

 test("Home setup after a saved one-second completion releases the old ID and starts once", async () => {
  let starts = 0;
  const ui = await providerSetup({
    startActivitySession: async () => `session-${++starts}`,
    completeActivitySession: async () => ({ ...result, duration_seconds: 1, minutes: 0, xp_earned: 0, gold_earned: 0 }),
  });
  try {
    await ui.run(s => s.startTimer(1));
    await ui.advance(1);
    assert.ok(ui.state().sessionSummary);
    await ui.run(s => s.clearCompletionModal());
    await ui.run(s => { s.setLinkedTaskId(null); s.setDurationInMinutes(30); });
    assert.equal(ui.state().isCompleted, false);
    await ui.run(s => s.startTimer(1800));
    assert.equal(starts, 2);
    assert.equal(ui.state().hasOpenSession, true);
    assert.equal(ui.calls.filter(c => c[0] === "cancel").length, 0);
  } finally { await ui.cleanup(); }
});

test("duration changes cannot abandon an in-flight or failed completion", async () => {
  const pending = deferred();
  const ui = await providerSetup({ completeActivitySession: () => pending.promise });
  try {
    await ui.run(s => s.startTimer(1));
    await ui.advance(1);
    await ui.run(s => s.setDurationInMinutes(30));
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().duration, 1);
    await ui.run(() => pending.reject(Error("Offline")));
    await ui.run(s => s.setDurationInMinutes(30));
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().duration, 1);
    assert.match(ui.state().actionError, /save/);
  } finally { await ui.cleanup(); }
});

test("completed setup keeps presets and wheel commits editable before the next Start", async () => {
  const ui = await providerSetup({ completeActivitySession: async () => ({ ...result, duration_seconds: 1, minutes: 0 }) });
  try {
    await ui.run(s => s.startTimer(1));
    await ui.advance(1);
    await ui.run(s => s.setDurationInMinutes(60));
    assert.equal(ui.state().duration, 3600);
    await ui.run(s => s.setDurationInSeconds(2700));
    assert.equal(ui.state().duration, 2700);
    await ui.run(s => s.setDurationInSeconds(2715));
    assert.equal(ui.state().duration, 2715);
    await ui.run(s => s.startTimer(ui.state().duration));
    assert.equal(ui.state().hasOpenSession, true);
    assert.equal(ui.calls.filter(c => c[0] === "start").at(-1)[1].targetDurationSeconds, 2715);
  } finally { await ui.cleanup(); }
});
