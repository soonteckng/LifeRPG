const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const host=type=>props=>React.createElement(type,props,props.children);
// Routine rows ask before starting; the confirmation sheet owns the Start.
const press=(root,label)=>root.findAllByType('Press').find(x=>x.props.accessibilityLabel===label).props.onPress();
const confirmSheet=root=>root.findAllByType('Sheet').find(x=>x.props.label==='start routine');
const manageSheet=root=>root.findAllByType('Sheet').find(x=>x.props.label==='routines');
function load(file,mocks,cache=new Map()) {const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const mod={exports:{}};cache.set(filename,mod);const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',source)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+suffix),mocks,cache);},mod,mod.exports);return mod.exports;}
const scope={backendId:'fixture',ownerId:'11111111-1111-4111-8111-111111111111'},routine={id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',revision:1,name:'Review notes',durationSeconds:75,focusAreaId:2,reminder:{enabled:false,hour:18,minute:0},deletedAt:null};
const subjects=[{id:1,title:'General',color_code:null},{id:2,title:'Learning',color_code:null}];
const rn={View:host('View'),StyleSheet:{create:value=>value,hairlineWidth:1},Platform:{OS:'android'},Keyboard:{dismiss:()=>{}},Switch:host('Switch'),AppState:{addEventListener:()=>({remove(){}})}};
function base(){return{'react-native':rn,'@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Press')},'react-native-gesture-handler/ReanimatedSwipeable':{__esModule:true,default:props=>props.children},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},'./AppText':{Text:host('Text')},'./AppSheet':props=>React.createElement('Sheet',props,props.header,props.children,props.footer,props.overlay),'./MotionPressable':host('Press'),'./FocusLengthControl':host('Duration'),'./SheetConfirmation':host('Confirm'),'./QuestSheet':host('LegacyEditor'),'../services/notificationPermissionService':{readNotificationPermission:async()=>({label:'Not allowed',action:'enable',supported:true,granted:false}),enableNotifications:async()=>({label:'Allowed',action:'settings',supported:true,granted:true}),openNotificationSettings:async()=>{}}};}
test('saved routine starts with exact name, area and seconds; offline stays in its workspace',async()=>{
 for(const online of [true,false]){const calls=[],state={ready:true,scope,online,routines:[routine],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>calls.push('haptic')},'expo-router':{useRouter:()=>({push:path=>calls.push(['route',path])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:true})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:async(...args)=>{calls.push(['start',...args]);return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});try{await act(async()=>press(ui.root,'Start routine Review notes'));assert.equal(confirmSheet(ui.root).props.visible,true);assert.equal(calls.some(x=>Array.isArray(x)&&x[0]==='start'),false,'the play button asks before starting');await act(async()=>press(ui.root,'Start Review notes now'));assert.deepEqual(calls.find(x=>Array.isArray(x)&&x[0]==='start'),['start',75,2,'Review notes']);assert.equal(confirmSheet(ui.root).props.visible,false);await act(async()=>confirmSheet(ui.root).props.onDismiss());assert.equal(calls.some(x=>Array.isArray(x)&&x[0]==='route'),online);assert.ok(calls.includes('haptic'));}finally{await act(async()=>ui.unmount());}}
});
test('routine card closes retained editor and management portals when its surface becomes inactive',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:()=>{}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,active:true}));});try{assert.equal(ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel==='Manage your routines'),false,'nothing to manage yet');await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='New routine').props.onPress());assert.equal(ui.root.findByType('Editor').props.visible,true);await act(async()=>ui.update(React.createElement(Component,{subjects,active:false})));assert.equal(ui.root.findByType('Editor').props.visible,false);assert.equal(manageSheet(ui.root).props.visible,false);await act(async()=>ui.update(React.createElement(Component,{subjects,active:true})));assert.equal(ui.root.findByType('Editor').props.visible,false);}finally{await act(async()=>ui.unmount());}
});
test('a late cache read after account switch cannot start a routine or navigate',async()=>{
 let release;const hold=new Promise(resolve=>{release=resolve;}),calls=[];let state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[]};const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:()=>calls.push('route')})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:async()=>{calls.push('start');return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:()=>hold},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});try{await act(async()=>press(ui.root,'Start routine Review notes'));await act(async()=>{press(ui.root,'Start Review notes now');});state={...state,scope:{...scope,ownerId:'22222222-2222-4222-8222-222222222222'}};await act(async()=>ui.update(React.createElement(Component,{subjects})));await act(async()=>{release(routine);await hold;});assert.deepEqual(calls,[]);}finally{await act(async()=>ui.unmount());}
});
test('routine editor preloads exact settings and saves an editable name without creating a quest',async()=>{
 const saved=[],mocks={...base(),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async(...args)=>{saved.push(args);return true;},remove:async()=>true})}};const Component=load('src/components/RoutineEditorSheet.tsx',mocks).default;let ui,closed=0;await act(async()=>{ui=create(React.createElement(Component,{subjects,routine,visible:true,onClose:()=>closed++}));});try{assert.equal(ui.root.findByType('Duration').props.seconds,75);const input=ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Routine name');assert.equal(input.props.value,'Review notes');await act(async()=>input.props.onChangeText('  New name  '));await act(async()=>ui.root.findAllByType('Press').find(x=>typeof x.props.onPress==='function'&&x.props.children?.props?.children==='Save routine').props.onPress());assert.equal(saved[0][0].name,'New name');assert.equal(saved[0][0].durationSeconds,75);assert.equal(saved[0][1],routine.id);assert.equal(closed,1);}finally{await act(async()=>ui.unmount());}
});
test('routine editor keeps invalid reminder errors visible and removal requires confirmation',async()=>{
 const saved=[],removed=[];const Component=load('src/components/RoutineEditorSheet.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>({scope,ready:true,save:async d=>{saved.push(d);return true;},remove:async id=>{removed.push(id);return true;}})}}).default;let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,routine:{...routine,reminder:{enabled:true,hour:18,minute:0}},visible:true,onClose:()=>{}}));});try{await act(async()=>ui.root.findAllByType('Input').find(x=>x.props.accessibilityLabel==='Reminder hour').props.onChangeText('24'));await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.children?.props?.children==='Save routine').props.onPress());assert.equal(saved.length,0);assert.ok(ui.root.findAllByType('Text').some(x=>x.props.accessibilityRole==='alert'));await act(async()=>ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='Remove routine').props.onPress());assert.equal(removed.length,0);assert.equal(ui.root.findByType('Confirm').props.title,'Remove this routine?');await act(async()=>ui.root.findByType('Confirm').props.onConfirm());assert.deepEqual(removed,[routine.id]);}finally{await act(async()=>ui.unmount());}
});
async function heldStartCard() {
 const calls=[];let release;const request=new Promise(resolve=>{release=resolve;});let state={ready:true,scope,online:true,routines:[routine],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:(...args)=>{calls.push(['start',...args]);return request;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects}));});
 return { ui,calls,release:async()=>act(async()=>{release(true);await request;}), updateScope:async next=>{state={...state,scope:next};await act(async()=>ui.update(React.createElement(Component,{subjects})));},cleanup:async()=>act(async()=>ui.unmount()) };
}
test('routine timer opens before a held server reply and rapid taps still issue one start',async()=>{
 const h=await heldStartCard();try{await act(async()=>press(h.ui.root,'Start routine Review notes'));const button=h.ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel==='Start Review notes now');await act(async()=>{button.props.onPress();button.props.onPress();});assert.deepEqual(h.calls,[['start',75,2,'Review notes']]);await act(async()=>confirmSheet(h.ui.root).props.onDismiss());assert.deepEqual(h.calls,[['start',75,2,'Review notes'],['route','/session']],'navigation follows the confirmation without waiting for the held server reply');await h.release();assert.equal(h.calls.filter(x=>x[0]==='route').length,1);}finally{await h.cleanup();}
});
test('Manage shows edit controls only in its sheet; Home rows keep their play buttons',async()=>{
 const h=await heldStartCard();try{await act(async()=>press(h.ui.root,'Manage your routines'));const sheet=manageSheet(h.ui.root);assert.equal(sheet.props.visible,true);const card=h.ui.root.findAllByType('View').find(x=>x.props.testID==='saved-routines-card');const labels=node=>node.findAllByType('Press').map(x=>x.props.accessibilityLabel);assert.ok(labels(card).includes('Start routine Review notes'));assert.ok(!labels(card).includes('Edit Review notes'));assert.ok(labels(sheet).includes('Edit Review notes'));assert.ok(!labels(sheet).includes('Start routine Review notes'));assert.deepEqual(h.calls,[]);}finally{await h.cleanup();}
});
test('a deferred confirmed navigation is dropped when the account or backend changes before dismissal',async()=>{
 const h=await heldStartCard();try{await act(async()=>press(h.ui.root,'Start routine Review notes'));await act(async()=>press(h.ui.root,'Start Review notes now'));const lateDismiss=confirmSheet(h.ui.root).props.onDismiss;await h.updateScope({...scope,backendId:'different-backend'});await act(async()=>lateDismiss());await h.release();assert.equal(h.calls.filter(x=>x[0]==='route').length,0);}finally{await h.cleanup();}
});

async function mergedRoutineCard() {
 const calls=[],legacy={id:42,title:'Same name',target_minutes:3,subject_id:2,is_completed_today:false,is_completed:false,is_recurring:true,repeat_rule:'Mon,Wed',is_due_today:true};
 let tasks=[legacy],state={ready:true,scope,online:true,routines:[{...routine,name:'Same name'}],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push:target=>calls.push(['route',target])})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false,profile:{id:scope.ownerId}})},'../context/TimerContext':{useTimer:()=>({startFreeTimer:async(...args)=>{calls.push(['free',...args]);return true;}})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 const props=()=>({subjects,legacyTasks:tasks,onStartLegacy:item=>calls.push(['linked',item])});let ui;
 await act(async()=>{ui=create(React.createElement(Component,props()));});
 return {ui,calls,legacy,updateTasks:async next=>{tasks=next;await act(async()=>ui.update(React.createElement(Component,props())));},cleanup:async()=>act(async()=>ui.unmount())};
}
test('merged routines retain linked task starts alongside separately stored saved routines',async()=>{
 const h=await mergedRoutineCard();try {
  const card=h.ui.root.findAllByType('View').find(item=>item.props.testID==='saved-routines-card');
  const buttons=card.findAllByType('Press').filter(item=>item.props.accessibilityLabel==='Start routine Same name');
  assert.equal(buttons.length,2,'same name does not hide an existing record');
  await act(async()=>buttons[0].props.onPress());
  assert.deepEqual(h.calls,[],'the play button asks before starting');
  await act(async()=>press(h.ui.root,'Start Same name now'));
  await act(async()=>confirmSheet(h.ui.root).props.onDismiss());
  assert.deepEqual(h.calls,[['linked',h.legacy]],'original task identity reaches Home, never a free timer conversion');
 }finally{await h.cleanup();}
});
test('legacy routine editing opens the existing record editor only after manager dismissal',async()=>{
 const h=await mergedRoutineCard();try {
  await act(async()=>h.ui.root.findAllByType('Press').find(item=>item.props.accessibilityLabel==='Manage your routines').props.onPress());
  const sheet=manageSheet(h.ui.root);
  await act(async()=>sheet.findAllByType('Press').find(item=>item.props.accessibilityLabel==='Edit routine Same name').props.onPress());
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
test('pending linked routine navigation checks fresh completion data before opening a session',async()=>{
 const h=await mergedRoutineCard();try {
  await act(async()=>press(h.ui.root,'Start routine Same name'));
  const sheet=confirmSheet(h.ui.root);
  await act(async()=>press(h.ui.root,'Start Same name now'));
  await h.updateTasks([{...h.legacy,is_completed_today:true}]);
  await act(async()=>sheet.props.onDismiss());
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
 return {ui,calls,removed,sheet,cleanup:async()=>act(async()=>ui.unmount())};
}
test('holding a routine offers Start, Edit and Remove in one small card; Remove asks first',async()=>{
 const h=await menuCard();try{
  const row=h.ui.root.findAllByType('Press').find(x=>x.props.accessibilityLabel?.startsWith('Edit Review notes,'));
  await act(async()=>row.props.onLongPress());
  assert.equal(h.sheet().props.label,'routine options');assert.equal(h.sheet().props.visible,true);assert.equal(h.sheet().props.floating,true);
  for(const label of ['Start now','Edit routine','Remove routine'])assert.ok(h.ui.root.findAllByType('Press').some(x=>x.props.accessibilityLabel===label),label);
  await act(async()=>press(h.ui.root,'Remove routine'));
  assert.equal(h.sheet().props.label,'remove routine');assert.deepEqual(h.removed,[],'nothing is removed before confirming');
  await act(async()=>press(h.ui.root,'Remove routine'));
  assert.deepEqual(h.removed,[routine.id]);assert.equal(h.sheet().props.visible,false);
 }finally{await h.cleanup();}
});
test('swiping a routine reveals Edit and Remove; Remove still confirms',async()=>{
 const h=await menuCard();try{
  await act(async()=>press(h.ui.root,'Remove Review notes'));
  assert.ok(h.calls.includes('close'),'the row slides back once an action is chosen');
  assert.equal(h.sheet().props.label,'remove routine');assert.deepEqual(h.removed,[]);
  await act(async()=>press(h.ui.root,'Keep routine'));
  assert.equal(h.sheet().props.visible,false);assert.deepEqual(h.removed,[]);
  await act(async()=>press(h.ui.root,'Edit Review notes'));
  assert.equal(h.ui.root.findByType('Editor').props.visible,true);
 }finally{await h.cleanup();}
});
test('an empty list offers two ready-made routines that open the editor prefilled',async()=>{
 const state={ready:true,scope,online:true,routines:[],pendingCount:0,conflicts:[]};
 const Component=load('src/components/SavedRoutinesCard.tsx',{...base(),'./SheetHeader':host('Header'),'expo-haptics':{selectionAsync:async()=>{}},'expo-router':{useRouter:()=>({push(){}})},'../hooks/useSavedRoutines':{useSavedRoutines:()=>state},'../context/UserContext':{useUser:()=>({hapticsEnabled:false})},'../context/TimerContext':{useTimer:()=>({})},'../services/savedRoutineService':{resolveSavedRoutine:async()=>routine},'../services/routineWidgetService':{routineWidgetsSupported:async()=>false,pinSavedRoutine:async()=>true},'./RoutineEditorSheet':host('Editor')}).default;
 let ui;await act(async()=>{ui=create(React.createElement(Component,{subjects,initialSeconds:1800,initialAreaId:1}));});
 try{
  await act(async()=>press(ui.root,'Add Review today’s notes, 30 minutes'));
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
  assert.ok(labels.includes('Add Review today’s notes, 30 minutes'));assert.ok(labels.includes('Add Plan tomorrow, 15 minutes'));
  assert.equal(labels.some(label=>label?.startsWith('Add Read before bed')),false);
  assert.ok(ui.root.findAllByType('Text').some(x=>x.props.children==='Suggested routines'));
 }finally{await act(async()=>ui.unmount());}
});
