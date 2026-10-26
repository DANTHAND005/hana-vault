const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const context = vm.createContext({
  document: {querySelector: () => ({getContext: () => ({})})},
  localStorage: {getItem: () => null}, setTimeout, clearTimeout, console
});
vm.runInContext(source.slice(0, source.indexOf('const database =')), context);
const graphStart = source.indexOf('function graphData()');
vm.runInContext(source.slice(graphStart, source.indexOf('\nlet graph ', graphStart)), context);
vm.runInContext(`
  for (let i=0;i<1000;i++) imports.push({id:'scale-'+i,name:'Research '+String(i).padStart(4,'0')+(i%2?'.png':'.md'),type:i%2?'image':'document',team:'investment',nodeIds:['investment-'+(i%7)],created:i,size:100});
`, context);
function measure(code) {const start=performance.now();const result=vm.runInContext(code,context);return {result,ms:Math.round((performance.now()-start)*100)/100};}
const report = {
  dataset: '1,000 synthetic file metadata records',
  overview: measure('graphData().points.length'),
  focusedFilter: measure("selectedNode='investment-2'; filteredFiles().length"),
  focusedGraph: measure('graphData().points.length'),
  search: measure("selectedNode=null; query='research 0999'; filteredFiles().length"),
  mobileGraph: measure("globalThis.innerWidth=375; query=''; selectedNode='investment-2'; graphData().points.length")
};
assert.equal(report.focusedFilter.result,143);
assert.equal(report.search.result,1);
assert.equal(report.overview.result, 1 + 7 + 1000, 'Overview must show every file');
assert.equal(report.focusedGraph.result, 1 + 143, 'Focused map must show every file');
assert.ok(report.overview.ms < 1000, 'Overview must build in under a second');
console.log(JSON.stringify(report,null,2));
