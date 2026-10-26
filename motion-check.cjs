const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const fn=source.slice(source.indexOf('function animateCamera('),source.indexOf('\nlet panelAnimation;'));
let frameRequests=0,draws=0;
const context=vm.createContext({
  performance:{now:()=>0},matchMedia:()=>({matches:true}),
  requestAnimationFrame:()=>{frameRequests++;},cancelAnimationFrame:()=>{},
  drawMap:()=>{draws++;}
});
vm.runInContext('let yaw=0,tilt=0,zoom=1,cameraFrame=0;'+fn,context);
vm.runInContext('animateCamera({yaw:.3,tilt:.2,zoom:1.15})',context);
assert.equal(frameRequests,0,'Reduced motion must not schedule animated camera frames');
assert.equal(draws,1,'Reduced motion must apply the final state in one draw');
assert.equal(vm.runInContext('zoom',context),1.15);
console.log('Reduced-motion check passed: final camera state applied immediately, with no animation frames.');
