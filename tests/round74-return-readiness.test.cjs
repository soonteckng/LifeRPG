/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),babel=require('@babel/core');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>function Host(props){return React.createElement(type,props,props.children);};
const root=path.resolve(__dirname,'..');
const player={look:{skin:'3',hair:'short',hairColor:'darkbrown',glasses:false},equipped:{},level:3,background:'bg_dusk',frame:null,
 today:{seconds:60,finds:0},nextFindSeconds:1740,trail:{findSeconds:1800,stops:4,complete:false}};
const reveal={id:'return:S',kind:'expedition',seconds:60,finds:[],stardust:0,
 trail:{...player.trail,...player.today,fromSeconds:0,nextFindSeconds:1740}};

function fixture({compiled=false,reduced=false,realMap=false}={}){
 const motions=[],nativeMotions=[],frames=new Map(),ready=[];let nextFrame=0;
 const globals=Object.create(globalThis);
 globals.requestAnimationFrame=fn=>{const id=++nextFrame;frames.set(id,fn);return id;};
 globals.cancelAnimationFrame=id=>frames.delete(id);
 const shared=initial=>{let value=initial;const ref={get(){return value;},set(next){ref.value=next;},get value(){return value;},set value(next){
  if(next&&typeof next==='object'&&'to'in next){next.shared=ref;motions.push(next);}else value=next;
 }};return ref;};
 const svg={__esModule:true};for(const name of ['default','Circle','Defs','Ellipse','G','LinearGradient','RadialGradient','Path','Rect','Stop','Text'])svg[name]=host(`Svg${name}`);
 const mocks={
  'react-native':{View:host('View'),ScrollView:host('Scroll'),StyleSheet:{create:v=>v,absoluteFill:{},hairlineWidth:1},useWindowDimensions:()=>({width:360,height:640,fontScale:1}),
   Easing:{out:v=>v,quad:0},Animated:{View:host('NativeMotion'),Value:class{constructor(value){this.value=value;}setValue(value){this.value=value;}},timing:(value,config)=>({start(){nativeMotions.push(config);value.setValue(config.toValue);},stop(){}})}},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
  'react-native-reanimated':{__esModule:true,default:{View:host('Motion'),createAnimatedComponent:c=>c},ReduceMotion:{System:'system'},Easing:{out:v=>v,inOut:v=>v,quad:0,cubic:0,linear:0},
   useSharedValue:initial=>React.useState(()=>shared(initial))[0],useAnimatedStyle:fn=>fn(),useAnimatedProps:fn=>fn(),useAnimatedReaction(){},interpolate:(_v,_a,b)=>b[0],
   runOnJS:fn=>fn,cancelAnimation(){},withTiming:(to,config,done)=>({to,config,done}),withDelay:(_delay,a)=>a,withSpring:to=>to,withRepeat:a=>a,withSequence:(...a)=>a[0]},
  'react-native-svg':svg,'@expo/vector-icons':{Ionicons:host('Icon')},'expo-router':{useRouter:()=>({push(){}})},
  '../MotionPressable':host('Button'),'../AppText':{Text:host('Text')},
  '../adventurer/ProfilePicture':host('Picture'),'../adventurer/ItemArt':{__esModule:true,default:host('Item'),StardustArt:host('Dust')},
  './PackArt':{__esModule:true,default:host('Pack'),PACK_COLORS:['#111']},
  '../../hooks/useRewards':{useRewards:()=>player},'../../context/UserContext':{useUser:()=>({profile:{level:3}})},
  '../../hooks/useReducedMotion':{useReducedMotion:()=>reduced},'../../utils/tapHaptics':{tapHaptic(){}},
 };
 if(!realMap)mocks['./TodayTrail']=host('Trail');
 const cache=new Map();
 function load(file){const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);let source=fs.readFileSync(filename,'utf8');
  if(compiled&&/(SessionReveal|RevealScreens|TodayTrail)\.tsx$/.test(filename)){
   source=babel.transformSync(source,{filename,configFile:false,babelrc:false,parserOpts:{plugins:['typescript','jsx']},plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
   assert.match(source,/react\/compiler-runtime/);
  }
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('globalThis','require','module','exports',js)(globals,name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);
   const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e));return load(target+ext);},module,module.exports);
  return module.exports;
 }
 return{load,mocks,motions,nativeMotions,frames,ready,
  flushFrames:()=>act(async()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}),
  finish:a=>act(async()=>{a.shared.value=a.to;a.done?.(true);})};
}
const words=ui=>ui.root.findAllByType('Text').map(n=>[].concat(n.props.children).join('')).join(' ');

for(const compiled of [false,true]){
 const mode=compiled?'production compiler':'uncompiled control';
 test(`the session return waits for content readiness before its single slow entrance (${mode})`,async()=>{
  const h=fixture({compiled});h.mocks['../rewards/RevealScreens']={ExpeditionReveal:host('Expedition')};
  const Screen=h.load('src/components/session/SessionReveal.tsx').default;let ui;
  await act(async()=>{ui=create(React.createElement(Screen,{reveal,onClose(){}}));});
  try{
   assert.equal(h.nativeMotions.length,0,'never spend the entrance fading an undrawn map');
   const done=ui.root.findByType('Expedition').props.onReady;assert.equal(typeof done,'function');
   await act(async()=>done());assert.equal(h.nativeMotions.length,1);assert.equal(h.nativeMotions[0].toValue,1);
   assert.ok(h.nativeMotions[0].duration>=450);assert.equal(h.nativeMotions[0].useNativeDriver,true);
   await act(async()=>done());assert.equal(h.nativeMotions.length,1,'duplicate layouts do not restart the fade');
  }finally{await act(async()=>ui.unmount());}
 });
 test(`a return map reports readiness only after its real drawing commits (${mode})`,async()=>{
  const h=fixture({compiled,realMap:true}),Trail=h.load('src/components/rewards/TodayTrail.tsx').default;let ui;
  await act(async()=>{ui=create(React.createElement(Trail,{...player,...reveal.trail,fill:true,onReady:()=>h.ready.push('ready')}));});
  try{
   assert.equal(ui.root.findAllByType('Picture').length,0);assert.deepEqual(h.ready,[]);
   const layout=()=>ui.root.findByProps({testID:'today-trail-map'}).props.onLayout({nativeEvent:{layout:{width:290,height:300}}});
   await act(async()=>layout());assert.equal(ui.root.findAllByType('Picture').length,1);assert.deepEqual(h.ready,[]);
   await h.flushFrames();assert.deepEqual(h.ready,['ready']);
   await act(async()=>layout());await h.flushFrames();assert.deepEqual(h.ready,['ready'],'an unchanged measurement schedules no new entrance');
  }finally{await act(async()=>ui.unmount());}
 });
 test(`an abandoned map cannot report readiness after unmount (${mode})`,async()=>{
  const h=fixture({compiled,realMap:true}),Trail=h.load('src/components/rewards/TodayTrail.tsx').default;let ui;
  await act(async()=>{ui=create(React.createElement(Trail,{...player,...reveal.trail,onReady:()=>h.ready.push('ready')}));});
  await act(async()=>ui.root.findByProps({testID:'today-trail-map'}).props.onLayout({nativeEvent:{layout:{width:290,height:300}}}));
  const stale=[...h.frames.values()];await act(async()=>ui.unmount());
  await act(async()=>stale.forEach(fn=>fn()));assert.deepEqual(h.ready,[]);
 });
 test(`finds fade out once and the measured map owns its subsequent fade-in (${mode})`,async()=>{
  const h=fixture({compiled}),Screen=h.load('src/components/rewards/RevealScreens.tsx').ExpeditionReveal;let ui;
  await act(async()=>{ui=create(React.createElement(Screen,{reveal:{...reveal,finds:[{item:'beret',new:true,rarity:'common',stardust:0}]},player,onClose(){},onOutfits(){}}));});
  try{
   const button=ui.root.findAllByType('Button').find(n=>n.props.accessibilityLabel==='Continue');
   await act(async()=>{button.props.onPress();button.props.onPress();});
   const fades=h.motions.filter(a=>a.to===0);assert.equal(fades.length,1);assert.ok(fades[0].config.duration>=300);
   await h.finish(fades[0]);const map=ui.root.findByType('Trail');
   assert.equal(h.motions.filter(a=>a.to===1&&a.config?.duration>=450).length,0,'do not fade before the actual map is ready');
   await act(async()=>map.props.onReady());
   assert.equal(h.motions.filter(a=>a.to===1&&a.config?.duration>=450).length,1);
   await act(async()=>map.props.onReady());assert.equal(h.motions.filter(a=>a.to===1&&a.config?.duration>=450).length,1);
  }finally{await act(async()=>ui.unmount());}
 });
}

test('later sessions show a completed trail without promising another walk, while the first finish still walks',async()=>{
 for(const [fromSeconds,seconds,complete]of[[7200,7260,true],[7140,7200,true],[7200,7260,false]]){
  const h=fixture({reduced:true}),Screen=h.load('src/components/rewards/RevealScreens.tsx').ExpeditionReveal;let ui;
  const snapshot={...reveal.trail,fromSeconds,seconds,complete,finds:complete?4:0,pendingFinds:complete?0:4,nextFindSeconds:0};
  await act(async()=>{ui=create(React.createElement(Screen,{reveal:{...reveal,trail:snapshot},player,onClose(){},onOutfits(){}}));});
  try{
   assert.match(words(ui),/FINISHED FOR TODAY.*Trail complete/);assert.doesNotMatch(words(ui),/MINUTE FURTHER|On your way/);
   const map=ui.root.findByType('Trail').props;assert.equal(map.fromSeconds,fromSeconds);assert.equal(map.seconds,seconds);
   assert.equal(map.pendingFinds,snapshot.pendingFinds,'physical trail completion never invents collected finds');
  }finally{await act(async()=>ui.unmount());}
 }
});

test('Reduce Motion swaps return content without an entrance animation',async()=>{
 const h=fixture({reduced:true});h.mocks['../rewards/RevealScreens']={ExpeditionReveal:host('Expedition')};
 const Screen=h.load('src/components/session/SessionReveal.tsx').default;let ui;
 await act(async()=>{ui=create(React.createElement(Screen,{reveal,onClose(){}}));});
 try{assert.equal(h.nativeMotions.length,0);assert.equal(ui.root.findByType('NativeMotion').props.style[2].opacity.value,1);}
 finally{await act(async()=>ui.unmount());}
});

test('a missing map layout releases its entrance after the bounded fallback',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=fixture(),Screen=h.load('src/components/session/SessionReveal.tsx').default;let ui;
 await act(async()=>{ui=create(React.createElement(Screen,{reveal,onClose(){}}));});
 try{
  assert.equal(h.nativeMotions.length,0);await act(async()=>t.mock.timers.tick(1199));assert.equal(h.nativeMotions.length,0);
  await act(async()=>t.mock.timers.tick(1));assert.equal(h.nativeMotions.length,1,'never leave an invisible return screen trapped');
 }finally{await act(async()=>ui.unmount());}
});

test('an earlier completed trail does not pretend to be the current day after midnight',async()=>{
 const h=fixture({reduced:true}),Screen=h.load('src/components/rewards/RevealScreens.tsx').ExpeditionReveal;let ui;
 await act(async()=>{ui=create(React.createElement(Screen,{reveal:{...reveal,trail:{...reveal.trail,date:'2026-10-26',seconds:7260,fromSeconds:7200,finds:4,complete:true}},
  player:{...player,today:{date:'2026-10-27',seconds:0,finds:0}},onClose(){},onOutfits(){}}));});
 try{assert.match(words(ui),/EARLIER TRAIL.*Trail complete.*Your session's progress is saved/);assert.doesNotMatch(words(ui),/FINISHED FOR TODAY|Back tomorrow/);}
 finally{await act(async()=>ui.unmount());}
});
