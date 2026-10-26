/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>function Host(props){return React.createElement(type,props,props.children);};
function load(file,mocks,cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(base+ext));return load(path.relative(path.resolve(__dirname,'..'),base+ext),mocks,cache);},module,module.exports);return module.exports;
}
async function sheet({reduced=false,closeMotion='fade',closeInstantly=false}={}){
 const motions=[],cancelled=[],calls=[];
 const shared=initial=>{let value=initial;return{get value(){return value;},set value(next){if(next&&typeof next==='object'&&'to'in next)motions.push(next);else value=next;}};};
 const Panel=React.forwardRef(function Panel(props,ref){React.useImperativeHandle(ref,()=>({close(){calls.push('slide-close');}}));return React.createElement('Panel',props,props.children);});
 const native={View:host('View'),Pressable:host('Press'),Modal:host('Modal'),StyleSheet:{create:v=>v,hairlineWidth:1,absoluteFill:{}},Platform:{OS:'android'},useWindowDimensions:()=>({height:800,width:390}),Keyboard:{isVisible:()=>false,dismiss(){},addListener:()=>({remove(){}})}};
 const AppSheet=load('src/components/AppSheet.tsx',{
  'react-native':native,'react-native-gesture-handler':{GestureHandlerRootView:host('GestureRoot')},
  '@gorhom/bottom-sheet':{__esModule:true,default:Panel,BottomSheetBackdrop:host('Backdrop'),BottomSheetFooter:host('Footer'),useBottomSheetSpringConfigs:v=>v,useBottomSheetTimingConfigs:v=>v},
  'react-native-reanimated':{__esModule:true,default:{View:host('Motion')},Easing:{out:v=>v,cubic:0},ReduceMotion:{System:'system'},runOnJS:fn=>fn,
   useSharedValue:value=>React.useState(()=>shared(value))[0],useAnimatedStyle:()=>({}),cancelAnimation:value=>cancelled.push(value),
   withTiming:(to,config,done)=>{if(reduced){done?.(true);return to;}return{to,config,done};}},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:16})},
 }).default;
 let ui,visible=true;
 const render=()=>React.createElement(AppSheet,{visible,onRequestClose:()=>calls.push('request-close'),onDismiss:()=>calls.push('dismiss'),closeMotion,closeInstantly,label:'session completion',header:null},React.createElement('Body'));
 await act(async()=>{ui=create(render());});
 return{calls,motions,cancelled,root:()=>ui.root,
  show:async next=>{visible=next;await act(async()=>ui.update(render()));},
  finish:async motion=>act(async()=>motion.done(true)),
  cleanup:()=>act(async()=>ui.unmount())};
}

test('result sheet fades its whole modal before dismissal instead of sliding behind the next screen',async()=>{
 const ui=await sheet();try{
  await ui.show(false);
  assert.equal(ui.root().findByType('Modal').props.visible,true,'outgoing card remains mounted throughout its fade');
  assert.equal(ui.root().findAll(node=>node.type==='Motion'&&node.props.testID==='sheet-exit-fade').length,1);
  assert.equal(ui.calls.includes('slide-close'),false);
  assert.equal(ui.calls.includes('dismiss'),false);
  const fade=ui.motions.at(-1);assert.equal(fade.to,0);assert.equal(fade.config.duration,220);assert.equal(fade.config.reduceMotion,'system');
  await ui.finish(fade);
  assert.equal(ui.root().findByType('Modal').props.visible,false);assert.deepEqual(ui.calls,['dismiss']);
 }finally{await ui.cleanup();}
});

test('an obsolete native fade completion cannot close a reopened sheet',async()=>{
 const ui=await sheet();try{
  await ui.show(false);const old=ui.motions.at(-1);await ui.show(true);await ui.finish(old);
  assert.equal(ui.root().findByType('Modal').props.visible,true);assert.deepEqual(ui.calls,[]);
  await ui.show(false);await ui.finish(ui.motions.at(-1));assert.deepEqual(ui.calls,['dismiss']);
 }finally{await ui.cleanup();}
});

test('Reduce Motion releases the result instantly and a missing callback still has a bounded release',async t=>{
 const instant=await sheet({reduced:true});try{await instant.show(false);assert.equal(instant.root().findByType('Modal').props.visible,false);assert.deepEqual(instant.calls,['dismiss']);}finally{await instant.cleanup();}
 t.mock.timers.enable({apis:['setTimeout']});const lost=await sheet();try{
  await lost.show(false);await act(async()=>t.mock.timers.tick(899));assert.equal(lost.root().findByType('Modal').props.visible,true);
  await act(async()=>t.mock.timers.tick(1));assert.equal(lost.root().findByType('Modal').props.visible,false);assert.deepEqual(lost.calls,['dismiss']);
 }finally{await lost.cleanup();}
});

test('ordinary sheets retain their existing slide and immediate close remains immediate',async()=>{
 const regular=await sheet({closeMotion:'slide'});try{await regular.show(false);assert.deepEqual(regular.calls,['slide-close']);assert.equal(regular.motions.length,0);await act(async()=>regular.root().findByType('Panel').props.onClose());assert.deepEqual(regular.calls,['slide-close','dismiss']);}finally{await regular.cleanup();}
 const immediate=await sheet({closeInstantly:true});try{await immediate.show(false);assert.equal(immediate.root().findByType('Modal').props.visible,false);assert.deepEqual(immediate.calls,['dismiss']);}finally{await immediate.cleanup();}
});
