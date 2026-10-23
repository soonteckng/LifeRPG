const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>props=>React.createElement(type,props,props.children);
const press=(root,label)=>root.findAllByType('Press').find(x=>x.props.accessibilityLabel===label).props.onPress();
const confirmSheet=root=>root.findAllByType('Sheet').find(x=>x.props.label==='start routine');
const manageSheet=root=>root.findAllByType('Sheet').find(x=>x.props.label==='routines');
// Play opens the session setup filled in with the routine; Start is pressed there.
const prepTimer=(calls,extra={})=>({setLinkedTaskId:v=>calls.push(['task',v]),setTargetAttributeId:v=>calls.push(['area',v]),setNotes:v=>calls.push(['notes',v]),setDurationInSeconds:v=>calls.push(['seconds',v]),reviewSummary:()=>{},...extra});
const encoded=name=>'liferpg:routine:v1:'+JSON.stringify({name});
function load(file,mocks,cache=new Map()) {const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',source)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+suffix),mocks,cache);},mod,mod.exports);return mod.exports;}
const scope={backendId:'fixture',ownerId:'11111111-1111-4111-8111-111111111111'},routine={id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',revision:1,name:'Review notes',durationSeconds:75,focusAreaId:2,reminder:{enabled:false,hour:18,minute:0},deletedAt:null};
const subjects=[{id:1,title:'General',color_code:null},{id:2,title:'Learning',color_code:null}];
const rn={View:host('View'),ScrollView:host('HScroll'),StyleSheet:{create:value=>value,hairlineWidth:1},Platform:{OS:'android'},Keyboard:{dismiss:()=>{}},Switch:host('Switch'),AppState:{addEventListener:()=>({remove(){}})}};
function base(){return{'react-native':rn,'@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Press')},'react-native-gesture-handler/ReanimatedSwipeable':{__esModule:true,default:props=>props.children},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},'./AppText':{Text:host('Text')},'./EditMode':{Wiggle:props=>React.createElement('View',{style:props.style,testID:props.active?'wiggling':undefined},props.children),EditBadges:props=>React.createElement('View',{testID:'edit-badges'},props.onEdit&&React.createElement('Press',{accessibilityLabel:`Edit ${props.name}`,onPress:props.onEdit}),props.onRemove&&React.createElement('Press',{accessibilityLabel:`Remove ${props.name}`,onPress:props.onRemove}))},'./AppSheet':props=>React.createElement('Sheet',props,props.header,props.children,props.footer,props.overlay),'./MotionPressable':host('Press'),'./FocusLengthControl':host('Duration'),'./SheetConfirmation':host('Confirm'),'./QuestSheet':host('LegacyEditor'),'../services/notificationPermissionService':{readNotificationPermission:async()=>({label:'Not allowed',action:'enable',supported:true,granted:false}),enableNotifications:async()=>({label:'Allowed',action:'settings',supported:true,granted:true}),openNotificationSettings:async()=>{}}};}
test('play opens setup with the routine’s exact name, area and seconds; offline asks first, then starts in its workspace',async()=>{
 for(const online of [true,false]){const calls=[],state={ready:true,scope,online,routines:[routine],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>calls.push('haptic')},'expo-router':{useRouter:()=>({push:path=>calls.push(['route',path])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:true})},'../context/TimerContext':{useTimer:()=>prepTimer(calls,{startFreeTimer:async(...args)=>{calls.push(['start',...args]);return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});try{await act(async()=>press(ui.root,'Start routine Review notes'));const steps=calls.filter(Array.isArray);
  if(online)assert.deepEqual(steps,[['task',null],['area',2],['notes',encoded('Review notes')],['seconds',75],['route','/session']],'nothing starts until Start on the setup screen');
  else {
   assert.deepEqual(steps,[],'offline (or still connecting) never starts on the first tap');
   assert.equal(confirmSheet(ui.root).props.visible,true,'it asks first');
   await act(async()=>press(ui.root,'Start Review notes now'));
   assert.deepEqual(calls.filter(Array.isArray),[['start',75,2,'Review notes']],'Start session then starts it here');
   assert.equal(confirmSheet(ui.root).props.visible,false,'and the question closes');
  }
  assert.ok(calls.includes('haptic'));}finally{await act(async()=>ui.unmount());}}
});
test('routine card closes retained editor and management portals when its surface becomes inactive',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:()=>{}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,active:true}));});try{assert.equal(ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Manage your routines'),false,'nothing to manage yet');await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='New routine').props.onPress());assert.equal(ui.root.findByType('Editor').props.visible,true);await act(async()=>ui.update(React.createElement(Component,{subjects,active:false})));assert.equal(ui.root.findByType('Editor').props.visible,false);assert.equal(manageSheet(ui.root).props.visible,false);await act(async()=>ui.update(React.createElement(Component,{subjects,active:true})));assert.equal(ui.root.findByType('Editor').props.visible,false);}finally{await act(async()=>ui.unmount());}
});
test('a late cache read after account switch cannot prepare a routine or navigate',async()=>{
 let release;const hold=new Promise(resolve=>{release=resolve;}),calls=[];let state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:()=>calls.push('route')})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>prepTimer(calls)},'../services/savedRoutineService':{resolveSavedRoutine:()=>hold},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});try{await act(async()=>{press(ui.root,'Start routine Review notes');});state={...state,scope:{...scope,ownerId:'22222222-2222-4222-8222-222222222222'}};await act(async()=>ui.update(React.createElement(Component,{subjects})));await act(async()=>{release(routine);await hold;});assert.deepEqual(calls,[]);}finally{await act(async()=>ui.unmount());}
});
test('routine editor preloads exact settings and saves an editable name without creating a quest',async()=>{
 const saved=[],mocks={...base(),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async(...args)=>{saved.push(args);return true;},remove:async()=>true})}};const Component=load('src/components/RoutineEditorSheet.tsx',mocks).default;let ui,closed=0;await act(async()=>{ui=create(React.createElement(Component,{subjects,routine,visible:true,onClose:()=>closed++}));});try{assert.equal(ui.root.findByType('Duration').props.seconds,75);const input=ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Routine name');assert.equal(input.props.value,'Review notes');await act(async()=>input.props.onChangeText('  New name  '));await act(async()=>ui.root.findAllByType('Press').find(x=>typeof x.props.onPress==='function'&&x.props.children?.props?.children==='Save routine').props.onPress());assert.equal(saved[0][0].name,'New name');assert.equal(saved[0][0].durationSeconds,75);assert.equal(saved[0][1],routine.id);assert.equal(closed,1);}finally{await act(async()=>ui.unmount());}
});
test('routine editor keeps invalid reminder errors visible and removal requires confirmation',async()=>{
 const saved=[],removed=[];const Component=load('src/components/RoutineEditorSheet.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async d=>{saved.push(d);return true;},remove:async id=>{removed.push(id);return true;}})}}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,routine:{...routine,reminder:{enabled:true,hour:18,minute:0}},visible:true,onClose:()=>{}}));});try{await act(async()=>ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Reminder hour').props.onChangeText('24'));await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.children?.props?.children==='Save routine').props.onPress());assert.equal(saved.length,0);assert.ok(ui.root.findAllByType('Text').some(x=>x.props.accessibilityRole==='alert'));await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='Remove routine').props.onPress());assert.equal(removed.length,0);assert.equal(ui.root.findByType('Confirm').props.title,'Remove this routine?');await act(async()=>ui.root.findByType('Confirm').props.onConfirm());assert.deepEqual(removed,[routine.id]);}finally{await act(async()=>ui.unmount());}
});
async function heldStartCard(extra={}) {
 const calls=[];let release;const read=new Promise(resolve=>{release=resolve;});let state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>prepTimer(calls)},'../services/savedRoutineService':{resolveSavedRoutine:()=>read},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,...extra}));});
 return { ui,calls,release:async()=>act(async()=>{release(routine);await read;}), updateScope:async next=>{state={...state,scope:next};await act(async()=>ui.update(React.createElement(Component,{subjects})));},cleanup:async()=>act(async()=>ui.unmount()) };
}
test('rapid taps on play prepare one setup and open it once',async()=>{
 const h=await heldStartCard();try{const button=h.ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='Start routine Review notes');await act(async()=>{button.props.onPress();button.props.onPress();});assert.deepEqual(h.calls,[],'nothing changes before the routine is read');await h.release();
  assert.equal(h.calls.filter(x=>x[0]==='notes').length,1);assert.deepEqual(h.calls.filter(x=>x[0]==='route'),[['route','/session']]);}finally{await h.cleanup();}
});
test('Home See all lists every routine in a sheet: tap a row to edit, play to start; Routines has no Edit link',async()=>{
 const plain=await heldStartCard();try{assert.equal(plain.ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Manage your routines'),false,'no Edit link beside +');}finally{await plain.cleanup();}
 const h=await heldStartCard({onSeeAll:()=>h.calls.push('routines tab')});try{await act(async()=>press(h.ui.root,'See all your routines'));const sheet=manageSheet(h.ui.root);assert.equal(sheet.props.visible,true,'See all opens a sheet like Upcoming Exams');
  const labels=sheet.findAllByType('Press').map(x=>x.props.accessibilityLabel);assert.ok(labels.includes('Start routine Review notes'));assert.ok(labels.some(label=>/^Edit Review notes, /.test(label)));assert.ok(labels.includes('Add routine'));assert.deepEqual(h.calls,[]);
  await act(async()=>press(h.ui.root,'Open Routines'));assert.equal(manageSheet(h.ui.root).props.visible,false);await act(async()=>manageSheet(h.ui.root).props.onDismiss());assert.deepEqual(h.calls,['routines tab'],'Open Routines goes to the tab after the sheet closes');}finally{await h.cleanup();}
});
test('a deferred Start from the See all sheet is dropped when the account or backend changes before dismissal',async()=>{
 const h=await heldStartCard({onSeeAll:()=>{}});try{await act(async()=>press(h.ui.root,'See all your routines'));
  const sheet=manageSheet(h.ui.root),start=sheet.findAllByType('Press').find(x=>x.props.accessibilityLabel==='Start routine Review notes');
  await act(async()=>{start.props.onPress();});await h.release();const lateDismiss=manageSheet(h.ui.root).props.onDismiss;assert.equal(h.calls.filter(x=>x[0]==='route').length,0,'it opens only once the sheet has slid away');
  await h.updateScope({...scope,backendId:'different-backend'});await act(async()=>lateDismiss());assert.equal(h.calls.filter(x=>x[0]==='route').length,0);}finally{await h.cleanup();}
});

async function mergedRoutineCard() {
 const calls=[],legacy={id:42,title:'Same name',target_minutes:3,subject_id:2,is_completed_today:false,is_completed:false,is_recurring:true,repeat_rule:'Mon,Wed',is_due_today:true};
 let tasks=[legacy],state={ready:true,scope,online:true,routines:[{...routine,name:'Same name'}],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{id:scope.ownerId}})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:async(...args)=>{calls.push(['free',...args]);return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 const props=()=>({subjects,legacyTasks:tasks,onStartLegacy:item=>calls.push(['linked',item]),onSeeAll:()=>{}});let ui;
 await act(async()=>{ui=create(React.createElement(Component,props()));});
 return {ui,calls,legacy,updateTasks:async next=>{tasks=next;await act(async()=>ui.update(React.createElement(Component,props())));},cleanup:async()=>act(async()=>ui.unmount())};
}
test('merged routines retain linked task starts alongside separately stored saved routines',async()=>{
 const h=await mergedRoutineCard();try {
  const card=h.ui.root.findAllByType('View').find(item=>item.props.testID==='saved-routines-card');
  const buttons=card.findAllByType('Press').filter(item=>item.props.accessibilityLabel==='Start routine Same name');
  assert.equal(buttons.length,2,'same name does not hide an existing record');
  await act(async()=>buttons[0].props.onPress());
  assert.deepEqual(h.calls,[['linked',h.legacy]],'original task identity reaches setup, never a free timer conversion');
 }finally{await h.cleanup();}
});
test('legacy routine editing opens the existing record editor only after manager dismissal',async()=>{
 const h=await mergedRoutineCard();try {
  await act(async()=>h.ui.root.findAllByType('Press').find(item=>item.props.accessibilityLabel==='See all your routines').props.onPress());
  const sheet=manageSheet(h.ui.root);
  await act(async()=>sheet.findAllByType('Press').find(item=>item.props.accessibilityLabel==='Edit Same name, 3 minutes').props.onPress());
  assert.equal(sheet.props.visible,false);
  assert.equal(h.ui.root.findAllByType('LegacyEditor').length,0);
  await act(async()=>sheet.props.onDismiss());
  const editor=h.ui.root.findByType('LegacyEditor');
  assert.equal(editor.props.initialTask,h.legacy);
  assert.equal(editor.props.editorOnly,true);
  assert.equal(editor.props.routineLanguage,true);
  assert.equal(editor.props.expectedOwnerId,scope.ownerId);
 }finally{await h.cleanup();}
});
test('a linked routine finished elsewhere opens nothing, even from the See all sheet',async()=>{
 const h=await mergedRoutineCard();try {
  await act(async()=>press(h.ui.root,'See all your routines'));
  const sheet=manageSheet(h.ui.root),starts=sheet.findAllByType('Press').filter(x=>x.props.accessibilityLabel==='Start routine Same name');
  await act(async()=>starts[0].props.onPress());
  await h.updateTasks([{...h.legacy,is_completed_today:true}]);
  await act(async()=>manageSheet(h.ui.root).props.onDismiss());
  assert.deepEqual(h.calls,[]);
 }finally{await h.cleanup();}
});
test('an upcoming scheduled legacy routine stays editable but cannot start outside its due day',async()=>{
 const h=await mergedRoutineCard();try {
  await h.updateTasks([{...h.legacy,is_due_today:false}]);
  const card=h.ui.root.findAllByType('View').find(item=>item.props.testID==='saved-routines-card');
  const button=card.findAllByType('Press').find(item=>item.props.accessibilityLabel==='Start routine Same name');
  assert.equal(button.props.disabled,true);
  await act(async()=>button.props.onPress());
  assert.deepEqual(h.calls,[]);
 }finally{await h.cleanup();}
});

async function menuCard({ remove = async () => true } = {}) {
 const calls=[],removed=[];const state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[],remove:async id=>{removed.push(id);return remove(id);}};
 // Render the swipe layer's actions beside the row so they can be pressed directly.
 const Swipe=props=>React.createElement('Swipe',null,props.children,props.renderRightActions(null,null,{close:()=>calls.push('close')}));
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'react-native-gesture-handler/ReanimatedSwipeable':{__esModule:true,default:Swipe},'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:async(...args)=>{calls.push(['start',...args]);return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});
 const sheet=()=>ui.root.findAllByType('Sheet').find(x=>['start routine','routine options','remove routine'].includes(x.props.label));
 return {ui,calls,removed,sheet,empty:async()=>{state.routines=[];await act(async()=>ui.update(React.createElement(Component,{subjects})));},cleanup:async()=>act(async()=>ui.unmount())};
}
test('holding a routine wiggles the list into edit mode: ✎ edits, − asks before removing, Done finishes',async()=>{
 const h=await menuCard();try{
  const row=h.ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel?.startsWith('Edit Review notes,'));
  await act(async()=>row.props.onLongPress());
  assert.ok(h.ui.root.findAll(x=>x.props.testID==='wiggling').length>0,'every card wiggles');
  const card=()=>h.ui.root.findAllByType('View').find(x=>x.props.testID==='saved-routines-card');
  assert.equal(card().findAllByType('Press').some(x=>x.props.accessibilityLabel==='Start routine Review notes'),false,'✎ and − take the place of play');
  assert.equal(h.ui.root.findAllByType('Sheet').some(x=>x.props.label==='routine options'),false,'no options card any more');
  await act(async()=>press(h.ui.root,'Remove Review notes'));
  assert.equal(h.sheet().props.label,'remove routine');assert.equal(h.sheet().props.visible,true);assert.deepEqual(h.removed,[],'nothing is removed before confirming');
  await act(async()=>press(h.ui.root,'Keep routine'));assert.deepEqual(h.removed,[]);
  await act(async()=>press(h.ui.root,'Remove Review notes'));await act(async()=>press(h.ui.root,'Remove routine'));
  assert.deepEqual(h.removed,[routine.id]);
  await act(async()=>press(h.ui.root,'Edit Review notes'));
  assert.equal(h.ui.root.findByType('Editor').props.visible,true,'✎ opens the editor and ends edit mode');
  assert.equal(h.ui.root.findAll(x=>x.props.testID==='wiggling').length,0);
  await act(async()=>row.props.onLongPress());await act(async()=>press(h.ui.root,'Done editing routines'));
  assert.equal(h.ui.root.findAll(x=>x.props.testID==='wiggling').length,0,'Done ends edit mode');
 }finally{await h.cleanup();}
});
test('an empty list offers two ready-made routines that open the editor prefilled',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,initialSeconds:1800,initialAreaId:1}));});
 try{
  await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel?.startsWith('Add Review today’s notes, 30 minutes')).props.onPress());
  const editor=ui.root.findByType('Editor').props;
  assert.equal(editor.visible,true);assert.equal(editor.initialName,'Review today’s notes');assert.equal(editor.initialSeconds,1800);assert.equal(editor.initialAreaId,2,'the Learning area');
 }finally{await act(async()=>ui.unmount());}
});
test('a nameless routine says so right above Save',async()=>{
 const saved=[];const Component=load('src/components/RoutineEditorSheet.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async d=>{saved.push(d);return true;}})}}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,routine:null,visible:true,onClose(){}}));});
 try{
  const sheet=()=>ui.root.findByType('Sheet');
  await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.children?.props?.children==='Save routine').props.onPress());
  assert.equal(saved.length,0);
  const alert=ui.root.findAllByType('Text').find(x=>x.props.accessibilityRole==='alert');
  assert.equal(alert.props.children,'Give your routine a name first.');
  assert.equal(ui.root.findByType('Scroll').findAllByType('Text').includes(alert),false,'the message sits with Save, outside the scrolling form');
 }finally{await act(async()=>ui.unmount());}
});
test('suggested routines stay offered after other routines exist; a saved one leaves the list',async()=>{
 const state={ready:true,scope,online:true,routines:[{...routine,name:'Read before bed'}],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});
 try{
  const labels=ui.root.findAllByType('Press').map(x=>x.props.accessibilityLabel);
  assert.ok(labels.some(label=>label?.startsWith('Add Review today’s notes, 30 minutes')));assert.ok(labels.some(label=>label?.startsWith('Add Plan tomorrow, 15 minutes')));
  assert.equal(labels.some(label=>label?.startsWith('Add Read before bed')),false);
  assert.ok(ui.root.findAllByType('Text').some(x=>x.props.children==='Ideas to start with'),'ideas sit under their own title, as chips');
 }finally{await act(async()=>ui.unmount());}
});
test('idea chips narrow to one area in a fixed order, and All shows everything',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});
 try{
  const ideas=()=>ui.root.findAllByType('Press').map(x=>x.props.accessibilityLabel).filter(label=>label?.startsWith('Add '));
  assert.ok(ideas()[0].startsWith('Add Review today’s notes'),'All keeps the usual order');
  const chip=label=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityRole==='tab'&&x.props.accessibilityLabel===label);
  assert.deepEqual(ui.root.findAllByType('Press').filter(x=>x.props.accessibilityRole==='tab').map(x=>x.props.accessibilityLabel),
   ['All ideas','Learning ideas','Work & projects ideas','Creativity ideas','Everyday life ideas','Wellbeing ideas'],'chips keep one fixed order');
  await act(async()=>chip('Work & projects ideas').props.onPress());
  assert.deepEqual(ideas().map(label=>label.split(',')[0]),['Add Side project','Add Deep work block','Add Clear my inbox','Add Prep for a meeting','Add Plan the week','Add Update my CV','Add Learn a work skill','Add Tidy my files']);
  await act(async()=>chip('All ideas').props.onPress());
  assert.equal(ideas().length,40,'eight ideas for each area');
  assert.ok(ui.root.findAll(x=>x.props.testID==='ideas-for-you-change'&&x.props.accessibilityLabel==='Get ideas for you').length>0,'someone who skipped can still choose');
 }finally{await act(async()=>ui.unmount());}
});
test('the areas picked in the intro open the ideas on For you, and can be changed right there',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},
  '../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../hooks/useGuidedPreference':{useGuidedPreference:()=>({value:{ideaAreas:['learning','wellbeing']}})},
  './IdeaAreasSheet':props=>React.createElement('AreasSheet',props),'./RoutineEditorSheet':host('Editor'),'../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{id:'owner'}})},
  '../context/TimerContext':{useTimer:()=>({})},'../services/routineWidgetService':{pinSavedRoutine:async()=>true,routineWidgetsSupported:async()=>false},'../services/savedRoutineService':{resolveSavedRoutine:async()=>null}}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});
 try{
  const tabs=()=>ui.root.findAllByType('Press').filter(x=>x.props.accessibilityRole==='tab');
  assert.equal(tabs()[0].props.accessibilityLabel,'For you ideas');assert.equal(tabs()[0].props.accessibilityState.selected,true,'opens on For you');
  const ideas=ui.root.findAllByType('Press').map(x=>x.props.accessibilityLabel).filter(label=>label?.startsWith('Add ')).map(label=>label.split(',')[0]);
  assert.equal(ideas.length,16,'eight from each picked area');
  assert.ok(ideas.includes('Add Flashcards')&&ideas.includes('Add Journal'));assert.equal(ideas.includes('Add Side project'),false);
  const change=ui.root.findAll(x=>x.props.testID==='ideas-for-you-change'&&x.props.accessibilityLabel&&typeof x.props.onPress==='function')[0];
  assert.equal(change.props.accessibilityLabel,'For you: Learning, Wellbeing. Change','one quiet button by the title, no crowded line');
  assert.equal(ui.root.findAll(x=>typeof x.props.children==='string'&&x.props.children.startsWith('From ')).length,0,'the long "From …" line is gone');
  await act(async()=>change.props.onPress());
  assert.equal(ui.root.findByType('AreasSheet').props.visible,true);
 }finally{await act(async()=>ui.unmount());}
});
test('removing the last routine ends edit mode, so + comes back instead of Done',async()=>{
 const h=await menuCard();try{
  const row=h.ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel?.startsWith('Edit Review notes,'));
  await act(async()=>row.props.onLongPress());
  assert.ok(h.ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Done editing routines'));
  await act(async()=>press(h.ui.root,'Remove Review notes'));await act(async()=>press(h.ui.root,'Remove routine'));
  assert.deepEqual(h.removed,[routine.id]);
  await h.empty();
  assert.equal(h.ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Done editing routines'),false);
  assert.ok(h.ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='New routine'),'+ is back');
 }finally{await h.cleanup();}
});
test('an idea keeps its category until renamed; a new routine starts in the category picked last; length matches the session picker',async()=>{
 const saved=[],remembered=[];
 const mocks={...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{id:'owner'}})},
  '../services/lastRoutineArea':{lastRoutineArea:{get:()=>subjects[1].id,load:async()=>{},remember:(owner,area)=>remembered.push([owner,area])}},
  '../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async d=>{saved.push(d);return true;}})}};
 const Component=load('src/components/RoutineEditorSheet.tsx',mocks).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,visible:true,onClose:()=>{},initialName:'Review today’s notes',initialAreaId:subjects[0].id,idea:{name:'Review today’s notes',areaId:subjects[0].id}}));});
 try{
  assert.equal(ui.root.findAll(x=>x.props.testID==='routine-idea-category').length>0,true,'the idea’s category is fixed');
  assert.equal(ui.root.findByType('Duration').props.compact,true,'the same 15–90 length picker as a session');
  await act(async()=>ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Routine name').props.onChangeText('My own thing'));
  assert.equal(ui.root.findAll(x=>x.props.testID==='routine-idea-category').length,0,'renamed, it is yours to categorise');
 }finally{await act(async()=>ui.unmount());}
 await act(async()=>{ui=create(React.createElement(Component,{subjects,visible:true,onClose:()=>{}}));});
 try{
  await act(async()=>ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Routine name').props.onChangeText('Guitar'));
  await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.children?.props?.children==='Save routine').props.onPress());
  assert.equal(saved[0].focusAreaId,subjects[1].id,'starts in the category picked last');
  assert.deepEqual(remembered,[['owner',subjects[1].id]]);
 }finally{await act(async()=>ui.unmount());}
});
test('Home Start row: each routine is a chip that starts it, Any activity sits last, and no routines means one wide Start button',async()=>{
  for(const withRoutine of [true,false]){
    const calls=[],state={ready:true,scope,online:true,routines:withRoutine?[routine]:[],pendingCount:0,conflicts:[]};
    const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>prepTimer(calls)},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
    let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,layout:'start',limit:3,suggestions:false,onSeeAll:()=>calls.push('see-all'),onAnyActivity:()=>calls.push('any')}));});
    try{
      const labels=()=>ui.root.findAllByType('Press').map(x=>x.props.accessibilityLabel);
      if(withRoutine){
        assert.ok(labels().includes('Start routine Review notes, 1 min 15 sec')||labels().some(l=>/^Start routine Review notes, /.test(l)),'the routine is a chip');
        assert.ok(labels().includes('Any activity. Start focusing, your time'),'Any activity sits beside it');
        await act(async()=>press(ui.root,labels().find(l=>/^Start routine Review notes, /.test(l))));
        assert.deepEqual(calls.filter(Array.isArray).at(-1),['route','/session'],'a chip opens the session set up with that routine');
        await act(async()=>press(ui.root,'Any activity. Start focusing, your time'));assert.ok(calls.includes('any'));
      }else{
        assert.ok(labels().includes('Start a focus session. Any activity, your time'),'one wide button when there are no routines');
        await act(async()=>press(ui.root,'Start a focus session. Any activity, your time'));assert.ok(calls.includes('any'));
        assert.equal(labels().some(l=>/^Start routine /.test(l||'')),false);
      }
    }finally{await act(async()=>ui.unmount());}
  }
});
test('Routines tab grid: each routine is a tile with its own start, hold edits, and a last tile makes a new one',async()=>{
  const calls=[],state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[]};
  const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>prepTimer(calls)},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
  let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,layout:'grid',limit:Number.MAX_SAFE_INTEGER}));});
  try{
    const labels=()=>ui.root.findAllByType('Press').map(x=>x.props.accessibilityLabel);
    assert.ok(labels().includes('Start routine Review notes'));
    assert.ok(labels().includes('Create a new routine'),'the last tile adds a routine');
    await act(async()=>press(ui.root,'Create a new routine'));assert.equal(ui.root.findByType('Editor').props.visible,true);
    await act(async()=>ui.root.findByType('Editor').props.onClose());
    await act(async()=>press(ui.root,'Start routine Review notes'));
    assert.deepEqual(calls.filter(Array.isArray).at(-1),['route','/session']);
    const tile=ui.root.findAllByType('Press').find(x=>/^Edit Review notes/.test(x.props.accessibilityLabel||''));
    await act(async()=>tile.props.onLongPress());
    assert.ok(ui.root.findAll(x=>x.props.testID==='edit-badges').length>0,'holding a tile starts edit mode');
    assert.equal(labels().includes('Create a new routine'),false,'no add tile while editing');
  }finally{await act(async()=>ui.unmount());}
});
test('like subjects, the Add routine tile shows until you have four routines',async()=>{
  for(const count of [3,4]){
    const list=Array.from({length:count},(_,i)=>({...routine,id:`bbbbbbbb-bbbb-4bbb-8bbb-00000000000${i+1}`,name:`Routine ${i+1}`}));
    const state={ready:true,scope,online:true,routines:list,pendingCount:0,conflicts:[]};
    const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
    let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,layout:'grid',limit:Number.MAX_SAFE_INTEGER}));});
    try{assert.equal(ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Create a new routine'),count<4);
      assert.equal(ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='New routine'),true,'the + by the title always adds one');}
    finally{await act(async()=>ui.unmount());}
  }
});

test('a new routine can go on the home screen as it is saved, without opening it again', async () => {
  const saved = [], results = [];
  const Component = load('src/components/RoutineEditorSheet.tsx', { ...base(), 'expo-haptics': { selectionAsync: async () => {} }, '../context/UserContext': { useUser: () => ({ hapticsEnabled: false }) },
    '../hooks/useSavedRoutines': { useSavedRoutines: () => ({ scope, ready: true, save: async (...args) => { saved.push(args); return true; }, remove: async () => true }) } }).default;
  const widgetSwitch = ui => ui.root.findAllByType('Switch').find(x => x.props.accessibilityLabel === 'Add a home screen widget after saving');
  const saveButton = ui => ui.root.findAllByType('Press').find(x => x.props.children?.props?.children === 'Save routine');
  let ui;
  // Phones without widgets, and routines that already exist, show no switch.
  for (const props of [{ widgetOnSave: false }, { widgetOnSave: true, routine }]) {
    await act(async () => { ui = create(React.createElement(Component, { subjects, visible: true, onClose() {}, ...props })); });
    try { assert.equal(widgetSwitch(ui), undefined); } finally { await act(async () => ui.unmount()); }
  }
  await act(async () => { ui = create(React.createElement(Component, { subjects, visible: true, onClose() {}, widgetOnSave: true, initialName: 'Stretch', onSaved: (draft, options) => results.push([draft.name, options]) })); });
  try {
    assert.equal(widgetSwitch(ui).props.value, false, 'off until you choose it');
    await act(async () => widgetSwitch(ui).props.onValueChange(true));
    await act(async () => saveButton(ui).props.onPress());
    assert.equal(saved.length, 1); assert.equal(saved[0][1], undefined, 'a brand-new routine');
    assert.deepEqual(results, [['Stretch', { addWidget: true }]]);
  } finally { await act(async () => ui.unmount()); }
});

test('the widget goes to the one routine that was just made, never a guess', async () => {
  const pinned = []; let routines = [];
  const api = load('src/services/routineWidgetService.ts', {
    'expo-modules-core': { uuid: { v4: () => 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001' } }, './nativeSessionCountdown': { getNativeSessionCountdownModule: async () => null },
    './savedRoutineService': { savedRoutineStore: { load: async () => {}, snapshot: () => ({ ready: true, routines }) } }, './offlineFocusCatalog': { readOfflineFocusAreas: async () => [] },
  });
  const original = api.pinSavedRoutine;
  assert.equal(typeof api.pinNewSavedRoutine, 'function');
  const before = new Set(['old-1']);
  routines = [{ id: 'old-1' }];
  assert.equal(await api.pinNewSavedRoutine(scope, before), false, 'nothing new, nothing pinned');
  routines = [{ id: 'old-1' }, { id: 'new-1' }, { id: 'new-2' }];
  assert.equal(await api.pinNewSavedRoutine(scope, before), false, 'two new ones cannot be told apart');
  assert.deepEqual(pinned, []); assert.equal(api.pinSavedRoutine, original);
});

test('Home Start row holds study subjects beside routines, before Any activity', async () => {
  for (const withRoutine of [true, false]) {
    const calls = [], state = { ready: true, scope, online: true, routines: withRoutine ? [routine] : [], pendingCount: 0, conflicts: [] };
    const Component = load('src/components/SavedRoutinesCard.tsx', { ...base(), './SheetHeader': host('Header'), 'expo-haptics': { selectionAsync: async () => {} }, 'expo-router': { useRouter: () => ({ push: target => calls.push(['route', target]) }) },
      '../hooks/useSavedRoutines': { useSavedRoutines: () => state }, '../context/UserContext': { useUser: () => ({ hapticsEnabled: false }) }, '../context/TimerContext': { useTimer: () => prepTimer(calls) },
      '../services/savedRoutineService': { resolveSavedRoutine: async () => routine }, '../services/routineWidgetService': { routineWidgetsSupported: async () => false, pinSavedRoutine: async () => true }, './RoutineEditorSheet': host('Editor') }).default;
    const studyChips = [{ key: 'math', name: 'Mathematics', caption: 'Study', color: '#BF5AF2', onPress: () => calls.push('study:math') }];
    let ui; await act(async () => { ui = create(React.createElement(Component, { subjects, layout: 'start', limit: 3, suggestions: false, onSeeAll() {}, onAnyActivity: () => calls.push('any'), studyChips })); });
    try {
      const labels = ui.root.findAllByType('Press').map(x => x.props.accessibilityLabel).filter(Boolean);
      const study = labels.indexOf('Study Mathematics. Study'), any = labels.indexOf('Any activity. Start focusing, your time');
      assert.ok(study >= 0, 'the subject is a chip'); assert.ok(any > study, 'Any activity stays last');
      if (withRoutine) assert.ok(labels.findIndex(l => /^Start routine/.test(l)) < study, 'routines come first');
      else assert.equal(labels.includes('Start a focus session. Any activity, your time'), false, 'a subject alone is enough for the chip row');
      await act(async () => ui.root.findAllByType('Press').find(x => x.props.accessibilityLabel === 'Study Mathematics. Study').props.onPress());
      assert.ok(calls.includes('study:math'));
    } finally { await act(async () => ui.unmount()); }
  }
});

test('Home passes up to two study subjects, most recently studied first, and routines fill the rest', () => {
  const home = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/app/(tabs)/index.tsx'), 'utf8');
  assert.match(home, /\.sort\(\(a, b\) => \(lastStudied\.get\(b\.id\) \?\? 0\) - \(lastStudied\.get\(a\.id\) \?\? 0\)/);
  assert.match(home, /course\.id !== nextCourse\?\.id/, 'the subject already shown as Revise is not repeated');
  assert.match(home, /\.slice\(0, 2\)/);
  assert.match(home, /limit=\{Math\.max\(1, 3 - studyChips\.length\)\} suggestions=\{false\} studyChips=\{studyChips\}/);
});
