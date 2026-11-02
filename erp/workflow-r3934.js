'use strict';
const H=require('./completion'),C=require('./controls'),V=require('./finance-view'),CS=require('./collection-status'),Access=require('./access');
const types=new Set(['part_support_assign','pm_delivery_ack','pm_finance_handoff','pm_operational_complete','project_complete_final']);
function handoff(p){return (p.pmFinanceHandoffs34||[]).findLast(x=>x.approvalKey===CS.key(p))||null;}
function delivery(p){return (p.pmDeliveries34||[]).findLast(x=>x.approvalKey===CS.key(p))||null;}
function view(d,p,u){
 const canManage=Access.admin(u),finance=canManage||u.role==='Accountant',sent=handoff(p),ack=delivery(p);
 const state=!p.finalTechnicalApproved?'working':!ack?'pm_receipt':!sent?'pm_direction':!p.operationalClosed?'pm_close':p.financialClosed?'completed':'accounts';
 return {state,approvalKey:CS.key(p),delivery:ack,handoff:finance?sent:sent?{at:sent.at,by:sent.by}:null,canManage,canComplete:finance,
 label:{working:'التنفيذ والمراجعة مستمران',pm_receipt:'اعتماد فني مكتمل — مطلوب استلام مهندس المشروعات',pm_direction:'مطلوب التواصل مع العميل وتوجيه الحسابات',pm_close:'تم توجيه الحسابات — مطلوب الإنهاء الإداري من المشروعات',accounts:'المتابعة والإقفال المالي لدى الحسابات',completed:'مكتمل إداريًا وماليًا'}[state]};
}
function action(d,u,p,type,b,D){
 if(!types.has(type))return {handled:false};D.assert(p,'PROJECT_REQUIRED','حدد المشروع');
 const admin=Access.admin(u),fin=admin||u.role==='Accountant';
 if(type==='part_support_assign'){
  D.assert(admin,'FORBIDDEN','توزيع الدعم لمهندس المشروعات أو المالك',403);D.checkPM(d,Access.effective(u),p);D.ensureNotFinal(p);
  const t=C.leaf(p.tasks).find(t=>t.id===b.taskId);D.assert(t?.executionBoard?.parts?.length,'PARTS_REQUIRED','اختر تكليفًا له أجزاء');
  const ids=b.partIds;D.assert(Array.isArray(ids)&&ids.length&&new Set(ids).size===ids.length,'PARTS_REQUIRED','حدد أجزاء الدعم مرة واحدة');
  const engineer=D.user(d,b.engineerId);D.assert(['Engineer','Project Engineer'].includes(engineer.role),'ENGINEER_REQUIRED','اختر مهندس تنفيذ فعالًا');
  const due=C.validDate(b.due),reason=D.text(b.reason,1500);D.assert(reason,'REASON_REQUIRED','وضح نطاق الدعم وسبب التوزيع');
  const rows=ids.map(id=>t.executionBoard.parts.find(r=>r.id===id));D.assert(rows.every(Boolean),'PART_NOT_FOUND','أحد الأجزاء غير موجود',404);
  D.assert(rows.every(r=>!['submitted','confirmed'].includes(r.status)),'PART_LOCKED','الجزء المرسل أو المعتمد يحتاج إعادة فتح موثقة من المراجع قبل نقل مسؤوليته',409);
  D.assert(rows.some(r=>r.assignee!==engineer.id),'SAME_ASSIGNEE','الأجزاء المحددة مسندة بالفعل إلى هذا المهندس',409);
  const at=D.now(),previousOwners=H.owners(t);
  for(const r of rows){if(r.assignee===engineer.id)continue;(r.assignmentHistory??=[]).push({at,by:u.id,previousAssignee:r.assignee||t.assignee,nextAssignee:engineer.id,reason,previousDue:r.due||t.due,due,progress:r.progress});r.assignee=engineer.id;r.due=due;r.dueTime='';r.plannedEndDateTime='';r.assignedAt=at;r.assignedBy=u.id;r.revision++;}
  // Earlier declarations retain their history but cannot approve changed responsibility.
  for(const id of new Set([...previousOwners,...H.owners(t)])){const rec=(t.completionDeclarations||[]).filter(x=>x.by===id).at(-1);if(rec&&['submitted','approved'].includes(rec.status)&&rec.signature!==H.signature(t,id)){rec.status='superseded';rec.invalidatedAt=at;rec.invalidatedBy=u.id;rec.reason='تغير توزيع الأجزاء؛ يلزم تأكيد الإنهاء للنطاق الحالي';}}
  D.notify(d,[engineer.id,...previousOwners,p.pm],'support_assigned',p.id,'توزيع دعم: '+rows.map(r=>r.label).join('، ')+' — '+engineer.name+' — '+due);
  return {handled:true,result:{taskId:t.id,partIds:ids,engineerId:engineer.id}};
 }
 D.assert(p.finalTechnicalApproved,'FINAL_APPROVAL_REQUIRED','أكمل الاعتماد الفني النهائي أولًا',409);
 D.assert(b.approvalKey===CS.key(p),'APPROVAL_CHANGED','تغير الاعتماد؛ حدّث المشروع',409);
 if(type==='project_complete_final'){
  D.assert(fin,'FORBIDDEN','الإتمام المالي للحسابات والإدارة',403);
  D.assert(p.operationalClosed&&handoff(p),'PM_HANDOFF_REQUIRED','يلزم توجيه المشروعات للحسابات والإنهاء الإداري أولًا',409);
  if(p.financialClosed&&D.W.financeSummary(d,p).canFinancialClose)return {handled:true,result:{existing:true,projectId:p.id}};
  const result=D.runAction(d,u,{type:'project_financial_close',projectId:p.id,payload:{reason:b.reason}});p.finalCompletion34={at:D.now(),by:u.id,approvalKey:CS.key(p)};return {handled:true,result};
 }
 D.assert(admin,'FORBIDDEN','استلام التسليم وتوجيه الحسابات من المشروعات أو المالك',403);
 if(type==='pm_operational_complete'){
  D.assert(delivery(p)&&handoff(p),'PM_HANDOFF_REQUIRED','أكد استلام التسليم وسجل توجيه الحسابات أولًا',409);
  if(p.operationalClosed)return {handled:true,result:{existing:true,projectId:p.id}};
  return {handled:true,result:D.runAction(d,u,{type:'project_operational_close',projectId:p.id,payload:{reason:b.reason,closeType:'completed'}})};
 }
 if(type==='pm_delivery_ack'){
  const prior=delivery(p);if(prior)return {handled:true,result:{existing:true,deliveryId:prior.id}};
  const r={id:D.uid('PMACK'),at:D.now(),by:u.id,approvalKey:CS.key(p)};(p.pmDeliveries34??=[]).push(r);
  return {handled:true,result:{deliveryId:r.id}};
 }
 const prior=handoff(p);if(prior)return {handled:true,result:{existing:true,handoffId:prior.id}};
 D.assert(delivery(p),'PM_RECEIPT_REQUIRED','أكد استلام التسليم الفني أولًا',409);
 const dueDate=C.validDate(b.dueDate),note=D.text(b.note,1500),contact=D.text(b.contact,1500);D.assert(note,'NOTE_REQUIRED','اكتب التوجيه المالي');
 const f=V.view(d,p),r={id:D.uid('PMFIN'),at:D.now(),by:u.id,byRole:u.role,approvalKey:CS.key(p),dueDate,note,contact,action:f.fullyCollected?'reconcile_close':f.outstanding>0?'collect':'issue_claim',value:f.value,paid:f.paid,uncollected:f.uncollected};
 for(const id of [...new Set(b.milestoneIds||[])]){D.Updates.action(d,u,p,'finance_direction',{milestoneId:id,dueDate,note},D);}
 (p.pmFinanceHandoffs34??=[]).push(r);
 D.notify(d,d.teamUsers.filter(x=>x.active!==false&&['Accountant','Owner'].includes(x.role)).map(x=>x.id),'pm_finance_handoff',p.id,(f.fullyCollected?'توجيه من المشروعات: مراجعة المطابقة والإقفال — ':'توجيه من المشروعات: متابعة الدفعة المستحقة — ')+p.name+' — '+note,true);
 return {handled:true,result:{handoffId:r.id}};
}
module.exports={action,view,handoff,delivery};
