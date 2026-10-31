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

// Round 87: the camp scene (dawn, morning, walking, its lights and fades) is
// gone with the dark look, so its eight scene tests went with it. The saving
// portal stays.
test("the saving portal dims uniformly without elevating a rectangular Android shadow surface",async()=>{
  const animations=[];
  const Saving=load("src/components/SessionSavingOverlay.tsx",{
    "react-native":{View:host("View"),ActivityIndicator:host("Spinner"),StyleSheet:{create:value=>value},Animated:{View:host("Motion"),Value:class{constructor(value){this.value=value;}},
      timing:(value,config)=>({start(done){animations.push(config);value.value=config.toValue;done?.({finished:true});},stop(){}})}},
    "./AppText":{Text:host("Text")},"../constants/theme":{colors:{primary:"#3B2737",text:"#2A2028",secondary:"gray",sheetCard:"#F0EAE2",scrim:"rgba(42,32,40,0.45)"}},"../hooks/useReducedMotion":{useReducedMotion:()=>false},
  }).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Saving,{visible:true}));});
  try {
    const scrim=renderer.root.findByProps({testID:"session-saving"});
    const style=Object.assign({},...scrim.props.style);
    assert.equal(style.elevation,undefined);
    assert.equal(style.backgroundColor,"rgba(42,32,40,0.45)","the shared aubergine scrim from the paper theme");
    assert.deepEqual([style.top,style.right,style.bottom,style.left],[0,0,0,0]);
    assert.equal(renderer.root.findByProps({accessibilityLabel:"Saving your session"}).props.style.borderRadius,24);
    await act(async()=>renderer.update(React.createElement(Saving,{visible:false})));
    assert.equal(renderer.toJSON(),null);
    assert.ok(animations.some(m=>m.toValue===0&&m.useNativeDriver));
  } finally {await act(async()=>renderer.unmount());}
});
