/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,mocks,cache=new Map()){
  const filename=path.resolve(__dirname,'..',file);
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',source)(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('.'))return require(name);
    const target=path.resolve(path.dirname(filename),name),suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
    return load(path.relative(path.resolve(__dirname,'..'),target+suffix),mocks,cache);
  },module,module.exports);return module.exports;
}
const host=type=>props=>React.createElement(type,props,props.children);
const summary={sessionId:'confirmed',durationSeconds:90,xpEarned:1,goldEarned:0,recovered:true,questTitle:'Review your notes',creditVersion:1,areaXpEarned:1,completedAtMs:Date.UTC(2026,9,14,4)};
async function setup(overrides={},mode='online',pathname='/'){
  let timer={duration:90,timeLeft:0,isCompleted:false,hasOpenSession:false,endingSession:false,sessionEnded:false,
    actionBusy:false,isRestoring:false,actionError:null,syncStatus:'idle',summaryViewed:false,rewardsVisible:false,clientReported:false,
    sessionId:'local',sessionSummary:null,linkedTaskId:null,targetAttributeId:1,notes:'',recoveredSession:false,...overrides};
  let ownerId='owner-a';const calls=[];
  const api={
    acknowledgeSummary(){calls.push('viewed');timer={...timer,summaryViewed:true};},
    clearCompletionModal(){calls.push('clear');timer={...timer,hasOpenSession:false,isCompleted:false,endingSession:false,sessionEnded:false,sessionSummary:null,sessionId:null,duration:1800};},
    retryCompletion:async()=>calls.push('retry-completion'),retryAction:async()=>calls.push('retry-end'),
  };
  const Presenter=load('src/components/GlobalRewardListener.tsx',{
    'expo-router':{usePathname:()=>pathname},
    './SessionResultSheet':host('Result'), './SaveSuggestedQuest':host('SaveQuest'), './PostSessionCelebration':host('Celebration'),
    '../context/AuthContext':{useAuth:()=>({accessMode:mode,user:mode==='online'?{id:ownerId}:null,localOwner:{id:ownerId},retrySessionVerification:async()=>calls.push('verify')})},
    '../context/TimerContext':{useTimer:()=>({...timer,...api})},
    '../context/UserContext':{useUser:()=>({profile:{id:ownerId,level:1,current_xp:1},reloadProfile:async()=>calls.push('profile')})},
    '../context/QuestContext':{useQuests:()=>({tasks:[{id:7,title:'An existing quest'}],subjects:[{id:1,title:'Learning',color_code:'#60A5FA'}]})},
  }).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Presenter));});
  return{calls,root:()=>renderer.root,result:()=>renderer.root.findByType('Result'),
    update:async(changes={},nextMode=mode,nextPath=pathname,nextOwner=ownerId)=>{timer={...timer,...changes};mode=nextMode;pathname=nextPath;ownerId=nextOwner;await act(async()=>renderer.update(React.createElement(Presenter)));},
    done:async()=>act(async()=>{renderer.root.findByType('Result').props.onClose();renderer.update(React.createElement(Presenter));}),
    dismiss:async()=>act(async()=>renderer.root.findByType('Result').props.onDismiss()),
    cleanup:async()=>act(async()=>renderer.unmount())};
}

test('the same recovered result portal survives session, offline and Home transitions even when rewardsVisible is false',async()=>{
  const ui=await setup({isCompleted:true,sessionSummary:summary},'online','/session');
  try{
    const result=ui.result();assert.equal(result.props.visible,true);assert.equal(result.props.durationSeconds,90);
    await ui.update({},'local-only','/session');assert.equal(ui.result(),result);assert.equal(result.props.visible,true);
    assert.equal(result.props.offline,true);assert.equal(result.props.recovered,true);
    await ui.update({isRestoring:true,isCompleted:false,sessionSummary:null});
    assert.equal(result.props.visible,true);assert.equal(result.props.sessionId,'confirmed','same-owner restore keeps the existing result visible');
    await ui.update({isRestoring:false,isCompleted:true,sessionSummary:summary});
    await ui.update({},'online','/');assert.equal(ui.result(),result);assert.equal(result.props.visible,true);
    assert.equal(ui.root().findAllByType('Result').length,1);assert.equal(result.props.areaXpEarned,1);
    assert.equal(result.props.saveAction,undefined);
  }finally{await ui.cleanup();}
});

test('Done freezes the completed identity and Save draft until the timed dismissal, then does not replay',async()=>{
  const suggestion={id:'review-topic',title:'Review your notes',instruction:'Open your notes.',seconds:90};
  const ui=await setup({isCompleted:true,sessionSummary:{...summary,suggestion}});
  try{
    const result=ui.result();const save=result.props.saveAction;
    assert.equal(save.props.completion.durationSeconds,90);assert.equal(save.props.completion.sessionId,'confirmed');
    await ui.done();assert.equal(result.props.visible,false);assert.equal(result.props.durationSeconds,90);
    assert.equal(result.props.sessionId,'confirmed');assert.equal(result.props.saveAction.props.completion.durationSeconds,90);
    assert.equal(result.props.saveAction.props.disabled,true);
    assert.equal(ui.calls.filter(c=>c==='clear').length,1);
    await ui.dismiss();assert.equal(result.props.visible,false);
    await ui.update();assert.equal(result.props.visible,false);assert.equal(ui.calls.filter(c=>c==='clear').length,1);
  }finally{await ui.cleanup();}
});

test('pending Done is available offline and confirmation resurfaces once after dismissal without interrupting newer work',async()=>{
  const ui=await setup({isCompleted:true,clientReported:true,actionBusy:true,syncStatus:'waiting'},'local-only');
  try{
    const result=ui.result();assert.equal(result.props.visible,true);assert.equal(result.props.pending,true);assert.equal(result.props.localSaved,true);
    await ui.done();assert.equal(result.props.visible,false);assert.equal(result.props.durationSeconds,90);
    await ui.update({sessionSummary:summary,isCompleted:true,summaryViewed:false,actionBusy:false,syncStatus:'saved'},'online');
    assert.equal(result.props.visible,false,'receipt waits for the outgoing sheet to physically close');
    await ui.dismiss();assert.equal(result.props.visible,true);assert.equal(result.props.pending,false);
    await ui.update({hasOpenSession:true});assert.equal(result.props.visible,false,'older results cannot cover a newer running session');
    await ui.update({hasOpenSession:false});assert.equal(result.props.visible,true);
    await ui.done();await ui.dismiss();assert.equal(result.props.visible,false);
  }finally{await ui.cleanup();}
});

test('online saving uses a short grace but maintains one pending sheet while the confirmed receipt arrives',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ui=await setup({isCompleted:true,syncStatus:'waiting'});
  try{
    const result=ui.result();assert.equal(result.props.visible,false);
    await act(async()=>t.mock.timers.tick(800));assert.equal(result.props.visible,true);assert.equal(result.props.pending,true);
    await ui.update({sessionSummary:summary,syncStatus:'saved'});assert.equal(ui.result(),result);assert.equal(result.props.visible,true);assert.equal(result.props.pending,false);
  }finally{await ui.cleanup();}
});

test('fast receipts skip the brief saving card, and retry controls retain their identity while retrying',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ui=await setup({isCompleted:true,syncStatus:'waiting'});
  try{
    const result=ui.result();await act(async()=>t.mock.timers.tick(400));
    await ui.update({sessionSummary:summary,syncStatus:'saved'});assert.equal(result.props.visible,true);assert.equal(result.props.pending,false);
    await act(async()=>t.mock.timers.tick(1000));assert.equal(result.props.pending,false);
  }finally{await ui.cleanup();}
});

test('early End and rejected records use the one shared portal without a completion reward or quest action',async()=>{
  for(const overrides of [{sessionEnded:true,endingSession:true,syncStatus:'waiting',actionBusy:true},{isCompleted:true,syncStatus:'rejected'}]){
    const ui=await setup(overrides,'local-only','/session');
    try{
      const result=ui.result();assert.equal(result.props.visible,true);assert.equal(result.props.saveAction,undefined);assert.equal(result.props.xpEarned,undefined);
      assert.equal(result.props.ending,!!overrides.sessionEnded);assert.equal(result.props.rejected,overrides.syncStatus==='rejected');
      await ui.done();assert.equal(ui.calls.filter(c=>c==='clear').length,1);
      assert.equal(ui.calls.filter(c=>c==='retry-completion'||c==='retry-end').length,0);
    }finally{await ui.cleanup();}
  }
});

test('End keeps its Done action after the cancellation reply clears the controller selection, then never reopens',async()=>{
  const ui=await setup({sessionEnded:true,endingSession:true,syncStatus:'waiting',actionBusy:true});
  try {
    const result=ui.result();assert.equal(result.props.visible,true);assert.equal(result.props.ending,true);
    await ui.update({sessionEnded:false,endingSession:false,sessionId:null,notes:'',duration:1800,
      syncStatus:'idle',actionBusy:false});
    assert.equal(ui.result(),result);assert.equal(result.props.visible,true,'receipt cannot dismiss an unacknowledged notice');
    assert.equal(result.props.ending,true);assert.equal(result.props.pending,false);assert.equal(result.props.syncBusy,false);
    assert.equal(result.props.sessionId,'local');assert.equal(result.props.durationSeconds,90);
    await ui.done();assert.equal(result.props.visible,false);assert.equal(ui.calls.filter(c=>c==='clear').length,1);
    await ui.dismiss();await ui.update();assert.equal(result.props.visible,false);
  }finally{await ui.cleanup();}
});

test('a settled End notice cannot cover a new open session or another owner',async()=>{
  for(const changes of [{hasOpenSession:true,sessionId:'new-running'},{sessionId:null}]) {
    const ui=await setup({sessionEnded:true});
    try {
      await ui.update({sessionEnded:false,...changes},'online','/',changes.hasOpenSession?'owner-a':'owner-b');
      assert.equal(ui.result().props.visible,false);
    }finally{await ui.cleanup();}
  }
});

test('a late Done from a previous account cannot dismiss the current account result',async()=>{
  const ui=await setup({isCompleted:true,sessionSummary:summary});
  try{
    const oldDone=ui.result().props.onClose;
    await ui.update({sessionSummary:{...summary,sessionId:'owner-b-session'}},'online','/','owner-b');
    await act(async()=>oldDone());assert.equal(ui.calls.filter(c=>c==='clear').length,0);
    assert.equal(ui.result().props.visible,true);assert.equal(ui.result().props.sessionId,'owner-b-session');
  }finally{await ui.cleanup();}
});

test('repeated Done requests in one event only clear the journal presentation once',async()=>{
  const ui=await setup({isCompleted:true,sessionSummary:summary});
  try {
    const done=ui.result().props.onClose;
    await act(async()=>{done();done();});
    assert.equal(ui.calls.filter(c=>c==='clear').length,1);
  }finally{await ui.cleanup();}
});
