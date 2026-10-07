/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];if(name.endsWith('/AppText'))return{Text:host('Text')};if(name.endsWith('/MotionPressable'))return host('Button');
  if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
 },module,module.exports);return module.exports;
}
test('entrance refresh waits for idle time and cancels both queued and stale callbacks',async()=>{
 const saved={setTimeout:global.setTimeout,clearTimeout:global.clearTimeout,requestIdleCallback:global.requestIdleCallback,cancelIdleCallback:global.cancelIdleCallback};
 const timers=new Map(),idle=new Map();let id=0,runs=0;
 global.setTimeout=callback=>{timers.set(++id,callback);return id;};global.clearTimeout=key=>timers.delete(key);
 global.requestIdleCallback=callback=>{idle.set(++id,callback);return id;};global.cancelIdleCallback=key=>idle.delete(key);
 try{
  const api=load('src/utils/afterTransition.ts');const cancel=api.afterTransition(()=>runs++);assert.equal(runs,0);cancel();assert.equal(timers.size,0);
  const cancelIdle=api.afterTransition(()=>runs++);timers.values().next().value();assert.equal(runs,0);const stale=idle.values().next().value;cancelIdle();stale();assert.equal(runs,0);assert.equal(idle.size,0);
  timers.clear();api.afterTransition(()=>runs++);timers.values().next().value();idle.values().next().value();assert.equal(runs,1);
 }finally{Object.assign(global,saved);}
});
test('tour geometry aligns window measurements and clamps highlight bounds',()=>{
 const geometry=load('src/utils/tourGeometry.ts');
 const frame={x:0,y:-28,width:390,height:824},measured={x:20,y:36,width:350,height:84};
 const local=geometry.overlayRect(measured,frame);assert.equal(local.y,64);
 const spot=geometry.spotlightRect(local,frame.width,frame.height);assert.deepEqual(spot,{x:16,y:60,width:358,height:92});
 for(const target of [{x:-20,y:-10,width:180,height:84},{x:900,y:900,width:80,height:52}]){const result=geometry.spotlightRect(target,390,800);assert.ok(result.x>=4&&result.x+result.width<=386);assert.ok(result.y>=4&&result.y+result.height<=796);}
});
test('animated secondary-page exit preserves navigation to Home for the quick tour',async()=>{
 let finish,prevent,tree;const dispatched=[],action={type:'NAVIGATE',payload:{name:'(tabs)'}};
 const navigation={canGoBack:()=>true,dispatch:value=>dispatched.push(value),goBack:()=>dispatched.push('back')};
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},View:host('View'),StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:390}),Animated:{View:host('Animated'),Value:class{setValue(){}},timing:(_,config)=>({start:callback=>{if(config.toValue===390)finish=callback;},stop(){}})}},'expo-router':{useRouter:()=>({canGoBack:()=>true}),useNavigation:()=>navigation},'expo-router/react-navigation':{usePreventRemove:(_,callback)=>{prevent=callback;}},'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({bottom:20})},'@expo/vector-icons':{Ionicons:host('Icon')},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header'),'../hooks/useReducedMotion':{useReducedMotion:()=>false}});
 await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Guide',subtitle:'',back:true,animateTransition:true},'Guide'));});
 try{await act(async()=>prevent({data:{action}}));assert.equal(dispatched.length,0);await act(async()=>finish({finished:true}));assert.deepEqual(dispatched,[action]);}finally{await act(async()=>tree.unmount());}
});
test('Android exact-alarm settings use special access and fall back to app settings',async()=>{
 const calls=[];let fail=false;
 const api=load('src/services/notificationPermissionService.ts',{'react-native':{Platform:{OS:'android',Version:35},Linking:{sendIntent:async action=>{calls.push(action);if(fail)throw Error('Unavailable');},openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}});
 await api.openAlarmSettings();assert.deepEqual(calls,['android.settings.REQUEST_SCHEDULE_EXACT_ALARM']);fail=true;await api.openAlarmSettings();assert.equal(calls.at(-1),'app-settings');
});
test('notification actions share fixed typography and preserve descriptive accessibility labels',async()=>{
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},StyleSheet:{create:value=>value}},'expo-router':{},'expo-router/react-navigation':{},'react-native-safe-area-context':{},'@expo/vector-icons':{},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header')});
 let tree;await act(async()=>{tree=create(React.createElement(React.Fragment,null,React.createElement(api.PersonalButton,{title:'Alarms & reminders',accessibilityLabel:'Open Alarms & reminders',onPress(){}}),React.createElement(api.PersonalButton,{title:'Notification settings',accessibilityLabel:'Open phone notification settings',onPress(){}})));});
 try{const labels=tree.root.findAllByType('Text');assert.equal(labels.length,2);for(const label of labels){assert.equal(label.props.adjustsFontSizeToFit,false);assert.equal(label.props.style[0].fontSize,16);assert.equal(label.props.style[0].lineHeight,24);}assert.deepEqual(tree.root.findAllByType('Button').map(node=>node.props.accessibilityLabel),['Open Alarms & reminders','Open phone notification settings']);}finally{await act(async()=>tree.unmount());}
});
test('daily goal sheet validates the minimum and prevents duplicate schedule writes',async()=>{
 let saves=0,resolveSave,refreshed=0,tree;
 const settings={today_goal_minutes:60,next_goal_minutes:60,next_effective_date:'2026-10-08',pending:false,scheduling_available:true,weekly_limit_available:true,can_change_goal:true};
 const api=load('src/components/DailyGoalSheet.tsx',{'react-native':{View:host('View')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:20})},'./AppSheet':host('Sheet'),'./PersonalUI':{p:{}},'../context/UserContext':{useUser:()=>({profile:{daily_goal_minutes:60,timezone:'Asia/Kuala_Lumpur'}})},'../services/dailyGoalService':{getDailyGoalSettings:async()=>settings,missingGoalAPI:()=>false,scheduleDailyGoal:async()=>{saves++;return new Promise(resolve=>{resolveSave=resolve;});}}});
 await act(async()=>{tree=create(React.createElement(api.default,{visible:true,onClose(){},onSaved(){refreshed++;}}));});
 try{
  await act(async()=>tree.root.findByType('Input').props.onChangeText('29'));
  await act(async()=>tree.root.findByType('Sheet').props.footer.props.children.props.onPress());assert.equal(saves,0);
  await act(async()=>tree.root.findByType('Input').props.onChangeText('90'));
  await act(async()=>{const save=tree.root.findByType('Sheet').props.footer.props.children.props.onPress;save();save();});assert.equal(saves,1);assert.equal(tree.root.findByType('Sheet').props.guardDismiss,true);
  await act(async()=>resolveSave({...settings,next_goal_minutes:90,pending:true,can_change_goal:false}));assert.equal(refreshed,1);assert.equal(tree.root.findByType('Sheet').props.footer.props.children.props.disabled,true);
 }finally{await act(async()=>tree.unmount());}
});
test('the six-tip tour measures its overlay, covers next-step access and stores completion per account',async()=>{
 const values=new Map([['liferpg:tour:v1:alice','pending']]),routes=[];let owner='alice',pathname='/',tour,tree;
 let changeRoute;
 const router={navigate:route=>{pathname=route;routes.push(route);changeRoute?.(route);}};
 const Native={View:host('View'),ScrollView:host('Scroll'),Modal:host('Modal'),StyleSheet:{create:s=>s,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:800}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:()=>({remove(){}})},Animated:{View:host('Animated'),Value:class{setValue(){}},timing:()=>({start(){},stop(){}})}};
 const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)},'expo-router':{useRouter:()=>router,usePathname:()=>{const [route,setRoute]=React.useState(pathname);changeRoute=setRoute;return route;}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:owner,onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({hasOpenSession:false})},'../hooks/useReducedMotion':{useReducedMotion:()=>true}});
 function Capture(){tour=api.useFeatureTour();React.useEffect(()=>{const clean=api.TOUR_STEPS.map(step=>tour.register(step.id,{measure:done=>done({x:20,y:100,width:350,height:100}),reveal:()=>false}));return()=>clean.forEach(fn=>fn());},[]);return null;}
 await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture)),{createNodeMock:()=>({measureInWindow:done=>done(0,-24,390,824)})});});
 await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());
 try{
  assert.equal(api.TOUR_STEPS.length,6);assert.ok(api.TOUR_STEPS.some(step=>step.id==='home-next-step'));assert.ok(tree.root.findAllByProps({testID:'tour-overlay'}).length>0);
  for(let i=0;i<6;i++){
   const text=node=>node.children.map(child=>typeof child==='string'?child:text(child)).join('');let next;
   for(let attempt=0;attempt<30;attempt++){await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));next=tree.root.findAllByType('Button').find(node=>text(node)===(i===5?'Explore LifeRPG':'Next'));if(next&&tree.root.findAllByProps({testID:'tour-outline'}).length)break;}
   assert.ok(next);assert.notEqual(next.props.disabled,true);
   const outline=tree.root.findByProps({testID:'tour-outline'});assert.equal(outline.props.style[1].top,120);
   await act(async()=>{next.props.onPress();next.props.onPress();});
  }
  assert.equal(values.get('liferpg:tour:v1:alice'),'done');assert.ok(routes.includes('/progress'));assert.ok(routes.includes('/profile'));assert.equal(tree.root.findAllByProps({testID:'tour-overlay'}).length,0);
  owner='bob';await act(async()=>tree.update(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture))));assert.equal(tree.root.findAllByProps({testID:'tour-overlay'}).length,0);assert.equal(values.has('liferpg:tour:v1:bob'),false);
 }finally{await act(async()=>tree.unmount());}
});

test('animated tour retains the outgoing target until fade-out and ignores late measurements during it',async()=>{
 const animations=[];let tour,tree,lastMeasurement;
 const router={navigate(){}};
 const Native={View:host('View'),ScrollView:host('Scroll'),Modal:host('Modal'),StyleSheet:{create:value=>value,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:800,fontScale:1}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:()=>({remove(){}})},Animated:{View:host('Animated'),Value:class{setValue(){}interpolate(){return 0;}},timing:(value,config)=>({start:callback=>animations.push({value,config,callback}),stop(){}})}};
 const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async()=> 'pending',setItem:async()=>{}},'expo-router':{useRouter:()=>router,usePathname:()=> '/'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:'owner',onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({})},'../hooks/useReducedMotion':{useReducedMotion:()=>false}});
 function Capture(){tour=api.useFeatureTour();React.useEffect(()=>{const clean=api.TOUR_STEPS.map((step,index)=>tour.register(step.id,{measure:done=>{lastMeasurement=done;done({x:20,y:100+index*80,width:350,height:52});},reveal:()=>false}));return()=>clean.forEach(fn=>fn());},[]);return null;}
 await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture)),{createNodeMock:()=>({measureInWindow:done=>done(0,-24,390,824)})});});
 try{
  await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());
  for(let i=0;i<20&&!tree.root.findAllByProps({testID:'tour-outline'}).length;i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.equal(tree.root.findByProps({testID:'tour-outline'}).props.style[1].top,120);
  const next=tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Next tour tip');
  await act(async()=>{next.props.onPress();next.props.onPress();lastMeasurement({x:20,y:500,width:350,height:52});});
  assert.equal(animations.filter(item=>item.config.duration===120).length,1);assert.equal(tree.root.findByProps({testID:'tour-outline'}).props.style[1].top,120);
  await act(async()=>animations.find(item=>item.config.duration===120).callback({finished:true}));
  assert.ok(tree.root.findAllByProps({testID:'tour-tip'}).length>0);assert.ok(tree.root.findAllByType('Button').some(node=>node.props.accessibilityLabel==='Close tour'));assert.equal(tree.root.findAllByProps({testID:'tour-outline'}).length,0);
  for(let i=0;i<20&&!tree.root.findAllByProps({testID:'tour-outline'}).length;i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.equal(tree.root.findByProps({testID:'tour-outline'}).props.style[1].top,200);
 }finally{await act(async()=>tree.unmount());}
});

test('tour controls remain usable when native root or target measurements never return',async()=>{
 for(const failure of ['root','target','throw','route']){
  const receipts=new Map();let tree,tour,back,attempts=0;
  const router={navigate(){}};
  const Native={View:host('View'),ScrollView:host('Scroll'),StyleSheet:{create:value=>value,absoluteFill:{},absoluteFillObject:{}},useWindowDimensions:()=>({width:390,height:800,fontScale:1}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:(_,callback)=>{back=callback;return{remove(){}};}},Animated:{View:host('Animated'),Value:class{setValue(){}},timing:()=>({start(){},stop(){}})}};
  const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async()=> 'pending',setItem:async(key,value)=>receipts.set(key,value)},'expo-router':{useRouter:()=>router,usePathname:()=> failure==='route'?'/guide':'/'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:'owner',onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({})},'../hooks/useReducedMotion':{useReducedMotion:()=>true}});
  function Capture(){tour=api.useFeatureTour();React.useEffect(()=>tour.register('home-identity',{measure:()=>{attempts++;if(failure==='throw')throw Error('Native measurement unavailable');},reveal:()=>false}),[]);return null;}
  await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture)),{createNodeMock:()=>({measureInWindow:done=>{if(failure!=='root')done(0,0,390,800);}})});});
  try{
   await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());
   assert.ok(tree.root.findAllByProps({testID:'tour-tip'}).length>0);
   await act(async()=>new Promise(resolve=>setTimeout(resolve,failure==='root'?1450:550)));
   if(failure==='root')assert.match(JSON.stringify(tree.toJSON()),/Retry highlight/);
   if(failure==='target'||failure==='throw')assert.ok(attempts>0);
   const next=()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Next tour tip');assert.ok(next());assert.notEqual(next().props.disabled,true);
   await act(async()=>next().props.onPress());
   assert.match(tree.root.findAllByType('Text').map(node=>node.children.join('')).join(' '),/2 of/);assert.equal(tree.root.findAllByProps({testID:'tour-outline'}).length,0);
   await act(async()=>back());assert.equal(tree.root.findAllByProps({testID:'tour-overlay'}).length,0);assert.equal(receipts.get('liferpg:tour:v1:owner'),'dismissed');
  }finally{await act(async()=>tree.unmount());}
 }
});

test('closing the tour during an unfinished native fade prevents a late callback reopening it',async()=>{
 let tree,tour,finish;const receipts=new Map(),router={navigate(){}};
 const Native={View:host('View'),ScrollView:host('Scroll'),StyleSheet:{create:value=>value,absoluteFill:{},absoluteFillObject:{}},useWindowDimensions:()=>({width:390,height:800}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:()=>({remove(){}})},Animated:{View:host('Animated'),Value:class{setValue(){}},timing:(_,config)=>({start:callback=>{if(config.duration===120)finish=callback;},stop(){}})}};
 const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async()=> 'pending',setItem:async(key,value)=>receipts.set(key,value)},'expo-router':{useRouter:()=>router,usePathname:()=> '/'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:'owner',onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({})},'../hooks/useReducedMotion':{useReducedMotion:()=>false}});
 function Capture(){tour=api.useFeatureTour();return null;}
 await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture)));});
 try{
  await act(async()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Next tour tip').props.onPress());
  await act(async()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Close tour').props.onPress());
  await act(async()=>finish({finished:true}));assert.equal(tree.root.findAllByProps({testID:'tour-overlay'}).length,0);assert.equal(receipts.get('liferpg:tour:v1:owner'),'dismissed');
 }finally{await act(async()=>tree.unmount());}
});

test('tour scrolling clears the fixed tip and removes its temporary padding when closed',async()=>{
 let tree,targetY=600;const scrolls=[],router={navigate(){}};
 const flatten=style=>Array.isArray(style)?Object.assign({},...style.map(flatten)):style||{};
 const Scroll=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo:position=>{scrolls.push(position);targetY=80;}}));return React.createElement('Scroll',props,props.children);});
 const Native={View:host('View'),ScrollView:Scroll,StyleSheet:{create:value=>value,flatten,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:800}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:()=>({remove(){}})},Animated:{View:host('Animated'),Value:class{setValue(){}},timing:()=>({start(){},stop(){}})}};
 const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async()=> 'pending',setItem:async()=>{}},'expo-router':{useRouter:()=>router,usePathname:()=> '/'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:'owner',onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({})},'../hooks/useReducedMotion':{useReducedMotion:()=>true}});
 await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(api.TourScrollView,{contentContainerStyle:{paddingBottom:90}},React.createElement(api.TourAnchor,{id:'home-identity'},'Target'))),{createNodeMock:element=>({measureInWindow:done=>element.props.testID==='tour-root'?done(0,0,390,800):done(20,targetY,350,80)})});});
 const content=()=>tree.root.findAllByType('Scroll').find(node=>node.props.contentContainerStyle);
 try{
  await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());assert.equal(flatten(content().props.contentContainerStyle).paddingBottom,398);
  for(let i=0;i<20&&!tree.root.findAllByProps({testID:'tour-outline'}).length;i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.equal(scrolls.length,1);assert.equal(tree.root.findByProps({testID:'tour-outline'}).props.style[1].top,76);
  await act(async()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel==='Close tour').props.onPress());assert.equal(flatten(content().props.contentContainerStyle).paddingBottom,90);assert.deepEqual(scrolls.at(-1),{y:0,animated:false});
 }finally{await act(async()=>tree.unmount());}
});
