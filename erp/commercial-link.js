'use strict';
// Project identity is assigned before a commercial document is activated.
const W=require('./workflow');
const clone=x=>JSON.parse(JSON.stringify(x));
const roles=new Set(['Owner','Accountant','Project Manager']);
const can=(u,p)=>roles.has(u?.role)&&(!p||u.role!=='Project Manager'||p.pm===u.id);
const live=p=>p&&!p.removedAt&&!p.operationalClosed;
function summary(d,u,p){
 if(!can(u,p))return null;
 const docs=['quote','contract'].flatMap(type=>d.commercial[type==='quote'?'quotes':'contracts'].filter(x=>!x.removedAt&&!x.documentArchived&&!x.parentContractId&&!x.changeOrderDraft&&W.docProject(d,x,type)?.id===p.id).map(x=>({type,id:x.id,number:x.number,status:x.status})));
 const source=W.source(d,p),approved=source&&!source.doc.documentArchived&&['approved','active','closed'].includes(source.doc.status),ordered=d.ops.orders.some(o=>o.projectId===p.id&&o.status==='issued');
 return {canManage:live(p)&&['Owner','Accountant'].includes(u.role),canLinkOperational:live(p)&&can(u,p),docs,sourceId:source?.doc.id||'',sourceType:source?.type||'',sourceNumber:source?.doc.number||'',state:approved?(ordered?'active':'ready'):docs.length?'draft':'missing',label:approved?(ordered?'المرجع التجاري مفعّل':'المرجع معتمد — استكمال بدء التشغيل'):docs.length?'استكمال وتفعيل العقد أو عرض السعر':'إضافة عقد أو عرض سعر للبدء'};
}
function state(d,u,revision,D){
 D.assert(['Owner','Accountant'].includes(u.role),'FORBIDDEN','محرر الأسعار والعقود للمالك والحسابات فقط',403);
 const ps=d.data.filter(p=>!p.removedAt&&can(u,p));const ids=new Set(ps.map(p=>p.id));
 const permitted=x=>u.role!=='Project Manager'||ids.has(x.projectId)||ids.has(x.sourceProjectId)||x.createdBy===u.id;
 const scoped=clone(d);
 scoped.data=ps.map(p=>({id:p.id,identityToken:p.identityToken||'',name:p.name,customerId:p.customerId||'',client:p.client||'',projectDraft:!!p.projectDraft,operationalClosed:!!p.operationalClosed,pm:p.pm,checker:p.checker,deadline:p.deadline||'',stage:0,value:0,invoice:0,paid:0,retention:0,docs:0,tasks:[],events:[],sourceQuoteId:p.sourceQuoteId||'',sourceContractId:p.sourceContractId||'',commercialSourceType:p.commercialSourceType||''}));
 scoped.commercial={quotes:d.commercial.quotes.filter(permitted),contracts:d.commercial.contracts.filter(permitted)};
 if(u.role==='Project Manager'){
  scoped.masters={customers:d.masters.customers.map(c=>({id:c.id,name:c.name,active:c.active})),vendors:[],vendorBills:[],expenses:[]};
  for(const k of ['timesheets','awards','vendorPayments','customerReceipts','projectCostCenters','journalEntries','costRates'])scoped[k]=[];
  scoped.rates={};scoped.legacyArchive={};scoped.teamUsers=d.teamUsers.map(D.publicUser);scoped.projectImages={};
  for(const kind of ['quotes','contracts'])scoped.commercial[kind]=scoped.commercial[kind].map(doc=>{const x=clone(doc);for(const row of x.paymentSchedule||x.schedule||[])for(const k of ['claimed','paid','claimId','claimedBy','claimedAt','status'])delete row[k];return x});
 }
 return {revision,orders:d.ops.orders.filter(o=>ids.has(o.projectId)).map(o=>({id:o.id,projectId:o.projectId,pmAck:o.pmAck,status:o.status})),release:D.RELEASE.build,user:D.publicUser(u),state:D.legacyState(scoped),commercialProjects:ps.filter(live).map(p=>({id:p.id,name:p.name,customerId:p.customerId||'',client:p.client||'',draft:!!p.projectDraft})),nextNumbers:Object.fromEntries(['quote','contract'].map(type=>{const letter=type==='quote'?'Q':'C';const list=d.commercial[type==='quote'?'quotes':'contracts'];return [type,'RNX-'+letter+'-'+(Math.max(100,...list.map(x=>Number((String(x.number).match(new RegExp(letter+'-(\\d+)'))||[])[1])||0))+1)+'/'+new Date().getFullYear()]}))};
}
function save(d,u,b,D){
 D.assert(['Owner','Accountant'].includes(u.role),'FORBIDDEN','محرر الأسعار والعقود للمالك والحسابات فقط',403);
 D.assert(b.state&&Object.keys(b.state).length===1&&b.state.ronixCommercialV3,'COMMERCIAL_ONLY','هذه الشاشة تحفظ العرض والعقد فقط',400);
 let input;try{input=typeof b.state.ronixCommercialV3==='string'?JSON.parse(b.state.ronixCommercialV3):b.state.ronixCommercialV3}catch{throw new D.AppError('INVALID_JSON','بيانات المستند غير صالحة')}
 const view=JSON.parse(state(d,u,0,D).state.ronixCommercialV3),merged=clone(d.commercial),changed=[];
 for(const kind of ['quotes','contracts']){
  D.assert(Array.isArray(input[kind]),'BAD_DOCUMENTS','بيانات المستندات غير صالحة');
  D.assert(view[kind].every(x=>input[kind].some(y=>y.id===x.id)),'DELETION_BLOCKED','استخدم إدارة السجلات للحذف',409);
  for(const raw of input[kind]){
   const before=d.commercial[kind].find(x=>x.id===raw.id),shown=view[kind].find(x=>x.id===raw.id);
   if(shown&&D.hash(shown)===D.hash(raw))continue;
   D.assert(!before||shown,'FORBIDDEN','المستند غير متاح لهذا الحساب',403);
   const doc=clone(raw),type=kind==='quotes'?'quote':'contract';
   if(!doc.projectId&&kind==='contracts'&&doc.quoteId)doc.projectId=merged.quotes.find(q=>q.id===doc.quoteId)?.projectId||'';
   D.assert(doc.projectId,'PROJECT_REQUIRED','اختر المشروع الموجود قبل حفظ المستند؛ أو أنشئ مسودة مشروع أولًا');
   const p=d.data.find(p=>p.id===doc.projectId);
   D.assert(live(p)&&can(u,p),'FORBIDDEN','المشروع غير متاح أو مؤرشف',403);
   const priorProject=before&&W.docProject(d,before,type);D.assert(!priorProject||priorProject.id===p.id,'PROJECT_LINK_LOCKED','المستند تابع لمشروع قائم ولا يمكن نقله',409);
   D.assert(!before?.projectId||before.projectId===p.id,'PROJECT_LINK_LOCKED','المستند مرتبط بمشروع؛ لا تنقله إلى مشروع آخر',409);
   D.assert(!doc.sourceProjectId||doc.sourceProjectId===p.id,'PROJECT_LINK_CONFLICT','مرجع المشروع غير متطابق',409);
   D.assert(!doc.customerId||!p.customerId||doc.customerId===p.customerId,'CUSTOMER_MISMATCH','عميل المستند مختلف عن عميل المشروع',409);
   if(!doc.customerId)doc.customerId=p.customerId||'';
   const customer=d.masters.customers.find(c=>c.id===doc.customerId);
   D.assert(customer||!doc.customerId,'CUSTOMER_MISSING','العميل غير موجود');
   doc.client=customer?.name||'';doc.projectName=p.name;
   if(kind==='contracts'&&doc.quoteId){const q=merged.quotes.find(q=>q.id===doc.quoteId);D.assert(q&&!q.removedAt&&q.projectId===p.id&&q.customerId===doc.customerId,'QUOTE_PROJECT_MISMATCH','اختر عرضًا لنفس المشروع والعميل',409)}
   const rowKey=kind==='quotes'?'paymentSchedule':'schedule',oldRows=before?.[rowKey]||[];
   for(const old of oldRows){const nr=(doc[rowKey]||[]).find(r=>r.id===old.id);const hasLedger=['claimed','paid','claimId'].some(k=>!!old[k]);D.assert(!hasLedger||nr,'CLAIM_LEDGER_IMMUTABLE','لا تحذف دفعة لها مطالبة أو قبض',409);if(nr)for(const k of ['claimed','paid','claimId','claimedBy','claimedAt','status']){if(u.role==='Project Manager'){D.assert(nr[k]===undefined,'CLAIM_LEDGER_IMMUTABLE','الحركات المالية خارج هذا الإجراء');if(old[k]!==undefined)nr[k]=clone(old[k]);}else D.assert(D.hash(nr[k]??null)===D.hash(old[k]??null),'CLAIM_LEDGER_IMMUTABLE','لا تعدل المطالبات أو القبض من محرر المستند',409)}}
   for(const row of doc[rowKey]||[])if(!oldRows.some(o=>o.id===row.id))D.assert(!row.paid&&!row.claimed&&!row.claimId,'CLAIM_LEDGER_IMMUTABLE','الدفعة الجديدة لا تتضمن قبضًا أو مطالبة');
   const used=before&&d.ops.orders.some(o=>o.projectId===p.id&&o.status==='issued'&&(o.sourceId===before.id||o.contractId===before.id));
   if(used){D.assert(doc.status===before.status,'ACTIVE_SOURCE_LOCKED','المرجع قيد التشغيل؛ استخدم تعديلًا موثقًا',409);for(const k of ['lines','currency','vatEnabled','vatRate',rowKey])D.assert(D.hash(doc[k]??null)===D.hash(before[k]??null),'ACTIVE_SOURCE_LOCKED','لا تعدل قيمة أو نطاق أو جدول مرجع قيد التشغيل مباشرة',409)}
   if(['approved','active'].includes(doc.status)){D.assert(customer,'CUSTOMER_REQUIRED','حدد عميلًا قبل التفعيل');D.assert(W.total(doc,type)>0&&W.scopeOptions({type,doc}).length,'SOURCE_VALUE_REQUIRED','استكمل نطاق العمل والأسعار');const rows=doc[rowKey]||[];D.assert(rows.length&&Math.abs(rows.reduce((s,r)=>s+Number(r.percent||0),0)-100)<.01,'INVALID_SCHEDULE','جدول الدفعات يجب أن يساوي 100%');}
   if(!before){doc.createdBy=u.id;doc.createdAt=D.now();}else{doc.createdBy=before.createdBy;doc.createdAt=before.createdAt;}
   const i=merged[kind].findIndex(x=>x.id===doc.id);if(i<0)merged[kind].push(doc);else merged[kind][i]=doc;
   changed.push({kind,id:doc.id,projectId:p.id,status:doc.status});
  }
 }
 if(!changed.length)return {saved:false,unchanged:true};
 // Use existing validation and audit with the actual actor, restricted to documents.
 const result=D.financeBatch(d,u,{state:{ronixCommercialV3:JSON.stringify(merged)}},true);
 for(const c of changed){const p=d.data.find(x=>x.id===c.projectId),doc=d.commercial[c.kind].find(x=>x.id===c.id);if(!p.customerId&&doc.customerId){p.customerId=doc.customerId;p.client=doc.client;}D.event(d,u,'commercial_document_save',p.id,{documentId:doc.id,kind:c.kind,status:doc.status});}
 return {...result,documents:changed};
}
function link(d,u,p,b,D){
 D.assert(can(u,p)&&live(p),'FORBIDDEN','ربط المرجع لمشروع متاح فقط',403);
 const type=b.sourceType;D.assert(['quote','contract'].includes(type),'INVALID_SOURCE','اختر عرضًا أو عقدًا');
 const doc=d.commercial[type==='quote'?'quotes':'contracts'].find(x=>x.id===b.sourceId&&!x.removedAt&&!x.documentArchived);
 D.assert(doc&&!doc.parentContractId&&!doc.changeOrderDraft,'SOURCE_REQUIRED','اختر مستندًا أصليًا متاحًا');
 if(u.role==='Project Manager')D.assert(doc.projectId===p.id||doc.sourceProjectId===p.id||doc.createdBy===u.id,'FORBIDDEN','المستند غير متاح لهذا الحساب',403);
 D.assert(!doc.projectId||doc.projectId===p.id,'SOURCE_PROJECT_MISMATCH','هذا المستند مرتبط بمشروع آخر',409);
 const linked=W.docProject(d,doc,type);D.assert(!linked||linked.id===p.id,'SOURCE_PROJECT_MISMATCH','هذا المستند مرتبط بمشروع آخر',409);
 D.assert(!p.customerId||!doc.customerId||p.customerId===doc.customerId,'CUSTOMER_MISMATCH','العميل مختلف',409);
 if(type==='contract'&&doc.quoteId){const q=d.commercial.quotes.find(x=>x.id===doc.quoteId);D.assert(q&&!q.removedAt&&(!q.projectId||q.projectId===p.id)&&(!q.customerId||q.customerId===doc.customerId),'QUOTE_PROJECT_MISMATCH','عرض العقد مرتبط بمشروع أو عميل آخر',409);q.projectId=p.id;q.projectName=p.name;}
 if(!p.customerId&&doc.customerId){p.customerId=doc.customerId;p.client=doc.client;}
 doc.projectId=p.id;doc.projectName=p.name;return {projectId:p.id,sourceId:doc.id};
}
module.exports={can,summary,state,save,link};
