/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
 },module,module.exports);return module.exports;
}
// A chainable stand-in for Gesture.Pan(), recording its configuration and handlers.
function harness(){
 const pan={config:{}};const chain=new Proxy(pan,{get:(target,key)=>key in target?target[key]:(...args)=>{target.config[key]=args.length>1?args:args[0];return chain;}});
 const timings=[];
 const mocks={
  'react-native':{useWindowDimensions:()=>({width:400})},
  'react-native-gesture-handler':{Gesture:{Pan:()=>chain},GestureDetector:({children})=>children},
  'react-native-reanimated':{__esModule:true,default:{View:host('Moving')},Easing:{out:fn=>fn,cubic:value=>value},ReduceMotion:{System:'system'},runOnJS:fn=>fn,
   useSharedValue:initial=>{const box={value:initial,get:()=>box.value,set:next=>{box.value=next;}};return box;},
   useAnimatedStyle:read=>read(),
   withTiming:(to,config,done)=>{timings.push({to,config});done?.(true);return to;}},
 };
 return {pan,mocks,timings};
}
async function render(enabled=true){
 const {pan,mocks,timings}=harness();let backs=0,tree;
 const SwipeBack=load('src/components/SwipeBack.tsx',mocks).default;
 const view=()=>React.createElement(SwipeBack,{enabled,onBack:()=>backs++},React.createElement('Page'));
 await act(async()=>{tree=create(view());});
 return {pan,timings,backs:()=>backs,drag:x=>pan.config.onUpdate({translationX:x}),release:(x,velocityX=0)=>pan.config.onEnd({translationX:x,velocityX})};
}
test('the page follows a rightward drag only, and vertical scrolling keeps priority',async()=>{
 const ui=await render();
 assert.equal(ui.pan.config.enabled,true);assert.equal(ui.pan.config.activeOffsetX,16);assert.deepEqual(ui.pan.config.failOffsetY,[-14,14]);
 ui.drag(120);ui.drag(-40);
 assert.equal(ui.timings.length,0,'dragging itself does not animate');
});
test('releasing past a third of the width or flicking leaves once; a short drag settles back',async()=>{
 const far=await render();far.drag(150);far.release(150);
 assert.equal(far.timings.at(-1).to,400);assert.equal(far.backs(),1);
 const flick=await render();flick.release(60,900);assert.equal(flick.backs(),1);
 const short=await render();short.drag(90);short.release(90,200);
 assert.equal(short.timings.at(-1).to,0);assert.equal(short.backs(),0);
 const tap=await render();tap.release(10,900);assert.equal(tap.backs(),0,'a tiny fast movement is not a swipe');
});
test('a disabled page does not offer the swipe',async()=>{
 const ui=await render(false);assert.equal(ui.pan.config.enabled,false);
});
test('a swiped Android page leaves at once without running its own exit animation again',async()=>{
 let swipe,prevent,tree;const timings=[],dispatched=[];globalThis.__slides=[];
 const navigation={canGoBack:()=>true,dispatch:value=>dispatched.push(value),goBack:()=>dispatched.push('back')};
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},View:host('View'),StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:390}),Animated:{View:host('Animated'),Value:class{setValue(){}},timing:(_,config)=>{timings.push(config.toValue);return{start(){},stop(){}};}}},'expo-router':{useRouter:()=>({canGoBack:()=>true}),useNavigation:()=>navigation},'expo-router/react-navigation':{usePreventRemove:(active,callback)=>{prevent={active,callback};}},'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({bottom:20})},'@expo/vector-icons':{Ionicons:host('Icon')},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header'),'./MotionPressable':host('Press'),'../hooks/useReducedMotion':{useReducedMotion:()=>false},'./SwipeBack':{__esModule:true,default:props=>{swipe=props;return props.children;},useSwipeOffset:()=>({get:()=>0,set(){}}),ParallaxLayer:props=>props.children,slideTo:(offset,to,duration,done)=>{(globalThis.__slides??=[]).push(to);if(globalThis.__onSlide)globalThis.__onSlide(to,done);else done?.();}}});
 await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Milestones',subtitle:'',back:true,animateTransition:true},'Milestones'));});
 try{
  assert.equal(swipe.enabled,true);
  await act(async()=>swipe.onBack());
  assert.deepEqual(dispatched,['back']);assert.equal(prevent.active,false);assert.equal(swipe.enabled,false);
  assert.ok(!timings.includes(390)&&!(globalThis.__slides??[]).includes(390),'no second slide-out after the swipe');
  await act(async()=>swipe.onBack());assert.deepEqual(dispatched,['back'],'a repeated callback is ignored');
 }finally{await act(async()=>tree.unmount());}
});
test('top-level pages and Settings never offer the swipe',async()=>{
 let swipe,tree;
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},View:host('View'),StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:390}),Animated:{View:host('Animated'),Value:class{setValue(){}interpolate(){return 0;}},timing:()=>({start(){},stop(){}})}},'expo-router':{useRouter:()=>({}),useNavigation:()=>({})},'expo-router/react-navigation':{usePreventRemove:()=>{}},'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({bottom:20})},'@expo/vector-icons':{Ionicons:host('Icon')},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header'),'./MotionPressable':host('Press'),'../hooks/useReducedMotion':{useReducedMotion:()=>false},'./SwipeBack':{__esModule:true,default:props=>{swipe=props;return props.children;},useSwipeOffset:()=>({get:()=>0,set(){}}),ParallaxLayer:props=>props.children,slideTo:(offset,to,duration,done)=>{(globalThis.__slides??=[]).push(to);if(globalThis.__onSlide)globalThis.__onSlide(to,done);else done?.();}}});
 await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Profile',subtitle:''},'Profile'));});
 try{assert.equal(swipe.enabled,false);}finally{await act(async()=>tree.unmount());}
 await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Settings',subtitle:'',back:true,animateTransition:true,expandFromIcon:true},'Settings'));});
 try{assert.equal(swipe.enabled,false,'Settings returns to its icon instead');}finally{await act(async()=>tree.unmount());}
});

test('the page beneath follows only the page directly above it, and lets go when that page leaves',()=>{
 const {pageStack}=load('src/utils/pageStack.ts');
 const settings=pageStack.reserve(),goal=pageStack.reserve(),seen=[];
 const stop=pageStack.subscribe(()=>seen.push(pageStack.above(settings)));
 pageStack.add(settings,null);assert.equal(pageStack.above(settings),null,'nothing above Settings yet');
 const motion={position:'p',swipe:'s'};pageStack.add(goal,motion);
 assert.equal(pageStack.above(settings),motion,'Settings follows Daily goal');assert.equal(pageStack.above(goal),null);
 pageStack.remove(goal);assert.equal(pageStack.above(settings),null,'and lets go once it has left');
 pageStack.remove(settings);stop();assert.deepEqual(seen,[null,motion,null,null]);
});
test('a swipe moves the shared offset, so the page beneath can follow the finger',async()=>{
 const {pan,mocks}=harness();let tree;
 const SwipeBack=load('src/components/SwipeBack.tsx',mocks).default;
 const shared={value:0,get(){return this.value;},set(next){this.value=next;}};
 await act(async()=>{tree=create(React.createElement(SwipeBack,{enabled:true,onBack:()=>{},offset:shared},React.createElement('Page')));});
 pan.config.onUpdate({translationX:120});assert.equal(shared.value,120);
 await act(async()=>tree.unmount());
});
test('the page beneath follows the one offset of the page above, and rests at 0 without one',async()=>{
 const {mocks}=harness();let tree;
 const styles=[];mocks['react-native-reanimated'].useAnimatedStyle=read=>{const style=read();styles.push(style);return style;};
 const {ParallaxLayer}=load('src/components/SwipeBack.tsx',mocks);
 const shift=()=>styles.at(-1).transform[0].translateX;
 const swipe={value:0,get(){return this.value;},set(next){this.value=next;}};
 await act(async()=>{tree=create(React.createElement(ParallaxLayer,{above:{swipe},width:400},React.createElement('Page')));});
 assert.equal(shift(),-120,'fully drifted while the page above is on screen');
 swipe.value=200;await act(async()=>tree.update(React.createElement(ParallaxLayer,{above:{swipe},width:400},React.createElement('Page'))));
 assert.equal(shift(),-60,'halfway back while that page is half swiped');
 swipe.value=400;await act(async()=>tree.update(React.createElement(ParallaxLayer,{above:{swipe},width:400},React.createElement('Page'))));
 assert.equal(shift()===0||Object.is(shift(),-0),true,'home once it has left');
 await act(async()=>tree.update(React.createElement(ParallaxLayer,{above:null,width:400},React.createElement('Page'))));
 assert.equal(shift(),0,'and stays at rest with nothing above, so there is no jump');
 await act(async()=>tree.unmount());
});
