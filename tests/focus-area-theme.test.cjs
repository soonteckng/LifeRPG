const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,mod,mod.exports);return mod.exports;}
const areas=load('src/utils/focusAreas.ts'),theme=load('src/constants/theme.ts').colors;
test('focus area labels preserve saved IDs and resolve real categories before honest fallback',()=>{
 const saved=[{id:1,title:'General',current_xp:34,level:2},{id:2,title:'Knowledge',level:5,current_xp:12},{id:3,title:'Life Admin'},{id:8,title:'My ceramics'}],copy=JSON.stringify(saved);
 assert.equal(areas.focusAreaTitle(saved[1].title),'Learning');assert.equal(areas.focusAreaTitle(saved[3].title),'My ceramics');assert.equal(areas.suggestedArea(saved,'learning').id,2);assert.equal(areas.suggestedArea(saved,'personal').id,3);
 assert.equal(areas.suggestedArea(saved,'work').id,1);assert.equal(areas.suggestedArea([...saved,{id:9,title:'Work'}],'work').id,9);assert.equal(areas.suggestedArea([], 'creative'),undefined);assert.equal(JSON.stringify(saved),copy);
});
function luminance(hex){const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('dark theme body, actions and quiet labels retain readable contrast on layered surfaces',()=>{
 for(const background of [theme.background,theme.surface,theme.surfaceRaised])for(const foreground of [theme.text,theme.secondary,theme.muted,theme.accent])assert.ok(contrast(foreground,background)>=4.5,foreground+' on '+background);
 assert.ok(contrast(theme.primaryText,theme.primary)>=7);assert.ok(contrast(theme.text,theme.selection)>=4.5);
});
