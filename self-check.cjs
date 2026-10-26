const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the real model helpers without starting the UI or browser database.
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const model = source.slice(0, source.indexOf('const database ='));
const context = vm.createContext({
  document: {querySelector: () => ({getContext: () => ({})})},
  localStorage: {getItem: () => null},
  setTimeout, clearTimeout, console
});
vm.runInContext(model, context);
vm.runInContext(`
  nodes.push({id:'custom-parent',team:'investment',name:'Custom',parent:null,color:colors[0]});
  nodes.push({id:'custom-child',team:'investment',name:'Evidence',parent:'custom-parent',color:colors[0]});
  nodes.push({id:'custom-grandchild',team:'investment',name:'Notes',parent:'custom-child',color:colors[0]});
  imports.push({id:'uploaded',name:'Evidence <review>.md',team:'investment',type:'document',nodeIds:['custom-grandchild','investment-2'],created:Date.now(),size:10});
  imports.push({id:'other-a',name:'Zebra due diligence.pdf',team:'investment',type:'document',nodeIds:['investment-2'],created:1,size:10});
  imports.push({id:'other-b',name:'Alpha chart.png',team:'investment',type:'image',nodeIds:['investment-2'],created:2,size:10});
  imports.push({id:'partner-a',name:'Partner file.csv',team:'partners',type:'data',nodeIds:['partners-0'],created:3,size:10});
`, context);
const run = code => vm.runInContext(code, context);
assert.equal(run('teamNodes().length'), 10);
assert.equal(run("filesForNode('custom-parent')[0].id"), 'uploaded');
assert.equal(run("filesForNode('custom-parent').length"), 1);
assert.equal(run("filesForNode('investment-2').length"), 3);
assert.equal(run("selectedNode='custom-child'; filteredFiles().length"), 1);
assert.equal(run("selectedNode=null; query='due diligence'; filteredFiles().length"), 3);
assert.equal(run("query='evidence'; filteredFiles().length"), 1);
assert.equal(run("query=''; typeFilter='image'; filteredFiles().length"), 1);
assert.equal(run("typeFilter='all'; nav='inbox'; filteredFiles().length"), 0);
assert.equal(run("nav='starred'; starred.add('uploaded'); filteredFiles().length"), 1);
assert.equal(run("escapeHTML('<img src=x onerror=alert(1)>')"), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(run("team='partners'; nav='all'; allFiles().length"), 1);
assert.equal(run("team='investment'; allFiles().length"), 3);
assert.equal(run("imports.filter(f=>f.id==='uploaded').length"), 1);
assert.equal(run("page=0; pageFiles(Array.from({length:1000},(_,i)=>i)).length"),48);
assert.equal(run("page=20; pageFiles(Array.from({length:1000},(_,i)=>i)).length"),40);
assert.equal(run("page=21; pageFiles(Array.from({length:1000},(_,i)=>i)).length"),0);
assert.equal(run("nav='all'; selectedNode=null; query='evidence custom'; filteredFiles().length"),1);
assert.equal(run("query=''; imports[0].nodeIds.push('investment-1'); dataRevision++; filesForNode('investment-1').length"),1);
assert.equal(run("selectedNode='custom-parent'; filteredFiles().length"),1);
assert.equal(run("selectedNode=null; sortMode='name'; filteredFiles()[0].name"),'Alpha chart.png');
console.log('21 model checks passed: hierarchy, multi-node links, search, filters, escaping, template isolation, pagination, sorting, and index invalidation.');
