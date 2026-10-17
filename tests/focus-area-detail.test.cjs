/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,cache=new Map()){
 const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(!name.startsWith('.'))return require(name);
  const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return load(path.relative(path.resolve(__dirname,'..'),target+ext),cache);
 },module,module.exports);return module.exports;
}
const {focusAreaDetail}=load('src/utils/focusAreaDetail.ts');
const NOW=new Date('2026-10-17T10:00:00Z'); // 18:00 in Kuala Lumpur
const areas=[{id:2,title:'Fitness & Health'},{id:7,title:'Grooming & Vitality'},{id:6,title:'Knowledge'},{id:9,title:'Piano'}];
const at=(day,hour=4)=>new Date(`${day}T${String(hour).padStart(2,'0')}:00:00Z`).toISOString();
const session=(id,subject,seconds,completed,extra={})=>({id,subject_id:subject,activity_type:'general',duration_seconds:seconds,xp_earned:0,gold_earned:0,completed_at:completed,...extra});

test('an area counts its legacy aliases, this week by local day, and the week before',()=>{
 const detail=focusAreaDetail(areas[0],areas,[
  session('today',2,600,at('2026-10-17')),
  session('alias',7,300,at('2026-10-11')),           // first day of the 7-day window
  session('before',2,1200,at('2026-10-10')),          // the week before
  session('older',2,60,at('2026-09-01')),             // counted in all time only
  session('other',6,999,at('2026-10-17')),            // another area
  session('late',2,120,'2026-10-16T17:30:00Z'),       // 01:30 on the 17th in Kuala Lumpur
 ],'Asia/Kuala_Lumpur',NOW);
 assert.deepEqual(detail.days.map(day=>day.day),['2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17']);
 assert.equal(detail.days[6].seconds,720);assert.equal(detail.days[0].seconds,300);
 assert.equal(detail.weekSeconds,1020);assert.equal(detail.previousWeekSeconds,1200);
 assert.equal(detail.seconds,2280);assert.equal(detail.sessions,5);
 assert.deepEqual(detail.recent.map(item=>item.id),['today','late','alias']);
});
test('abandoned, duplicated, unfinished and future sessions never count',()=>{
 const detail=focusAreaDetail(areas[3],areas,[
  session('kept',9,600,at('2026-10-15')),
  session('kept',9,600,at('2026-10-15')),
  session('abandoned',9,900,at('2026-10-15'),{status:'abandoned'}),
  session('open',9,900,null),
  session('zero',9,0,at('2026-10-15')),
  session('future',9,900,'2026-10-18T10:00:00Z'),
  session('legacy',null,900,at('2026-10-15')),
 ],'Asia/Kuala_Lumpur',NOW);
 assert.equal(detail.sessions,1);assert.equal(detail.seconds,600);assert.equal(detail.weekSeconds,600);
});
test('a custom area stands alone and an empty area reads as a calm zero',()=>{
 const detail=focusAreaDetail(areas[3],areas,[session('a',2,600,at('2026-10-15'))],'Asia/Kuala_Lumpur',NOW);
 assert.equal(detail.seconds,0);assert.equal(detail.recent.length,0);assert.equal(detail.days.length,7);
 assert.ok(detail.days.every(day=>day.seconds===0));
});
test('the sheet shows the week, recent sessions and a start button that defers to an open session',async()=>{
 const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
 const host=name=>props=>React.createElement(name,props,props.children);
 const mocks={'react-native':{View:host('View'),StyleSheet:{create:value=>value}},'@expo/vector-icons':{Ionicons:host('Icon')},'@gorhom/bottom-sheet':{BottomSheetScrollView:host('Scroll'),TouchableOpacity:host('Button')},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:20})},'./AppSheet':{__esModule:true,default:props=>React.createElement('Sheet',props,props.header,props.children,props.footer)},
  './AppText':{Text:host('Text')},'./PersonalUI':{Meter:host('Meter')}};
 const cache=new Map();
 const loadWith=file=>{const filename=path.resolve(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;const module={exports:{}};cache.set(filename,module);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name),ext=['.ts','.tsx'].find(ext=>fs.existsSync(target+ext));return loadWith(path.relative(path.resolve(__dirname,'..'),target+ext));},module,module.exports);return module.exports;};
 const Sheet=loadWith('src/components/FocusAreaDetailSheet.tsx').default;
 const detail=focusAreaDetail(areas[3],areas,[session('a',9,1500,at('2026-10-17')),session('b',9,600,at('2026-10-09'))],'Asia/Kuala_Lumpur',NOW);
 const area={id:9,title:'Piano',level:2,current:40,required:100,color:'#79BFF2'};
 const props={visible:true,area,detail,timeZone:'Asia/Kuala_Lumpur',sessionOpen:false,onFocus(){},onClose(){},onDismiss(){}};
 let tree;await act(async()=>{tree=create(React.createElement(Sheet,props));});
 const text=()=>tree.root.findAllByType('Text').map(node=>[].concat(node.props.children).join(''));
 assert.ok(text().includes('60 XP to level 3'));assert.ok(text().includes('+15m vs the week before'));
 assert.equal(tree.root.findByType('Button').props.accessibilityLabel,'Start a session in Piano');
 assert.ok(text().includes('Focus session'));
 await act(async()=>tree.update(React.createElement(Sheet,{...props,sessionOpen:true})));
 assert.equal(tree.root.findByType('Button').props.accessibilityLabel,'Return to your session');
 await act(async()=>tree.unmount());
});
