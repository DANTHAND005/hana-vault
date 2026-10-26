const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const routing=source.slice(source.indexOf('// Pointer routing'),source.indexOf("document.addEventListener('dragover'"));
const documentEvents={},windowEvents={},timers=[],connections=[];
const classes=()=>{const set=new Set();return {set,add:x=>set.add(x),remove:x=>set.delete(x)};};
const bodyClasses=classes(),nodeClasses=classes();
const card={dataset:{file:'original-file'}};
const node={dataset:{node:'destination'},classList:nodeClasses};
const target={closest:()=>node};
const context=vm.createContext({
  document:{body:{classList:bodyClasses},addEventListener:(type,fn)=>documentEvents[type]=fn,elementFromPoint:()=>target},
  window:{addEventListener:(type,fn)=>windowEvents[type]=fn},
  nodeById:id=>id==='destination'?node:null,
  connectFile:(id,destination)=>connections.push([id,destination]),toast:()=>{},
  setTimeout:fn=>timers.push(fn),Math
});
vm.runInContext(routing,context);
const event=(x,y,type='mouse')=>({target:{closest:()=>card},pointerType:type,button:0,pointerId:1,clientX:x,clientY:y});
documentEvents.pointerdown(event(0,0));documentEvents.pointermove(event(3,3));documentEvents.pointerup(event(3,3));
assert.equal(connections.length,0,'A small click movement must not add a connection');
documentEvents.pointerdown(event(0,0));documentEvents.pointermove(event(20,10));
assert.ok(bodyClasses.set.has('routing-file'));
assert.ok(nodeClasses.set.has('drop-target'));
documentEvents.pointerup(event(20,10));
assert.deepEqual(connections,[['original-file','destination']]);
assert.equal(bodyClasses.set.size,0);assert.equal(nodeClasses.set.size,0);
let prevented=false,stopped=false;
documentEvents.click({preventDefault:()=>prevented=true,stopImmediatePropagation:()=>stopped=true});
assert.ok(prevented&&stopped,'Completing a drag must not trigger a file preview or node navigation');
timers.splice(0).forEach(fn=>fn());
documentEvents.pointerdown(event(0,0,'touch'));documentEvents.pointermove(event(20,20,'touch'));documentEvents.pointerup(event(20,20,'touch'));
assert.equal(connections.length,1,'Touch scrolling must use the explicit connection dialog instead of starting a drag');
documentEvents.pointerdown(event(0,0));documentEvents.pointermove(event(20,20));windowEvents.pointercancel();documentEvents.pointerup(event(20,20));
assert.equal(connections.length,1,'Cancelled gestures must not write connections');
assert.equal(bodyClasses.set.size,0);
console.log('Pointer routing checks passed: movement threshold, commit, click suppression, touch fallback, and cancellation cleanup.');
