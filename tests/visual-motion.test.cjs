const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), {act,create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks,cache=new Map()) {
  const target=path.resolve(__dirname,'..',file);
  if(cache.has(target))return cache.get(target).exports;
  const module={exports:{}};cache.set(target,module);
  const code=ts.transpileModule(fs.readFileSync(target,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('.'))return require(name);
    const filename=path.resolve(path.dirname(target),name);
    const ext=['.ts','.tsx'].find(ext=>fs.existsSync(filename+ext));
    return load(path.relative(path.resolve(__dirname,'..'),filename+ext),mocks,cache);
  },module,module.exports);
  return module.exports;
}
function native() {
  const springs=[];
  class Value {
    constructor(value){this.value=value;}
    setValue(value){this.value=value;}
    stopAnimation(){this.stops=(this.stops||0)+1;}
    interpolate(config){return {source:this,config};}
  }
  return {springs, api:{View:host('View'),Pressable:host('Button'),Platform:{OS:'android'},StyleSheet:{absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0},hairlineWidth:0.5},Animated:{Value,View:host('AnimatedView'),createAnimatedComponent:component=>component,spring:(value,config)=>{
    const animation={config,stopped:false,start(){value.setValue(config.toValue);},stop(){this.stopped=true;}};springs.push(animation);return animation;
  }}}};
}
test('press motion is native-driven, reversible, preserves callbacks and respects reduced motion',async()=>{
 for(const reduced of [false,true]) {
  const n=native();let presses=0,ins=0,outs=0;
  const Button=load('src/components/MotionPressable.tsx',{'react-native':n.api,'../hooks/useReducedMotion':{useReducedMotion:()=>reduced}}).default;
  let tree;await act(async()=>{tree=create(React.createElement(Button,{onPress:()=>presses++,onPressIn:()=>ins++,onPressOut:()=>outs++,accessibilityLabel:'Start',style:{minHeight:44}}));});
  const button=tree.root.findByType('Button');
  await act(async()=>button.props.onPressIn({}));
  const value=button.props.style[1].transform[0].scale;
  assert.equal(value.value,reduced?1:0.975);
  await act(async()=>button.props.onPressOut({}));
  assert.equal(value.value,1);
  await act(async()=>button.props.onPress({}));
  assert.deepEqual([presses,ins,outs],[1,1,1]);
  assert.equal(button.props.accessibilityLabel,'Start');
  assert.equal(button.props.style[0].minHeight,44);
  assert.equal(n.springs.length,reduced?0:2);
  for(const spring of n.springs)assert.equal(spring.config.useNativeDriver,true);
  await act(async()=>tree.update(React.createElement(Button,{disabled:true})));
  assert.equal(tree.root.findByType('Button').props.disabled,true);
  await act(async()=>tree.unmount());assert.ok(value.stops>0);
 }
});
test('selection uses measured geometry, interrupts previous spring and updates immediately under reduced motion',async()=>{
 for(const reduced of [false,true]) {
  const n=native();const Pill=load('src/components/SlidingSelection.tsx',{'react-native':n.api,'../hooks/useReducedMotion':{useReducedMotion:()=>reduced}}).default;
  let tree;await act(async()=>{tree=create(React.createElement(Pill,{index:0,style:{width:'50%',top:0,bottom:0}}));});
  const frame=()=>tree.root.findByType('AnimatedView');
  await act(async()=>frame().props.onLayout({nativeEvent:{layout:{width:150}}}));
  await act(async()=>tree.update(React.createElement(Pill,{index:1,settling:"quick",style:{width:'50%',top:0,bottom:0}})));
  assert.equal(frame().props.style[1].left,0);
  assert.deepEqual(frame().props.style[1].transform[0].translateX.config.outputRange,[0,150]);
  assert.equal(frame().props.style[1].transform[0].translateX.source.value,1);
  assert.equal(frame().props.pointerEvents,'none');
  if(reduced)assert.equal(n.springs.length,0);else {assert.ok(n.springs[0].stopped);assert.equal(n.springs.at(-1).config.stiffness,460);assert.equal(n.springs.at(-1).config.overshootClamping,true);assert.equal(n.springs.at(-1).config.restDisplacementThreshold,0.008);}
  await act(async()=>tree.update(React.createElement(Pill,{index:0})));
  assert.equal(frame().props.style[1].transform[0].translateX.source.value,0);
  if(!reduced)assert.equal(n.springs.at(-1).config.stiffness,300);
  await act(async()=>tree.unmount());
  if(!reduced)assert.equal(n.springs.at(-1).stopped,true);
 }
});
test('glass is dense on Android, uses available native iOS glass and honours reduced transparency',async()=>{
 for(const [platform,reduced,available] of [['android',false,false],['ios',false,true],['ios',true,true],['ios',false,false]]) {
  const n=native();n.api.Platform.OS=platform;let imports=0,listener;
  n.api.AccessibilityInfo={isReduceTransparencyEnabled:async()=>reduced,addEventListener:(_,callback)=>{listener=callback;return{remove(){}};}};
  const mocks={'react-native':n.api,'react-native-svg':{__esModule:true,default:host('Svg'),Defs:host('Defs'),LinearGradient:host('Gradient'),Rect:host('Rect'),Stop:host('Stop')}};
  Object.defineProperty(mocks,'expo-glass-effect',{get(){imports++;return{isLiquidGlassAvailable:()=>available,GlassView:host('NativeGlass')};}});
  const Glass=load('src/components/GlassSurface.tsx',mocks).default;
  let tree;await act(async()=>{tree=create(React.createElement(Glass));});
  assert.equal(tree.root.findAllByType('NativeGlass').length,platform==='ios'&&!reduced&&available?1:0);
  if(platform==='android')assert.equal(imports,0);
  const root=tree.root.findByProps({testID:'glass-surface'});
  assert.equal(root.props.pointerEvents,'none');
  assert.equal(root.props.style[1].backgroundColor,platform==='ios'&&reduced?'#1E1E21':platform==='ios'&&available?'transparent':'rgba(30,30,33,0.95)');
  if(platform==='ios'){
    await act(async()=>listener(true));
    assert.equal(tree.root.findAllByType('NativeGlass').length,0);
    assert.equal(tree.root.findAllByType('Svg').length,0);
  }
  await act(async()=>tree.unmount());
 }
});

test('Tab crossfade respects reduced motion without changing route identities or history policy',async()=>{
  let reduced=false;
  const Tabs=Object.assign(host('Tabs'),{Screen:host('TabScreen')});
  const Layout=load('src/app/(tabs)/_layout.tsx',{
    'react-native':{Platform:{OS:'android'},StyleSheet:{create:s=>s,hairlineWidth:0.5}},
    'expo-router':{Tabs},
    '../../hooks/useReducedMotion':{useReducedMotion:()=>reduced},
    '../../context/FloatingDockContext':{FloatingDockProvider:host('DockProvider')},
    '../../components/GlassSurface':host('Glass'),
    '../../components/SessionTabBar':host('Dock'),
    '../../components/TabIcon':host('Icon'),
  }).default;
  let tree;await act(async()=>{tree=create(React.createElement(Layout));});
  try {
    const routes=tree.root.findAllByType('TabScreen');
    const tabs=()=>tree.root.findByType('Tabs').props;
    assert.equal(tabs().screenOptions.animation,'fade');
    assert.equal(tabs().screenOptions.transitionSpec.config.duration,180);
    assert.equal(tabs().backBehavior,'initialRoute');
    assert.deepEqual(routes.map(node=>node.props.name),['index','progress','profile','tasks','timer']);
    reduced=true;await act(async()=>tree.update(React.createElement(Layout)));
    assert.equal(tabs().screenOptions.animation,'none');
    assert.equal(tabs().screenOptions.transitionSpec.config.duration,0);
    assert.equal(tree.root.findAllByType('TabScreen')[0],routes[0]);
  }finally{await act(async()=>tree.unmount());}
});
