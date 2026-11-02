'use strict';
// Read-only financial projections. No allocation, journal, receipt or source changes.
const W=require('./workflow');
const crypto=require('node:crypto');
const C=require('./controls');
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const copy=x=>JSON.parse(JSON.stringify(x));
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function view(d,p,today=new Date().toISOString().slice(0,10)){
 const integrated=require('./unified').projection(d,p);
 if(integrated)return {...integrated,financialLabel:integrated.closeBlockers.length?'حسابات V20 — متابعة ومطابقة':'حسابات V20 — مسوّاة',fullyCollected:integrated.uncollected===0,claims:[],directions:[],customerName:d.masters.customers.find(c=>c.id===p.customerId)?.name||p.client||'',sourceValue:integrated.value,sourceVerified:true,sourceStatus:'active',milestones:[],receipts:[],supplierBills:[],supplierAwards:[],unallocatedReceiptAmount:integrated.advance,claimsRemainingBySchedule:integrated.outstanding,allocatedToMilestones:Math.max(0,integrated.paid-integrated.advance),receiptsNotMatchedToSchedule:integrated.advance,dueKnownAmount:0,overdueKnownAmount:0,unknownDueAmount:integrated.outstanding,scheduleReconciliationNeeded:!!integrated.advance,priceState:'verified',collectionPercent:integrated.value?integrated.paid/integrated.value*100:null};
 const base=W.financeSummary(d,p),src=W.source(d,p),sourceTotal=src?W.total(src.doc,src.type):null;
 const rows=src?W.milestoneAmounts(src):[];
 const receipts=d.customerReceipts.filter(x=>x.projectId===p.id).map(r=>({id:r.id,date:r.date,status:r.status,amount:n(r.amount),method:r.method||'',reference:r.reference||'',accountId:r.accountId||'',milestoneId:r.milestoneId||'',opening:!!r.openingBalance||/^OPEN-/i.test(r.id)||r.kind==='opening',unallocated:!!r.unallocated,note:r.note||'',attachmentName:r.attachmentName||'',arApplied:n(r.arApplied),advanceApplied:n(r.advanceApplied),allocations:(r.allocations||[]).map(x=>({id:x.id,milestoneId:x.milestoneId,claimId:x.claimId,amount:n(x.amount),at:x.at})),availableToAllocate:Math.max(0,n(r.amount)-(r.allocations||[]).reduce((sum,x)=>sum+n(x.amount),0))})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const milestones=rows.map(m=>{
  const claims=d.ops.claims.filter(x=>x.projectId===p.id&&x.milestoneId===m.id&&(!x.sourceId||x.sourceId===src.doc.id));
  const claimed=n(m.claimed),allocated=n(m.paid),claimRemaining=Math.max(0,claimed-allocated),notClaimed=Math.max(0,m.amount-claimed);
  const dueDate=validDate(m.dueDate)||validDate(claims.at(-1)?.dueDate);
  const isAdvance=m.startRequired===true||/advance|contract award|توقيع|مقدمة/i.test([m.label,m.trigger].join(' '));
  const finalMet=!!p.finalTechnicalApproved||(p.legacyWorkflowType==='PRE_R42_3_ACCOUNTS'&&!p.opsReopenedAt&&!!p.accountsEnteredAt);
  const direction=(p.financeDirections||[]).find(x=>x.sourceId===src.doc.id&&x.milestoneId===m.id&&!x.claimId);
  const canClaim=notClaimed>0&&(isAdvance||finalMet)&&['approved','active'].includes(src.doc.status);
  return {id:m.id,label:m.label||m.id,percent:n(m.percent),amount:m.amount,trigger:m.trigger||'',claimed,allocated,claimRemaining,notClaimed,dueDate,direction:direction?copy(direction):null,claimIds:[...new Set([m.claimId,...claims.map(x=>x.id)].filter(Boolean))],canClaim,blockedReason:notClaimed<=0?'مطالب بها بالكامل':canClaim?'':src.doc.status==='closed'?'مرجع التعاقد مقفل':'بانتظار تحقق شرط التسليم الفني',isAdvance,status:claimed<=0?(canClaim?'ready':'not_claimed'):claimRemaining<=0?'paid':dueDate&&dueDate<today?'overdue':allocated>0?'partial':'issued'};
 });
 const sum=(a,k)=>a.reduce((s,x)=>s+n(x[k]),0);
 const lineClaimed=sum(milestones,'claimed'),lineAllocated=sum(milestones,'allocated'),lineOutstanding=sum(milestones,'claimRemaining');
 const allocationGap=Math.max(0,base.paid-lineAllocated);
 const supplierBills=(d.masters.vendorBills||[]).filter(x=>x.projectId===p.id&&!['void','cancelled'].includes(x.status)&&!C.removed(x)).map(b=>({id:b.id,vendorId:b.vendorId,vendorName:d.masters.vendors.find(v=>v.id===b.vendorId)?.name||b.vendorId,awardId:b.awardId||'',amount:n(b.amount),paid:n(b.paid),remaining:Math.max(0,n(b.amount)-n(b.paid)),date:b.date||'',dueDate:validDate(b.dueDate),reference:b.reference||'',status:b.status||'',correctionHash:crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'),corrections:copy(b.corrections||[])}));
 const supplierAwards=(d.awards||[]).filter(x=>x.projectId===p.id&&x.status==='active').map(a=>{const value=a.supplierFlowVersion===1?require('./supplier-flow').total(a):(a.items||[]).filter(x=>x.included!==false).reduce((sum,x)=>sum+n(x.qty)*n(x.rate??x.unitPrice),0),bills=supplierBills.filter(b=>b.awardId===a.id);return {id:a.id,vendorId:a.vendorId,value:Math.round(value),billed:sum(bills,'amount'),paid:sum(bills,'paid'),unbilled:Math.max(0,Math.round(value)-sum(bills,'amount')),overbilled:Math.max(0,sum(bills,'amount')-Math.round(value))}});
 const rawReceiptCapacity=receipts.filter(x=>x.status==='posted').reduce((sum,r)=>sum+r.availableToAllocate,0);
 // Historical milestone.paid may predate receipt-level links; cap availability
 // at project cash minus all amounts already credited to milestones.
 const unallocatedReceiptAmount=Math.min(rawReceiptCapacity,Math.max(0,base.paid-lineAllocated));
 const knownDue=milestones.filter(x=>x.claimRemaining>0&&x.dueDate&&x.dueDate<=today),overdue=knownDue.filter(x=>x.dueDate<today);
 const reconciliationNeeded=lineClaimed!==base.invoiced||lineOutstanding!==base.outstanding||lineAllocated>base.paid||(unallocatedReceiptAmount>0&&lineOutstanding>0);
 const collected=base.value>0&&base.paid>=base.value;
 const financialLabel=collected?(reconciliationNeeded?'قيمة التعاقد محصّلة بالكامل — مطابقة الدفعات والمطالبات مطلوبة':base.financialClosed?'مقفل ماليًا':'قيمة التعاقد محصّلة بالكامل — مراجعة الإقفال المالي مطلوبة'):reconciliationNeeded?'قبض مسجل — مطابقة المقبوضات والمطالبات مطلوبة':base.outstanding>0?'مطالبات صادرة — متابعة التحصيل':'متبقي من التعاقد — راجع الدفعات المطلوبة';
 return {...base,financialLabel,fullyCollected:collected,claims:copy(d.ops.claims.filter(x=>x.projectId===p.id)),directions:copy(p.financeDirections||[]),customerName:d.masters.customers.find(x=>x.id===p.customerId)?.name||p.client||'',sourceValue:sourceTotal,sourceVerified:sourceTotal!==null&&sourceTotal>0&&sourceTotal===base.value,sourceStatus:src?.doc.status||'',milestones,receipts,supplierBills,supplierAwards,unallocatedReceiptAmount,
  claimsRemainingBySchedule:lineOutstanding,allocatedToMilestones:lineAllocated,receiptsNotMatchedToSchedule:allocationGap,
  dueKnownAmount:sum(knownDue,'claimRemaining'),overdueKnownAmount:sum(overdue,'claimRemaining'),unknownDueAmount:sum(milestones.filter(x=>x.claimRemaining>0&&!x.dueDate),'claimRemaining'),
  scheduleReconciliationNeeded:lineClaimed!==base.invoiced||lineOutstanding!==base.outstanding||lineAllocated>base.paid||(unallocatedReceiptAmount>0&&lineOutstanding>0),
  dueCoverage:'Only explicit milestone/claim due dates; project follow-up date is NOT applied to all milestones',
  priceState:sourceTotal===null?'missing_source':sourceTotal<=0?'unpriced':sourceTotal!==base.value?'value_mismatch':'verified',
  followUp:copy(p.followUp||{}),collectionPercent:base.value>0?Math.round(base.paid/base.value*10000)/100:null};
}
module.exports={view};
