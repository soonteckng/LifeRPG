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
    'react-native':{View:host('View'),Text:host('Text'),Platform:{OS:'android'},StyleSheet:{create:s=>s,hairlineWidth:1},useWindowDimensions:()=>({height,width:390,fontScale})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:34})},
    '@gorhom/bottom-sheet':{BottomSheetScrollView:Scroll},
    '@expo/vector-icons':{Ionicons:host('Icon')},
    './ProgressRing':host('Ring'),
    './MotionPressable':host('Button'),
    './SaveSuggestedQuest':() => saveVisible ? React.createElement('Button',{},'Save as quest') : null,
    './AppSheet':values=>React.createElement('Sheet',values,values.header,values.children),
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
      tree.root.findByType('Scroll').props.onContentSizeChange(390,body);
      tree.root.findByProps({testID:'session-result-actions'}).props.onLayout({nativeEvent:{layout:{height:actions}}});
    }),
    update:async(next)=>act(async()=>tree.update(React.createElement(Modal,{...initial,...next}))),
    removeSave:()=>{saveVisible=false;},
    cleanup:async()=>act(async()=>tree.unmount()),
  };
}

test('measured ordinary result removes empty screen space without moving actions into the scroll body',async()=>{
  const ui=await resultScreen();
  try {
    await ui.measure(42,285,166);
    assert.equal(ui.sheet().props.heightRatio*844,521);
    assert.equal(ui.sheet().props.footer,undefined);
    assert.equal(ui.scroll().findAllByType('Button').length,0);
    assert.deepEqual(ui.actions().findAllByType('Button').map(text),['Save as quest','Done']);
    assert.equal(ui.actions().props.style[0].flexShrink,0);
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
    assert.equal(ui.actions().props.style[0].flexShrink,0);
    assert.equal(ui.tree.root.findByType('Ring').props.size,48);
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
