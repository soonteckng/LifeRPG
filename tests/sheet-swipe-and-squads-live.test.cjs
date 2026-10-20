const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>React.forwardRef((props,ref)=>React.createElement(type,{...props,ref:undefined},props.children));
function load(file,mocks,cache=new Map()){const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(filename),name);
  const target=['.tsx','.ts'].map(ext=>base+ext).find(fs.existsSync);return load(path.relative(path.resolve(__dirname,'..'),target),mocks,cache);},mod,mod.exports);return mod.exports;}

test('a sheet text field ignores the tap that ends a swipe-down, and works again afterwards',async()=>{
 const cache=new Map(),mocks={'@gorhom/bottom-sheet':{BottomSheetTextInput:host('Input')}};
 const SheetTextInput=load('src/components/SheetTextInput.tsx',mocks,cache).default,{SheetDragContext}=load('src/utils/sheetDrag.ts',mocks,cache);
 const view=dragging=>React.createElement(SheetDragContext.Provider,{value:dragging},React.createElement(SheetTextInput,{value:'Read',editable:true}));
 let ui;await act(async()=>{ui=create(view(false));});
 assert.equal(ui.root.findByType('Input').props.editable,true);
 await act(async()=>ui.update(view(true)));
 assert.equal(ui.root.findByType('Input').props.editable,false,'no focus, so no keyboard flash while the sheet slides away');
 await act(async()=>ui.update(view(false)));
 assert.equal(ui.root.findByType('Input').props.editable,true);
 await act(async()=>ui.update(React.createElement(SheetDragContext.Provider,{value:false},React.createElement(SheetTextInput,{value:'Read',editable:false}))));
 assert.equal(ui.root.findByType('Input').props.editable,false,'a field that is off stays off');
 await act(async()=>ui.unmount());
});

test('every sheet text field uses the swipe-safe field',()=>{
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const offenders=walk(path.resolve(__dirname,'../src')).filter(f=>/\.tsx$/.test(f)&&!f.endsWith('SheetTextInput.tsx')&&fs.readFileSync(f,'utf8').includes('<BottomSheetTextInput'));
 assert.deepEqual(offenders,[]);
});

test('Ideas for you keeps Done pinned below the list, with the limit in the subtitle',async()=>{
 const rn={View:host('View'),StyleSheet:{create:v=>v}};
 const Sheet=load('src/components/IdeaAreasSheet.tsx',{'react-native':rn,'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll')},
  './AppSheet':props=>React.createElement('Sheet',props,props.children),'./SheetHeader':host('Header'),'./IdeaAreaPicker':host('Picker'),
  './SheetTouchable':host('Press'),'./AppText':{Text:host('Text')},'../constants/theme':{colors:{}},
  '../hooks/useGuidedPreference':{useGuidedPreference:()=>({ready:true,busy:false,value:{ideaAreas:['learning']},save:async v=>{saved.push(v.ideaAreas);return true;}})}}).default;
 const saved=[];let closed=0;
 let ui;await act(async()=>{ui=create(React.createElement(Sheet,{owner:'o',visible:true,onClose(){closed++;}}));});
 const sheet=ui.root.findByType('Sheet');
 assert.ok(sheet.props.footer,'Done lives in the footer');
 assert.equal(ui.root.findByType('Scroll').findAll(x=>x.props.accessibilityLabel==='Done').length,0,'not at the end of the scrolling list');
 assert.match(sheet.props.header.props.subtitle,/up to three/);
 assert.equal(ui.root.findByType('Picker').props.inSheet,true);
 await act(async()=>ui.root.findByType('Picker').props.onChange(['learning','wellbeing']));
 await act(async()=>ui.root.findByType('Sheet').props.onRequestClose());
 await act(async()=>ui.root.findByType('Sheet').props.header.props.onClose());
 assert.deepEqual(saved,[],'swiping down or ✕ does not save');assert.equal(closed,2);
 const done=ui.root.findByType('Sheet').props.footer;let doneUi;await act(async()=>{doneUi=create(done);});
 await act(async()=>doneUi.root.findAll(x=>x.props.accessibilityLabel==='Done'&&x.props.onPress)[0].props.onPress());
 assert.deepEqual(saved,[['learning','wellbeing']],'Done saves the picks');
 await act(async()=>{doneUi.unmount();ui.unmount();});
});

test('a squad on screen reloads when shown, on return to the app, on a timer, and when your session changes',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/hooks/useSquads.ts'),'utf8');
 assert.match(src,/useFocusEffect/);assert.match(src,/AppState\.addEventListener/);assert.match(src,/setInterval/);
 assert.match(src,/timer\.hasOpenSession/);assert.match(src,/clearInterval/);
});

test('a squad page slides down from anywhere once scrolled to the top, like the session, and leaves taps and scrolling alone',async()=>{
 let config;const values=[];
 const value={setValue:v=>values.push(v),stopAnimation(){},interpolate:()=>0};
 const timing=(_v,{toValue})=>({start:done=>{values.push(['to',toValue]);done?.({finished:true});},stop(){}});
 const rn={View:host('View'),ScrollView:host('Scroll'),StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({height:800}),
  Animated:{Value:function(){return value;},View:host('AView'),timing},PanResponder:{create:c=>{config=c;return{panHandlers:{}};}}};
 const nav={canGoBack:()=>true,goBack(){nav.left=true;}};
 // A chainable stand-in for the list gesture that keeps its callbacks.
 let list;const chain=()=>{const g={};for(const k of ['runOnJS','enabled','activeOffsetY','failOffsetX','simultaneousWithExternalGesture'])g[k]=()=>g;
  for(const k of ['onStart','onUpdate','onEnd','onFinalize'])g[k]=f=>{g['_'+k]=f;return g;};return g;};
 const gh={Gesture:{Native:()=>({native:true}),Pan:()=>(list=chain())},GestureDetector:({children})=>children};
 const Page=load('src/components/SlideUpPage.tsx',{'react-native':rn,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  'react-native-gesture-handler':gh,
  'expo-router':{useNavigation:()=>nav,useRouter:()=>({replace(){}})},'expo-router/react-navigation':{usePreventRemove(){}},'./AppHeader':host('Header'),
  '../constants/theme':{colors:{}},'../hooks/useReducedMotion':{useReducedMotion:()=>false},'../utils/navigationMotion':{navigationTiming:d=>({duration:d})}}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Page,{title:'My Squad',fallback:'/squads'},React.createElement('Text',null,'board')));});
 const take=(dy,dx=0)=>config.onMoveShouldSetPanResponderCapture({}, {dy,dx});
 assert.equal(take(5),false,'a tap stays a tap');assert.equal(take(30,40),false,'sideways stays sideways');assert.equal(take(-30),false,'scrolling up scrolls');
 assert.equal(take(30),true,'a downward drag at the top moves the page');
 ui.root.findByType('Scroll').props.onScroll({nativeEvent:{contentOffset:{y:120}}});
 assert.equal(take(30),false,'scrolled down, the content scrolls back first');
 ui.root.findByType('Scroll').props.onScroll({nativeEvent:{contentOffset:{y:0}}});
 config.onPanResponderGrant();config.onPanResponderMove({}, {dy:400});assert.equal(values.at(-1),0.5,'the page follows the finger');
 config.onPanResponderRelease({}, {dy:40,vy:0.1});assert.deepEqual(values.at(-1),['to',1],'a short pull settles back');
 config.onPanResponderGrant();await act(async()=>config.onPanResponderRelease({}, {dy:300,vy:0.2}));assert.deepEqual(values.at(-1),['to',0],'a long pull slides it away');
 assert.equal(nav.left,true,'and then leaves');
 assert.equal(take(30),false,'once leaving, nothing else takes the pull');
 await act(async()=>ui.unmount());
});

test('over a long scrolling list the pull is taken alongside the scroll, only at the top',async()=>{
 const values=[];const value={setValue:v=>values.push(v),stopAnimation(){},interpolate:()=>0};
 const timing=(_v,{toValue})=>({start:done=>{values.push(['to',toValue]);done?.({finished:true});},stop(){}});
 let config,list;const chain=()=>{const g={};for(const k of ['runOnJS','enabled','activeOffsetY','failOffsetX','simultaneousWithExternalGesture'])g[k]=()=>g;
  for(const k of ['onStart','onUpdate','onEnd','onFinalize'])g[k]=f=>{g['_'+k]=f;return g;};return g;};
 const rn={View:host('View'),ScrollView:host('Scroll'),StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({height:800}),
  Animated:{Value:function(){return value;},View:host('AView'),timing},PanResponder:{create:c=>{config=c;return{panHandlers:{}};}}};
 const nav={canGoBack:()=>true,goBack(){nav.left=true;}};
 const Page=load('src/components/SlideUpPage.tsx',{'react-native':rn,'react-native-gesture-handler':{Gesture:{Native:()=>({}),Pan:()=>(list=chain())},GestureDetector:({children})=>children},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'expo-router':{useNavigation:()=>nav,useRouter:()=>({replace(){}})},
  'expo-router/react-navigation':{usePreventRemove(){}},'./AppHeader':host('Header'),'../constants/theme':{colors:{}},
  '../hooks/useReducedMotion':{useReducedMotion:()=>false},'../utils/navigationMotion':{navigationTiming:d=>({duration:d})}}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Page,{title:'My Squad',fallback:'/squads'},'board'));});
 const scroller=ui.root.findByType('Scroll');values.length=0;
 scroller.props.onScroll({nativeEvent:{contentOffset:{y:200}}});
 list._onStart();list._onUpdate({translationY:300});list._onEnd({translationY:300,velocityY:0});
 assert.equal(values.length,0,'scrolled down, a pull just scrolls the list');
 scroller.props.onScroll({nativeEvent:{contentOffset:{y:0}}});
 list._onStart();assert.equal(config.onMoveShouldSetPanResponderCapture({}, {dy:30,dx:0}),false,'one owner per pull');
 list._onUpdate({translationY:200});assert.equal(values.at(-1),0.75,'the page follows the finger over the list');
 list._onEnd({translationY:40,velocityY:100});list._onFinalize();assert.deepEqual(values.at(-1),['to',1],'a short pull settles back');
 list._onStart();await act(async()=>list._onEnd({translationY:60,velocityY:900}));assert.deepEqual(values.at(-1),['to',0],'a quick flick slides it away');
 assert.equal(nav.left,true);
 await act(async()=>ui.unmount());
});
