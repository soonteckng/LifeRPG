/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) {return React.createElement(type, props, props.children);};
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');

function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName:filename, compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports','__DEV__',source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const suffix = ['', '.ts', '.tsx'].find(extension => fs.existsSync(target + extension));
    return load(path.relative(root, target + suffix), mocks, cache);
  },module,module.exports,false);
  return module.exports;
}

// Exercise our real result/AppSheet with the INSTALLED library's actual footer
// placement and scroll-padding hooks. Native platform primitives and the sheet
// host are substituted; footer geometry is not reimplemented by the test.
async function setup({height=844,fontScale=1,bottom=34,initialProps={}}={}) {
  const layout = {containerHeight:height,handleHeight:70,footerHeight:0};
  const keyboard = {status:0,heightWithinContainer:0};
  let sheetHeight=500, closes=0, unmountedFooters=0;
  const state = {get:()=>layout,modify:fn=>fn(layout)};
  const internal = {animatedLayoutState:state,animatedKeyboardState:{get:()=>keyboard},
    animatedPosition:{get:()=>height-sheetHeight}};
  const native = {View:host('View'),Text:host('Text'),Modal:host('Modal'),Pressable:host('Press'),
    Platform:{OS:'android'},StyleSheet:{create:value=>value,flatten,compose:(...args)=>flatten(args),hairlineWidth:1,absoluteFill:{}},
    useWindowDimensions:()=>({height,width:390,fontScale}),
    Keyboard:{dismiss(){},isVisible:()=>false,addListener:()=>({remove(){}})}};
  const AnimatedView = props => {
    React.useEffect(()=>()=>{unmountedFooters++;},[]);
    return React.createElement('NativeFooter',props,props.children);
  };
  const reanimated = {__esModule:true,default:{View:AnimatedView},
    Easing:{out:fn=>fn,cubic:value=>value},ReduceMotion:{System:'system'},
    useDerivedValue:fn=>({get:fn}),useAnimatedStyle:fn=>fn(),runOnJS:fn=>fn,
    useAnimatedReaction:(prepare,react)=>{const value=prepare();React.useLayoutEffect(()=>{react(value,undefined);},[value,react]);}};
  const constants = {INITIAL_LAYOUT_VALUE:-999,KEYBOARD_STATUS:{SHOWN:1}};
  const libraryMocks = {'react-native':native,'react-native-reanimated':reanimated,
    '../../constants':constants,'../../utilities':{print(){}},
    '../../hooks':{useBottomSheetInternal:()=>internal,useBoundingClientRect(){}},
    './useBottomSheetInternal':{useBottomSheetInternal:()=>internal}};
  const libraryCache=new Map();
  const Footer = load('node_modules/@gorhom/bottom-sheet/src/components/bottomSheetFooter/BottomSheetFooter.tsx',libraryMocks,libraryCache).BottomSheetFooter;
  const FooterContainer = load('node_modules/@gorhom/bottom-sheet/src/components/bottomSheetFooter/BottomSheetFooterContainer.tsx',libraryMocks,libraryCache).BottomSheetFooterContainer;
  const useContentStyle = load('node_modules/@gorhom/bottom-sheet/src/hooks/useBottomSheetContentContainerStyle.ts',libraryMocks,libraryCache).useBottomSheetContentContainerStyle;
  const Scroll=React.forwardRef(function Scroll(props,ref){
    React.useImperativeHandle(ref,()=>({scrollTo(){}}),[]);
    const contentContainerStyle=useContentStyle(props.enableFooterMarginAdjustment,props.contentContainerStyle);
    return React.createElement('NativeScroll',{...props,contentContainerStyle},props.children);
  });
  const Sheet=React.forwardRef(function Sheet(props,ref){
    React.useImperativeHandle(ref,()=>({close(){}}),[]);
    sheetHeight=props.snapPoints[0];
    return React.createElement('NativeSheet',props,React.createElement(props.handleComponent),props.children,
      props.footerComponent&&React.createElement(FooterContainer,{footerComponent:props.footerComponent}));
  });
  const mocks={'react-native':native,'react-native-reanimated':reanimated,
    'react-native-svg':{__esModule:true,default:host('Svg'),Defs:host('Defs'),RadialGradient:host('RadialGradient'),Rect:host('Rect'),Stop:host('Stop')},
    '@gorhom/bottom-sheet':{__esModule:true,default:Sheet,BottomSheetFooter:Footer,BottomSheetScrollView:Scroll,
      BottomSheetBackdrop:host('Backdrop'),useBottomSheetSpringConfigs:x=>x,useBottomSheetTimingConfigs:x=>x},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom})},
    'react-native-gesture-handler':{GestureHandlerRootView:host('Root')},
    '@expo/vector-icons':{Ionicons:host('Icon')},'./ProgressRing':host('Ring'),'./CharacterMark':host('Companion'),
    './AppText':{Text:host('Text')},'./MotionPressable':host('Button'),
    '../context/UserContext':{useUser:()=>({profile:{id:'a',level:1,current_xp:1},hapticsEnabled:false})},
    'expo-haptics':{},'../services/dailyAchievementQueue':{dailyAchievementQueue:{enqueue(){}}},
    '../utils/sheetActivity':{registerSheetActivity:()=>()=>{}}};
  const Result=load('src/components/SessionResultSheet.tsx',mocks).default;
  let props={sessionId:'end-a',visible:true,ending:true,pending:true,localSaved:true,offline:true,
    questTitle:'Read a chapter',onClose:()=>closes++,...initialProps};
  let tree;await act(async()=>{tree=create(React.createElement(Result,props));});
  const render=async()=>act(async()=>tree.update(React.createElement(Result,props)));
  return {tree,get closes(){return closes;},get unmountedFooters(){return unmountedFooters;},
    async update(changes){props={...props,...changes};await render();},
    async measure({header=42,body=220,actions=94}={}){
      layout.handleHeight=header+28;
      await act(async()=>{
        for(const [part,value] of Object.entries({header,body,actions})) {
          tree.root.findByProps({testID:`session-result-${part}`}).props.onLayout({nativeEvent:{layout:{height:value}}});
        }
        tree.root.findByType('NativeFooter').props.onLayout({nativeEvent:{layout:{height:actions}}});
      });
      await render();
    },
    bounds(){
      const footer=tree.root.findByType('NativeFooter');
      const style=flatten(footer.props.style);
      const top=internal.animatedPosition.get()+layout.handleHeight+style.transform[0].translateY;
      return {top,bottom:top+layout.footerHeight,bodyStart:height-sheetHeight+layout.handleHeight,
        padding:flatten(tree.root.findByType('NativeScroll').props.contentContainerStyle).paddingBottom,
        position:style.position,reduceMotion:tree.root.findByType('NativeSheet').props.overrideReduceMotion};
    },
    async cleanup(){await act(async()=>tree.unmount());}};
}

test('real native footer remains on screen when an End receipt removes pending content after layout',async()=>{
  const ui=await setup();
  try{
    await ui.measure({body:258});
    const button=ui.tree.root.findAllByType('Button').find(item=>text(item)==='Done');
    const originalFooter=ui.tree.root.findByType('NativeSheet').props.footerComponent;
    assert.equal(ui.bounds().bottom,844);
    assert.equal(ui.bounds().position,'absolute');
    assert.equal(ui.bounds().padding,94);
    await ui.update({pending:false,offline:false});await ui.measure({body:156});
    assert.equal(ui.tree.root.findByType('NativeSheet').props.footerComponent,originalFooter,'receipt and measurements do not remount the measured footer');
    assert.equal(ui.unmountedFooters,0);
    assert.equal(ui.tree.root.findAllByType('Button').find(item=>text(item)==='Done'),button);
    assert.equal(ui.bounds().bottom,844,'Done stays above the phone bottom after the shorter sheet settles');
    assert.ok(ui.bounds().top>=ui.bounds().bodyStart);
    assert.equal(ui.bounds().padding,94,'the body can scroll completely above Done');
    await act(async()=>button.props.onPress());assert.equal(ui.closes,1);
  }finally{await ui.cleanup();}
});

test('large text, capped sheets and late save actions retain visible native actions with one matching scroll reservation',async()=>{
  const ui=await setup({height:640,fontScale:1.8,bottom:34});
  try{
    await ui.update({ending:false,pending:true,durationSeconds:60});
    await ui.measure({header:72,body:720,actions:102});
    assert.equal(ui.bounds().bottom,640);assert.equal(ui.bounds().padding,102);
    const footer=ui.tree.root.findByType('NativeSheet').props.footerComponent;
    await ui.update({pending:false,saveAction:React.createElement('Button',null,'Save as routine')});
    await ui.measure({header:72,body:1080,actions:174});
    assert.equal(ui.bounds().bottom,640);assert.equal(ui.bounds().padding,174);
    assert.ok(ui.bounds().top>ui.bounds().bodyStart,'the scroll body retains a visible viewport');
    assert.equal(ui.tree.root.findByType('NativeSheet').props.footerComponent,footer);
    assert.equal(ui.bounds().reduceMotion,'system');
    assert.deepEqual(ui.tree.root.findByType('NativeFooter').findAllByType('Button').map(text),['Save as routine','Done']);
    assert.equal(ui.tree.root.findByType('NativeScroll').findAllByType('Button').length,0);
    assert.equal(ui.unmountedFooters,0);
  }finally{await ui.cleanup();}
});

test('normal online End never flashes Retry connection before its confirmation or after it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ui=await setup({initialProps:{offline:false,syncBusy:true,onRetry(){}}});
  try{
    const buttons=()=>ui.tree.root.findAllByType('Button').map(text);
    const done=ui.tree.root.findAllByType('Button').find(n=>text(n)==='Done');
    assert.deepEqual(buttons(),['Done']);
    await act(async()=>t.mock.timers.tick(600));
    assert.deepEqual(buttons(),['Done']);
    await ui.update({pending:false,syncBusy:false});
    await act(async()=>t.mock.timers.tick(4000));
    assert.deepEqual(buttons(),['Done']);
    assert.equal(ui.tree.root.findAllByType('Button').find(n=>text(n)==='Done'),done);
    await act(async()=>done.props.onPress());assert.equal(ui.closes,1);
  }finally{await ui.cleanup();}
});

test('End offers retry for a real failure, offline stop or prolonged confirmation, retaining Done throughout',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ui=await setup({initialProps:{offline:false,syncBusy:true,onRetry(){}}});
  try{
    const buttons=()=>ui.tree.root.findAllByType('Button');
    await act(async()=>t.mock.timers.tick(2999));assert.deepEqual(buttons().map(text),['Done']);
    await act(async()=>t.mock.timers.tick(1));assert.deepEqual(buttons().map(text),['Retry connection','Done']);
    assert.equal(buttons()[0].props.disabled,true);
    await ui.update({pending:false,syncBusy:false});assert.deepEqual(buttons().map(text),['Done']);
    await ui.update({sessionId:'failed-end',pending:true,syncError:'Connection lost'});
    assert.deepEqual(buttons().map(text),['Retry connection','Done']);assert.equal(buttons()[0].props.disabled,false);
    await ui.update({sessionId:'offline-end',syncError:null,offline:true});
    assert.deepEqual(buttons().map(text),['Retry connection','Done']);
    assert.match(text(ui.tree.root),/confirm it when you reconnect/);
  }finally{await ui.cleanup();}
});
