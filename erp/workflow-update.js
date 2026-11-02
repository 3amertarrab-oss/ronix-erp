'use strict';
// R3932: explicit assignments and financial instructions; no historical backfill.
const n=x=>Number(x)||0;
function assignInitial(d,u,p,order,b,D){
 const engineer=D.user(d,b.engineerId);
 D.assert(engineer.role==='Engineer','ENGINEER_REQUIRED','اختر مهندس التنفيذ الفعّال؛ لا يتم اختيار اسم تلقائيًا');
 const scope=D.W.scopeOptions(D.W.source(d,p)),selected=scope.find(s=>s.id===b.scopeItemId);
 D.assert(selected,'SCOPE_REQUIRED','حدد نطاق التكليف الأول من المرجع المعتمد');
 D.assert(!D.Supplier.overlap(d,p,selected.id),'SCOPE_EXTERNALLY_ASSIGNED','هذا النطاق مسند لمورد',409);
 D.assert(!D.C.leaf(p.tasks).some(t=>t.scopeItemId===selected.id||selected.parentId&&t.scopeItemId===selected.parentId||scope.some(s=>s.id===t.scopeItemId&&s.parentId===selected.id)),'SCOPE_ALREADY_ASSIGNED','النطاق له تكليف قائم؛ افتح التكليف الحالي',409);
 const t={id:D.uid('TSK'),orderId:order.id,name:selected.label,scopeItemId:selected.id,scopeServiceCode:selected.serviceCode,assignee:engineer.id,checker:p.checker,assignedBy:u.id,assignedAt:D.now(),due:p.deadline,startDate:'',plannedHours:0,weight:1,priority:'Normal',required:true,status:'todo',progress:0,approvedProgress:0,reviewCycles:[],submissions:[],assessments:[]};
 p.tasks.push(t);if(D.B.templateFor(d,p,t)==='steel_detailing_65_35')D.B.initialize(d,u,p,t,{fresh:true});
 order.initialTaskId=t.id;order.engineerId=engineer.id;
 D.notify(d,[engineer.id],'task_assigned',p.id,'تم تكليفك: '+t.name+' — '+p.name);
 return t;
}
function allocateClaimReceipt(d,u,p,r,b,D){
 D.assert(p,'PROJECT_REQUIRED','قبض المطالبة يتطلب مشروعًا');
 const src=D.W.source(d,p),claim=d.ops.claims.find(c=>c.id===b.claimId&&c.projectId===p.id&&c.sourceId===src?.doc.id);
 D.assert(claim,'CLAIM_NOT_FOUND','المطالبة ليست من نفس المشروع والمرجع',409);
 const s=D.W.schedule(src).find(s=>s.id===claim.milestoneId),amount=Math.min(n(r.amount),Math.max(0,n(s?.claimed)-n(s?.paid)));
 D.assert(amount>0,'CLAIM_ALREADY_PAID','المطالبة مطابقة بالكامل؛ سجل أي مبلغ إضافي من المشروع',409);
 r.claimId=claim.id;r.milestoneId=claim.milestoneId;
 D.runAction(d,u,{type:'receipt_allocate',projectId:p.id,payload:{receiptId:r.id,milestoneId:claim.milestoneId,amount,date:r.date}});
}
function action(d,u,p,type,b,D){
 if(!['finance_direction','claim_mark_sent'].includes(type))return {handled:false};
 D.assert(p,'PROJECT_REQUIRED','حدد المشروع');
 if(type==='finance_direction'){
  D.assert(D.Access.admin(u),'FORBIDDEN','التوجيه المالي من المالك أو مهندس المشروعات',403);
  const src=D.W.source(d,p),m=src&&D.W.milestoneAmounts(src).find(m=>m.id===b.milestoneId);
  D.assert(m&&['approved','active'].includes(src.doc.status),'MILESTONE_REQUIRED','اختر دفعة من مرجع معتمد');
  const eligible=D.V.view(d,p).milestones.find(x=>x.id===m.id);
  D.assert(eligible?.canClaim,'MILESTONE_NOT_READY','لم يتحقق شرط المطالبة أو صدرت بالكامل',409);
  const dueDate=String(b.dueDate||'');D.assert(/^\d{4}-\d{2}-\d{2}$/.test(dueDate)&&Number.isFinite(Date.parse(dueDate))&&new Date(dueDate).toISOString().slice(0,10)===dueDate,'DATE_REQUIRED','حدد موعدًا صحيحًا للتوجيه');
  const prior=(p.financeDirections||[]).find(x=>x.sourceId===src.doc.id&&x.milestoneId===m.id&&!x.claimId);
  if(prior)return {handled:true,result:{directionId:prior.id,existing:true}};
  const rec={id:D.uid('FDIR'),sourceId:src.doc.id,milestoneId:m.id,label:m.label,percent:n(m.percent),amount:eligible.notClaimed,dueDate,note:D.text(b.note,1500),by:u.id,byRole:u.role,at:D.now(),action:D.V.view(d,p).fullyCollected?'document_received':'issue_claim'};
  (p.financeDirections??=[]).push(rec);
  D.notify(d,d.teamUsers.filter(x=>x.active!==false&&x.role==='Accountant').map(x=>x.id),'finance_direction',p.id,(rec.action==='document_received'?'توثيق دفعة مقبوضة؛ لا تطلب دفعًا جديدًا: ':'مطلوب إصدار مطالبة ')+m.label+' — بتوجيه من '+u.name,true);
  D.event(d,u,type,p.id,{directionId:rec.id,milestoneId:m.id,amount:rec.amount});
  return {handled:true,result:{directionId:rec.id}};
 }
 D.assert(D.FINANCE.has(u.role),'FORBIDDEN','تأكيد إرسال المطالبة للحسابات والإدارة',403);
 const claim=d.ops.claims.find(c=>c.id===b.claimId&&c.projectId===p.id);D.assert(claim,'CLAIM_NOT_FOUND','المطالبة غير موجودة');
 if(claim.sentAt)return {handled:true,result:{claimId:claim.id,existing:true}};
 const f=D.V.view(d,p);
 D.assert(!f.fullyCollected&&!f.unallocatedReceiptAmount&&!f.scheduleReconciliationNeeded,'RECONCILIATION_REQUIRED','راجع المقبوضات والمطابقة أولًا؛ لا تطلب مبلغًا وصل بالفعل',409);
 const remaining=f.milestones.find(m=>m.id===claim.milestoneId)?.claimRemaining||0;
 D.assert(remaining>0,'CLAIM_ALREADY_PAID','لا يوجد مبلغ متبقٍ لهذه المطالبة',409);
 const reference=D.text(b.reference,200);D.assert(reference,'REFERENCE_REQUIRED','اكتب مرجع الإرسال الذي تم فعليًا');
 claim.sentAt=D.now();claim.sentBy=u.id;claim.sentReference=reference;
 D.event(d,u,type,p.id,{claimId:claim.id,reference});return {handled:true,result:{claimId:claim.id}};
}
module.exports={assignInitial,allocateClaimReceipt,action};
