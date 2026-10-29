/* global __dirname */
// Real components, both with and without the production React compiler. No cloud calls.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), babel = require('@babel/core');
const React = require('react'), {act, create} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
function loader(mocks, compiled) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports:{}}; cache.set(filename,module);
    let source = fs.readFileSync(filename,'utf8');
    if (compiled && /(?:ArrivalBanner|SessionResultSheet)\.tsx$/.test(filename)) {
      source = babel.transformSync(source,{filename,configFile:false,babelrc:false,parserOpts:{plugins:['typescript','jsx']},
        plugins:[[require.resolve('babel-plugin-react-compiler'),{target:'19'}]]}).code;
      assert.match(source,/react\/compiler-runtime/,'production compilation remains enabled');
    }
    const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','module','exports',js)(name => {
      if (Object.hasOwn(mocks,name)) return mocks[name];
      if (!name.startsWith('.')) return require(name);
      const target=path.resolve(path.dirname(filename),name), suffix=['','.ts','.tsx'].find(ext=>fs.existsSync(target+ext)&&fs.statSync(target+ext).isFile());
      return load(path.relative(root,target+suffix));
    },module,module.exports);
    return module.exports;
  }
  return load;
}

for (const compiled of [false,true]) {
  const mode=compiled?'production compiler':'uncompiled control';
  test(`identical arrival layout events do not schedule result-scene commits (${mode})`,async()=>{
    let renders=0, commits=0, tree;
    const svg=props=>{renders++;return React.createElement('Svg',props,props.children);};
    const load=loader({'react-native':{View:host('View'),StyleSheet:{create:value=>value}},
      'react-native-svg':{__esModule:true,default:svg,Circle:host('Circle'),Defs:host('Defs'),LinearGradient:host('Gradient'),Path:host('Path'),Rect:host('Rect'),Stop:host('Stop')},
      '@expo/vector-icons':{Ionicons:host('Icon')},'./AppText':{Text:host('Text')},},compiled);
    const Banner=load('src/components/ArrivalBanner.tsx').default;
    await act(async()=>{tree=create(React.createElement(React.Profiler,{id:'arrival',onRender:()=>commits++},React.createElement(Banner,{seconds:60,title:'Read a page'})));});
    try {
      const measure=async(width,height)=>act(async()=>tree.root.findByProps({testID:'session-arrival'}).props.onLayout({nativeEvent:{layout:{width,height}}}));
      await measure(320,132); const initial=renders, settled=commits;
      await measure(320,132); await measure(320,132); await measure(320,132);
      assert.equal(commits,settled,'unchanged native geometry must not schedule more React commits during the sheet entrance');
      assert.equal(renders,initial,'sheet measurements with unchanged geometry must not rebuild the SVG scene');
      await measure(320,210);assert.equal(tree.root.findByType('Svg').props.height,210,'large text still grows the scene');
    }finally{await act(async()=>tree.unmount());}
  });
}
