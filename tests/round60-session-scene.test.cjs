/* global __dirname */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const React=require("react"),{act,create}=require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>function Host(props){return React.createElement(type,props,props.children);};
function load(file,mocks){
  const filename=path.resolve(__dirname,"..",file),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,"utf8"),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","module","exports",code)(name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),module,module.exports);
  return module.exports;
}
const LOOK={skin:"3",hair:"short",hairColor:"darkbrown",glasses:false};
async function sceneSetup(initial={}){
  let reduced=false,props={phase:"running",progress:0.2,walking:true,intro:false,skipToken:0,onIntroEnd:()=>{},...initial};
  const motions=[],cancelled=[],draws=[];
  const mod=load("src/components/session/SessionBackdrop.tsx",{
    "react-native":{View:host("View"),Pressable:host("Press"),StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844}),Animated:{View:host("RNView"),Value:class{constructor(value){this.value=value;}},timing:()=>({start(){},stop(){}})}},
    "react-native-reanimated":{__esModule:true,default:{View:host("Motion")},Easing:{inOut:v=>v,quad:0},interpolate:(v,i,o)=>o[0]+(o[1]-o[0])*v,
      runOnJS:fn=>fn,useAnimatedStyle:fn=>fn(),useSharedValue:value=>React.useRef({value}).current,cancelAnimation:value=>cancelled.push(value),
      withDelay:(_delay,value)=>value,withTiming:(to,config,done)=>{motions.push({to,...config,done});return to;}},
    "../AppText":{Text:host("Text")},"../adventurer/AdventurerBack":host("Walker"),
    "./TrailScenes":{TrailScene:React.memo(function Scene(props){draws.push(props.light);return React.createElement("Scene",props);}),FireGlow:host("Fire"),Fireflies:host("Flies")},
    "../../hooks/useRewards":{useRewards:()=>({look:LOOK,equipped:{},today:{seconds:0}})},"../../hooks/useReducedMotion":{useReducedMotion:()=>reduced},
    "../../utils/trail":{trailZone:()=>({name:"Meadow"}),trailStops:()=>0},
    "../../services/sessionReturn":load("src/services/sessionReturn.ts",{}),
  });
  let renderer;await act(async()=>{renderer=create(React.createElement(mod.default,props));});
  return {mod,motions,cancelled,draws,root:()=>renderer.root,lights:()=>renderer.root.findAllByType("Scene").map(n=>n.props.light),
    update:async changes=>{props={...props,...changes};await act(async()=>renderer.update(React.createElement(mod.default,props)));},
    settle:async()=>{const motion=motions.filter(m=>m.duration===mod.MORNING_FADE_MS).at(-1);await act(async()=>motion?.done?.(true));},
    reduce:async()=>{reduced=true;await act(async()=>renderer.update(React.createElement(mod.default,{...props,skipToken:props.skipToken+1})));},
    cleanup:async()=>{await act(async()=>renderer.unmount());}};
}

test("a reopened timer mounts only its visible scene and ticks do not rebuild the backdrop",async()=>{
  const ui=await sceneSetup();
  try {
    assert.deepEqual(ui.lights(),["night"]);
    const draws=ui.draws.length,motions=ui.motions.length;
    for(const progress of [0.21,0.3,0.5,0.89])await ui.update({progress});
    assert.equal(ui.draws.length,draws,"per-second progress stays in the countdown, not the SVG scene");
    assert.equal(ui.motions.length,motions,"no restart of walk or light animations on ticks");
    assert.equal(ui.root().findByType("Walker").props.walking,true,"the visible adventurer remains present from the first frame");
  } finally {await ui.cleanup();}
  assert.ok(ui.cancelled.length>=3,"leaving cancels all scene transition values");
});

test("dawn and early End keep both lights until their fade finishes, then release the hidden SVG",async()=>{
  const ui=await sceneSetup();
  try {
    await ui.update({progress:0.91});
    assert.deepEqual(ui.lights(),["night","morning"],"the old scene stays underneath throughout the crossfade");
    await ui.settle();assert.deepEqual(ui.lights(),["morning"]);
    const dawns=ui.motions.filter(m=>m.to===1&&m.duration===ui.mod.MORNING_FADE_MS).length;
    await ui.update({progress:0.95});await ui.update({progress:0.99});
    assert.equal(ui.motions.filter(m=>m.to===1&&m.duration===ui.mod.MORNING_FADE_MS).length,dawns);
    await ui.update({phase:"ended",walking:false});
    assert.deepEqual(ui.lights(),["night","morning"],"ending near dawn fades back rather than flashing black");
    await ui.settle();assert.deepEqual(ui.lights(),["night"]);
    assert.equal(ui.root().findByType("Walker").props.walking,false);
  } finally {await ui.cleanup();}
});

test("a completed route opens directly in morning and Reduce Motion swaps light without an animation",async()=>{
  const ui=await sceneSetup({phase:"completed",progress:1,walking:false});
  try {
    assert.deepEqual(ui.lights(),["morning"],"no night or dusk subtree is mounted on completed reopen");
    await ui.reduce();const motions=ui.motions.length;
    await ui.update({phase:"ended"});
    assert.deepEqual(ui.lights(),["night"]);
    assert.equal(ui.motions.length,motions,"Reduce Motion never starts a crossfade");
  } finally {await ui.cleanup();}
});

test("an obsolete native fade callback cannot unmount the new light after End or Reduce Motion",async()=>{
  for(const reduce of [false,true]){
    const ui=await sceneSetup();
    try {
      await ui.update({progress:0.91});
      const oldDawn=ui.motions.filter(m=>m.to===1&&m.duration===ui.mod.MORNING_FADE_MS).at(-1);
      if(reduce)await ui.reduce();
      await ui.update({phase:"ended",walking:false});
      // Model a native completion which had already queued its JS callback
      // before the effect cleanup cancelled/replaced the fade.
      await act(async()=>oldDawn.done(true));
      assert.ok(ui.lights().includes("night"),"an old morning completion must not remove the new night scene");
      if(!reduce)await ui.settle();
      assert.deepEqual(ui.lights(),["night"]);
    }finally{await ui.cleanup();}
  }
});

test("a fresh completion walks towards camp once, facing forward, without restarting departure",async()=>{
  let returned=0,introFinished=0;
  const ui=await sceneSetup({onIntroEnd:()=>introFinished++});
  try {
    await ui.update({phase:"completed",progress:1,walking:false,returning:true,onReturnEnd:()=>returned++});
    const walker=ui.root().findByType("Walker");
    assert.equal(walker.props.facing,"camp");assert.equal(walker.props.walking,true);
    const home=ui.motions.filter(m=>m.duration===1800).at(-1);
    assert.equal(home.to,0,"walk down the same road towards the foreground");
    const count=ui.motions.length;await ui.update({progress:1});
    assert.equal(ui.motions.length,count,"ticks and reward state do not restart the walk");
    await act(async()=>home.done(true));assert.equal(returned,1);assert.equal(introFinished,0);
    await ui.update({returning:false});
    assert.equal(ui.root().findByType("Walker").props.walking,false);
    await act(async()=>home.done(true));assert.equal(returned,1,"an obsolete callback cannot finish another presentation");
  } finally {await ui.cleanup();}
});

test("returning to camp cancels on unmount or Reduce Motion and never runs for early End",async()=>{
  let returned=0;
  const ui=await sceneSetup();
  try {
    await ui.update({phase:"ended",walking:false});
    assert.equal(ui.motions.filter(m=>m.duration===1800).length,0);
    await ui.update({phase:"completed",walking:false,returning:true,onReturnEnd:()=>returned++});
    const home=ui.motions.filter(m=>m.duration===1800).at(-1);
    await ui.reduce();assert.equal(returned,1,"Reduce Motion completes the presentation immediately");
    await act(async()=>home.done(true));assert.equal(returned,1);
  } finally {await ui.cleanup();}
  const disposed=await sceneSetup({phase:"completed",walking:false,returning:true,onReturnEnd:()=>returned++});
  const late=disposed.motions.filter(m=>m.duration===1800).at(-1);
  await disposed.cleanup();await act(async()=>late.done(true));assert.equal(returned,1);
});

test("the saving portal dims uniformly without elevating a rectangular Android shadow surface",async()=>{
  const animations=[];
  const Saving=load("src/components/SessionSavingOverlay.tsx",{
    "react-native":{View:host("View"),ActivityIndicator:host("Spinner"),StyleSheet:{create:value=>value},Animated:{View:host("Motion"),Value:class{constructor(value){this.value=value;}},
      timing:(value,config)=>({start(done){animations.push(config);value.value=config.toValue;done?.({finished:true});},stop(){}})}},
    "./AppText":{Text:host("Text")},"../constants/theme":{colors:{primary:"#7C3AED",text:"white",secondary:"gray",sheetCard:"#20243D"}},"../hooks/useReducedMotion":{useReducedMotion:()=>false},
  }).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Saving,{visible:true}));});
  try {
    const scrim=renderer.root.findByProps({testID:"session-saving"});
    const style=Object.assign({},...scrim.props.style);
    assert.equal(style.elevation,undefined);
    assert.equal(style.backgroundColor,"rgba(0,0,0,0.62)");
    assert.deepEqual([style.top,style.right,style.bottom,style.left],[0,0,0,0]);
    assert.equal(renderer.root.findByProps({accessibilityLabel:"Saving your session"}).props.style.borderRadius,24);
    await act(async()=>renderer.update(React.createElement(Saving,{visible:false})));
    assert.equal(renderer.toJSON(),null);
    assert.ok(animations.some(m=>m.toValue===0&&m.useNativeDriver));
  } finally {await act(async()=>renderer.unmount());}
});
