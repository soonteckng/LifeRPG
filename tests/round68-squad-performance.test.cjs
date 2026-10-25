/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{act,create}=require('react-test-renderer'),ts=require('typescript');
global.IS_REACT_ACT_ENVIRONMENT=true;
const repo=path.resolve(__dirname,'..'),req=require;
function harness(){
const portraits=[];
const counters={pictures:0,art:0,svg:0,loads:0,rewardsSubscriptions:0};
const host=type=>function Host(props){return React.createElement(type,props,props.children);};
const look={skin:'3',hair:'coily',hairColor:'darkbrown',glasses:true},equipped={top:'cardigan',hat:'scholar_cap',pet:'pet_owl'};
let saved={look,equipped,background:'bg_forest',frame:'frame_streak_100'}; const rewardListeners=new Set();
let profile={id:'player-0',level:60,streak_count:30},shownLevel=60;const profileListeners=new Set(),previewListeners=new Set();
const svg={__esModule:true};for(const type of ['default','Circle','Defs','Ellipse','G','LinearGradient','Path','Rect','Stop','Text'])svg[type]=function SvgPart(props){counters.svg++;return React.createElement('Svg'+type,props,props.children);};
const rn={View:host('View'),StyleSheet:{create:v=>v,absoluteFill:{},hairlineWidth:1},Keyboard:{dismiss(){}},Share:{share:async()=>{}}};
const members=Array.from({length:8},(_,i)=>({id:'player-'+i,isYou:i===0,isOwner:i===0,name:'Person '+i,level:60+i,streak:30,weekSeconds:(8-i)*600,focusingNow:false,look:{look,equipped,background:'bg_forest',frame:'frame_streak_100'}}));
let state={squads:[{id:'fixture',name:'Study crew',code:'ABCDEF',ownerIsYou:true,members,goalMinutes:300}],online:true,ready:true,limits:{lead:1,member:3},join:async()=>null,create:async()=>null};
const mocks={
 'react-native':rn,'react-native-svg':svg,'@expo/vector-icons':{Ionicons:host('Icon')},'expo-router':{useRouter:()=>({navigate(){}})},
 '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
 '/MotionPressable':host('Press'),'/SheetTouchable':host('Press'),'/AppText':{Text:host('Text')},'/AppSheet':props=>props.visible?React.createElement('Sheet',props,props.header,props.children):null,
 '/Segmented':host('Segmented'),'/SheetTextInput':host('Input'),'/Adventurer':host('Character'),
 '/useRewards':{useRewards:(options={})=>{counters.rewardsSubscriptions++;React.useEffect(()=>{if(options.load!==false)counters.loads++;},[options.load]);return React.useSyncExternalStore(cb=>{rewardListeners.add(cb);return()=>rewardListeners.delete(cb);},()=>saved,()=>saved);}},
 '/UserContext':{useUser:()=>({profile:React.useSyncExternalStore(cb=>{profileListeners.add(cb);return()=>profileListeners.delete(cb);},()=>profile,()=>profile)})},'/levelPreview':{useShownLevel:()=>({level:React.useSyncExternalStore(cb=>{previewListeners.add(cb);return()=>previewListeners.delete(cb);},()=>shownLevel,()=>shownLevel)})},
 '/useSquads':{useSquads:()=>state},'/useStudyPlan':{useStudyPlan:()=>({})},'/useProgressData':{useProgressData:()=>({})},'/QuestContext':{useQuests:()=>({subjects:[]})},'/TimerContext':{useTimer:()=>({})},
 '/squadSelection':{squadSelection:{get:()=>null,choose(){}}},'/StudyExamSheet':host('ExamSheet'),'/usePlayer':{usePlayerCard:()=>({card:null})},
 '/tapHaptics':{tapHaptic(){}},'/StudyTagChips':host('StudyTagChips'),'/ExamsCard':host('ExamsCard'),'/ExamRow':host('ExamRow'),'/MilestonesRow':host('MilestonesRow'),'/useTabDockInset':{useTabDockInset:()=>100}
};
const cache=new Map();
function load(file){const filename=path.resolve(repo,file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);
const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
new Function('require','module','exports',code)(name=>{let key=Object.keys(mocks).find(k=>k===name||k.startsWith('/')&&name.endsWith(k));if(key)return mocks[key];if(!name.startsWith('.'))return req(name);const target=path.resolve(path.dirname(filename),name);const ext=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(target+ext);},mod,mod.exports);
for(const [suffix,key]of [['ProfilePicture.tsx','pictures'],['AdventurerArt.tsx','art']])if(filename.endsWith(suffix)){const orig=mod.exports.default;const fn=orig.type;mod.exports.default=React.memo(function CountedPortrait(props){counters[key]++;if(key==='pictures')portraits.push(props);return fn(props);},orig.compare);}
return mod.exports;}

 const {HomeSquad}=load('src/components/HomeSections.tsx');
 return {HomeSquad,counters,portraits,profile:next=>{profile={...profile,...next};for(const l of profileListeners)l();},preview:next=>{shownLevel=next;for(const l of previewListeners)l();},state:()=>state,replace:next=>{state=next;}, reward:next=>{saved={...saved,...next};for(const l of rewardListeners)l();}};
}
async function mount(h){let ui;await act(async()=>{ui=create(React.createElement(h.HomeSquad,{tile:true}));});return ui;}
const delta=(before,after)=>Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]));

test('opening the Home squad peek renders only its six new portraits and starts no reward refresh',async()=>{
 const h=harness(),ui=await mount(h),before={...h.counters};
 try{
  assert.equal(h.counters.pictures,4);
  await act(async()=>ui.root.findAllByType('Press').find(p=>p.props.testID==='home-squad').props.onPress());
  const changed=delta(before,h.counters);
  assert.equal(changed.pictures,6,'the unchanged four Home portraits do not redraw while the sheet mounts');
  assert.equal(changed.art,6,'only new sheet portraits rebuild character SVGs');
  assert.equal(changed.loads,0,'portrait mounts subscribe to the already loaded saved look without requesting the rewards wallet');
  assert.ok(ui.root.findAllByType('Sheet').some(x=>x.props.label==='squad peek'));
 }finally{await act(async()=>ui.unmount());}
});

test('squad portrait memoization still updates changed looks, levels, streaks and focusing status',async()=>{
 const h=harness(),ui=await mount(h);
 try{
  const old=h.state(),first=old.squads[0].members[1];
  const next={...first,level:75,streak:120,focusingNow:true,look:{...first.look,background:'bg_night',look:{...first.look.look,hair:'braids'}}};
  h.replace({...old,squads:[{...old.squads[0],members:old.squads[0].members.map(m=>m.id===next.id?next:m)}]});
  const before={...h.counters};await act(async()=>ui.update(React.createElement(h.HomeSquad,{tile:true})));
  const changedPortrait=h.portraits.find(p=>p.level===75);
  assert.equal(changedPortrait?.streak,120);assert.equal(changedPortrait?.background,'bg_night');assert.equal(changedPortrait?.look.hair,'braids');
  assert.equal(delta(before,h.counters).pictures,1,'only the changed visible member redraws');
  assert.ok(ui.root.findAllByType('View').some(p=>[].concat(p.props.style||[]).some(s=>s?.top===19)),'the focusing marker appears');
 }finally{await act(async()=>ui.unmount());}
});

test('your squad portrait follows the shared saved look without a wallet request',async()=>{
 const h=harness(),ui=await mount(h),before={...h.counters};
 try{
  await act(async()=>h.reward({look:{skin:'5',hair:'braids',hairColor:'black',glasses:false},background:'bg_night'}));
  assert.equal(delta(before,h.counters).pictures,1,'your own store subscription still refreshes its picture through the memo boundary');
  assert.equal(delta(before,h.counters).loads,0);
  await act(async()=>h.profile({streak_count:120}));assert.equal(h.portraits.at(-1).streak,120);
  await act(async()=>h.preview(100));assert.equal(h.portraits.at(-1).level,100,'the existing level-preview subscription still updates your portrait');
  assert.equal(h.portraits.at(-1).size,30);assert.notEqual(h.portraits.at(-1).showLevel,false);
 }finally{await act(async()=>ui.unmount());}
});
