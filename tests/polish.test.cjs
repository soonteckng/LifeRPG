/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name.endsWith('/AppBuildInfo'))return()=>null;
  if(name.endsWith('/SwipeBack'))return{__esModule:true,default:props=>props.children,useSwipeOffset:()=>({get:()=>0,set(){}}),ParallaxLayer:props=>props.children,slideTo:(offset,to,duration,done)=>{(globalThis.__slides??=[]).push(to);if(globalThis.__onSlide)globalThis.__onSlide(to,done);else done?.();}};
  if(Object.hasOwn(mocks,name))return mocks[name];if(name.endsWith('/NotificationOnboardingPrompt'))return host('NotificationInvite');if(name==='expo-constants')return {expoConfig:{android:{package:'com.soonteck.liferpg'}}};if(name==='expo')return {isRunningInExpoGo:()=>false};if(name.endsWith('/NotificationOnboardingPrompt'))return host('NotificationInvitation');if(name.endsWith('/AppText'))return{Text:host('Text')};if(name.endsWith('/MotionPressable'))return host('Button');
   if(name==='expo-haptics')return {};if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks,cache);
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
 let finish,prevent,tree;globalThis.__onSlide=(to,done)=>{if(to===390)finish=()=>done?.();else done?.();};const dispatched=[],action={type:'NAVIGATE',payload:{name:'(tabs)'}};
 const navigation={canGoBack:()=>true,dispatch:value=>dispatched.push(value),goBack:()=>dispatched.push('back')};
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},View:host('View'),StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:390}),Animated:{View:host('Animated'),Value:class{setValue(){}},timing:(_,config)=>({start:callback=>{if(config.toValue===390)finish=callback;},stop(){}})}},'expo-router':{useRouter:()=>({canGoBack:()=>true}),useNavigation:()=>navigation},'expo-router/react-navigation':{usePreventRemove:(_,callback)=>{prevent=callback;}},'react-native-safe-area-context':{SafeAreaView:host('Safe'),useSafeAreaInsets:()=>({bottom:20})},'@expo/vector-icons':{Ionicons:host('Icon')},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header'),'../hooks/useReducedMotion':{useReducedMotion:()=>false}});
 await act(async()=>{tree=create(React.createElement(api.PersonalPage,{title:'Guide',subtitle:'',back:true,animateTransition:true},'Guide'));});
 try{await act(async()=>prevent({data:{action}}));assert.equal(dispatched.length,0);await act(async()=>finish({finished:true}));assert.deepEqual(dispatched,[action]);}finally{globalThis.__onSlide=undefined;await act(async()=>tree.unmount());}
});
test('alarm settings open the current app toggle directly without sending users to an unscoped application list',async()=>{
 const calls=[];
 const api=load('src/services/notificationPermissionService.ts',{'expo-intent-launcher':{ActivityAction:{REQUEST_SCHEDULE_EXACT_ALARM:'android.settings.REQUEST_SCHEDULE_EXACT_ALARM'},startActivityAsync:async(action,params)=>calls.push({action,params})},'react-native':{Platform:{OS:'android',Version:35},Linking:{sendIntent:async action=>calls.push(action),openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}});
 await api.openAlarmSettings();assert.deepEqual(calls,[{action:'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',params:{data:'package:com.soonteck.liferpg'}}]);
});
test('Android notification settings target LifeRPG and fall back to its app page on unsupported phones',async()=>{
 const calls=[];let fail=false;
 const api=load('src/services/notificationPermissionService.ts',{'react-native':{Platform:{OS:'android',Version:35},Linking:{sendIntent:async (action,extra)=>{calls.push({action,extra});if(fail)throw Error('Unsupported');},openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}});
 await api.openNotificationSettings();assert.deepEqual(calls[0],{action:'android.settings.APP_NOTIFICATION_SETTINGS',extra:[{key:'android.provider.extra.APP_PACKAGE',value:'com.soonteck.liferpg'}]});
 fail=true;await api.openNotificationSettings();assert.equal(calls.at(-1),'app-settings');
});
test('notification settings in Expo Go target the preview application instead of another LifeRPG install',async()=>{
 const calls=[];
 const api=load('src/services/notificationPermissionService.ts',{'expo':{isRunningInExpoGo:()=>true},'react-native':{Platform:{OS:'android',Version:35},Linking:{sendIntent:async()=>calls.push('intent'),openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}});
 await api.openNotificationSettings();assert.deepEqual(calls,['app-settings']);
});
test('notification actions share fixed typography and preserve descriptive accessibility labels',async()=>{
 const api=load('src/components/PersonalUI.tsx',{'react-native':{Platform:{OS:'android'},StyleSheet:{create:value=>value}},'expo-router':{},'expo-router/react-navigation':{},'react-native-safe-area-context':{},'@expo/vector-icons':{},'./FeatureTour':{TourScrollView:host('Scroll')},'./AppHeader':host('Header')});
 let tree;await act(async()=>{tree=create(React.createElement(React.Fragment,null,React.createElement(api.PersonalButton,{title:'Alarms & reminders',accessibilityLabel:'Open Alarms & reminders',onPress(){}}),React.createElement(api.PersonalButton,{title:'Notification settings',accessibilityLabel:'Open phone notification settings',onPress(){}})));});
 try{const labels=tree.root.findAllByType('Text');assert.equal(labels.length,2);for(const label of labels){assert.equal(label.props.adjustsFontSizeToFit,false);assert.equal(label.props.style[0].fontSize,16);assert.equal(label.props.style[0].lineHeight,22);}assert.deepEqual(tree.root.findAllByType('Button').map(node=>node.props.accessibilityLabel),['Open Alarms & reminders','Open phone notification settings']);}finally{await act(async()=>tree.unmount());}
});
test('daily goal sheet validates the minimum and prevents duplicate schedule writes',async()=>{
 let saves=0,resolveSave,refreshed=0,tree;
 const settings={today_goal_minutes:60,next_goal_minutes:60,next_effective_date:'2026-10-08',pending:false,scheduling_available:true,weekly_limit_available:true,can_change_goal:true};
 const api=load('src/components/DailyGoalSheet.tsx',{'react-native':{View:host('View'),Keyboard:{addListener:()=>({remove(){}})}},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:20})},'./AppSheet':host('Sheet'),'./PersonalUI':{p:{}},'@expo/vector-icons':{Ionicons:host('Icon')},'./SheetHeader':host('Header'),'../context/UserContext':{useUser:()=>({profile:{daily_goal_minutes:60,timezone:'Asia/Kuala_Lumpur'}})},'../services/dailyGoalService':{getDailyGoalSettings:async()=>settings,missingGoalAPI:()=>false,scheduleDailyGoal:async()=>{saves++;return new Promise(resolve=>{resolveSave=resolve;});}}});
 await act(async()=>{tree=create(React.createElement(api.default,{visible:true,onClose(){},onSaved(){refreshed++;}}));});
 try{
  // Short content floats as a fitted card; Save sits right under the rules.
  const sheet=()=>tree.root.findByType('Sheet'),save=()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityState?.busy!==undefined);
  assert.notEqual(sheet().props.floating,false,"sheets float by default");assert.equal(sheet().props.compact,true);assert.equal(sheet().props.footer,undefined);
  await act(async()=>tree.root.findByType('Input').props.onChangeText('29'));
  await act(async()=>save().props.onPress());assert.equal(saves,0);
  await act(async()=>tree.root.findByType('Input').props.onChangeText('90'));
  await act(async()=>{const press=save().props.onPress;press();press();});assert.equal(saves,1);assert.equal(sheet().props.guardDismiss,true);
  await act(async()=>resolveSave({...settings,next_goal_minutes:90,pending:true,can_change_goal:false}));assert.equal(refreshed,1);assert.equal(save().props.disabled,true);
 }finally{await act(async()=>tree.unmount());}
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
 const mapped=api.settingsTransform(icon,frame);assert.equal(frame.x+mapped.x,348);assert.equal(frame.y+mapped.y,54);assert.equal(mapped.scale,44/390,'it starts at the button’s own size, not a dot');
 const date=Date.now;try{Date.now=()=>date()+10_001;assert.equal(api.readSettingsOrigin(),null);}finally{Date.now=date;}
});

test('Settings waits for its frame and smoothly expands and retracts at the measured icon without rebound',async()=>{
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
   const enter=animations.find(a=>a.config.toValue===0);assert.equal(enter.config.duration,360);assert.equal(enter.config.useNativeDriver,true);assert.equal(enter.config.spring,undefined);
   await act(async()=>tree.root.findByType('Header').props.onBack());assert.equal(dispatch.length,0);
   const exit=animations.find(a=>a.config.toValue===1);assert.equal(exit.config.duration,320,'shrinking back is unhurried');assert.equal(exit.config.useNativeDriver,true);assert.equal(exit.config.spring,undefined);assert.equal(exit.config.velocity,undefined);await act(async()=>exit.callback({finished:true}));assert.deepEqual(dispatch,['back']);
  }finally{await act(async()=>tree.unmount());}
 }
});

test('exact-alarm routing uses the configured installed package and falls back if its native activity is unsupported',async()=>{
 const calls=[];let fail=false;
 const api=load('src/services/notificationPermissionService.ts',{
  'expo-constants':{expoConfig:{android:{package:'com.soonteck.liferpg.preview'}}},
  'expo-intent-launcher':{ActivityAction:{REQUEST_SCHEDULE_EXACT_ALARM:'android.settings.REQUEST_SCHEDULE_EXACT_ALARM'},startActivityAsync:async(action,params)=>{calls.push({action,params});if(fail)throw Error('ActivityNotFound');}},
  'react-native':{Platform:{OS:'android',Version:'35'},Linking:{openSettings:async()=>calls.push('app-settings')}},
  '../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'},
 });
 await api.openAlarmSettings();assert.equal(calls[0].params.data,'package:com.soonteck.liferpg.preview');
 fail=true;await api.openAlarmSettings();assert.equal(calls.at(-1),'app-settings');
});

test('an older Android binary without IntentLauncher still opens app settings without failing module import at startup',async()=>{
 const calls=[];
 const mocks={'react-native':{Platform:{OS:'android',Version:35},Linking:{openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}};
 Object.defineProperty(mocks,'expo-intent-launcher',{get(){calls.push('native-load');throw Error('Missing native module');}});
 const api=load('src/services/notificationPermissionService.ts',mocks);
 assert.deepEqual(calls,[]);
 await api.openAlarmSettings();assert.deepEqual(calls,['native-load','app-settings']);
});

test('alarm routing never imports Android IntentLauncher or guesses the LifeRPG package outside a supported installed build',async()=>{
 const cases=[{os:'ios',version:35},{os:'web',version:35},{os:'android',version:30},{os:'android',version:undefined},{os:'android',version:35,expoGo:true},{os:'android',version:35,packageName:null},{os:'android',version:35,packageName:'package:foreign.app'}];
 for(const example of cases){
  const calls=[];
  const mocks={'expo':{isRunningInExpoGo:()=>!!example.expoGo},'expo-constants':{expoConfig:{android:{package:example.packageName===undefined?'com.soonteck.liferpg':example.packageName}}},'react-native':{Platform:{OS:example.os,Version:example.version},Linking:{openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}};
  Object.defineProperty(mocks,'expo-intent-launcher',{get(){throw Error('Native module must not load');}});
  const api=load('src/services/notificationPermissionService.ts',mocks);
  await api.openAlarmSettings();assert.deepEqual(calls,['app-settings']);
 }
});

test('notification routing falls back to the current app settings when its installed package is missing or malformed',async()=>{
 for(const packageName of [null,'',123,'package:com.other.app']){
  const calls=[];
  const api=load('src/services/notificationPermissionService.ts',{'expo-constants':{expoConfig:{android:{package:packageName}}},'react-native':{Platform:{OS:'android',Version:35},Linking:{sendIntent:async()=>calls.push('unscoped-intent'),openSettings:async()=>calls.push('app-settings')}},'../utils/sessionNotifications':{getSessionNotifications:()=>null},'./sessionNotificationService':{ONGOING_CHANNEL_ID:'timer'}});
  await api.openNotificationSettings();assert.deepEqual(calls,['app-settings']);
 }
});
