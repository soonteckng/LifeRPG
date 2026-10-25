/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), {act, create} = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = type => props => React.createElement(type, props, props.children);
const deferred = () => { let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve}; };
function load(relative,mocks,cache=new Map()) {
  const filename=path.resolve(__dirname,'..',relative);
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),extension=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+extension),mocks,cache);
  },module,module.exports);return module.exports;
}
const OWNER_A='11111111-1111-4111-8111-111111111111', OWNER_B='22222222-2222-4222-8222-222222222222';
const draft={name:'Review notes',durationSeconds:90,focusAreaId:7,reminder:{enabled:false,hour:18,minute:30}};
const text=node=>typeof node==='string'?node:(node.children??[]).map(text).join('');
async function setup(options={}) {
  let ownerId=OWNER_A, nonce=Object.hasOwn(options,'nonce')?options.nonce:'widget-nonce-a', sequence=0;
  const calls=[], values=new Map(), modules=new Map();
  let timer={hasOpenSession:false,endingSession:false,awaitingStart:false,isCompleted:false,isRestoring:false,actionBusy:false,
    startFreeTimer:async(...args)=>{calls.push(['start',...args]);return options.start?options.start(...args):options.started??true;},...options.timer};
  const router={dismissTo:route=>calls.push(['route',route]),replace:route=>calls.push(['replace',route])};
  let routine;
  const mocks={
    'react-native':{View:host('View'),ActivityIndicator:host('Spinner')},
    'react-native-safe-area-context':{SafeAreaView:host('SafeArea')},
    'expo-router':{useLocalSearchParams:()=>({widgetNonce:nonce}),useRouter:()=>router},
    '../components/AppText':{Text:host('Text')},'../components/ContentReveal':host('Reveal'),
    '../components/PersonalUI':{p:{},PersonalButton:props=>React.createElement('Button',{onPress:props.onPress},props.title)},
    '../context/TimerContext':{useTimer:()=>timer},
    '../context/AuthContext':{useAuth:()=>({user:options.mode==='local-only'?null:{id:ownerId},localOwner:{id:ownerId,backendId:'widget-fixture'},accessMode:options.mode??'online'})},
    '@react-native-async-storage/async-storage':{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)},
    'expo-modules-core':{uuid:{v4:()=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(++sequence).padStart(12,'0')}`}},
    '../../lib/supabase':{supabase:{rpc:()=>{throw Error('No live backend requests in route tests');}}},
    '../services/routineWidgetService':{consumeSavedRoutineWidgetLaunch:async(scope,value)=>{
      calls.push(['proof',scope.ownerId,value]);return options.proof?await options.proof(scope,value):{routineId:routine.id};
    }},
  };
  // Use the real durable store, resolver and useSyncExternalStore hook. Native
  // proof delivery and the existing session callback are the only action mocks.
  const service=load('src/services/savedRoutineService.ts',mocks,modules),scope={ownerId,backendId:'widget-fixture'};
  assert.equal(await service.savedRoutineStore.save(scope,draft),true);
  routine=service.savedRoutineStore.snapshot(scope).routines[0];
  const Component=load('src/app/routine-start.tsx',mocks,modules).default;
  let renderer;const render=()=>React.createElement(Component);
  await act(async()=>{renderer=create(render());});
  return{calls,routine,root:()=>renderer.root,
    edit:async changes=>act(async()=>{assert.equal(await service.savedRoutineStore.save(scope,{...draft,...changes},routine.id),true);}),
    remove:async()=>act(async()=>{assert.equal(await service.savedRoutineStore.remove(scope,routine.id),true);}),
    update:async changes=>act(async()=>{if(changes.ownerId)ownerId=changes.ownerId;if(changes.nonce)nonce=changes.nonce;
      if(changes.timer)timer={...timer,...changes.timer};renderer.update(render());}),
    cleanup:()=>act(async()=>renderer.unmount())};
}

test('a cold widget proof resolves the latest durable routine and starts with its name, exact duration and area once',async()=>{
  const proof=deferred();const ui=await setup({proof:()=>proof.promise});
  try{
    assert.equal(ui.root().findAllByType('Spinner').length,1);assert.equal(ui.calls.filter(c=>c[0]==='start').length,0);
    await ui.edit({name:'Latest Learning routine',durationSeconds:125,focusAreaId:9});
    await act(async()=>proof.resolve({routineId:ui.routine.id}));
    assert.deepEqual(ui.calls.filter(c=>c[0]==='start'),[['start',125,9,'Latest Learning routine']]);
    assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']]);
    await ui.update({timer:{actionBusy:true}});await ui.update({timer:{actionBusy:false}});await ui.edit({name:'Next time'});
    assert.equal(ui.calls.filter(c=>c[0]==='proof').length,1);assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);
  }finally{await ui.cleanup();}
});

test('a widget opens the current running, ending, starting or completed session without creating another',async()=>{
  for(const flag of ['hasOpenSession','endingSession','awaitingStart','isCompleted']) {
    const ui=await setup({timer:{[flag]:true}});
    try{assert.equal(ui.calls.filter(c=>c[0]==='start').length,0);assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']]);}
    finally{await ui.cleanup();}
  }
});

test('widget proof delivery waits for timer restoration and action completion',async()=>{
  const ui=await setup({timer:{isRestoring:true,actionBusy:true}});
  try{
    assert.equal(ui.calls.length,0);await ui.update({timer:{isRestoring:false}});assert.equal(ui.calls.length,0);
    await ui.update({timer:{actionBusy:false}});assert.equal(ui.calls.filter(c=>c[0]==='proof').length,1);
    assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);
  }finally{await ui.cleanup();}
});

test('an account change or unmount during proof verification prevents a late widget start',async()=>{
  for(const unmount of [false,true]) {
    const proof=deferred();const ui=await setup({proof:()=>proof.promise});
    try{
      if(unmount)await ui.cleanup();else await ui.update({ownerId:OWNER_B});
      await act(async()=>proof.resolve({routineId:ui.routine.id}));
      assert.equal(ui.calls.filter(c=>c[0]==='start').length,0);assert.equal(ui.calls.filter(c=>c[0]==='route').length,0);
    }finally{if(!unmount)await ui.cleanup();}
  }
});

test('a routine deleted after the widget was drawn produces a calm error without a new session',async()=>{
  const proof=deferred();const ui=await setup({proof:()=>proof.promise});
  try{
    await ui.remove();await act(async()=>proof.resolve({routineId:ui.routine.id}));
    assert.match(text(ui.root()),/no longer available/);assert.equal(ui.calls.filter(c=>c[0]==='start').length,0);
    assert.equal(ui.root().findAllByType('Spinner').length,0);
    await act(async()=>ui.root().findByType('Button').props.onPress());assert.deepEqual(ui.calls.at(-1),['replace','/'],'Open Home takes this page\'s place');
  }finally{await ui.cleanup();}
});

test('an invalid or rejected native launch proof never starts a routine',async()=>{
  for(const proof of [async()=>null,async()=>{throw Error('Synthetic native proof failure');}]) {
    const ui=await setup({proof});
    try{assert.equal(ui.calls.filter(c=>c[0]==='start').length,0);assert.equal(ui.root().findAllByType('Spinner').length,0);
      assert.equal(ui.root().findAllByType('Text').some(node=>node.props.accessibilityRole==='alert'),true);}
    finally{await ui.cleanup();}
  }
});

test('a refused widget start opens the controller-owned timer once and retains a calm fallback message',async()=>{
  const ui=await setup({started:false});
  try{assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']]);
    assert.match(text(ui.root()),/saved session needs attention/);}
  finally{await ui.cleanup();}
});

test('a held widget start opens the timer before the server reply and cannot start or navigate twice',async()=>{
  const reply=deferred();let replied=false;
  const ui=await setup({start:async()=>{const result=await reply.promise;replied=true;return result;}});
  try{
    assert.equal(replied,false,'the server response is still pending');
    assert.deepEqual(ui.calls.filter(c=>c[0]==='start'),[['start',90,7,'Review notes']]);
    assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']],'the timer opens without waiting for that response');
    await ui.update({timer:{actionBusy:true}});await ui.update({timer:{actionBusy:false}});
    assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);
    await act(async()=>reply.resolve(true));assert.equal(replied,true);
    await ui.update({timer:{hasOpenSession:true}});
    assert.equal(ui.calls.filter(c=>c[0]==='proof').length,1);
    assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);
    assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']]);
  }finally{await ui.cleanup();}
});

test('a missing or malformed widget nonce offers Home without verifying or starting anything',async()=>{
  for(const nonce of [undefined,null,17,['widget-a','widget-b']]) {
    const ui=await setup({nonce});
    try{assert.deepEqual(ui.calls,[]);assert.equal(ui.root().findAllByType('Spinner').length,0);
      assert.match(text(ui.root()),/Open a routine from its widget or from Home/);}
    finally{await ui.cleanup();}
  }
});

test('offline widget start uses the same account-scoped cache and the existing safe session callback',async()=>{
  const ui=await setup({mode:'local-only'});
  try{assert.deepEqual(ui.calls.filter(c=>c[0]==='start'),[['start',90,7,'Review notes']]);
    assert.deepEqual(ui.calls.filter(c=>c[0]==='route'),[['route','/session']]);}
  finally{await ui.cleanup();}
});

test('a widget tap with a session already open goes back to that session screen, never a second copy on top', () => {
  const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');
  const router = StackRouter({});
  const options = { routeNames: ['(tabs)', 'session', 'routine-start'], routeParamList: {}, routeGetIdList: { session: () => 'session' } };
  const open = { stale: false, type: 'stack', key: 'root', index: 2, routeNames: options.routeNames, preloadedRoutes: [],
    routes: [{ key: 'tabs-1', name: '(tabs)' }, { key: 'session-1', name: 'session' }, { key: 'start-1', name: 'routine-start', params: { widgetNonce: 'n' } }] };
  const replaced = router.getStateForAction(open, { type: 'REPLACE', payload: { name: 'session' } }, options);
  assert.equal(replaced.routes.filter(r => r.name === 'session').length, 2, 'replace stacks a second session screen (the old bug)');
  const popped = router.getStateForAction(open, { type: 'POP_TO', payload: { name: 'session' } }, options);
  assert.deepEqual(popped.routes.map(r => r.key), ['tabs-1', 'session-1'], 'dismissTo goes back to the one that is open, still running');
  const fresh = { ...open, index: 1, routes: [{ key: 'tabs-1', name: '(tabs)' }, { key: 'start-1', name: 'routine-start' }] };
  const opened = router.getStateForAction(fresh, { type: 'POP_TO', payload: { name: 'session' } }, options);
  assert.deepEqual(opened.routes.map(r => r.name), ['(tabs)', 'session'], 'with none open, it takes this page\'s place');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/app/routine-start.tsx'), 'utf8');
  assert.doesNotMatch(source, /router\.replace\("\/session"\)/);
});
