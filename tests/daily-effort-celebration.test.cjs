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

test("only a fresh confirmed first receipt for the account's current local day earns encouragement", () => {
  assert.equal(service.firstDailyEffortEvidence(evidence(), NOW), true);
  assert.equal(service.firstDailyEffortEvidence(evidence({durationSeconds:30,dailyCompletedSeconds:30}), NOW), true, "sub-minute effort still counts");
  for (const change of [
    {pending:true},{recovered:true},{visible:false},{ownerId:""},{sessionId:null},{creditVersion:undefined},
    {dailyCompletedSeconds:120},{dailyCompletedSeconds:undefined},{durationSeconds:0},{durationSeconds:1.5,dailyCompletedSeconds:1.5},
    {creditedDate:"2026-10-11"},{creditedDate:"not-a-date"},{timeZone:"invalid"},
  ]) assert.equal(service.firstDailyEffortEvidence(evidence(change), NOW), false, JSON.stringify(change));
  const nearMidnight = Date.UTC(2026,9,11,17);
  assert.equal(service.firstDailyEffortEvidence(evidence(), nearMidnight), true, "receipt uses local date, not UTC date");
  assert.equal(service.firstDailyEffortEvidence(evidence({timeZone:"UTC"}), nearMidnight), false);
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
    assert.equal(visible,true);
    value=evidence({visible:false}); await act(async()=>renderer.update(React.createElement(Consumer))); assert.equal(visible,false);
    value=evidence(); await act(async()=>renderer.update(React.createElement(Consumer))); assert.equal(visible,false);
    await act(async()=>renderer.unmount()); renderer=null;
    await act(async()=>{renderer=create(React.createElement(Consumer));}); assert.equal(visible,false);
  } finally {if(renderer)await act(async()=>renderer.unmount()); Date.now=realNow;}
});

test("switching accounts during a stored claim never displays the first account's message", async () => {
  const waiting=deferred(), values=new Map(), realNow=Date.now; Date.now=()=>NOW;
  const saved={getItem:async key=>key.endsWith(":owner-a")?waiting.promise:values.get(key)??null,setItem:async(key,value)=>values.set(key,value)};
  const useCelebration=load("src/hooks/useDailyEffortCelebration.ts",{"@react-native-async-storage/async-storage":saved}).useDailyEffortCelebration;
  let value=evidence(), visible, renderer;
  function Consumer(){visible=useCelebration(value);return null;}
  try {
    await act(async()=>{renderer=create(React.createElement(Consumer));}); assert.equal(visible,false);
    value=evidence({ownerId:"owner-b",sessionId:"session-b",recovered:true});
    await act(async()=>renderer.update(React.createElement(Consumer)));
    await act(async()=>waiting.resolve(null));
    assert.equal(visible,false); assert.equal(values.size,0);
    value=evidence({ownerId:"owner-b",sessionId:"session-b"});
    await act(async()=>renderer.update(React.createElement(Consumer))); assert.equal(visible,true);
    assert.ok([...values.keys()].every(key=>key.endsWith(":owner-b")));
  } finally {if(renderer)await act(async()=>renderer.unmount()); Date.now=realNow;}
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
    "../context/UserContext":{useUser:()=>({hapticsEnabled:false,profile:{id:"owner-a",timezone:"Asia/Kuala_Lumpur",level:1,current_xp:1}})},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},"expo-haptics":{},"@react-native-async-storage/async-storage":saved,
  }).default;
  const input={visible:true,pending:false,recovered:false,sessionId:"confirmed",creditVersion:1,creditedDate:"2026-10-12",dailyCompletedSeconds:60,durationSeconds:60,onClose(){}};
  const content=node=>typeof node==="string"?node:(node.children??[]).map(content).join("");
  let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(Modal,input));});
    assert.match(content(renderer.root),/First step today/);
    assert.equal(renderer.root.findAllByType("Sheet").length,1);
    assert.deepEqual(renderer.root.findAllByType("Button").map(content),["Done"]);
    await act(async()=>renderer.update(React.createElement(Modal,{...input,visible:false})));
    await act(async()=>renderer.update(React.createElement(Modal,input)));
    assert.doesNotMatch(content(renderer.root),/First step today/);
  }finally{if(renderer)await act(async()=>renderer.unmount());Date.now=realNow;}
});
