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

async function tourHarness({ failure, reduced = false, receipt = 'pending', actualScroll = false } = {}) {
 const saved={setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
 let now=0,serial=0,tree,tour,back,changeRoute,pathname='/',owner='alice',attempts=0,targetY=700;
 const timers=new Map(),animations=[],routes=[],scrolls=[],events=[],geometry=new Map(),receipts=new Map(receipt?[['liferpg:tour:v1:alice',receipt]]:[]);
 global.setTimeout=(callback,delay=0)=>{const id=++serial;timers.set(id,{callback,at:now+delay});return id;};global.clearTimeout=id=>timers.delete(id);
 const advance=async ms=>{const end=now+ms;let turns=0;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++turns>200)throw Error('Timer loop');now=next[1].at;timers.delete(next[0]);await act(async()=>next[1].callback());}now=end;};
 class Value { constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(config){return {source:this,config};} }
 const router={navigate(route){routes.push(route);events.push({kind:'navigate',route});if(failure==='route'||failure==='return'&&route==='/'&&pathname==='/profile')return;pathname=route;changeRoute?.(route);}};
 const Scroll=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo:position=>{scrolls.push(position);events.push({kind:'scroll',...position});targetY-=position.y;}}));return React.createElement('Scroll',props,props.children);});
 const Native={View:host('View'),ScrollView:Scroll,StyleSheet:{create:s=>s,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:800}),AccessibilityInfo:{announceForAccessibility(){}},BackHandler:{addEventListener:(_,cb)=>{back=cb;return{remove(){}};}},Animated:{View:host('Animated'),Value,timing:(value,config)=>{let item;return{start:callback=>{item={value,config,callback};animations.push(item);events.push({kind:'animate',...config});},stop:()=>{if(item)item.stopped=true;}};}}};
 const api=load('src/components/FeatureTour.tsx',{'react-native':Native,'@react-native-async-storage/async-storage':{getItem:async key=>receipts.get(key)||null,setItem:async(key,value)=>receipts.set(key,value)},'expo-router':{useRouter:()=>router,usePathname:()=>{const [route,setRoute]=React.useState(pathname);changeRoute=setRoute;return route;}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24})},'../context/UserContext':{useUser:()=>({profile:{id:owner,onboarding_completed:true}})},'../context/TimerContext':{useTimer:()=>({})},'../hooks/useReducedMotion':{useReducedMotion:()=>reduced}});
 const late=[];
 function Capture(){tour=api.useFeatureTour();React.useEffect(()=>{
  if(actualScroll)return;
  const cleanup=api.TOUR_STEPS.map((step,i)=>tour.register(step.id,{measure:done=>{attempts++;late.push(done);if(failure==='target')return;if(failure==='throw')throw Error('Native unavailable');done(geometry.get(step.id)||{x:20,y:100+i*80,width:350,height:100});},reveal:()=>false}));return()=>cleanup.forEach(fn=>fn());
 },[]);return actualScroll?React.createElement(api.TourScrollView,{tourRoute:'/',tourBottomInset:90,contentContainerStyle:{paddingBottom:90}},React.createElement(api.TourAnchor,{id:'home-identity'},'Target')):null;}
 await act(async()=>{tree=create(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture)),{createNodeMock:element=>({measureInWindow:done=>{if(failure==='root')return;element.props.testID==='tour-root'?done(0,-24,390,824):done(20,targetY,350,100);}})});});
 await act(async()=>tree.root.findByProps({testID:'tour-root'}).props.onLayout());
 const button=label=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel===label);
 return {api,tree,animations,routes,scrolls,events,receipts,late,advance,button,layout:async(id,rect)=>act(async()=>{geometry.set(id,rect);tour.layoutChanged(id);}),reportDock:async height=>act(async()=>tour.reportDock(height)),text:()=>tree.root.findAllByType('Text').map(n=>n.children.join('')).join(' '),attempts:()=>attempts,press:async label=>act(async()=>button(label).props.onPress()),back:async()=>act(async()=>back()),owner:async value=>{owner=value;await act(async()=>tree.update(React.createElement(api.FeatureTourProvider,null,React.createElement(Capture))));},
  finish:async item=>act(async()=>{item.value.setValue(item.config.toValue);item.callback?.({finished:true});}),
  cleanup:async()=>{await act(async()=>tree.unmount());Object.assign(global,saved);},
 };
}

test('first-run tour waits for Home, requires every lesson, supports Back and returns Home before saving completion',async()=>{
 const ui=await tourHarness({reduced:true});
 try{
  assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);
  await ui.advance(749);assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);
  await ui.advance(121);assert.ok(ui.tree.root.findAllByProps({testID:'tour-outline'}).length>0);
  assert.equal(ui.button('Close tour'),undefined);assert.equal(ui.button('Previous tour tip').props.disabled,true);
  await ui.back();assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');
  await ui.press('Next tour tip');await ui.advance(120);
  await ui.press('Previous tour tip');await ui.advance(120);assert.match(ui.text(),/1 of/);
  for(let i=0;i<5;i++){await ui.press('Next tour tip');await ui.advance(140);}
  assert.match(ui.text(),/6 of/);assert.equal(ui.tree.root.findAllByProps({testID:'tour-outline'}).length,0,'page overviews have no misleading narrow outline');
  assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');assert.ok(ui.routes.includes('/progress'));assert.ok(ui.routes.includes('/profile'));
  await ui.press('Explore LifeRPG');await ui.advance(1);
  assert.equal(ui.routes.at(-1),'/');assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'done');assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);
  await ui.owner('bob');await ui.advance(1000);assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);assert.equal(ui.receipts.has('liferpg:tour:v1:bob'),false);
 }finally{await ui.cleanup();}
});

test('dialog exits as a whole before switching target and rejects duplicate taps and stale measurements',async()=>{
 const ui=await tourHarness();
 try{
  await ui.advance(900);const outline=()=>ui.tree.root.findByProps({testID:'tour-outline'}).props.style[1];assert.equal(outline().top,120);
  const body=ui.tree.root.findAllByType('Text').find(node=>node.children.includes(ui.api.TOUR_STEPS[0].body));
  await act(async()=>body.props.onLayout({nativeEvent:{layout:{height:81.5}}}));
  assert.equal(ui.tree.root.findAllByType('Scroll').find(node=>node.props.style?.flexGrow===0).props.style.height,82,'body height comes from actual native layout, including line spacing');
  const next=ui.button('Next tour tip');await act(async()=>{next.props.onPress();next.props.onPress();ui.late.at(-1)({x:20,y:600,width:350,height:100});});
  const exits=ui.animations.filter(a=>a.config.duration===140);assert.equal(exits.length,1);assert.equal(outline().top,120);
  const panel=ui.tree.root.findByProps({testID:'tour-tip'}).props.style[1];assert.equal(panel.transform[0].scale.source,exits[0].value,'scale and opacity reverse together on the native driver');
  exits[0].value.setValue(.3);await ui.advance(220);assert.equal(exits[0].value.value,.3,'the incoming deadline must not flash a departing dialog back to full opacity');
  await ui.finish(exits[0]);assert.equal(ui.tree.root.findAllByProps({testID:'tour-outline'}).length,0);
  await ui.advance(120);assert.equal(outline().top,200);assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');
 }finally{await ui.cleanup();}
});

test('missing native measurements never trap the mandatory tour and hardware Back goes to the previous tip',async()=>{
 for(const failure of ['root','target','throw']){
  const ui=await tourHarness({failure,reduced:true});
  try{
   await ui.advance(1400);assert.ok(ui.button('Next tour tip'));assert.match(JSON.stringify(ui.tree.toJSON()),/Retry highlight/);
   if(failure==='target'||failure==='throw')assert.ok(ui.attempts()>0);
   await ui.press('Next tour tip');await ui.advance(0);assert.match(ui.text(),/2 of/);
   await ui.back();await ui.advance(0);assert.match(ui.text(),/1 of/);
   assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');assert.equal(ui.button('Close tour'),undefined);
  }finally{await ui.cleanup();}
 }
});

test('changing account during a native exit cancels late callbacks without completing the next account tour',async()=>{
 const ui=await tourHarness();
 try{
  await ui.advance(1400);await ui.press('Next tour tip');const exit=ui.animations.find(a=>a.config.duration===140);
  await ui.owner('bob');await ui.finish(exit);await ui.advance(1000);
  assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');assert.equal(ui.receipts.has('liferpg:tour:v1:bob'),false);
 }finally{await ui.cleanup();}
});

test('tour scrolling reveals actual content without adding fake space and restores its original scroll position',async()=>{
 const ui=await tourHarness({actualScroll:true,reduced:true});
 try{
  const content=()=>ui.tree.root.findAllByType('Scroll').find(n=>n.props.contentContainerStyle);
  await ui.advance(1000);assert.equal(content().props.contentContainerStyle.paddingBottom,90);assert.equal(ui.scrolls.length,1);
  const outline=ui.tree.root.findByProps({testID:'tour-outline'}).props.style[1];assert.ok(outline.top+outline.height<824-90);
  await ui.owner('bob');assert.deepEqual(ui.scrolls.at(-1),{y:0,animated:false});assert.equal(content().props.contentContainerStyle.paddingBottom,90);
 }finally{await ui.cleanup();}
});

test('adaptive dialogs fit above lower cards and below upper sections across phone sizes',()=>{
 const {tourTipPosition,tourScrollDelta}=load('src/utils/tourGeometry.ts');
 for(const height of [640,800,932]){
  const top=36,bottom=height-100,panel=210;
  const upper={x:20,y:40,width:350,height:130},lower={x:20,y:height-230,width:350,height:110};
  assert.equal(tourTipPosition(upper,panel,top,bottom),184);
  const above=tourTipPosition(lower,panel,top,bottom);assert.ok(above+panel<lower.y);assert.ok(above>=top);
  const delta=tourScrollDelta(lower,panel,top,bottom);assert.ok(Math.abs(delta)<height/2,'do not force lower cards to the top or invent blank content');
 }
 const card={x:20,y:220,width:350,height:400},panel=190,top=36,bottom=720;
 const delta=tourScrollDelta(card,panel,top,bottom,0);assert.ok(delta>0,'at scroll top, make room below a full focus card instead of requesting impossible negative scrolling');
 const revealed={...card,y:card.y-delta};const dialog=tourTipPosition(revealed,panel,top,bottom);assert.ok(dialog>=revealed.y+revealed.height);
});

test('Settings origin geometry maps a full page back to its actual icon and expires stale origins',()=>{
 const api=load('src/utils/settingsOrigin.ts');
 const icon={x:326,y:32,width:44,height:44},frame={x:0,y:24,width:390,height:800};
 api.rememberSettingsOrigin(icon);assert.deepEqual(api.readSettingsOrigin(),icon);
 const mapped=api.settingsTransform(icon,frame);assert.equal(frame.x+mapped.x,348);assert.equal(frame.y+mapped.y,54);assert.equal(mapped.scale,.001);
 const date=Date.now;try{Date.now=()=>date()+10_001;assert.equal(api.readSettingsOrigin(),null);}finally{Date.now=date;}
});

test('the final native fade returns Home smoothly and only then marks the tour complete',async()=>{
 const ui=await tourHarness();
 try{
  await ui.advance(900);
  for(let i=0;i<5;i++){await ui.press('Next tour tip');await ui.advance(400);}
  assert.match(ui.text(),/6 of/);await ui.press('Explore LifeRPG');await ui.advance(360);
  assert.equal(ui.routes.at(-1),'/');assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');
  const fade=ui.animations.find(a=>a.config.duration===350);assert.ok(fade);assert.equal(fade.config.useNativeDriver,true);
  await ui.finish(fade);assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'done');assert.equal(ui.tree.root.findAllByProps({testID:'tour-overlay'}).length,0);
 }finally{await ui.cleanup();}
});

test('failed page navigation and return-to-Home keep visible mandatory controls without saving a false completion',async()=>{
 for(const failure of ['route','return']){
  const ui=await tourHarness({failure,reduced:true});
  try{
   await ui.advance(900);for(let i=0;i<5;i++){await ui.press('Next tour tip');await ui.advance(150);}
   if(failure==='route'){await ui.advance(600);assert.match(ui.text(),/Retry highlight/);await ui.press('Previous tour tip');assert.match(ui.text(),/5 of/);}
   else {await ui.press('Explore LifeRPG');await ui.advance(1250);assert.ok(ui.button('Explore LifeRPG'));await ui.press('Previous tour tip');assert.match(ui.text(),/5 of/);}
   assert.equal(ui.receipts.get('liferpg:tour:v1:alice'),'pending');
  }finally{await ui.cleanup();}
 }
});

test('Settings waits for its frame, springs around the fixed icon pivot and bounces back before route removal',async()=>{
 for(const OS of ['ios','android']){
  const animations=[],dispatch=[];let tree;
  const navigation={canGoBack:()=>true,goBack:()=>dispatch.push('back'),dispatch:a=>dispatch.push(a)};
  const source=load('src/utils/settingsOrigin.ts');source.rememberSettingsOrigin({x:120,y:180,width:44,height:44});
  const motion=(value,config)=>({start:callback=>animations.push({config,callback}),stop(){}});
  const api=load('src/components/PersonalUI.tsx',{'react-native':{View:host('View'),Platform:{OS},StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:390,height:800}),Animated:{View:host('Animated'),Value:class{setValue(){}interpolate(config){return config;}},timing:motion,spring:(value,config)=>motion(value,{...config,spring:true})}},'expo-router':{useRouter:()=>({}),useNavigation:()=>navigation},'expo-router/react-navigation':{usePreventRemove(){}},'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({bottom:24})},'@expo/vector-icons':{Ionicons:host('Icon')},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header'),'../hooks/useReducedMotion':{useReducedMotion:()=>false},'../utils/settingsOrigin':source});
  await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Settings',subtitle:'',back:true,animateTransition:true,expandFromIcon:true}),{createNodeMock:()=>({measureInWindow:done=>done(0,24,390,800)})});});
  try{
   const style=tree.root.findByProps({testID:'personal-page-surface'}).props.style;
   assert.deepEqual(style.transform.map(t=>Object.keys(t)[0]),['scale']);assert.equal(style.opacity.outputRange[2],0);
   assert.equal(animations.length,0,'no motion until window origin has been measured');
   await act(async()=>tree.root.findByProps({testID:'settings-frame'}).props.onLayout());
   assert.deepEqual(tree.root.findByProps({testID:'personal-page-surface'}).props.style.transformOrigin,[142,178,0]);
   const enter=animations.find(a=>a.config.toValue===0);assert.ok(enter.config.spring&&enter.config.useNativeDriver);assert.equal(enter.config.overshootClamping,undefined);
   await act(async()=>tree.root.findByType('Header').props.onBack());assert.equal(dispatch.length,0);
   const exit=animations.find(a=>a.config.toValue===1);assert.ok(exit.config.spring&&exit.config.useNativeDriver);assert.ok(exit.config.velocity<0);assert.equal(exit.config.overshootClamping,true);await act(async()=>exit.callback({finished:true}));assert.deepEqual(dispatch,['back']);
  }finally{await act(async()=>tree.unmount());}
 }
});

test('guide transition masks stop above the measured nav bar throughout route and return fades',async()=>{
 const ui=await tourHarness();
 try{
  await ui.advance(900);await ui.reportDock(126);
  const mask=()=>ui.tree.root.findByProps({testID:'tour-content-mask'}).props.style[1];assert.equal(mask().bottom,126);assert.equal(mask().overflow,'hidden');
  for(let i=0;i<5;i++){await ui.press('Next tour tip');await ui.advance(400);assert.equal(mask().bottom,126);}
  await ui.press('Explore LifeRPG');await ui.advance(360);assert.equal(mask().bottom,126);
 }finally{await ui.cleanup();}
});

test('Home resets while covered before navigation and again on attachment, with no scroll jump after fade completion',async()=>{
 const ui=await tourHarness({actualScroll:true});
 try{
  await ui.advance(1000);assert.ok(ui.scrolls[0].y>0);
  for(let i=0;i<5;i++){await ui.press('Next tour tip');await ui.advance(650);}
  await ui.press('Explore LifeRPG');await ui.advance(360);
  const navigate=ui.events.findLastIndex(e=>e.kind==='navigate'&&e.route==='/'),fadeIndex=ui.events.findIndex(e=>e.kind==='animate'&&e.duration===350);
  assert.ok(ui.events.slice(0,navigate).some(e=>e.kind==='scroll'&&e.y===0));
  assert.ok(ui.events.slice(navigate,fadeIndex).some(e=>e.kind==='scroll'&&e.y===0),'attached Home is already at top when it becomes visible');
  const before=ui.scrolls.length;await ui.finish(ui.animations.find(a=>a.config.duration===350));assert.equal(ui.scrolls.length,before,'no delayed restore after the cover disappears');
 }finally{await ui.cleanup();}
});

test('Home tour steps two through four remeasure full targets when suggestion height and sibling positions change',async()=>{
 const ui=await tourHarness({reduced:true});
 try{
  await ui.advance(900);
  const cases=[['home-focus',{x:20,y:170,width:350,height:310},{x:30,y:120,width:330,height:360}],['home-next-step',{x:20,y:500,width:350,height:70},{x:20,y:540,width:350,height:85}],['home-quests',{x:20,y:600,width:350,height:140},{x:20,y:500,width:350,height:210}]];
  for(const [id,initial,changed] of cases){
   await ui.press('Next tour tip');await ui.layout(id,initial);await ui.advance(120);
   const old=ui.late.at(-1);await ui.layout(id,changed);await act(async()=>old(initial));
   assert.equal(ui.tree.root.findAllByProps({testID:'tour-outline'}).length,0,'stale rectangles are hidden during remeasurement');
   await ui.advance(120);const rect=ui.tree.root.findByProps({testID:'tour-outline'}).props.style[1];
   assert.equal(rect.top,changed.y+20);assert.equal(rect.height,changed.height+8);assert.equal(rect.width,changed.width+8);
  }
 }finally{await ui.cleanup();}
});
