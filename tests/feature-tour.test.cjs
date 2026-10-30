/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks,cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  const key=Object.keys(mocks).find(k=>k===name||k.startsWith('/')&&name.endsWith(k));if(key)return mocks[key];
  if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e));
  return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
 },module,module.exports);return module.exports;
}

// The real guide, with the phone around it replaced: routes, storage, timers and measurements.
async function guide({receipt='pending',measureTabs=true}={}){
 const saved={setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
 let now=0,serial=0;const timers=new Map();
 global.setTimeout=(callback,delay=0)=>{const id=++serial;timers.set(id,{callback,at:now+delay});return id;};global.clearTimeout=id=>timers.delete(id);
 const advance=async ms=>{const end=now+ms;for(let turn=0;turn<500;turn++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);await act(async()=>{next[1].callback();});}now=end;};
 const store=new Map(receipt?[['liferpg:tour:v1:alice',receipt]]:[]);const measures=[],reveals=[];const invitations=[];const announcements=[];let backHandler=null;
 let pathname='/',rerender;const routes=[];
 const router={navigate:route=>{routes.push(route);pathname=route;rerender?.();}};
 class Value{constructor(v){this.value=v;}setValue(v){this.value=v;}interpolate(){return 0;}}
 const Animated={View:host('Animated'),Value,add:()=>0,timing:(value,config)=>({start:done=>{value.setValue(config.toValue);done?.({finished:true});},stop(){}}),sequence:items=>({start:done=>{items.forEach(i=>i.start());done?.({finished:true});},stop(){}}),loop:()=>({start(){},stop(){}})};
 const Native={View:host('View'),ScrollView:host('Scroll'),Pressable:host('Paused'),StyleSheet:{create:s=>s,absoluteFill:{}},Animated,useWindowDimensions:()=>({width:390,height:800,fontScale:1}),
  AccessibilityInfo:{announceForAccessibility:text=>announcements.push(text)},BackHandler:{addEventListener:(_,handler)=>{backHandler=handler;return{remove(){if(backHandler===handler)backHandler=null;}};}}};
 const api=load('src/components/FeatureTour.tsx',{
  'react-native':Native,'expo-haptics':{ImpactFeedbackStyle:{Light:'light'},impactAsync:async()=>{}},'@expo/vector-icons':{Ionicons:host('Icon'),MaterialCommunityIcons:host('Icon')},
  'expo-router':{usePathname:()=>pathname,useRouter:()=>router},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'react-native-svg':{__esModule:true,default:host('Svg'),Path:host('Path')},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>store.get(key)??null,setItem:async(key,value)=>{store.set(key,value);}}},
  '/UserContext':{useUser:()=>({profile:{id:'alice',onboarding_completed:true},hapticsEnabled:false})},
  '/TimerContext':{useTimer:()=>({hasOpenSession:false,actionBusy:false,isRestoring:false,restoreError:false,rewardsVisible:false,isCompleted:false,sessionSummary:null})},
  '/useReducedMotion':{useReducedMotion:()=>true},
  '/notificationOnboardingStore':{notificationOnboardingStore:{prepare:async()=>{},finishGuide:async owner=>{invitations.push(owner);}}},
  '/NotificationOnboardingPrompt':host('Invite'),'/AppText':{Text:host('Text')},'/MotionPressable':host('Button'),
 });
 // Every highlighted target sits somewhere sensible; tab targets only when measurable.
 const spots={'home-focus':{x:20,y:200,width:350,height:220},'home-quests':{x:20,y:440,width:350,height:160},'home-identity':{x:20,y:60,width:350,height:100},'routines-mine':{x:20,y:240,width:350,height:200},'study-subjects':{x:20,y:120,width:350,height:260},'home-places':{x:20,y:620,width:350,height:260}};
 ['index','routines','study','squads','progress'].forEach((tab,i)=>{spots[`tab-${tab}`]={x:20+i*70,y:720,width:70,height:66};});
 function Targets(){const tour=api.useFeatureTour();React.useEffect(()=>{const offs=Object.entries(spots).map(([id,rect])=>tour.register(id,{measure:done=>{if(id.startsWith('tab-')&&!measureTabs)return;measures.push(id);done(rect);},reveal:()=>{reveals.push(id);return false;}}));return()=>offs.forEach(off=>off());},[tour]);return React.createElement('App');}
 const element=()=>React.createElement(api.FeatureTourProvider,null,React.createElement(Targets));
 let tree;await act(async()=>{tree=create(element(),{createNodeMock:()=>({measureInWindow:done=>done(0,0,390,800)})});});
 rerender=()=>tree.update(element());
 await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());
 const find=id=>tree.root.findAll(node=>node.props.testID===id&&typeof node.type==='string');
 const text=()=>tree.root.findAllByType('Text').map(node=>[].concat(node.props.children).join('')).join(' | ');
 return {api,tree,store,routes,invitations,announcements,advance,find,text,measures,reveals,
  title:()=>find('tour-title')[0]?.props.children,
  next:async()=>{await act(async()=>tree.root.findAll(n=>n.props.testID==='tour-next')[0].props.onPress());await advance(1200);},
  tapPaused:async()=>act(async()=>tree.root.findAll(n=>n.props.testID==='tour-paused-controls')[0].props.onPress()),
  back:async()=>act(async()=>backHandler?.()),hasBack:()=>!!backHandler,
  openTab:async route=>{await act(async()=>router.navigate(route));await advance(1200);},
  cleanup:async()=>{await act(async()=>tree.unmount());Object.assign(global,saved);}};
}

test('the guide is one short walk on Today: no tab bar to tap, it starts with a welcome and ends on your initials',()=>{
 const {TOUR_STEPS}=load('src/components/FeatureTour.tsx',{'react-native':{StyleSheet:{create:s=>s}},'expo-router':{},'expo-haptics':{},'@expo/vector-icons':{},'react-native-safe-area-context':{},'react-native-svg':{},'@react-native-async-storage/async-storage':{},'/UserContext':{},'/TimerContext':{},'/useReducedMotion':{},'/notificationOnboardingStore':{},'/NotificationOnboardingPrompt':{},'/AppText':{},'/MotionPressable':{}});
 assert.equal(TOUR_STEPS[0].id,'welcome');assert.equal(TOUR_STEPS.at(-1).id,'home-identity');
 assert.deepEqual(TOUR_STEPS.map(step=>step.route),TOUR_STEPS.map(()=>'/'),'every tip is on Today, which opens everything else');
 assert.equal(TOUR_STEPS.filter(step=>step.kind==='tap').length,0,'Round 84: no tab steps, because there is no tab bar');
 assert.ok(TOUR_STEPS.some(step=>step.target==='home-places'),'one tip shows where Routines, Study, Squads and Your rhythm open');
});

test('a new account sees a welcome, with the app paused, no Skip and nothing to go back to; other taps and hardware Back only point at the glow',async()=>{
 const ui=await guide();
 try{
  assert.equal(ui.find('tour-overlay').length,1,'the app is paused while the guide gets ready');
  await ui.advance(700);
  assert.equal(ui.title(),'Welcome to LifeRPG');
  assert.equal(ui.find('tour-banner').length,0,'no banner over the page: the count lives in the tip');
  assert.match(ui.text(),/1 of 5/);
  assert.equal(ui.tree.root.findByProps({testID:'tour-app-content'}).props.importantForAccessibility,'no-hide-descendants');
  assert.equal(ui.tree.root.findAll(n=>/Skip|Back/.test(n.props.accessibilityLabel??'')).length,0,'not skippable, and the first tip has no Back');
  await ui.tapPaused();
  assert.match(ui.text(),/Tap Let’s go to keep going/);assert.equal(ui.title(),'Welcome to LifeRPG','tapping elsewhere never moves on');
  assert.ok(ui.hasBack());await ui.back();assert.equal(ui.title(),'Welcome to LifeRPG','hardware Back stays in the guide');
  // Copy stays warm and plain: no em dashes and no "glowing" instructions.
  for(const step of ui.api.TOUR_STEPS)assert.doesNotMatch(`${step.title} ${step.body}`,/—|glowing/,step.id);
 }finally{await ui.cleanup();}
});

test('a reminder only grows the card: the page underneath is not measured or scrolled again',async()=>{
 const ui=await guide();
 try{
  await ui.advance(700);await ui.next();
  assert.equal(ui.title(),'What’s next');
  const before={measures:ui.measures.length,reveals:ui.reveals.length};
  const lines=()=>ui.find('tour-tip')[0].findAllByType('Text').length;
  const before_lines=lines();
  await ui.tapPaused();
  assert.match(ui.text(),/Tap Next to keep going/);
  assert.equal(lines(),before_lines,'the reminder replaces the count, so the card keeps its size');
  assert.equal(ui.find('tour-count').length,0);
  await act(async()=>ui.find('tour-tip')[0].props.onLayout({nativeEvent:{layout:{height:300}}}));
  await ui.advance(1500);
  assert.deepEqual({measures:ui.measures.length,reveals:ui.reveals.length},before,'no re-measure, no scroll');
 }finally{await ui.cleanup();}
});

test('Back returns to the previous tip; hardware Back does the same',async()=>{
 const ui=await guide();
 try{
  await ui.advance(700);await ui.next();
  assert.equal(ui.title(),'What’s next');
  await act(async()=>ui.tree.root.findAll(n=>n.props.testID==='tour-back')[0].props.onPress());await ui.advance(1200);
  assert.equal(ui.title(),'Welcome to LifeRPG');
  await ui.next();await ui.next();await ui.next();
  assert.equal(ui.title(),'Your circle');
  await ui.back();await ui.advance(1200);
  assert.equal(ui.title(),'Time for yourself today','hardware Back goes to the previous tip');
  assert.ok(ui.routes.every(route=>route==='/'),'the whole guide stays on Today');
 }finally{await ui.cleanup();}
});

test('walking the whole guide finishes once on Today, readies the notification invitation and never returns',async()=>{
 const ui=await guide();
 try{
  await ui.advance(700);
  for(let i=0;i<40&&ui.title();i++){
   const tap=ui.tree.root.findAll(n=>n.props.testID==='tour-next').length===0;
   if(tap){const step=ui.api.TOUR_STEPS.find(s=>s.title===ui.title());await ui.openTab(step.expect);}else await ui.next();
  }
  assert.equal(ui.find('tour-overlay').length,0,'the guide has closed');
  assert.equal(ui.store.get('liferpg:tour:v1:alice'),'done');assert.deepEqual(ui.invitations,['alice']);
  assert.ok(ui.routes.every(route=>route==='/'),'nothing to open: every tip is on Today');
 }finally{await ui.cleanup();}
 const again=await guide({receipt:'done'});
 try{await again.advance(2000);assert.equal(again.find('tour-overlay').length,0,'a finished guide never runs again');}finally{await again.cleanup();}
});

test('an account without a pending guide never sees it',async()=>{
 const ui=await guide({receipt:null});
 try{await ui.advance(2000);assert.equal(ui.find('tour-overlay').length,0);}finally{await ui.cleanup();}
});

test('new-account setup prepares the guide and the notification invitation together',async()=>{
 const store=new Map(),prepared=[];
 const api=load('src/components/FeatureTour.tsx',{'react-native':{StyleSheet:{create:s=>s}},'expo-router':{},'expo-haptics':{},'@expo/vector-icons':{},'react-native-safe-area-context':{},'react-native-svg':{},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{setItem:async(key,value)=>{store.set(key,value);}}},'/UserContext':{},'/TimerContext':{},'/useReducedMotion':{},
  '/notificationOnboardingStore':{notificationOnboardingStore:{prepare:async owner=>{prepared.push(owner);}}},'/NotificationOnboardingPrompt':{},'/AppText':{},'/MotionPressable':{}});
 await api.prepareFeatureTour('bob');
 assert.deepEqual(prepared,['bob']);assert.equal(store.get('liferpg:tour:v1:bob'),'pending');
 await api.prepareFeatureTour('');assert.deepEqual(prepared,['bob'],'no owner, nothing prepared');
});

test("the guide describes today's layout and every highlight still exists", () => {
  const fs = require("node:fs"), path = require("node:path");
  const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const tour = read("src/components/FeatureTour.tsx"), page = read("src/app/guide.tsx");
  for (const old of [/big button/i, /Other session/, /every session listed/, /title: "Your routines"/]) {
    assert.doesNotMatch(tour, old); assert.doesNotMatch(page, old);
  }
  const screens = ["src/app/(tabs)/index.tsx", "src/app/(tabs)/routines.tsx", "src/app/(tabs)/study.tsx"].map(read).join("\n");
  // Round 84: the guide stays on Today. Round 85: Up next comes first, as on the page (mockup 01).
  assert.match(tour, /target: "home-places", title: "Your circle"/);
  assert.ok(tour.indexOf('target: "home-quests"') < tour.indexOf('target: "home-focus"'), 'the tips follow the page from top to bottom');
  assert.doesNotMatch(tour, /target: "tab-/);
  // Tips with no highlight keep the page visible behind them (a faint ink wash on paper).
  assert.match(tour, /overviewDim: \{ backgroundColor: "rgba\(42,32,40,0\.14\)" \}/);
  const targets = [...tour.matchAll(/kind: "info", target: "([\w-]+)"/g)].map(match => match[1]);
  assert.ok(targets.length >= 3);
  for (const target of targets) assert.match(screens, new RegExp(`TourAnchor id="${target}"`), `${target} is still on screen`);
  assert.match(read("src/components/SavedRoutinesCard.tsx"), /layout === "grid" && wrapMine/);
});
