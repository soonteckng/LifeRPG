const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const host=name=>function Host(props){return React.createElement(name,props,props.children);};
function load(file,mocks={}){const filename=path.resolve(__dirname,'..',file),mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const target=path.resolve(path.dirname(filename),name);const ext=['.ts','.tsx'].find(e=>fs.existsSync(target+e))??'.ts';return load(path.relative(path.resolve(__dirname,'..'),target+ext),mocks);},mod,mod.exports);return mod.exports;}
test('email syntax catches malformed addresses while preserving common aliases and international domains',()=>{const{validEmail}=load('src/utils/passwordRecovery.ts');for(const email of ['  hero+study@example.invalid  ',"a.b'c@sub.school.edu",'学生@学校.cn','name@xn--bcher-kva.de'])assert.equal(validEmail(email),true,email);for(const email of ['', 'name', 'a@@gmail.com','a..b@gmail.com','.name@gmail.com','name.@gmail.com','a@-gmail.com','a@gmail-.com','a@gmail..com','a@gmail.com/extra','a@gmail.com\\extra','a@g%6dail.com','a@domain','a@domain.com\nother','a'.repeat(65)+'@gmail.com'])assert.equal(validEmail(email),false,email);});
test('email integration fixture guard refuses the production and hosted Supabase endpoints',()=>{const{assertLocalAuthTestTarget}=require('./helpers/auth-email-test-guard.cjs');assert.equal(assertLocalAuthTestTarget('http://127.0.0.1:54321/auth/v1'),'http://127.0.0.1:54321');for(const url of ['https://msuelivxpsfizkddjjfg.supabase.co','https://staging.supabase.co','http://localhost.attacker.invalid','https://user:password@localhost'])assert.throws(()=>assertLocalAuthTestTarget(url),/Refusing/);});

test('the test runner blocks external fetch and socket connections before they can send an email',async()=>{
 const {assertLocalHost}=require('./helpers/no-external-network.cjs');
 for(const host of ['localhost','127.0.0.1','::1','[::1]']) assert.doesNotThrow(()=>assertLocalHost(host));
 for(const host of ['msuelivxpsfizkddjjfg.supabase.co','staging.supabase.co','localhost.attacker.invalid','127.0.0.2']) assert.throws(()=>assertLocalHost(host),/refuse external/);
 await assert.rejects(fetch('https://msuelivxpsfizkddjjfg.supabase.co/auth/v1/signup'),/refuse external/);
 assert.throws(()=>require('node:net').connect({host:'msuelivxpsfizkddjjfg.supabase.co',port:443}),/refuse external/);
});
test('invalid signup and sign-in never contact authentication, and duplicate valid submissions stay single-flight',async()=>{
 for(const mode of ['sign-up','sign-in']){
  const calls=[],focuses=[];let finish;const pending=new Promise(resolve=>finish=resolve);
  const Frame=Object.assign(({children,primary,onNext})=>React.createElement('Frame',null,React.createElement('Next',{onPress:onNext,label:primary}),children),{useOnboardingTransition:()=>({opacity:{},moving:false,change:fn=>fn()})});
  const Screen=load('src/components/AuthScreen.tsx',{'react-native':{View:host('View'),Keyboard:{dismiss(){}},Platform:{OS:'android'},ActivityIndicator:host('Spinner')},'./MotionPressable':host('Link'),'./AppText':{Text:host('Text'),TextInput:host('Input')},'./PasswordInput':host('Input'),'./CharacterPortrait':host('Portrait'),'./PersonalUI':{p:{},PersonalButton:host('Button')},
   './AuthFormFrame':props=>props.children({tight:false,active:'email',focus:name=>focuses.push(name),blur(){},layout(){}}),
   './OnboardingWelcome':({onDone})=>{React.useEffect(()=>{onDone();},[onDone]);return null;},'./OnboardingFrame':Frame,'./IdeaAreaPicker':host('Areas'),
   '../services/authSettings':{useAuthSettings:()=>({google:false})},'../services/nativeFocusProtection':{getSessionProtectionModule:async()=>null},
   '@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}},
   '@expo/vector-icons':{Ionicons:host('Icon')},
   '../context/AuthContext':{useAuth:()=>({googleStatus:'idle',clearGoogleStatus(){},signIn:async(...args)=>{calls.push(args);return pending;},signUp:async(...args)=>{calls.push(args);return pending;}})}}).default;
  let tree;await act(async()=>{tree=create(React.createElement(Screen,{initialMode:mode}));});
  try{
   if(mode==='sign-up')await act(async()=>tree.root.findByType('Next').props.onPress());
   const label=mode==='sign-up'?'Email':'Email or username';
   const input=name=>tree.root.findAllByType('Input').find(n=>n.props.accessibilityLabel===name);
   await act(async()=>{input(label).props.onChangeText('bad..address@gmail.com');input('Password').props.onChangeText('valid-password');});
   await act(async()=>tree.root.findByType('Button').props.onPress());
   assert.deepEqual(calls,[]);assert.ok(focuses.includes(mode==='sign-up'?'email':'identifier'));
   assert.match(JSON.stringify(tree.toJSON()),mode==='sign-up'?/Enter a real email address/:/Check your email address/);
   await act(async()=>input(label).props.onChangeText(' fixture@example.invalid '));
   await act(async()=>{const submit=tree.root.findByType('Button').props.onPress;submit();submit();});
   assert.equal(calls.length,1);assert.equal(calls[0][0],'fixture@example.invalid');
   await act(async()=>finish({error:null,needsEmailConfirmation:mode==='sign-up'}));
  }
  finally{await act(async()=>tree.unmount());}
 }
});
