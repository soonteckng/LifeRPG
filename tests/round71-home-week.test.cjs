/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), babel = require('@babel/core');
const React = require('react'), {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = name => function Host(props) { return React.createElement(name, props, props.children); };

async function setup({compiled = false, ready = true} = {}) {
  const RealDate = Date, intervals = new Set(), app = new Set(), calls = [];
  let clock = RealDate.parse('2026-10-25T23:55:00Z'), cloud = 0, focus, current, tree;
  let data = ready ? {sessions:[], goals:[], areas:[]} : null;
  class ClockDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  global.Date = ClockDate;
  const native = {View:host('View'), StyleSheet:{create:x=>x, hairlineWidth:1}, AppState:{addEventListener:(_name, callback)=>{app.add(callback);return {remove:()=>app.delete(callback)};}}};
  const mocks = {
    'react-native':native, 'expo-router':{useRouter:()=>({navigate(){}}), useFocusEffect:callback=>React.useEffect(()=>{focus=callback; return callback();},[callback])},
    '@expo/vector-icons':{Ionicons:host('Icon')}, '@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll')},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:16})},
    '../context/UserContext':{useUser:()=>({profile:{id:'owner-a',timezone:'UTC'}})},
    '../context/TimerContext':{useTimer:()=>({sessionSummary:null,cloudSaveVersion:cloud})},
    '../hooks/useProgressData':{useProgressData:(...args)=>{calls.push(args);return {data};}},
    '../utils/studyPlan':{studyTime:seconds=>`${Math.floor(seconds/60)}m`},
    './AppText':{Text:host('Text')}, './MotionPressable':{__esModule:true,default:host('Press')},
    './SectionHeader':{__esModule:true,default:host('Section'),DoneButton:host('Done'),SeeAll:host('SeeAll')},
    './AppSheet':{__esModule:true,default:props=>React.createElement('Sheet',props,props.header,props.children)},
    './SheetHeader':{__esModule:true,default:host('Header')},
  };
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root,file);
    if(cache.has(filename))return cache.get(filename).exports;
    const mod={exports:{}};cache.set(filename,mod);
    let source=fs.readFileSync(filename,'utf8');
    if(compiled && filename.endsWith('HomeSections.tsx')) source=babel.transformSync(source,{filename,configFile:false,babelrc:false,parserOpts:{plugins:['typescript','jsx']},plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','module','exports','setInterval','clearInterval',js)(name=>{
      if(Object.hasOwn(mocks,name))return mocks[name];
      if(!name.startsWith('.'))return require(name);
      const target=path.resolve(path.dirname(filename),name);
      if(name.includes('/utils/') || name.includes('/constants/') || filename.includes(`${path.sep}utils${path.sep}`)) {
        const suffix=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(root,target+suffix));
      }
      return {__esModule:true,default:host(name)};
    },mod,mod.exports,callback=>{intervals.add(callback);return callback;},callback=>intervals.delete(callback));
    return mod.exports;
  }
  const sections=load('src/components/HomeSections.tsx');
  function Capture(){current=sections.useWeekProgress();return null;}
  const render=async(Component=Capture)=>act(async()=>{if(tree)tree.update(React.createElement(Component));else tree=create(React.createElement(Component));});
  return {calls,get value(){return current;},get tree(){return tree;},
    mount:()=>render(),mountTile:()=>render(()=>React.createElement(sections.HomeWeek,{tile:true})),
    async complete(){clock+=300_000;data={sessions:[{id:'saved',status:'completed',duration_seconds:60,completed_at:new ClockDate(clock-1000).toISOString(),subject_id:null,activity_type:'general',xp_earned:1}],goals:[],areas:[]};await render();},
    async sync(){cloud++;await render();},
    async advance(iso,event){clock=RealDate.parse(iso);await act(async()=>{if(event==='focus')focus();else if(event==='resume')for(const callback of app)callback('active');else for(const callback of intervals)callback();});},
    cleanup:async()=>{try{if(tree)await act(async()=>tree.unmount());}finally{global.Date=RealDate;}}
  };
}

for(const compiled of [false,true]) test(`Home week includes sessions completed after Home mounted (${compiled?'compiled':'control'})`,async()=>{
  const ui=await setup({compiled});try{await ui.mount();assert.equal(ui.value.week.seconds,0);await ui.complete();assert.equal(ui.value.week.seconds,60,'a current saved row cannot be rejected as future against the mount time');}finally{await ui.cleanup();}
});

test('Home forwards the existing offline-save signal and rolls the displayed week on focus, resume and its local clock',async()=>{
  for(const event of ['focus','resume','clock']) {
    const ui=await setup();try{await ui.mount();await ui.sync();assert.equal(ui.calls.at(-1)[4],1,'Home week uses the same cloud refresh signal as Progress');
      await ui.advance('2026-10-26T00:01:00Z',event);assert.equal(ui.value.period.today,'2026-10-26');assert.equal(ui.value.period.start,'2026-10-26');
    }finally{await ui.cleanup();}
  }
});

test('a Home week still loading does not claim zero time or zero active days',async()=>{
  const ui=await setup({ready:false});try{await ui.mountTile();const words=ui.tree.root.findAllByType('Text').flatMap(node=>node.children).filter(value=>typeof value==='string').join(' ');
    assert.match(words,/Checking/);assert.doesNotMatch(words,/0m|Focus on 0|Start your week/);
  }finally{await ui.cleanup();}
});
