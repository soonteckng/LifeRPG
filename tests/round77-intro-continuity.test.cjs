/* global __dirname */
// Keep actual Reanimated shared values between React commits. A timing target
// is not its starting value: the UI thread reaches it only when advanced here.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),babel=require('@babel/core');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>function Host(props){return React.createElement(type,props,props.children);};
const root=path.resolve(__dirname,'..');

async function fixture({compiled=false,reduced=false}={}){
 const motions=[],values=[],cache=new Map();let introEnds=0,reduce=reduced;
 const shared=initial=>{
  let value=initial;
  const cell={get value(){return value;},set value(next){
   if(next?.kind==='timing'){next.cell=cell;motions.push(next);}else value=next;
  }};values.push(cell);return cell;
 };
 const interpolate=(value,input,output)=>output[0]+(output[1]-output[0])*Math.max(0,Math.min(1,(value-input[0])/(input[1]-input[0])));
 const mocks={
  'react-native':{View:host('View'),Pressable:host('Press'),StyleSheet:{create:x=>x,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844}),
   AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Animated:{View:host('NativeMotion'),Value:class{},timing:()=>({start(){},stop(){}})}},
  'expo-router':{useFocusEffect:callback=>React.useEffect(callback,[callback])},
  'react-native-reanimated':{__esModule:true,default:{View:host('Motion')},Easing:{inOut:x=>x,quad:0,linear:0},interpolate,
   useSharedValue:initial=>React.useState(()=>shared(initial))[0],useAnimatedStyle:fn=>({read:fn}),cancelAnimation(){},runOnJS:fn=>fn,
   withTiming:(to,config,done)=>({kind:'timing',to,config,done}),withDelay:(delay,motion)=>({...motion,delay})},
  '../AppText':{Text:host('Text')},'../adventurer/AdventurerBack':host('Walker'),
  './TrailScenes':{TrailScene:host('Scene'),FireGlow:host('Fire'),Fireflies:host('Flies')},
  '../../hooks/useRewards':{useRewards:()=>({look:{skin:'3',hair:'short',hairColor:'darkbrown',glasses:false},equipped:{},today:{seconds:0}})},
  '../../hooks/useReducedMotion':{useReducedMotion:()=>reduce},
  '../../utils/trail':{trailZone:()=>({name:'Meadow'}),trailStops:()=>0},
 };
 function load(file){
  const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);let source=fs.readFileSync(filename,'utf8');
  if(compiled&&filename.endsWith('SessionBackdrop.tsx')){
   source=babel.transformSync(source,{filename,configFile:false,babelrc:false,parserOpts:{plugins:['typescript','jsx']},plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
   assert.match(source,/react\/compiler-runtime/);
  }
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);
   const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(target+ext);},module,module.exports);
  return module.exports;
 }
 const mod=load('src/components/session/SessionBackdrop.tsx');let props={phase:'running',progress:0,secondsLeft:60,walking:true,intro:true,skipToken:0,onIntroEnd:()=>introEnds++},ui;
 await act(async()=>{ui=create(React.createElement(mod.default,props));});
 const dim=()=>{const node=ui.root.findAllByType('Motion').find(n=>n.props.testID==='session-scenery-dim');return node.props.style.at(-1).read().opacity;};
 return{mod,motions,values,dim,introEnds:()=>introEnds,scene:light=>ui.root.findAllByType('Scene').find(n=>n.props.light===light),
  update:async changes=>{props={...props,...changes};await act(async()=>ui.update(React.createElement(mod.default,props)));},
  setDusk:async value=>{await act(async()=>{values[1].value=value;});},
  finish:async motion=>{await act(async()=>{motion.cell.value=motion.to;motion.done?.(true);});},
  reduce:async()=>{reduce=true;await act(async()=>ui.update(React.createElement(mod.default,{...props,skipToken:props.skipToken+1})));},
  cleanup:async()=>{await act(async()=>ui.unmount());}};
}

for(const compiled of [false,true]){
 const mode=compiled?'production compiler':'uncompiled control';
 test(`Round 77: dusk and scenery dim reach the same night before timer handoff (${mode})`,async()=>{
  const ui=await fixture({compiled});
  try{
   const dusk=ui.motions.find(m=>m.delay===ui.mod.WALK_MS&&m.config.duration===ui.mod.NIGHT_FADE_MS),night=ui.scene('night');
   assert.ok(dusk);assert.equal(ui.dim(),0.35,'departure starts with its existing readable light');
   for(const value of [0.75,0.5,0.25,0]){
    await ui.setDusk(value);assert.ok(Math.abs(ui.dim()-(0.82+(0.35-0.82)*value))<0.000001,'one dusk animation carries the scenery all the way into dim focus');
   }
   await ui.finish(dusk);assert.equal(ui.introEnds(),1);assert.equal(ui.dim(),0.82);
   const dimMotions=ui.motions.filter(m=>m.config.duration===500).length;
   await ui.update({intro:false});
   assert.equal(ui.dim(),0.82,'revealing the timer cannot brighten or reset the completed night');
   assert.equal(ui.scene('night'),night,'the underlying native night subtree remains mounted through the handoff');
   assert.equal(ui.scene('dusk'),undefined,'only the already transparent dusk layer leaves');
   assert.equal(ui.motions.filter(m=>m.config.duration===500).length,dimMotions,'there is no second lighting pass when the intro disappears');
  }finally{await ui.cleanup();}
 });
 test(`Round 77: skipping and Reduce Motion keep the same dark handoff (${mode})`,async()=>{
  const ui=await fixture({compiled});
  try{
   await ui.update({skipToken:1});const skip=ui.motions.findLast(m=>m.config.duration===700);
   assert.ok(skip);await ui.finish(skip);assert.equal(ui.dim(),0.82);assert.equal(ui.introEnds(),1);
   await ui.update({intro:false});assert.equal(ui.dim(),0.82);
   await ui.update({intro:true});await ui.reduce();assert.equal(ui.dim(),0.82,'less motion joins the same night immediately');
  }finally{await ui.cleanup();}
 });
 test(`Round 77: a cancelled intro callback cannot finish a replacement departure (${mode})`,async()=>{
  const ui=await fixture({compiled});
  try{
   const old=ui.motions.find(m=>m.delay===ui.mod.WALK_MS&&m.config.duration===ui.mod.NIGHT_FADE_MS);
   await ui.update({intro:false,phase:'setup',secondsLeft:0});
   await ui.update({intro:true,phase:'running',secondsLeft:60});
   const replacement=ui.motions.findLast(m=>m.delay===ui.mod.WALK_MS&&m.config.duration===ui.mod.NIGHT_FADE_MS);
   assert.notEqual(replacement,old);
   // The old native fade already finished and queued JS before cancellation;
   // delivering that callback must not finish the newly selected departure.
   await act(async()=>old.done(true));assert.equal(ui.introEnds(),0);
   await ui.finish(replacement);assert.equal(ui.introEnds(),1);
   await ui.cleanup();await act(async()=>replacement.done(true));assert.equal(ui.introEnds(),1,'an unmounted scene cannot finish another start');
  }catch(error){await ui.cleanup().catch(()=>{});throw error;}
 });
}
