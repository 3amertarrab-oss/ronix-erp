'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../erp/site/assets/action-registry-r42');

const fullContext={
 lang:'ar',projectId:'PRJ-101',customerId:'C1',financePage:'projects',
 permissions:{finance:true,reports:true,projects:true,tasks:true,commercial:true,cost:true,files:true,receipts:true},
 counts:{tasks:3,files:2,projects:4}
};

test('contextual action registry covers project, customer and finance centers with unique IDs',()=>{
 const all=['project','customer','finance'].flatMap(scope=>registry.build(scope,fullContext));
 assert.equal(all.length,19);
 assert.equal(registry.validate(all).valid,true);
 assert.equal(new Set(all.map(action=>action.id)).size,all.length);
 assert.ok(all.every(action=>['navigate','record','command'].includes(action.kind)));
 assert.equal(all.find(action=>action.id==='project.cost').financePage,'costcenters');
});

test('action state follows permissions, linked records and selected context',()=>{
 const project=registry.build('project',{...fullContext,permissions:{...fullContext.permissions,finance:false},hasCommercial:false});
 assert.equal(project.find(action=>action.id==='project.finance').visible,false);
 const commercial=project.find(action=>action.id==='project.commercial');
 assert.equal(commercial.enabled,false);
 assert.match(commercial.disabledReason,/لا يمكن إدارة|cannot be managed/);
 const restricted=registry.build('project',{...fullContext,permissions:{...fullContext.permissions,commercial:false},hasFiles:false});
 assert.equal(restricted.find(action=>action.id==='project.commercial').visible,false);
 assert.equal(restricted.find(action=>action.id==='project.files').enabled,false);
 const customer=registry.build('customer',{...fullContext,customerId:'',hasFinance:false});
 assert.ok(customer.every(action=>action.enabled===false));
 assert.ok(customer.every(action=>action.disabledReason));
});

test('finance action registry has one active page and deterministic mobile priorities',()=>{
 const actions=registry.build('finance',fullContext);
 assert.deepEqual(actions.filter(action=>action.primary).map(action=>action.id),['finance.projects']);
 assert.deepEqual(actions.slice().sort((a,b)=>a.mobilePriority-b.mobilePriority).slice(0,4).map(action=>action.id),[
  'finance.dashboard','finance.projects','finance.clients','finance.claims'
 ]);
});

test('rendered dynamic actions preserve context and escape labels',()=>{
 const actions=registry.build('customer',{...fullContext,translate:()=>'<عميل & حساب>'});
 const html=registry.render(actions);
 assert.match(html,/data-customer42="C1"/);
 assert.match(html,/data-finance-page42="clients"/);
 assert.doesNotMatch(html,/<عميل/);
 assert.match(html,/&lt;عميل &amp; حساب&gt;/);
});
