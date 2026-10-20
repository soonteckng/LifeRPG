/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks){
 const filename=path.resolve(__dirname,'..',file),module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  const key=Object.keys(mocks).find(k=>k===name||k.startsWith('/')&&name.endsWith(k));if(key)return mocks[key];
  if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e));
  return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks);
 },module,module.exports);
 return module.exports;
}
test('an elevated confirmation rises once its own layer is on screen, so its first tap always lands',async()=>{
 const starts=[];
 class Value{constructor(v){this.value=v;}setValue(v){this.value=v;}interpolate(){return 0;}}
 const Animated={View:host('Animated'),Value,timing:(value,config)=>({start:done=>{starts.push(config.toValue);value.setValue(config.toValue);done?.({finished:true});},stop(){}})};
 const Confirm=load('src/components/SheetConfirmation.tsx',{
  'react-native':{Animated,Easing:{out:()=>0,cubic:0},Modal:host('Modal'),StyleSheet:{create:s=>s,absoluteFill:{}},View:host('View')},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},'/MotionPressable':host('Press'),'/AppText':{Text:host('Text')},'/useReducedMotion':{useReducedMotion:()=>false},
 }).default;
 let ui;await act(async()=>{ui=create(React.createElement(Confirm,{elevated:true,title:'End this session?',message:'',confirmLabel:'End',cancelLabel:'Keep',onConfirm(){},onCancel(){}}));});
 try{
  assert.deepEqual(starts,[],'not before the layer exists');
  await act(async()=>ui.root.findByType('Modal').props.onShow());
  assert.deepEqual(starts,[1]);
  await act(async()=>ui.root.findByType('Modal').props.onShow());
  assert.deepEqual(starts,[1],'only once');
 }finally{await act(async()=>ui.unmount());}
});
