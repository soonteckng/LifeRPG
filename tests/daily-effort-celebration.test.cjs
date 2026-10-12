/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ["", ".ts", ".tsx"].find(value => fs.existsSync(target + value));
    return load(path.relative(path.resolve(__dirname, ".."), target + extension), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const service = load("src/services/dailyEffortCelebrationService.ts");
const evidence = (overrides = {}) => ({visible:true,pending:false,recovered:false,sessionId:"session-a",ownerId:"owner-a",timeZone:"Asia/Kuala_Lumpur",creditedDate:"2026-10-12",creditVersion:1,durationSeconds:60,dailyCompletedSeconds:60,...overrides});
const NOW = Date.UTC(2026, 9, 12, 2);
const deferred = () => {let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve};};
const storage = () => {const values = new Map(), writes=[]; return {values,writes,getItem:async key=>values.get(key)??null,setItem:async(key,value)=>{writes.push(key);values.set(key,value);}};};

test("only a confirmed first receipt for the account's current local day earns encouragement", () => {
  assert.equal(service.firstDailyEffortEvidence(evidence(), NOW), true);
  assert.equal(service.firstDailyEffortEvidence(evidence({durationSeconds:30,dailyCompletedSeconds:30}), NOW), true, "sub-minute effort still counts");
  for (const change of [
    {pending:true},{visible:false},{ownerId:""},{sessionId:null},{creditVersion:undefined},
    {dailyCompletedSeconds:120},{dailyCompletedSeconds:undefined},{durationSeconds:0},{durationSeconds:1.5,dailyCompletedSeconds:1.5},
    {creditedDate:"2026-10-11"},{creditedDate:"not-a-date"},{timeZone:"invalid"},
  ]) assert.equal(service.firstDailyEffortEvidence(evidence(change), NOW), false, JSON.stringify(change));
  assert.equal(service.firstDailyEffortEvidence(evidence({recovered:true}), NOW), true, "same-day recovery still deserves an unseen first-session message");
  const nearMidnight = Date.UTC(2026,9,11,17);
  assert.equal(service.firstDailyEffortEvidence(evidence(), nearMidnight), true, "receipt uses local date, not UTC date");
  assert.equal(service.firstDailyEffortEvidence(evidence({timeZone:"UTC"}), nearMidnight), false);
});

test("goal celebration uses the receipt's stored crossing, including an idempotent recovered reply", () => {
  const crossing = evidence({durationSeconds:60,dailyCompletedSeconds:1800,dailyGoalMinutes:30,goalReachedNow:true});
  assert.equal(service.dailyGoalEvidence(crossing,NOW),true);
  assert.equal(service.dailyGoalEvidence({...crossing,recovered:true,goalReachedNow:false},NOW),true,"retry clears the live flag but preserves the stored crossing");
  assert.equal(service.dailyGoalEvidence({...crossing,dailyCompletedSeconds:1860,goalReachedNow:false},NOW),false,"a later session does not cross the goal again");
  assert.equal(service.dailyGoalEvidence({...crossing,dailyCompletedSeconds:1799},NOW),false,"no celebration before the stored goal");
  assert.equal(service.dailyGoalEvidence({...crossing,pending:true},NOW),false);
  assert.equal(service.dailyGoalEvidence({...crossing,creditedDate:"2026-10-11",recovered:true},NOW),false,"earlier recovered days stay quiet");
  assert.equal(service.dailyGoalEvidence({...crossing,dailyGoalMinutes:undefined},NOW),true,"a confirmed server crossing flag is sufficient when a target is absent");
  assert.equal(service.dailyGoalEvidence({...crossing,dailyGoalMinutes:undefined,goalReachedNow:false},NOW),false,"never guess a goal from the profile");
});

test("same-day claims serialize across result surfaces and stay claimed after a restart", async () => {
  const saved = storage(), claims = service.createDailyEffortClaims(saved,"backend-a");
  const outcomes = await Promise.all([claims.claim("owner-a","2026-10-12",()=>true),claims.claim("owner-a","2026-10-12",()=>true)]);
  assert.deepEqual(outcomes,[true,false]); assert.equal(saved.writes.length,1);
  const restarted = service.createDailyEffortClaims(saved,"backend-a");
  assert.equal(await restarted.claim("owner-a","2026-10-12",()=>true),false);
  assert.equal(await restarted.claim("owner-a","2026-10-13",()=>true),true);
  assert.equal(await restarted.claim("owner-b","2026-10-12",()=>true),true);
  assert.equal(await service.createDailyEffortClaims(saved,"backend-b").claim("owner-a","2026-10-12",()=>true),true);
  assert.equal(saved.values.size,3);
});

test("first-session and daily-goal claims are independent and both persist across a restart", async () => {
  const saved=storage(), claims=service.createDailyEffortClaims(saved,"backend");
  assert.equal(await claims.claim("owner","2026-10-12",()=>true),true);
  assert.equal(await claims.claim("owner","2026-10-12",()=>true,"daily-goal"),true,"later daily goal is not consumed by first-session encouragement");
  const restarted=service.createDailyEffortClaims(saved,"backend");
  assert.equal(await restarted.claim("owner","2026-10-12",()=>true),false);
  assert.equal(await restarted.claim("owner","2026-10-12",()=>true,"daily-goal"),false);
  assert.equal(saved.values.size,2);
});

test("claim ledger is bounded and storage faults never block the ordinary result", async () => {
  const saved = storage(), claims = service.createDailyEffortClaims(saved,"backend-a");
  for(let day=1;day<=40;day++) {
    const date = new Date(Date.UTC(2026,8,day)).toISOString().slice(0,10);
    assert.equal(await claims.claim("owner-a",date,()=>true),true);
  }
  const ledger = JSON.parse([...saved.values.values()][0]);
  assert.equal(ledger.days.length,35); assert.equal(new Set(ledger.days).size,35);
  assert.equal(await service.createDailyEffortClaims({getItem:async()=>{throw Error("read failed");},setItem:async()=>{}} ,"backend").claim("owner","2026-10-12",()=>true),false);
  assert.equal(await service.createDailyEffortClaims({getItem:async()=>null,setItem:async()=>{throw Error("write failed");}} ,"backend").claim("owner","2026-10-12",()=>true),false);
  assert.equal(await service.createDailyEffortClaims({getItem:async()=>"bad json",setItem:async()=>{throw Error("must not overwrite");}} ,"backend").claim("owner","2026-10-12",()=>true),false);
});

test("cancelled or switched-owner async claims cannot display or write for the replacement account", async () => {
  const waiting = deferred(), writes=[]; let current=true;
  const claims = service.createDailyEffortClaims({getItem:()=>waiting.promise,setItem:async(key)=>writes.push(key)},"backend");
  const pending = claims.claim("owner-a","2026-10-12",()=>current);
  await Promise.resolve(); current=false; waiting.resolve(null);
  assert.equal(await pending,false); assert.equal(writes.length,0);
});

test("closing and reopening a confirmed result does not replay its daily banner", async () => {
  const saved=storage(), realNow=Date.now; Date.now=()=>NOW;
  const useCelebration=load("src/hooks/useDailyEffortCelebration.ts",{"@react-native-async-storage/async-storage":saved}).useDailyEffortCelebration;
  let value=evidence(), visible, renderer;
  function Consumer(){visible=useCelebration(value);return null;}
  try {
    await act(async()=>{renderer=create(React.createElement(Consumer));});
    assert.deepEqual(visible,{firstSession:true,dailyGoal:false});
    value=evidence({visible:false}); await act(async()=>renderer.update(React.createElement(Consumer))); assert.deepEqual(visible,{firstSession:false,dailyGoal:false});
    value=evidence(); await act(async()=>renderer.update(React.createElement(Consumer))); assert.deepEqual(visible,{firstSession:false,dailyGoal:false});
    await act(async()=>renderer.unmount()); renderer=null;
    await act(async()=>{renderer=create(React.createElement(Consumer));}); assert.deepEqual(visible,{firstSession:false,dailyGoal:false});
  } finally {if(renderer)await act(async()=>renderer.unmount()); Date.now=realNow;}
});

test("switching accounts during a stored claim never displays the first account's message", async () => {
  const waiting=deferred(), values=new Map(), realNow=Date.now; Date.now=()=>NOW;
  const saved={getItem:async key=>key.endsWith(":owner-a")?waiting.promise:values.get(key)??null,setItem:async(key,value)=>values.set(key,value)};
  const useCelebration=load("src/hooks/useDailyEffortCelebration.ts",{"@react-native-async-storage/async-storage":saved}).useDailyEffortCelebration;
  let value=evidence(), visible, renderer;
  function Consumer(){visible=useCelebration(value);return null;}
  try {
    await act(async()=>{renderer=create(React.createElement(Consumer));}); assert.deepEqual(visible,{firstSession:false,dailyGoal:false});
    value=evidence({ownerId:"owner-b",sessionId:"session-b",pending:true});
    await act(async()=>renderer.update(React.createElement(Consumer)));
    await act(async()=>waiting.resolve(null));
    assert.deepEqual(visible,{firstSession:false,dailyGoal:false}); assert.equal(values.size,0);
    value=evidence({ownerId:"owner-b",sessionId:"session-b"});
    await act(async()=>renderer.update(React.createElement(Consumer))); assert.deepEqual(visible,{firstSession:true,dailyGoal:false});
    assert.ok([...values.keys()].every(key=>key.endsWith(":owner-b")));
  } finally {if(renderer)await act(async()=>renderer.unmount()); Date.now=realNow;}
});

test("offline confirmation publishes first-session and goal together, then suppresses both after reopening", async () => {
  const saved=storage(), realNow=Date.now; Date.now=()=>NOW;
  const useCelebration=load("src/hooks/useDailyEffortCelebration.ts",{"@react-native-async-storage/async-storage":saved}).useDailyEffortCelebration;
  let value=evidence({pending:true,durationSeconds:1800,dailyCompletedSeconds:1800,dailyGoalMinutes:30}), visible, renderer;
  function Consumer(){visible=useCelebration(value);return null;}
  try {
    await act(async()=>{renderer=create(React.createElement(Consumer));});
    assert.deepEqual(visible,{firstSession:false,dailyGoal:false}); assert.equal(saved.writes.length,0,"an unsaved result cannot claim congratulations");
    value={...value,pending:false,recovered:true,goalReachedNow:false};
    await act(async()=>renderer.update(React.createElement(Consumer)));
    assert.deepEqual(visible,{firstSession:true,dailyGoal:true}); assert.equal(saved.writes.length,2);
    value={...value,visible:false};await act(async()=>renderer.update(React.createElement(Consumer)));
    value={...value,visible:true};await act(async()=>renderer.update(React.createElement(Consumer)));
    assert.deepEqual(visible,{firstSession:false,dailyGoal:false});
    value=evidence({sessionId:"later-session",durationSeconds:60,dailyCompletedSeconds:1860,dailyGoalMinutes:30});
    await act(async()=>renderer.update(React.createElement(Consumer)));
    assert.deepEqual(visible,{firstSession:false,dailyGoal:false});assert.equal(saved.writes.length,2);
  }finally{if(renderer)await act(async()=>renderer.unmount());Date.now=realNow;}
});

test("a later goal-crossing session remains eligible after the first session's celebration", async () => {
  const saved=storage(), realNow=Date.now; Date.now=()=>NOW;
  const useCelebration=load("src/hooks/useDailyEffortCelebration.ts",{"@react-native-async-storage/async-storage":saved}).useDailyEffortCelebration;
  let value=evidence({dailyGoalMinutes:30}), visible, renderer;
  function Consumer(){visible=useCelebration(value);return null;}
  try {
    await act(async()=>{renderer=create(React.createElement(Consumer));});assert.deepEqual(visible,{firstSession:true,dailyGoal:false});
    value=evidence({sessionId:"goal-session",durationSeconds:60,dailyCompletedSeconds:1800,dailyGoalMinutes:30,goalReachedNow:true});
    await act(async()=>renderer.update(React.createElement(Consumer)));
    assert.deepEqual(visible,{firstSession:false,dailyGoal:true});assert.equal(saved.writes.length,2);
  }finally{if(renderer)await act(async()=>renderer.unmount());Date.now=realNow;}
});

test("daily celebration animates once, cancels in background and respects Reduce Motion", async () => {
  let reduced=false, listener; const events=[];
  class Value {constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(value){return value;}}
  function Host(props){return React.createElement("View",props,props.children);}
  const component=load("src/components/DailyEffortCelebration.tsx",{
    "react-native":{View:Host,Animated:{Value,View:Host,timing:(_value,config)=>({start(){events.push(["start",config]);},stop(){events.push(["stop"]);}})},AppState:{currentState:"active",addEventListener:(_event,next)=>{listener=next;return{remove(){events.push(["remove"]);}};}},StyleSheet:{create:value=>value,hairlineWidth:1}},
    "@expo/vector-icons":{Ionicons:Host},"./AppText":{Text:Host},"../hooks/useReducedMotion":{useReducedMotion:()=>reduced},
  }).default;
  let renderer;
  await act(async()=>{renderer=create(React.createElement(component));});
  try {
    assert.equal(events.filter(event=>event[0]==="start").length,1);
    assert.equal(events[0][1].useNativeDriver,true);
    await act(async()=>listener("background")); assert.ok(events.some(event=>event[0]==="stop"));
    reduced=true;await act(async()=>renderer.update(React.createElement(component)));
    reduced=false;await act(async()=>renderer.update(React.createElement(component)));
    assert.equal(events.filter(event=>event[0]==="start").length,1);
  }finally{await act(async()=>renderer.unmount());}
  events.length=0; reduced=true;
  await act(async()=>{renderer=create(React.createElement(component));});
  assert.equal(events.filter(event=>event[0]==="start").length,0);await act(async()=>renderer.unmount());
});

test("confirmed first-day encouragement stays inside the existing result with a single Done action", async () => {
  const saved=storage(), realNow=Date.now; Date.now=()=>NOW;
  const host=type=>function CelebrationHost(props){return React.createElement(type,props,props.children);};
  class Value {constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(value){return value;}}
  const Modal=load("src/components/LevelUpModal.tsx",{
    "react-native":{View:host("View"),Text:host("Text"),Platform:{OS:"android"},StyleSheet:{create:value=>value,hairlineWidth:1},useWindowDimensions:()=>({height:844,width:390,fontScale:1}),AppState:{currentState:"active"},Animated:{Value,View:host("Animated")}},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({top:24,bottom:34})},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("Scroll")},"@expo/vector-icons":{Ionicons:host("Icon")},
    "./AppSheet":props=>React.createElement("Sheet",props,props.header,props.children),
    "./MotionPressable":host("Button"),"./ProgressRing":host("Ring"),"./SaveSuggestedQuest":()=>null,
    "../context/UserContext":{useUser:()=>({hapticsEnabled:false,profile:{id:"owner-a",level:1,current_xp:1}})},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},"expo-haptics":{},"@react-native-async-storage/async-storage":saved,
  }).default;
  const input={visible:true,pending:false,recovered:false,sessionId:"confirmed",creditVersion:1,creditedDate:"2026-10-12",dailyCompletedSeconds:60,durationSeconds:60,onClose(){}};
  const content=node=>typeof node==="string"?node:(node.children??[]).map(content).join("");
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(Modal,input));});
    assert.match(content(renderer.root),/Nice work!.*Your first session today/);
    assert.ok(renderer.root.findByProps({testID:"first-daily-effort"}),"a legacy missing profile timezone uses the database's default local timezone");
    assert.equal(renderer.root.findAllByType("Sheet").length,1);
    assert.deepEqual(renderer.root.findAllByType("Button").map(content),["Done"]);
    await act(async()=>renderer.update(React.createElement(Modal,{...input,visible:false})));
    await act(async()=>renderer.update(React.createElement(Modal,input)));
    assert.doesNotMatch(content(renderer.root),/Your first session today/);
  }finally{if(renderer)await act(async()=>renderer.unmount());Date.now=realNow;}
});

test("same-day recovered goal achievement is prominent in the ordinary sheet and Done stays outside scrolling", async () => {
  const saved=storage(), realNow=Date.now; Date.now=()=>NOW;
  const host=type=>function CelebrationHost(props){return React.createElement(type,props,props.children);};
  class Value {constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(value){return value;}}
  const Modal=load("src/components/LevelUpModal.tsx",{
    "react-native":{View:host("View"),Text:host("Text"),Platform:{OS:"android"},StyleSheet:{create:value=>value,hairlineWidth:1},useWindowDimensions:()=>({height:640,width:360,fontScale:1.6}),AppState:{currentState:"active"},Animated:{Value,View:host("Animated")}},
    "react-native-safe-area-context":{useSafeAreaInsets:()=>({top:24,bottom:34})},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("Scroll")},"@expo/vector-icons":{Ionicons:host("Icon")},
    "./AppSheet":props=>React.createElement("Sheet",props,props.header,props.children),
    "./MotionPressable":host("Button"),"./ProgressRing":host("Ring"),"./SaveSuggestedQuest":()=>null,
    "../context/UserContext":{useUser:()=>({hapticsEnabled:false,profile:{id:"owner-a",timezone:"Asia/Kuala_Lumpur",level:1,current_xp:30}})},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},"expo-haptics":{},"@react-native-async-storage/async-storage":saved,
  }).default;
  const content=node=>typeof node==="string"?node:(node.children??[]).map(content).join("");
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(Modal,{visible:true,pending:false,recovered:true,sessionId:"recovered-crossing",creditVersion:1,creditedDate:"2026-10-12",dailyCompletedSeconds:1800,dailyGoalMinutes:30,durationSeconds:1800,goalReachedNow:false,onClose(){}}));});
    const scroll=renderer.root.findByType("Scroll"), banner=renderer.root.findByProps({testID:"daily-achievement-celebration"});
    assert.match(content(banner),/Nice work!.*Your first session today.*Daily goal complete/);
    assert.equal(banner.props.accessibilityLiveRegion,"polite");
    assert.match(banner.props.accessibilityLabel,/first session.*daily goal/);
    assert.equal(scroll.children[0].findByProps({testID:"daily-achievement-celebration"}),banner,"encouragement is first in the result content");
    assert.equal(scroll.findAllByType("Button").length,0);
    assert.deepEqual(renderer.root.findAllByType("Button").map(content),["Done"]);
    assert.equal(renderer.root.findAllByType("Sheet").length,1);
  }finally{if(renderer)await act(async()=>renderer.unmount());Date.now=realNow;}
});
