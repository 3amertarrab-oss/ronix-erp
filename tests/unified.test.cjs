'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const U=require('../erp/unified'),D=require('../erp/domain');
const owner={id:'owner',role:'Owner'},acc={id:'acc',role:'Accountant'},engineer={id:'eng',role:'Engineer'};
function fixture(){const d=D.normalizeBackup(JSON.parse(fs.readFileSync(path.join(__dirname,'../erp/data/initial-backup.json'))));d.masters.customers.push({id:'C1',name:'Test Customer'});d.data.push({id:'PRJ-101',name:'Test Project',customerId:'C1',client:'Test Customer',tasks:[],value:0,invoice:0,paid:0,projectDraft:true});return d;}
function draft(currency='EGP',kind='quote'){return {schema:'ronix-commercial-draft',version:1007,state:{kind,path:'execution',currency,client:'Test Customer',project:'Test Project',reference:'TEST-'+kind+'-'+currency,date:'2026-11-02',example:false,discount:0,vat:false,vatRate:14,stamp:false,stampRate:0,payments:[{label:'Advance',percent:50},{label:'Delivery',percent:50}],items:[{id:'roof',name:'Roof',on:true,scope:'تركيب فقط',unit:'m2',qty:2,rate:100,priceMode:'priced'}],engineering:[],terms:[]}};}
function saved(d,kind='quote',currency='EGP'){return U.saveDocument(d,owner,{baseRevision:U.root(d).commercial.revision,projectId:'PRJ-101',customerId:'C1',draft:draft(currency,kind)});}
function financePayload(o={}){const code=o.code||'FIN-1',client=o.client||'Finance Client',customerId=o.customerId||'FC-1',project={code,name:o.name||'Finance Project',client,contract:o.contract??100,state:'نشط',kind:'تنفيذ'};if(o.unifiedSourceId)project.unifiedSourceId=o.unifiedSourceId;return U.R.validate(U.R.normalize({projects:[project],customers:[{id:customerId,name:client,phone:'',email:'',note:''}],assignments:[{id:o.assignmentId||'AS-1',code,designer:'Designer A',fee:100,kind:'تصميم'}],payments:[{id:o.paymentId||'PAY-1',code,designer:'Designer A',amount:o.paymentAmount??30,date:'2026-11-01',method:'cash',ref:'R1',note:''}],documentNumbers:[{id:o.documentId||'SEQ-1',kind:'payment',number:o.documentNumber??1}]}));}
test('approved 1007 pricing: discount, VAT, stamp, free items, engineering and precision',()=>{
 const s=draft().state;s.discount=10;s.vat=true;s.stamp=true;s.stampRate=1;
 assert.deepEqual(Object.fromEntries(Object.entries(U.amounts(s)).filter(([k])=>k!=='lines')),{subtotal:200,discount:10,net:190,vat:27,stamp:2,total:219});
 s.items[0].priceMode='free';s.discount=0;assert.equal(U.amounts(s).total,0);
 s.path='engineering';s.currency='USD';s.engineering=[{id:'design',name:'Design',unit:'item',qty:3,rate:1.11,on:true}];s.vat=false;s.stamp=false;
 assert.equal(U.amounts(s).total,3.33);
 s.engineering[0].rate=-1;assert.throws(()=>U.amounts(s));
});
test('trim pricing follows approved linked roof rate',()=>{const s=draft().state;s.terms=[{name:'الحليات',on:true,value:'تُحاسب بالمتر الطولي وبنفس سعر تركيب المتر المسطح للألواح.'}];s.items.push({id:'trims',name:'Trims',on:true,scope:'تركيب فقط',unit:'m',qty:3,rate:999});assert.equal(U.amounts(s).total,500);});
test('milestone rounding matches 1007 largest-remainder distribution',()=>{const d=fixture(),b=draft();b.state.items[0].qty=1;b.state.items[0].rate=1;b.state.payments=[{label:'A',percent:33.33},{label:'B',percent:33.33},{label:'C',percent:33.34}];const r=U.saveDocument(d,owner,{baseRevision:0,projectId:'PRJ-101',customerId:'C1',draft:b});U.approve(d,owner,{baseRevision:1,id:r.document.id});assert.deepEqual(U.paymentAmounts(b.state),[0,0,1]);assert.deepEqual(D.W.milestoneAmounts({type:'quote',doc:d.commercial.quotes[0]}).map(r=>r.amount),[0,0,1]);});
test('documents require existing project/customer and stable identities',()=>{const d=fixture(),b={baseRevision:0,projectId:'missing',customerId:'C1',draft:draft()};assert.throws(()=>U.saveDocument(d,owner,b));b.projectId='PRJ-101';b.draft.state.client='Other';assert.throws(()=>U.saveDocument(d,owner,b));});
test('optimistic document concurrency and immutable approval',()=>{const d=fixture(),r=saved(d);assert.throws(()=>saved(d),e=>e.status===409);const a=U.approve(d,owner,{baseRevision:1,id:r.document.id});assert.equal(a.document.status,'approved');assert.equal(D.W.total(d.commercial.quotes[0],'quote'),200);assert.throws(()=>U.saveDocument(d,owner,{baseRevision:2,id:r.document.id,projectId:'PRJ-101',customerId:'C1',draft:draft()}),e=>e.status===409);assert.throws(()=>U.approve(d,acc,{baseRevision:2,id:r.document.id}),e=>e.status===403);});
test('handoff to approved accounting is idempotent and preserves currency',()=>{const d=fixture(),r=saved(d,'contract','USD');U.approve(d,owner,{baseRevision:1,id:r.document.id});assert.throws(()=>U.handoff(d,acc,{baseRevision:2,financeRevision:0,id:r.document.id,rate:0}));const b={baseRevision:2,financeRevision:0,id:r.document.id,rate:50};const a=U.handoff(d,acc,b),again=U.handoff(d,acc,b);assert.equal(again.replayed,true);assert.equal(U.root(d).finance.payload.projects.length,1);const p=U.root(d).finance.payload.projects[0];assert.equal(p.contractCurrency,'USD');assert.equal(p.originalContract,200);assert.equal(p.contract,10000);assert.equal(a.financeCode,'PRJ-101');assert.equal(U.projection(d,d.data[0]).value,10000);});
test('finance conflicts cannot overwrite newer changes and malformed records fail',()=>{const d=fixture(),payload=U.R.normalize({projects:[],assignments:[],payments:[]});U.saveFinance(d,acc,{baseRevision:0,payload});assert.throws(()=>U.saveFinance(d,acc,{baseRevision:0,payload}),e=>e.status===409);assert.throws(()=>U.saveFinance(d,engineer,{baseRevision:1,payload}),e=>e.status===403);assert.throws(()=>U.saveFinance(d,acc,{baseRevision:1,payload:{projects:'wrong'}}));});
test('migration preview is read only and does not infer matches by project name',()=>{const d=fixture(),before=JSON.stringify(d),payload=U.R.normalize({projects:[{code:'other',name:'Test Project',client:'Test Customer',contract:200}],assignments:[],payments:[]});const report=U.migration(payload,d);assert.equal(report.kind,'finance-v20');assert.equal(report.matches.length,0);assert.equal(report.unmatched.length,1);assert.equal(JSON.stringify(d),before);});
test('finance import adds only new records and preserves the current valid database',()=>{
 const d=fixture(),current=financePayload(),incoming=financePayload({code:'FIN-2',client:'Finance Client B',customerId:'FC-2',name:'Finance Project B',assignmentId:'AS-2',paymentId:'PAY-2',documentId:'SEQ-2',documentNumber:2});
 U.saveFinance(d,owner,{baseRevision:0,payload:current});const before=JSON.parse(JSON.stringify(U.root(d).finance.payload)),preview=U.financeImportPreview(d,owner,incoming);
 assert.equal(preview.conflicts.length,0);assert.equal(preview.add.projects,1);assert.equal(preview.add.customers,1);assert.equal(preview.counts.candidate.projects,2);
 const result=U.financeImportCommit(d,owner,incoming,preview),merged=U.root(d).finance.payload;
 assert.equal(result.replayed,false);assert.equal(merged.projects.length,2);assert.equal(merged.customers.length,2);assert.deepEqual(merged.projects.find(x=>x.code==='FIN-1'),before.projects[0]);assert.deepEqual(merged.payments.find(x=>x.id==='PAY-1'),before.payments[0]);
});
test('finance import treats identical data as identical and replays the same import once',()=>{
 const d=fixture(),payload=financePayload();U.saveFinance(d,owner,{baseRevision:0,payload});const preview=U.financeImportPreview(d,owner,payload);
 assert.equal(preview.conflicts.length,0);assert.equal(preview.add.projects,0);assert.equal(preview.identical.projects,1);assert.equal(preview.identical.payments,1);
 const first=U.financeImportCommit(d,owner,payload,preview),revision=U.root(d).finance.revision,counts={projects:U.root(d).finance.payload.projects.length,payments:U.root(d).finance.payload.payments.length,imports:U.root(d).imports.length};
 const second=U.financeImportCommit(d,owner,payload,preview);
 assert.equal(first.replayed,false);assert.equal(second.replayed,true);assert.equal(U.root(d).finance.revision,revision);assert.deepEqual({projects:U.root(d).finance.payload.projects.length,payments:U.root(d).finance.payload.payments.length,imports:U.root(d).imports.length},counts);
});
test('finance import blocks changed IDs, normalized customer aliases and document number collisions',()=>{
 const setup=()=>{const d=fixture();U.saveFinance(d,owner,{baseRevision:0,payload:financePayload()});return d};
 let d=setup(),incoming=financePayload({paymentAmount:31}),preview=U.financeImportPreview(d,owner,incoming);assert.ok(preview.conflicts.some(x=>x.collection==='payments'));assert.throws(()=>U.financeImportCommit(d,owner,incoming,preview),e=>e.status===409);
 d=setup();incoming=U.R.validate(U.R.normalize({projects:[],assignments:[],payments:[],customers:[{id:'FC-OTHER',name:'FINANCE CLIENT',phone:'',email:'',note:''}]}));preview=U.financeImportPreview(d,owner,incoming);assert.ok(preview.conflicts.some(x=>x.collection==='customers'));assert.throws(()=>U.financeImportCommit(d,owner,incoming,preview),e=>e.status===409);
 d=setup();incoming=U.R.validate(U.R.normalize({projects:[],assignments:[],payments:[],documentNumbers:[{id:'SEQ-OTHER',kind:'payment',number:1}]}));preview=U.financeImportPreview(d,owner,incoming);assert.ok(preview.conflicts.some(x=>x.collection==='documentNumbers'));assert.throws(()=>U.financeImportCommit(d,owner,incoming,preview),e=>e.status===409);
});
test('finance import preserves the linked project source and link identity',()=>{
 const d=fixture(),current=financePayload({code:'PRJ-101',client:'Test Customer',customerId:'C1',unifiedSourceId:'DOC-APPROVED'});U.saveFinance(d,owner,{baseRevision:0,payload:current});U.link(d,owner,{baseRevision:1,projectId:'PRJ-101',financeCode:'PRJ-101'});
 const incoming=financePayload({code:'PRJ-101',client:'Test Customer',customerId:'C1'}),preview=U.financeImportPreview(d,owner,incoming);assert.equal(preview.conflicts.length,0);assert.equal(preview.identical.projects,1);
 U.financeImportCommit(d,owner,incoming,preview);assert.equal(U.root(d).finance.payload.projects[0].unifiedSourceId,'DOC-APPROVED');assert.deepEqual(U.root(d).links.map(x=>[x.projectId,x.financeCode]),[['PRJ-101','PRJ-101']]);
});
test('server financial helpers are exact copies of the approved embedded engines',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../erp/site/modules/finance.html'),'utf8');
 for(const [name,file] of [['R14','finance-v20-core.js'],['R18Clients','finance-v20-clients.js']]){
  const start=source.search(new RegExp('const '+name+'\\s*=')),marker="if(typeof module!=='undefined')module.exports="+name+';';
  const engine=source.slice(start,source.indexOf(marker,start)+marker.length).replace("require('./finance-core.js')","require('./finance-v20-core')");
  assert.equal(fs.readFileSync(path.join(__dirname,'../erp',file),'utf8'),"'use strict';\n"+engine+'\n');
 }
});
test('linked identities synchronize atomically; issued document snapshots remain unchanged',()=>{
 const d=fixture(),r=saved(d,'contract');U.approve(d,owner,{baseRevision:1,id:r.document.id});U.handoff(d,owner,{baseRevision:2,financeRevision:0,id:r.document.id,rate:1});
 let previous=D.clone(d);d.data[0].name='Updated project';d.masters.customers[0].name='Updated customer';U.syncIdentity(d,previous);
 assert.equal(U.root(d).finance.payload.projects[0].name,'Updated project');assert.equal(U.root(d).finance.payload.projects[0].client,'Updated customer');assert.equal(U.root(d).finance.revision,2);
 assert.equal(U.root(d).commercial.documents[0].draft.state.client,'Test Customer');
 previous=D.clone(d);const f=U.root(d).finance.payload,c=f.customers[0];U.root(d).finance.payload=require('../erp/finance-v20-clients').save(f,{...c,name:'Finance rename'});U.syncIdentity(d,previous);
 assert.equal(d.masters.customers[0].name,'Finance rename');assert.equal(d.data[0].client,'Finance rename');
});
test('financial closure uses approved accounts and never duplicates receipts',()=>{
 const d=fixture(),r=saved(d,'contract');U.approve(d,owner,{baseRevision:1,id:r.document.id});U.handoff(d,owner,{baseRevision:2,financeRevision:0,id:r.document.id,rate:1});
 const payload=D.clone(U.root(d).finance.payload);
 payload.claims.push({id:'CL1',code:'PRJ-101',client:'Test Customer',status:'صادرة',date:'2026-11-02',total:200,items:[{desc:'Roof',amount:200}]});
 payload.clientReceipts.push({id:'RC1',code:'PRJ-101',client:'Test Customer',date:'2026-11-02',amount:200});
 payload.claimSettlements.push({id:'S1',claimId:'CL1',receiptId:'RC1',code:'PRJ-101',amount:200,mode:'manual'});
 U.saveFinance(d,acc,{baseRevision:1,payload});
 const summary=D.W.financeSummary(d,d.data[0]);assert.equal(summary.paid,200);assert.equal(summary.invoiced,200);assert.equal(summary.outstanding,0);assert.equal(summary.canFinancialClose,true);
 assert.equal(d.customerReceipts.length,0);assert.equal(d.ops.claims.length,0);
 const changed=D.clone(payload);changed.projects[0].originalContract=300;changed.projects[0].contract=300;U.saveFinance(d,acc,{baseRevision:2,payload:changed});assert.equal(D.W.financeSummary(d,d.data[0]).canFinancialClose,false);
});
test('approved foreign-currency contract drives native work order and engineer assignment without rounding',()=>{
 const d=fixture();d.teamUsers.push({id:'pm',name:'PM',role:'Project Manager',active:true},{id:'checker',name:'Checker',role:'Checker',active:true},{id:'eng',name:'Engineer',role:'Engineer',active:true});
 const b=draft('USD','contract');b.state.items[0].qty=3;b.state.items[0].rate=1.11;
 const r=U.saveDocument(d,owner,{baseRevision:0,projectId:'PRJ-101',customerId:'C1',draft:b});U.approve(d,owner,{baseRevision:1,id:r.document.id});
 const scope=D.W.scopeOptions({type:'contract',doc:d.commercial.contracts[0]})[0];
 const result=D.runAction(d,owner,{type:'issue_order',projectId:'PRJ-101',payload:{sourceType:'contract',sourceId:r.document.id,pmId:'pm',checkerId:'checker',engineerId:'eng',scopeItemId:scope.id,deadline:'2026-12-01'}});
 assert.ok(result.orderId);assert.equal(d.data.length,1);assert.equal(d.data[0].tasks[0].assignee,'eng');assert.equal(d.ops.orders[0].sourceSnapshot.total,3.33);assert.equal(d.ops.orders[0].sourceSnapshot.currency,'USD');assert.equal(d.customerReceipts.length,0);
});
test('live HTTP authentication, CSRF, roles, shared revisions, restart persistence and backup',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ronix-unified-'));const d=fixture();d.teamUsers.push({id:'acc',name:'Accounts',role:'Accountant',active:true},{id:'eng',name:'Engineer',role:'Engineer',active:true});
 fs.writeFileSync(path.join(dir,'initial-backup.json'),JSON.stringify(d));const users={};for(const u of d.teamUsers){const salt=crypto.randomBytes(16).toString('hex');users[u.id]={salt,hash:crypto.scryptSync('T123',salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex'),active:true};}fs.writeFileSync(path.join(dir,'accounts.json'),JSON.stringify({users}));
 let child,base;
 async function start(publicMode=false){child=fork(path.join(__dirname,'../erp/server.js'),[],{env:{...process.env,RONIX_DATA_DIR:dir,RONIX_PORT:'0',RONIX_PUBLIC_MODE:publicMode?'1':'0'},stdio:['ignore','ignore','pipe','ipc']});let errors='';child.stderr.on('data',x=>errors+=x);const address=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout: '+errors)),15000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});});base='http://127.0.0.1:'+address.port;}
 async function stop(){if(child?.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
 t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
 await start();
 const call=async(route,body,session={},csrf=true)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{...(session.cookie?{cookie:session.cookie}:{}),...(body?{'Content-Type':'application/json',...(csrf?{'X-Ronix-CSRF':session.csrf||''}:{})}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 async function login(id,password='T123'){const r=await call('/api/login',{id,password});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.json.csrf};}
 assert.equal((await call('/api/unified/finance')).status,401);
 const a=await login('owner'),b=await login('owner'),e=await login('eng');
 assert.equal((await call('/api/unified/finance',null,e)).status,403);
 const finance={baseRevision:0,payload:U.R.normalize({projects:[],assignments:[],payments:[]})};
 assert.equal((await call('/api/unified/finance',finance,a,false)).status,403);
 assert.equal((await call('/api/unified/finance',finance,a)).status,200);
 assert.equal((await call('/api/unified/finance',finance,b)).status,409);
 assert.equal((await call('/api/unified/finance',null,b)).json.revision,1);
 const report=await call('/api/unified/migration-preview',{backup:finance.payload},a);assert.equal(report.json.readOnly,true);
 const importBackup=financePayload({code:'HTTP-FIN-1',client:'HTTP Finance Client',customerId:'HTTP-FC-1',name:'HTTP Finance Project',assignmentId:'HTTP-AS-1',paymentId:'HTTP-PAY-1',documentId:'HTTP-SEQ-1',documentNumber:101});
 const beforeImport=(await call('/api/unified/finance',null,a)).json,importPreview=await call('/api/unified/finance-import-preview',{backup:importBackup},a);assert.equal(importPreview.status,200);assert.equal(importPreview.json.conflicts.length,0);
 const afterPreview=(await call('/api/unified/finance',null,a)).json;assert.equal(afterPreview.revision,beforeImport.revision);assert.equal(afterPreview.baseRevision,beforeImport.baseRevision);assert.deepEqual(afterPreview.payload,beforeImport.payload);
 const importRequest={backup:importBackup,confirm:true,importHash:importPreview.json.importHash,previewHash:importPreview.json.previewHash,financeRevision:importPreview.json.financeRevision,baseRevision:importPreview.json.baseRevision};
 const imported=await call('/api/unified/finance-import-commit',importRequest,a);assert.equal(imported.status,200);assert.equal(imported.json.replayed,false);
 const afterImport=(await call('/api/unified/finance',null,a)).json;assert.equal(afterImport.payload.projects.filter(x=>x.code==='HTTP-FIN-1').length,1);assert.equal(afterImport.payload.payments.filter(x=>x.id==='HTTP-PAY-1').length,1);
 const replayed=await call('/api/unified/finance-import-commit',importRequest,a);assert.equal(replayed.status,200);assert.equal(replayed.json.replayed,true);
 const afterReplay=(await call('/api/unified/finance',null,a)).json;assert.equal(afterReplay.baseRevision,afterImport.baseRevision);assert.equal(afterReplay.revision,afterImport.revision);assert.equal(afterReplay.payload.projects.filter(x=>x.code==='HTTP-FIN-1').length,1);assert.equal(afterReplay.payload.payments.filter(x=>x.id==='HTTP-PAY-1').length,1);
 const secondBackup=financePayload({code:'HTTP-FIN-2',client:'HTTP Finance Client 2',customerId:'HTTP-FC-2',name:'HTTP Finance Project 2',assignmentId:'HTTP-AS-2',paymentId:'HTTP-PAY-2',documentId:'HTTP-SEQ-2',documentNumber:102}),secondPreview=await call('/api/unified/finance-import-preview',{backup:secondBackup},a);assert.equal(secondPreview.status,200);
 const concurrent=await call('/api/customers',{baseRevision:secondPreview.json.baseRevision,requestId:'12345678-1234-1234',name:'Concurrent Customer'},a);assert.equal(concurrent.status,200);
 const stale=await call('/api/unified/finance-import-commit',{backup:secondBackup,confirm:true,importHash:secondPreview.json.importHash,previewHash:secondPreview.json.previewHash,financeRevision:secondPreview.json.financeRevision,baseRevision:secondPreview.json.baseRevision},a);assert.equal(stale.status,409);assert.equal((await call('/api/unified/finance',null,a)).json.payload.projects.some(x=>x.code==='HTTP-FIN-2'),false);
 const workspace=await call('/api/workspace',null,a);assert.equal(workspace.status,200);
 const savedBackup=(await call('/api/backup',null,a)).json;assert.equal(savedBackup.extensions.unified.finance.revision,2);
 await call('/api/unified/finance',{baseRevision:2,payload:{...savedBackup.extensions.unified.finance.payload,testMarker:'after-backup'}},a);
 const preview=await call('/api/restore-preview',{backup:savedBackup},a);assert.equal(preview.status,200);
 const restoredBackup=await call('/api/restore',{backup:savedBackup,previewHash:preview.json.hash,confirm:true,baseRevision:(await call('/api/workspace',null,a)).json.revision},a);assert.equal(restoredBackup.status,200);
 assert.equal((await call('/api/unified/finance',null,a)).json.revision,2);
 const freshEngineer=await login('eng');
 for(const route of ['/modules/finance.html','/modules/commercial.html']){const r=await fetch(base+route,{headers:{cookie:freshEngineer.cookie}});assert.equal(r.status,403);}
 assert.equal((await call('/api/password',{oldPassword:'T123',password:'Test-Password-2026'},a)).status,200);
 await stop();await start(true);assert.equal((await call('/api/login',{id:'owner',password:'T123'})).status,401);const restored=await login('owner','Test-Password-2026');assert.equal((await call('/api/health')).json.passwordMinLength,12);assert.equal((await call('/api/password',{oldPassword:'Test-Password-2026',password:'1234'},restored)).status,400);assert.equal((await call('/api/unified/finance',null,restored)).json.revision,2);
 assert.equal((await call('/api/backup',null,restored)).status,200);
});
