const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

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
const result = { already_completed: false, xp_earned: 30, gold_earned: 5, minutes: 1, level: 2, leveled_up: false };

async function providerSetup(overrides = {}) {
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
    "expo-notifications": null,
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
  await ui.run((s) => { first=s.startTimer(30,"Read"); void s.startTimer(30,"Read"); });
  assert.equal(starts,1);
  assert.equal(ui.state().actionBusy,true);
  await ui.run(async () => { pending.reject(Error("Offline")); await first; });
  assert.equal(ui.state().hasOpenSession,false);
  assert.match(ui.state().actionError,/start your session/);
  assert.equal(ui.state().actionBusy,false);
  await ui.run((s) => s.startTimer(30,"Read"));
  assert.equal(starts,2);
  assert.equal(ui.state().hasOpenSession,true);
  assert.equal(ui.state().actionError,null);
  await ui.cleanup();
});

test("minimise/reopen keeps running and paused identity, settings and remaining time", async () => {
  const ui=await providerSetup();
  await ui.run((s)=> { s.setLinkedTaskId(7); s.setTargetAttributeId(3); s.setActivityType("read"); });
  await ui.run((s)=>s.startTimer(30,"Read"));
  await ui.advance(10);
  await ui.page(false); await ui.page(true);
  assert.equal(ui.state().timeLeft,1790);
  assert.equal(ui.state().isRunning,true);
  await ui.run((s)=>s.pauseTimer());
  await ui.page(false); await ui.page(true);
  await ui.run((s)=> { s.setLinkedTaskId(99); s.setTargetAttributeId(99); s.setActivityType("work"); s.setDurationInMinutes(15); return s.startTimer(15); });
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
  await ui.run((s)=>s.startTimer(1,"Read"));
  await ui.advance(61);
  assert.equal(ui.state().isCompleted,true);
  assert.equal(ui.state().rewardsVisible,true);
  const summary=ui.state().sessionSummary;
  await ui.run((s)=>s.clearCompletionModal());
  assert.equal(ui.state().rewardsVisible,false);
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
  await ui.run((s)=>s.startTimer(1));
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
  await ui.run((s)=>s.startTimer(30));
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
  await ui.run((s)=>s.startTimer(30));
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

async function screenSetup(initial = {}, questOverrides = {}) {
  const calls = [], keyboardListeners = {};
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
    setActivityType:(value)=>{calls.push(["activity",value]);},setDurationInMinutes:(value)=>{calls.push(["duration",value]);},
    setNotes:()=>{},resolveQuestTitle:()=>{},
    ...initial,
  };
  const router = {canDismiss:()=>true,dismiss:()=>calls.push(["dismiss"]),replace:()=>calls.push(["replace"])};
  const quests = {tasks:[{id:7,title:"A long quest title worth finishing",target_minutes:30,subject_id:1,is_due_today:true,is_completed_today:false}],
    subjects:[{id:1,title:"General"}],loading:false,error:false,refresh:async()=>{},...questOverrides};
  const Screen=load("src/components/SessionScreen.tsx",{
    "react-native":{
      View:host("View"),Text:host("Text"),TextInput:host("Input"),TouchableOpacity:host("Button"),
      ScrollView:host("Scroll"),KeyboardAvoidingView:host("KeyboardView"),ActivityIndicator:host("Spinner"),
      Platform:{OS:"android"},useWindowDimensions:()=>({height:640,width:320,fontScale:1.5}),
      StyleSheet:{create:(s)=>s,hairlineWidth:1,absoluteFill:{}},
      Keyboard:{isVisible:()=>keyboard,dismiss:()=>{keyboard=false;keyboardListeners.keyboardDidHide?.();calls.push(["keyboard"]);},addListener:(event,fn)=>{keyboardListeners[event]=fn;return{remove(){}};}},
      BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}};}},
      Animated:{Value:class {setValue(){}},View:host("AnimatedView"),timing:()=>({start(){},stop(){}})},
    },
    "expo-router":{Stack:{Screen:host("Options")},useRouter:()=>router,useFocusEffect:(effect)=>React.useEffect(effect,[effect])},
    "expo-router/react-navigation":{usePreventRemove:()=>{}},
    "@expo/vector-icons":{Ionicons:host("Icon")},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("SheetScroll"),TouchableOpacity:host("Button")},
    "react-native-safe-area-context":{SafeAreaView:host("SafeArea")},
    "./AppSheet":(p)=>p.visible?React.createElement("Sheet",p,p.header,p.children):null,
    "./SheetConfirmation":(p)=>React.createElement("Confirm",p),
    "../context/TimerContext":{useTimer:()=>state},"../context/QuestContext":{useQuests:()=>quests},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},
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
    cleanup:async()=>{await act(async()=>renderer.unmount());},
  };
}

test("timer anchor and countdown stay mounted with identical layout across setup, running and paused",async()=>{
  const ui=await screenSetup();
  const anchor=ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor");
  const countdown=ui.root().findAllByType("Text").find((n)=>n.props.testID==="session-countdown");
  const layout=JSON.stringify(anchor.props.style);
  await ui.update({hasOpenSession:true,isRunning:true,timeLeft:1800});
  assert.equal(ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor"),anchor);
  assert.equal(JSON.stringify(anchor.props.style),layout);
  assert.equal(ui.root().findAllByType("Text").find((n)=>n.props.testID==="session-countdown"),countdown);
  await ui.update({isRunning:false,timeLeft:1795});
  assert.equal(JSON.stringify(anchor.props.style),layout);
  assert.ok(ui.button("Resume"));
  assert.equal(ui.button("Choose activity"),undefined);
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
  assert.deepEqual(ui.calls.at(-1),["start",45,"A long quest title worth finishing"]);
  await ui.cleanup();
  const missing=await screenSetup({linkedTaskId:7},{tasks:[],loading:true});
  assert.match(missing.output(),/Loading quest/);
  assert.equal(missing.button("Start").props.disabled,true);
  assert.equal(missing.calls.length,0);
  await missing.cleanup();
});

test("screen rejects invalid custom input and Retry uses the valid duration",async()=>{
  const ui=await screenSetup();
  await ui.press("Custom");
  await act(async()=>ui.root().findByType("Input").props.onChangeText("0"));
  await ui.press("Start");
  assert.match(ui.output(),/1 to 480/);
  assert.equal(ui.calls.some(([action])=>action==="start"),false);
  await act(async()=>ui.root().findByType("Input").props.onChangeText("45"));
  await ui.update({actionError:"Couldn’t start your session."});
  await ui.press("Retry");
  assert.deepEqual(ui.calls.at(-1),["start",45,undefined]);
  await ui.update({actionBusy:true});
  assert.equal(ui.button("Start").props.disabled,true);
  await ui.cleanup();
});

test("back dismisses keyboard, then picker, then the screen without resetting",async()=>{
  const ui=await screenSetup();
  await ui.press("Choose activity");
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
  const ui=await screenSetup({isCompleted:true,timeLeft:0,sessionSummary:{questTitle:"Read",minutesSpent:30,xpEarned:30,goldEarned:5}});
  assert.match(ui.output(),/30 minutes completed/);
  assert.ok(ui.button("Done")); assert.ok(ui.button("New session"));
  await ui.press("Done");
  assert.deepEqual(ui.calls,[["dismiss"]]);
  assert.match(ui.output(),/30 minutes completed/);
  await ui.cleanup();
});


