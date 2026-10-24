const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relative, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}, fileName:filename,
  }).outputText;
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ['', '.ts', '.tsx'].find(suffix => fs.existsSync(target + suffix));
    return load(path.relative(path.resolve(__dirname, '..'), target + extension), mocks, cache);
  };
  new Function('require','module','exports',code)(localRequire,module,module.exports);
  return module.exports;
}
const host = type => props => React.createElement(type, props, props.children);
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');

async function resultScreen({height = 844, fontScale = 1, showSave = true, props = {}} = {}) {
  let saveVisible = showSave;
  const Scroll = React.forwardRef((values, ref) => {
    React.useImperativeHandle(ref, () => ({scrollTo(){}}));
    return React.createElement('Scroll',values,values.children);
  });
  const Modal = load('src/components/LevelUpModal.tsx', {
    'react-native-svg':{__esModule:true,default:host('Svg'),Defs:host('Defs'),RadialGradient:host('RadialGradient'),Rect:host('Rect'),Stop:host('Stop')},
    'react-native':{View:host('View'),Text:host('Text'),Platform:{OS:'android'},StyleSheet:{create:s=>s,hairlineWidth:1},useWindowDimensions:()=>({height,width:390,fontScale})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:34})},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:Scroll},
    '@expo/vector-icons':{Ionicons:host('Icon')},
    './ProgressRing':host('Ring'),'./CharacterMark':host('Companion'),
    './ArrivalBanner':require('./helpers/arrival-banner-mock.cjs'),'./MotionPressable':host('Button'),
    './SaveSuggestedQuest':() => saveVisible ? React.createElement('Button',{},'Save as quest') : null,
    './AppSheet':values=>React.createElement('Sheet',values,values.header,values.children,React.createElement('NativeFooter',null,values.footer)),
    '../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{level:1,current_xp:1}})},
    'expo-haptics':{},
    '@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{}},
  }).default;
  const initial = {visible:true,sessionId:'one',durationSeconds:60,xpEarned:1,onClose(){},...props};
  let tree;
  await act(async()=>{tree=create(React.createElement(Modal,initial));});
  return {
    tree,
    sheet:()=>tree.root.findByType('Sheet'),
    actions:()=>tree.root.findByProps({testID:'session-result-actions'}),
    scroll:()=>tree.root.findByType('Scroll'),
    measure:async(header,body,actions)=>act(async()=>{
      tree.root.findByProps({testID:'session-result-header'}).props.onLayout({nativeEvent:{layout:{height:header}}});
      tree.root.findByProps({testID:'session-result-body'}).props.onLayout({nativeEvent:{layout:{height:body}}});
      tree.root.findByProps({testID:'session-result-actions'}).props.onLayout({nativeEvent:{layout:{height:actions}}});
    }),
    update:async(next)=>act(async()=>tree.update(React.createElement(Modal,{...initial,...next}))),
    removeSave:()=>{saveVisible=false;},
    cleanup:async()=>act(async()=>tree.unmount()),
  };
}

test('measured result anchors actions in the native footer and excludes its scroll padding from body sizing',async()=>{
  const ui=await resultScreen();
  try {
    await ui.measure(42,285,166);
    assert.equal(ui.sheet().props.heightRatio*844,521);
    assert.ok(ui.sheet().props.footer);
    assert.equal(ui.tree.root.findByType('NativeFooter').findByProps({testID:'session-result-actions'}),ui.actions());
    assert.equal(ui.scroll().props.enableFooterMarginAdjustment,true);
    assert.equal(ui.scroll().props.onContentSizeChange,undefined,'library footer padding cannot feed back into the natural body measurement');
    assert.equal(ui.scroll().findAllByType('Button').length,0);
    assert.deepEqual(ui.actions().findAllByType('Button').map(text),['Save as quest','Done']);
    assert.equal([].concat(ui.actions().props.style)[0].flexShrink,0);
    ui.removeSave(); await ui.update({}); await ui.measure(42,285,94);
    assert.equal(ui.sheet().props.heightRatio*844,449,'a result without a Save action does not keep its missing button space');
    assert.deepEqual(ui.actions().findAllByType('Button').map(text),['Done']);
  } finally {await ui.cleanup();}
});

test('short screen with large text keeps measured actions visible while details scroll within the cap',async()=>{
  const ui=await resultScreen({height:640,fontScale:1.8});
  try {
    await ui.measure(72,1200,210);
    const height=ui.sheet().props.heightRatio*640;
    assert.equal(height,544);
    assert.ok(height-28-72-210>0,'the body has remaining space after real header and action heights');
    assert.equal(ui.scroll().props.style.flex,1);
    assert.equal([].concat(ui.actions().props.style)[0].flexShrink,0);
    assert.equal(ui.tree.root.findAllByProps({testID:'session-arrival'}).length,1,'large text keeps the same arrival banner');
    assert.deepEqual(ui.actions().findAllByType('Button').map(text),['Save as quest','Done']);
  } finally {await ui.cleanup();}
});

test('content sizing never presents pending local work as confirmed rewards',async()=>{
  const ui=await resultScreen({props:{pending:true,syncError:'Offline',onRetry(){}}});
  try {
    await ui.measure(42,265,94);
    assert.equal(Math.round(ui.sheet().props.heightRatio*844),429);
    assert.match(text(ui.tree.root),/saved on this phone.*Reconnect to confirm/);
    assert.doesNotMatch(text(ui.tree.root),/Character XP|Focus day recorded|Daily goal progress saved/);
    assert.deepEqual(ui.actions().findAllByType('Button').map(text),['Done']);
  } finally {await ui.cleanup();}
});

test('offline pending Done stays reachable during sync and the same result becomes a compact confirmed sheet',async()=>{
  let closes=0;
  const ui=await resultScreen({height:640,fontScale:1.6,props:{pending:true,localSaved:true,offline:true,syncBusy:true,durationSeconds:90,onClose:()=>closes++}});
  try {
    const sheet=ui.sheet();
    assert.equal(sheet.props.motionMode,'timed');
    assert.match(text(ui.tree.root),/Saved on this phone.*sync when you’re online/);
    assert.doesNotMatch(text(ui.tree.root),/Character XP|Save as quest|New session/);
    const done=ui.actions().findByType('Button');
    assert.equal(done.props.disabled,undefined);
    await act(async()=>done.props.onPress());
    assert.equal(closes,1,'Done does not wait for a cloud reply');
    await ui.update({visible:false});
    await act(async()=>ui.sheet().props.onDismiss());
    await ui.update({visible:true,pending:false,localSaved:false,syncBusy:false,recovered:true,xpEarned:1,areaXpEarned:null,creditVersion:1,completedAtMs:Date.UTC(2026,9,13,4)});
    assert.match(text(ui.tree.root),/Earlier session saved/);
    assert.match(text(ui.tree.root),/Finished.*13 Oct 2026/);
    assert.equal(ui.tree.root.findAllByProps({testID:'session-arrival'}).length,1,'online and offline use the same arrival banner');
    assert.match(text(ui.tree.root),/Character XP\+1/);
  } finally {await ui.cleanup();}
});

test('early End and rejected records use shared reachable actions without confirmed reward claims',async()=>{
  for (const props of [{ending:true,pending:true,localSaved:true,syncBusy:true}, {rejected:true,pending:false}]) {
    let closes=0;
    const ui=await resultScreen({props:{...props,onClose:()=>closes++}});
    try {
      assert.doesNotMatch(text(ui.tree.root),/Character XP|Focus day recorded|Daily goal progress saved|Save as quest/);
      assert.equal(ui.actions().findAllByType('Button').length,1);
      await act(async()=>ui.actions().findByType('Button').props.onPress());
      assert.equal(closes,1);
    } finally {await ui.cleanup();}
  }
});

test('retrying an offline result keeps its Retry connection button mounted while Done remains available',async()=>{
  let retries=0;
  const ui=await resultScreen({props:{pending:true,localSaved:true,offline:true,syncError:'Offline',onRetry:()=>retries++}});
  try {
    const retry=ui.scroll().findByType('Button');assert.equal(text(retry),'Retry connection');
    await act(async()=>retry.props.onPress());assert.equal(retries,1);
    await ui.update({syncError:null,syncBusy:true});
    assert.equal(ui.scroll().findByType('Button'),retry);assert.equal(retry.props.disabled,true);
    assert.equal(ui.actions().findByType('Button').props.disabled,undefined);
    await ui.update({syncError:'Still offline',syncBusy:false});
    assert.equal(ui.scroll().findByType('Button'),retry);assert.equal(retry.props.disabled,false);
  } finally {await ui.cleanup();}
});
