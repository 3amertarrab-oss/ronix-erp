'use strict';
// Shared source/identity helpers. No writes, invented approvals, prices, or allocations.
const crypto = require('node:crypto');
const n = x => Number(x) || 0;
const copy = x => JSON.parse(JSON.stringify(x));
const included = d => (d?.lines || []).filter(l => l.included !== false);
function total(d, type='contract') {
  if(d?.integrated1007)return require('./unified').amounts(d.integrated1007.state).total;
  const net = included(d).reduce((s,l) => s+n(l.qty)*n(l.unitPrice??l.rate)*(1-n(l.discount)/100),0);
  return Math.round(net+(type==='quote'&&d?.vatEnabled?net*n(d.vatRate)/100:0));
}
function rootContract(d,c) {
  const seen=new Set();let cur=c;
  while(cur?.parentContractId&&!seen.has(cur.id)){seen.add(cur.id);const parent=d.commercial.contracts.find(x=>x.id===cur.parentContractId);if(!parent)break;cur=parent}
  return cur;
}
function docProject(d,doc,type) {
  const root=type==='contract'?rootContract(d,doc):doc;
  const ids=[root?.projectId,doc?.projectId,root?.sourceProjectId,doc?.sourceProjectId].filter(Boolean);
  // An explicit project identity must not disappear because its customer is still blank.
  let p=d.data.find(p=>ids.includes(p.id));
  if(!p)p=d.data.find(p=>(type==='quote'?p.sourceQuoteId===doc.id:p.sourceContractId===root?.id)&&(!doc.customerId||p.customerId===doc.customerId));
  if(!p&&type==='contract'&&root?.quoteId){const q=d.commercial.quotes.find(x=>x.id===root.quoteId);p=q&&docProject(d,q,'quote')}
  return p||null;
}
function source(d,p) {
  if(!p||p.removedAt)return null;
  const quote=d.commercial.quotes.find(q=>q.id===p.sourceQuoteId&&!q.removedAt);
  const contract=d.commercial.contracts.find(c=>c.id===p.sourceContractId&&!c.changeOrderDraft&&!c.removedAt);
  if(['quote','quotation'].includes(p.commercialSourceType)&&quote)return {type:'quote',doc:quote};
  if(contract)return {type:'contract',doc:contract};
  if(quote)return {type:'quote',doc:quote};
  const cs=d.commercial.contracts.filter(c=>c.projectId===p.id&&!c.changeOrderDraft&&['active','approved','closed'].includes(c.status));
  if(cs.length===1)return {type:'contract',doc:cs[0]};
  const qs=d.commercial.quotes.filter(q=>q.projectId===p.id&&q.status==='approved');
  return qs.length===1?{type:'quote',doc:qs[0]}:null;
}
function schedule(s){return s?(s.type==='quote'?s.doc.paymentSchedule||[]:s.doc.schedule||[]):[]}
function scopeOptions(s){
  if(!s)return [];
  const out=[];
  included(s.doc).forEach((l,index)=>{
    const key=[s.type,s.doc.id,'line',l.id||index].join(':');
    const service=l.serviceCode||'';
    const desc=String(l.description||'').trim();
    const prefix=service==='SRV-ST-DSGN'?'Full Design — ':service==='SRV-ST-DETL'?'Full Detailing — ':'';
    if(desc)out.push({id:key,label:prefix+desc,serviceCode:service,sourceType:s.type,sourceId:s.doc.id,lineIndex:index,parentId:null});
    (l.scopeItems||[]).filter(i=>i.included!==false).forEach((v,j)=>{
      const ar=String(v.ar||v.en||v.description||'').trim(),en=String(v.en||'').trim();
      if(ar)out.push({id:key+':scope:'+(v.id||j),label:ar+(en&&ar!==en?' — '+en:''),serviceCode:service,sourceType:s.type,sourceId:s.doc.id,lineIndex:index,parentId:key});
    });
  });
  return out;
}
function sourceRows(d){
 const rows=[];
 for(const [type,list] of [['quote',d.commercial.quotes],['contract',d.commercial.contracts]])for(const doc of list){if(doc.removedAt||doc.documentArchived)continue;
   const p=docProject(d,doc,type),o=p&&d.ops.orders.find(x=>x.projectId===p.id&&x.status==='issued');
   const revision=!!doc.changeOrderDraft||!!doc.parentContractId;
   let state='ready',reason='جاهز لبدء التشغيل';
   if(revision){state='revision';reason='مراجعة للمرجع الأصلي — ليست مشروعًا أو بيعًا إضافيًا'}
   else if(p?.operationalClosed){state='closed';reason='المشروع مؤرشف بالفعل — افتح سجله أو أعد فتحه موثقًا'}
   else if(o){state='existing';reason=o.pmAck?'له أمر تشغيل — تم استلام PM':'له أمر تشغيل — بانتظار استلام PM'}
   else if(p?.operationalClosed||p?.finalTechnicalApproved){state='closed';reason='مشروع مؤرشف أو معتمد فنيًا؛ افتح المشروع الموجود'}
   else if(!(type==='quote'?doc.status==='approved':['approved','active'].includes(doc.status))){state='not_approved';reason='بانتظار اعتماد المرجع'}
   else if(!doc.customerId||!d.masters.customers.some(c=>c.id===doc.customerId)){state='missing_customer';reason='حدد عميلًا صحيحًا في المرجع'}
   else if(!included(doc).length||total(doc,type)<=0){state='missing_scope';reason='نطاق العمل أو القيمة غير مكتملين؛ راجع المرجع'}
   const duplicates=list.filter(x=>x.number===doc.number).length;
   rows.push({key:type+':'+doc.id,type,id:doc.id,number:doc.number,revision:doc.revision||null,duplicateNumber:duplicates>1,recordSuffix:doc.id.slice(-8),parentId:doc.parentContractId||'',projectId:p?.id||'',projectName:p?.name||doc.projectName||'',customerId:doc.customerId||'',client:doc.client||'',status:doc.status,state,reason,orderId:o?.id||'',total:total(doc,type),scope:scopeOptions({type,doc}),governing:!!p&&source(d,p)?.doc.id===doc.id});
 }
 return rows;
}
function projectIdentity(p){return p.identityToken||crypto.createHash('sha256').update([p.id,p.sourceContractId||'',p.sourceQuoteId||''].join('|')).digest('hex').slice(0,24)}
function normalizedName(s){return String(s||'').trim().replace(/^PRJ-\d+\s*[—-]?\s*/i,'').replace(/\s+/g,' ')}
function imageEligible(d,p){
 const im=d.projectImages?.[p.id];if(!im?.src)return false;
 if(im.projectIdentity&&im.projectIdentity!==projectIdentity(p))return false;
 if(im.builtin===true)return ['PRJ-101','PRJ-102','PRJ-103'].includes(p.id);
 return !im.name||normalizedName(im.name)===normalizedName(p.name);
}
function nextProjectId(d){
 // Reserve orphan references too: IDs from former projects must NEVER bind to a new project.
 let max=100;const seen=new WeakSet();
 function walk(x){if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);for(const [k,v]of Object.entries(x)){
  let m=k.match(/^PRJ-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));
  if(typeof v==='string'&&v.length<100){m=v.match(/^(?:CC-)?PRJ-(\d+)$/);if(m)max=Math.max(max,Number(m[1]))}
  else if(v&&typeof v==='object')walk(v);
 }}walk(d);return 'PRJ-'+(max+1);
}
function financeSummary(d,p){
 const integrated=require('./unified').projection(d,p);if(integrated)return integrated;
 const s=source(d,p),value=n(p.revisedContractValue??p.value),invoiced=n(p.invoice),paid=n(p.paid);
 // Cash reduces a specific claim only after it is allocated to that claim.
 // Older milestone.paid values remain credited without rewriting their history.
 const allocated=s?schedule(s).reduce((sum,row)=>sum+n(row.paid),0):0;
 const outstanding=Math.max(0,invoiced-(s?allocated:Math.min(invoiced,paid))),advance=Math.max(0,paid-(s?allocated:Math.min(invoiced,paid)));
 const vendors=(d.masters.vendorBills||[]).filter(x=>x.projectId===p.id&&!['cancelled','void'].includes(x.status)).reduce((a,x)=>a+Math.max(0,n(x.amount)-n(x.paid)),0);
 const retention=n(p.retention),unbilled=Math.max(0,value-invoiced),uncollected=Math.max(0,value-paid);
 const bookedReceipts=d.customerReceipts.filter(r=>r.projectId===p.id&&r.status==='posted').reduce((a,r)=>a+n(r.amount),0);
 const missingCenter=d.customerReceipts.some(r=>r.projectId===p.id&&r.costCenterId&&!d.projectCostCenters.some(c=>c.id===r.costCenterId&&c.projectId===p.id));
 const blockers=[];
 if(outstanding)blockers.push('مطالبات غير محصلة: '+outstanding);
 if(advance)blockers.push('دفعات مقدمة أو رصيد دائن يحتاج تسوية: '+advance);
 if(unbilled)blockers.push('قيمة تعاقد لم تصدر عنها مطالبات/تسوية: '+unbilled);
 if(retention)blockers.push('محتجزات تحتاج مراجعة: '+retention);
 if(vendors)blockers.push('التزامات موردين غير مسددة: '+vendors);
 if(!s||!included(s.doc).length||total(s.doc,s.type)<=0)blockers.push('مرجع التعاقد أو قيمته غير مكتمل');
 if(bookedReceipts!==paid)blockers.push('إجمالي القبض لا يطابق السندات؛ يلزم مطابقة');
 if(s&&allocated>paid)blockers.push('المسدد المخصص للدفعات يتجاوز المقبوض فعليًا');
 if(missingCenter)blockers.push('مركز تكلفة سند قبض غير موجود');
 return {currency:s?.doc.currency||'EGP',value,invoiced,paid,outstanding,advance,unbilled,uncollected,vendorOutstanding:vendors,retention,bookedReceipts,closeBlockers:blockers,canFinancialClose:!blockers.length,closureNeedsReview:!!p.financialClosed&&!!blockers.length,financialClosed:!!p.financialClosed&&!blockers.length,recordedFinancialClosed:!!p.financialClosed,followUp:copy(p.followUp||{}),contractId:p.sourceContractId||'',customerId:p.customerId||'',sourceType:s?.type||'',sourceId:s?.doc.id||'',sourceNumber:s?.doc.number||'',schedule:copy(schedule(s)),operationalClosed:!!p.operationalClosed,reconciliation:p.workflowState==='reconciliation'||!!p.recoveredAt};
}
function milestoneAmounts(s){
 if(s.doc.integrated1007){const amounts=require('./unified').paymentAmounts(s.doc.integrated1007.state);return schedule(s).map((row,i)=>({...row,amount:amounts[i]}));}
 const rows=schedule(s),tot=total(s.doc,s.type);let previous=0,cumulative=0;
 return rows.map(r=>{cumulative+=n(r.percent);const end=Math.round(tot*cumulative/100);const amount=end-previous;previous=end;return {...r,amount}});
}
function scopeCoverage(d,p){
 const scope=scopeOptions(source(d,p)),assigned=new Set((p.tasks||[]).filter(t=>t.required!==false&&!t.isSummary&&!t.removedAt).map(t=>t.scopeItemId).filter(Boolean));
 for(const x of require('./supplier-scope').work(d,p.id))if(x.scopeItemId)assigned.add(x.scopeItemId);
 const strict=!!d.ops.orders.find(o=>o.projectId===p.id&&o.sourceSnapshot)||assigned.size>0;
 const missing=[];if(strict)for(const root of scope.filter(x=>!x.parentId)){
  if(assigned.has(root.id))continue;const children=scope.filter(x=>x.parentId===root.id);
  if(!children.length)missing.push(root.label);else for(const child of children)if(!assigned.has(child.id))missing.push(child.label);
 }
 return {strict,complete:!missing.length,missing};
}
function uiState(d,p){if(p.projectDraft===true&&!p.operationalClosed)return {state:'draft',nextActor:'owner',canPlan:false};const o=d.ops.orders.find(x=>x.projectId===p.id&&x.status==='issued');
 if(p.operationalClosed)return {state:'archived',nextActor:'',canPlan:false};
 if(o&&!o.pmAck)return {state:'awaiting_pm',nextActor:p.pm,canPlan:false};
 if(!p.tasks.length&&!require('./supplier-scope').work(d,p.id).length)return {state:'ready_for_planning',nextActor:p.pm,canPlan:!!o?.pmAck||!!p.legacyWorkflow};
 return {state:'active',nextActor:'',canPlan:!p.finalTechnicalApproved&&(!o||!!o.pmAck)};
}
module.exports={normalizedName,total,rootContract,docProject,source,schedule,scopeOptions,sourceRows,projectIdentity,imageEligible,nextProjectId,financeSummary,milestoneAmounts,scopeCoverage,uiState};
