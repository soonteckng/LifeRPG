const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>props=>React.createElement(type,props,props.children);
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
function load(file,mocks,cache=new Map()){const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','__DEV__',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(filename),name);
  const target=['.tsx','.ts'].map(ext=>base+ext).find(fs.existsSync);return load(path.relative(path.resolve(__dirname,'..'),target),mocks,cache);},mod,mod.exports,false);return mod.exports;}
function sheet(){
 let props;
 const AppSheet=p=>{props=p;return React.createElement('Sheet',null,p.header,p.children,p.footer);};
 const Sheet=load('src/components/SessionResultSheet.tsx',{
  'react-native':{View:host('View'),StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({height:800,width:390,fontScale:1})},
  '@expo/vector-icons':{Ionicons:host('Icon')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  '@gorhom/bottom-sheet':{BottomSheetScrollView:React.forwardRef((p,ref)=>React.createElement('Scroll',p,p.children))},
  'react-native-svg':{__esModule:true,default:host('Svg'),Defs:host('Defs'),RadialGradient:host('RG'),Rect:host('Rect'),Stop:host('Stop')},
  './AppSheet':AppSheet,'expo-haptics':{notificationAsync:async()=>{},NotificationFeedbackType:{Success:'s'}},
  './ArrivalBanner':require('./helpers/arrival-banner-mock.cjs'),'./MotionPressable':host('Press'),'./AppText':{Text:host('Text')},'./ProgressRing':host('Ring'),'./CharacterMark':host('Companion'),
  '../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{id:'me',level:2,current_xp:40,timezone:'Asia/Kuala_Lumpur'}})},
  '../services/dailyAchievementQueue':{dailyAchievementQueue:{enqueue(){}}},
 }).default;
 return {Sheet,props:()=>props};
}
const base={visible:true,onClose(){},questTitle:'Test',durationSeconds:60,areaTitle:'Learning'};

test('while the result is confirmed online, the card already looks finished and only the numbers fill in',async()=>{
 const {Sheet,props}=sheet();let ui;
 await act(async()=>{ui=create(React.createElement(Sheet,{...base,pending:true,localSaved:true,sessionId:'s1'}));});
 const shown=text(ui.toJSON());
 assert.match(shown,/Session complete/,'no "Session finished" title swap');
 assert.match(shown,/Learning/);assert.match(shown,/…/);assert.doesNotMatch(shown,/XP|Level/,'no XP or level rows since Round 83');
 assert.doesNotMatch(shown,/Saved on this phone/,'no long saving message online');
 await act(async()=>ui.update(React.createElement(Sheet,{...base,pending:false,sessionId:'s1'})));
 const done=text(ui.toJSON());assert.match(done,/Time added/);assert.match(done,/Focus day recorded/);assert.doesNotMatch(done,/…/);
 await act(async()=>ui.unmount());
});

test('offline the card still explains that the session is saved on this phone',async()=>{
 const {Sheet}=sheet();let ui;
 await act(async()=>{ui=create(React.createElement(Sheet,{...base,pending:true,localSaved:true,offline:true,sessionId:'s1'}));});
 assert.match(text(ui.toJSON()),/Saved on this phone/);
 await act(async()=>ui.unmount());
});

test('measured sizes survive the result arriving, so the card never grows a gap above Done',async()=>{
 const {Sheet,props}=sheet();let ui;
 await act(async()=>{ui=create(React.createElement(Sheet,{...base,pending:true,localSaved:true,sessionId:null}));});
 const layout=(id,h)=>ui.root.findAll(x=>x.props.testID===id&&x.props.onLayout)[0].props.onLayout({nativeEvent:{layout:{height:h}}});
 await act(async()=>{layout('session-result-header',36);layout('session-result-body',260);layout('session-result-actions',74);});
 const measured=props().heightRatio*800;
 assert.equal(Math.round(measured),28+36+260+74);
 // The session id and the confirmed result arrive; the header and Done do not change size, so they report nothing new.
 await act(async()=>ui.update(React.createElement(Sheet,{...base,pending:false,sessionId:'s1'})));
 assert.equal(Math.round(props().heightRatio*800),28+36+260+74,'kept the real sizes instead of falling back to taller guesses');
 await act(async()=>layout('session-result-body',250));
 assert.equal(Math.round(props().heightRatio*800),28+36+250+74,'and still follows a real change');
 await act(async()=>ui.unmount());
});

test('a finished session shows the time and the focus day, with no level, XP or companion',async()=>{
 const {Sheet}=sheet();let ui;
 await act(async()=>{ui=create(React.createElement(Sheet,{...base,pending:false,sessionId:'s2'}));});
 const shown=text(ui.toJSON());
 assert.match(shown,/Session complete/);assert.match(shown,/Focus day recorded/);
 assert.equal(ui.root.findAll(n=>n.props.testID==='session-level-up').length,0);
 assert.equal(ui.root.findAllByType('Companion').length,0);assert.doesNotMatch(shown,/Level|XP/);
 await act(async()=>ui.unmount());
});
