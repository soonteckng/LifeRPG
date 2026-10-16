/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
function setup(overrides={}) { let writes=[];const native={formatVersion:3,capabilities:async()=>({supported:true,usage:true,overlay:true,notifications:true,...overrides})};const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/services/protectedSessionStart.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)(name=>({'@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async(k,v)=>writes.push([k,v])},'react-native':{Platform:{OS:'android'}},'./nativeFocusProtection':{getSessionProtectionModule:async()=>native},'./sessionProtection':{readProtectionSelection:()=>({mode:'normal',allowed:[]})}}[name]),m,m.exports);
 return {api:m.exports,native,writes}; }
for(const key of ['usage','overlay','notifications','supported'])test('protected Start refuses missing '+key+' before writing a preference',async()=>{const h=setup({[key]:false});await assert.rejects(h.api.prepareProtectedSession('owner'),/protection/);assert.equal(h.writes.length,0);});
test('protected Start requires the finite-break native build',async()=>{const h=setup();h.native.formatVersion=2;await assert.rejects(h.api.prepareProtectedSession('owner'),/updated Android/);assert.equal(h.writes.length,0);});
test('a ready phone gets a private owner-scoped block-apps default',async()=>{const h=setup();assert.equal(await h.api.prepareProtectedSession('["backend","owner"]'),true);assert.equal(h.writes.length,1);assert.match(h.writes[0][0],/backend/);assert.deepEqual(JSON.parse(h.writes[0][1]),{mode:'essentials',allowed:[]});});
