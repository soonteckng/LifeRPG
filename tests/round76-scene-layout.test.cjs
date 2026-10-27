/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const mod={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/utils/focusSceneLayout.ts'),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const geometry=mod.exports.focusWalkerGeometry;
test('Round 76: every visible walker stays below the ring and above details at small/large phone sizes',()=>{
 for(const height of [640,700,720,844,915])for(const ringBottom of [height*.40,height*.55,height*.65])for(const areaBottom of [height*.65,height*.75,height*.82]){
  const g=geometry(height,{ringBottom,areaBottom});if(!g.visible)continue;
  const visibleTop=g.top+g.size*1.5*(1-g.scale)/2,visibleBottom=visibleTop+g.size*1.5*g.scale;
  assert.ok(visibleTop>=ringBottom+14-0.001);assert.ok(visibleBottom<=areaBottom-14+0.001);
 }
});
test('Round 76: missing, stale or cramped geometry hides the background walker rather than covering the ring',()=>{
 for(const band of [null,{ringBottom:400,areaBottom:420},{ringBottom:-5,areaBottom:500},{ringBottom:NaN,areaBottom:500},{ringBottom:400,areaBottom:900}])assert.equal(geometry(640,band).visible,false);
 assert.equal(geometry(640).visible,true,'standalone developer journey previews have a fallback');
});
