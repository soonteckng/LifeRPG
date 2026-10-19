/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks){const filename=path.resolve(__dirname,'..',file);const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>mocks[name]??require(name),module,module.exports);return module.exports;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('the session trail keeps the latest 300 events on this phone and shares them oldest first',async()=>{
 const store=new Map([['liferpg:session-trail:v1',JSON.stringify([{at:0,event:'earlier'}])]]);
 const storage={getItem:async key=>store.get(key)??null,setItem:async(key,value)=>{store.set(key,value);}};
 const trail=load('src/services/sessionTrail.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage}});
 for(let i=0;i<305;i++)trail.sessionTrail('timer',{n:i});
 for(let i=0;i<5;i++)await settle();
 const saved=JSON.parse(store.get('liferpg:session-trail:v1'));
 assert.equal(saved.length,300,'bounded');assert.equal(saved.at(-1).detail.n,304,'newest kept');
 const text=await trail.readSessionTrail();
 assert.equal(text.split('\n').length,300);assert.match(text.split('\n')[0],/timer \{"n":5\}/);assert.doesNotMatch(text,/earlier/,'the oldest fall away first');
});
test('a storage failure never reaches the session',async()=>{
 const trail=load('src/services/sessionTrail.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async()=>{throw Error('disk');},setItem:async()=>{throw Error('disk');}}}});
 assert.doesNotThrow(()=>trail.sessionTrail('app',{state:'active'}));
 for(let i=0;i<5;i++)await settle();
 assert.match(await trail.readSessionTrail(),/app \{"state":"active"\}/);
});
