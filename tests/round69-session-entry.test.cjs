/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()) {
  const filename=path.resolve(root,file);if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(root,target+ext),mocks,cache);
  },module,module.exports);return module.exports;
}
const host=type=>function Host(props){return React.createElement(type,props,props.children);};

test('entry requests are immutable, session-specific and consumed once by their focused presentation',()=>{
  const {sessionEntry}=load('src/services/sessionEntry.ts');const blank=sessionEntry.snapshot();let updates=0;
  const off=sessionEntry.subscribe(()=>updates++);
  sessionEntry.request(null);assert.equal(sessionEntry.snapshot(),blank);assert.equal(updates,0);
  sessionEntry.request('session-a');const first=sessionEntry.snapshot();
  assert.deepEqual(blank,{sequence:0,sessionId:null,pendingScope:null});
  assert.equal(sessionEntry.take(first,'other-session'),false);
  assert.equal(sessionEntry.take(first,'session-a'),true);assert.equal(sessionEntry.take(first,'session-a'),false);
  sessionEntry.request('session-a');const second=sessionEntry.snapshot();
  assert.equal(sessionEntry.take(first,'session-a'),false,'an old callback cannot consume a newer request');
  assert.equal(sessionEntry.take(second,'session-a'),true);assert.equal(updates,2);
  off();sessionEntry.request('session-b');assert.equal(updates,2);
});

test('a pending widget entrance belongs only to its exact account admission until a timer id exists',()=>{
  const {sessionEntry}=load('src/services/sessionEntry.ts');
  sessionEntry.request(null,'backend/owner/epoch-1');const pending=sessionEntry.snapshot();
  assert.equal(sessionEntry.take(pending,null,'backend/other-owner/epoch-1'),false);
  assert.equal(sessionEntry.take(pending,null,'backend/owner/epoch-2'),false);
  assert.equal(sessionEntry.take(pending,null,'backend/owner/epoch-1'),true);
  assert.equal(sessionEntry.take(pending,'new-client-id','backend/owner/epoch-1'),false);
});

test('each pinned running-session press requests a new entrance after prior widget activity',async()=>{
  const cache=new Map(),calls=[];
  const timer={sessionId:'server-session',protectionSessionId:'current-session',hasOpenSession:true,isRunning:true,isCompleted:false,duration:1800,timeLeft:120,summaryViewed:false};
  const mocks={
    'react-native':{View:host('View'),TouchableOpacity:host('Button'),StyleSheet:{create:styles=>styles},useWindowDimensions:()=>({width:360,fontScale:1})},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},
    '@expo/vector-icons':{Ionicons:host('Icon')},
    'expo-router':{useRouter:()=>({navigate:to=>calls.push(to)})},'expo-router/js-tabs':{BottomTabBar:host('Tabs')},
    '../context/TimerContext':{useTimer:()=>timer},'./AppText':{Text:host('Text')},
    '../utils/tapHaptics':{tapHaptic(){},tapHapticsEnabled:()=>false},
    '../context/FloatingDockContext':{floatingDockKey:()=>'',useMeasureFloatingDock:()=>()=>{}},
    './FeatureTour':{useFeatureTour:()=>null},'./PinnedAction':{PinnedActionHost:host('Pinned'),usePinnedActionPresent:()=>false},'./OfflineStatus':()=>null,
  };
  const entry=load('src/services/sessionEntry.ts',mocks,cache).sessionEntry;
  const Dock=load('src/components/SessionTabBar.tsx',mocks,cache).default;
  let ui;await act(async()=>{ui=create(React.createElement(Dock,{state:{routes:[{name:'index'}],index:0}}));});
  try {
    entry.request(timer.protectionSessionId);entry.take(entry.snapshot(),timer.protectionSessionId);
    for(let expected=2;expected<=4;expected++) {
      await act(async()=>ui.root.findByProps({accessibilityLabel:'Expand running session'}).props.onPress());
      assert.equal(entry.snapshot().sequence,expected,'the dock renews the entrance even when a prior widget reused Session');
      assert.equal(entry.snapshot().sessionId,timer.protectionSessionId);
      assert.equal(entry.take(entry.snapshot(),timer.protectionSessionId),true);
    }
    assert.deepEqual(calls,['/session','/session','/session']);
  } finally {await act(async()=>ui.unmount());}
});
