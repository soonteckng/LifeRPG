const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>props=>React.createElement(name,props,props.children);
function load(file,mocks={},cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name.endsWith('/MotionPressable'))return host('Button');
  if(name.endsWith('/AppText'))return {Text:host('Text')};
  if(name.endsWith('/SlidingSelection'))return ()=>null;
  if(name.endsWith('/SheetConfirmation'))return ()=>null;
  if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),extension=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));
  return load(path.relative(path.resolve(__dirname,'..'),target+extension),mocks,cache);
 },module,module.exports);return module.exports;
}
const content=node=>typeof node==='string'?node:(node.children??[]).map(content).join('');
const native={View:host('View'),StyleSheet:{create:value=>value,hairlineWidth:0.5},ActivityIndicator:host('Spinner')};
const sheet=props=>props.visible?React.createElement('Sheet',props,props.header,props.children,props.footer,props.overlay):null;

test('character tiers use the saved XP curve, have exact boundaries and keep growing beyond the last tier',()=>{
 const api=load('src/utils/levelTiers.ts');assert.equal(api.LEVEL_TIERS.length,12);
 assert.equal(api.requiredCharacterXP(1),100);assert.equal(api.requiredCharacterXP(2),282);assert.equal(api.requiredCharacterXP(3),519);
 for(const tier of api.LEVEL_TIERS){let expected=0;for(let level=1;level<tier.level;level++)expected+=api.requiredCharacterXP(level);assert.equal(tier.totalXP,expected);assert.equal(api.levelTierProgress(tier.level,0).current.title,tier.title);if(tier.level>1){const prior=api.levelTierProgress(tier.level-1,api.requiredCharacterXP(tier.level-1)-1);assert.equal(prior.remainingXP,1);assert.ok(prior.fraction<1);}}
 assert.equal(api.levelTierProgress(1,40).remainingXP,342);assert.equal(api.levelTierProgress(1,40).fraction,40/382);
 const gaps=api.LEVEL_TIERS.slice(1).map((tier,i)=>tier.level-api.LEVEL_TIERS[i].level);assert.ok(gaps.every((gap,i)=>i===0||gap>gaps[i-1]));assert.equal(api.LEVEL_TIERS.at(-1).level,100);
 for(let level=2;level<=100;level++)assert.ok(api.requiredCharacterXP(level)>api.requiredCharacterXP(level-1));
 assert.equal(api.levelTierProgress(1000000,700).next,null);assert.equal(api.levelTierProgress(NaN,-1).current.level,1);
});

test('tier path renders all stages with one current tier and a clear next target',async()=>{
 const api=load('src/components/LevelTierSheet.tsx',{'react-native':native,'@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll')},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:16})},'./AppSheet':sheet});
 let tree;await act(async()=>{tree=create(React.createElement(api.default,{visible:true,onClose(){},level:3,currentXP:100}));});
 try{assert.match(content(tree.root),/Spark/);assert.match(content(tree.root),/Next tier: Momentum at level 6/);assert.doesNotMatch(content(tree.root),/total XP|more XP|XP to level/);const stages=tree.root.findAllByType('View').filter(node=>node.props.accessibilityLabel?.includes(', Level'));assert.equal(stages.length,12);assert.equal(stages.filter(node=>node.props.accessibilityLabel.includes('current tier')).length,1);assert.equal(tree.root.findByType('Sheet').props.expanded,true);}finally{await act(async()=>tree.unmount());}
});

test('30/60 presets and Custom respect disabled state and the haptic preference while retaining short custom timers',async()=>{
 let enabled=true,haptics=0;const changes=[];
 const Control=load('src/components/FocusLengthControl.tsx',{'react-native':native,'expo-haptics':{selectionAsync:async()=>{haptics++;}},'../context/UserContext':{useUser:()=>({hapticsEnabled:enabled})},'./FocusDurationSheet':host('CustomSheet')}).default;
 let props={seconds:1800,onChange:value=>changes.push(value)},tree;await act(async()=>{tree=create(React.createElement(Control,props));});
 const button=label=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel===label);
 try{
  assert.equal(button('Use 10 minutes'),undefined);await act(async()=>button('Use 30 minutes').props.onPress());assert.equal(haptics,0);
  await act(async()=>button('Use 60 minutes').props.onPress());assert.deepEqual(changes,[3600]);assert.equal(haptics,1);
  props={...props,seconds:3600};enabled=false;await act(async()=>tree.update(React.createElement(Control,props)));await act(async()=>button('Use 30 minutes').props.onPress());assert.equal(haptics,1);
  enabled=true;props={...props,seconds:600,disabled:true};await act(async()=>tree.update(React.createElement(Control,props)));assert.equal(button('Set a custom focus duration').props.accessibilityState.selected,true);assert.equal(content(button('Set a custom focus duration')),'10 min');await act(async()=>button('Use 60 minutes').props.onPress());assert.equal(changes.length,2);
  props={...props,disabled:false};await act(async()=>tree.update(React.createElement(Control,props)));await act(async()=>button('Set a custom focus duration').props.onPress());assert.equal(haptics,2);assert.equal(tree.root.findByType('CustomSheet').props.seconds,600);
 }finally{await act(async()=>tree.unmount());}
});

test('area choices reconcile duplicate cached names without losing the selected real ID or canonical quest attribution',()=>{
 const api=load('src/utils/focusAreas.ts'),draft=load('src/utils/questDraft.ts');
 const areas=[{id:1,title:'General'},{id:2,title:'Fitness & Health'},{id:3,title:'Grooming & Vitality'},{id:4,title:'Knowledge'}];
 assert.deepEqual(api.focusAreaChoices(areas,3).map(area=>[area.id,api.focusAreaTitle(area.title)]),[[1,'Everyday focus'],[4,'Learning'],[3,'Wellbeing']]);assert.equal(areas.length,4);
 const canonical=api.FOCUS_AREAS.map((area,index)=>({...area,id:index+10}));assert.equal(api.focusAreaChoices(canonical).length,6);
 assert.equal(draft.questParams(draft.makeQuestDraft(),canonical,null).subjectId,10);
 const directions=load('src/constants/guidedQuests.ts').FOCUS_DIRECTIONS.map(direction=>direction.title);assert.deepEqual(directions,api.FOCUS_AREAS.slice(1).map(area=>area.title));
});

test('quest scope switches give haptics and custom minutes are revealed after keyboard and content layout changes',async()=>{
 let enabled=true,haptics=0;const events=new Map(),scrolls=[];
 const Scroll=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({scrollTo:value=>scrolls.push(value)}));return React.createElement('Scroll',props,props.children);});
 const Sheet=load('src/components/QuestSheet.tsx',{'react-native':{...native,Keyboard:{dismiss(){},addListener:(name,fn)=>{events.set(name,fn);return{remove:()=>events.delete(name)};}}},'@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:Scroll,BottomSheetTextInput:host('Input'),TouchableOpacity:host('Button')},'expo-haptics':{selectionAsync:async()=>{haptics++;}},'expo-router':{useRouter:()=>({})},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:24})},'../context/QuestContext':{useQuests:()=>({tasks:[],subjects:[],refresh:async()=>{}})},'../context/UserContext':{useUser:()=>({hapticsEnabled:enabled})},'../context/TimerContext':{useTimer:()=>({})},'../services/taskService':{},'./AppSheet':sheet}).default;
 let tree;await act(async()=>{tree=create(React.createElement(Sheet,{visible:true,onClose(){}}));});
 const press=async label=>act(async()=>tree.root.findAllByType('Button').find(node=>node.props.accessibilityLabel===label||content(node)===label).props.onPress());
 try{
  await press('All quests');assert.equal(haptics,1);await press('All quests');assert.equal(haptics,1);enabled=false;await act(async()=>tree.update(React.createElement(Sheet,{visible:true,onClose(){}})));await press('Today');assert.equal(haptics,1);await press('Add quest');await press('Custom');
  const editor=tree.root.findAllByType('Sheet').find(node=>node.props.label==='quest editor');assert.equal(editor.props.expanded,true);assert.equal(editor.props.keyboardBehavior,'fillParent');
  const duration=tree.root.findAllByType('View').find(node=>node.props.onLayout);await act(async()=>duration.props.onLayout({nativeEvent:{layout:{y:172}}}));
  const input=tree.root.findAllByType('Input').find(node=>node.props.accessibilityLabel==='Custom duration in minutes');await act(async()=>input.props.onFocus());await act(async()=>events.get('keyboardDidShow')());
  const scroll=tree.root.findAllByType('Scroll').find(node=>node.props.onContentSizeChange);await act(async()=>scroll.props.onContentSizeChange(300,800));assert.deepEqual(scrolls.at(-1),{y:160,animated:false});
  const list=tree.root.findAllByType('Sheet').find(node=>node.props.label==='quests');assert.equal(list.props.compact,true);assert.equal(list.props.maxHeightRatio,.60);assert.equal(list.props.expanded,undefined);assert.equal(list.props.heightRatio,undefined);
  assert.equal(tree.root.findAllByType('Scroll')[0].props.contentContainerStyle.paddingBottom,48);
 }finally{await act(async()=>tree.unmount());}
});

test('focus-card preview keeps the same layout from tour step one through four',async()=>{
 let previewFocus=true,targetId='home-identity';
 const Card=load('src/components/FocusCard.tsx',{'react-native':native,'@expo/vector-icons':{Ionicons:host('Icon')},'./ContentReveal':host('Reveal'),'./FocusLengthControl':()=>null,'./FocusAreaSheet':()=>null,'./FeatureTour':{useFeatureTour:()=>({previewFocus,targetId,previewLines:2})}}).default;
 const props={cardID:'card',title:'A suggestion',instruction:'A longer suggestion description',label:'Suggested focus',contentKey:'same',area:'Learning',seconds:1800};
 let tree;await act(async()=>{tree=create(React.createElement(Card,props));});
 try{const layout=()=>tree.root.findByProps({testID:'card'}).props.style;const first=layout();
  for(const id of ['home-focus','home-next-step','home-quests']){targetId=id;await act(async()=>tree.update(React.createElement(Card,props)));assert.deepEqual(layout(),first);const instruction=tree.root.findAllByType('Text').find(node=>content(node)===props.instruction);assert.equal(instruction.props.numberOfLines,2);}
  previewFocus=false;await act(async()=>tree.update(React.createElement(Card,props)));assert.equal(layout()[1],false,'normal full card returns underneath the return cover');
 }finally{await act(async()=>tree.unmount());}
});
