/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>function Host(props){return React.createElement(name,props,props.children);};
const text=node=>typeof node==='string'?node:(node?.children??[]).map(text).join('|');
function load(file,mocks,cache=new Map()){const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(filename),name);
  const target=['.ts','.tsx'].map(ext=>base+ext).find(fs.existsSync);return load(path.relative(path.resolve(__dirname,'..'),target),mocks,cache);},mod,mod.exports);return mod.exports;}
const Shelf=load('src/components/SubjectShelf.tsx',{'react-native':{View:host('View'),StyleSheet:{create:v=>v,hairlineWidth:1},useWindowDimensions:()=>({width:390})},
 '@expo/vector-icons':{Ionicons:host('Icon')},'./MotionPressable':host('Press'),'./StartButton':host('Start'),'./AppText':{Text:host('Text')},
 './EditMode':{EditBadges:host('Badges'),Wiggle:host('Wiggle')}}).default;
const course=(id,name)=>({id,name,focusAreaId:null,deletedAt:null,revision:1});
test('Study: the subject you studied last this week leads, full width; everything else keeps its order',async()=>{
 const courses=[course('a','Additional Mathematics'),course('b','Mathematics'),course('c','Statistics')];
 const now=Date.now(),props={courses,exams:[],editing:false,onEditingChange(){},onOpen(){},onEdit(){},onStudy(){},onRemove(){}};
 let ui;await act(async()=>{ui=create(React.createElement(Shelf,{...props,recent:[{courseId:'c',completedAt:now-60000,seconds:900},{courseId:'a',completedAt:now-3600000,seconds:60}]}));});
 const tiles=()=>ui.root.findAllByType('Wiggle');
 assert.match(text(tiles()[0]),/Last studied\|Statistics/);
 assert.ok(tiles()[0].props.style.at(-1).width>tiles()[1].props.style.at(-1).width,'the featured tile is wider');
 assert.deepEqual(tiles().slice(1).map(t=>text(t).match(/Additional Mathematics|Mathematics/)[0]),['Additional Mathematics','Mathematics']);
 await act(async()=>ui.update(React.createElement(Shelf,{...props,recent:[]})));
 assert.doesNotMatch(text(ui.toJSON()),/Last studied/,'nothing studied this week, nothing featured');
 await act(async()=>ui.unmount());
});
