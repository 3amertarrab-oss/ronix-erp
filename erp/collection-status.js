'use strict';
/* R3926. Financial handoff acknowledgments are not invoices, payment allocation,
 * technical approvals, or project closure. Reads are pure; no automatic backfill. */
const V=require('./finance-view'),W=require('./workflow'),Daily=require('./daily-time');
const crypto=require('node:crypto');
const fin=u=>['Owner','Accountant'].includes(u?.role);
const sum=(xs,k)=>xs.reduce((n,x)=>n+Number(x[k]||0),0);
function key(p){return p.finalApprovalRecord?.id||(p.finalTechnicalApproved?'legacy:'+p.id+':'+(p.finalTechnicalApprovedAt||'undated'):'');}
function common(p){const approvalKey=key(p),ack=(p.financeHandoffAcks||[]).find(a=>a.approvalKey===approvalKey);return {finalApproved:!!p.finalTechnicalApproved,approvedAt:p.finalTechnicalApprovedAt||'',approvedBy:p.finalTechnicalApprovedBy||'',approvalKey,acknowledged:!!ack,ackAt:ack?.at||'',ackBy:ack?.by||''};}
function view(d,p,u){
 const base=common(p);
 if(!fin(u))return base; // No money, schedules or payment promises for technical roles.
 const f=V.view(d,p,Daily.today(d)),total=Number(f.sourceValue??f.value??0),paid=Number(f.paid||0);
 const unknownPrice=!f.sourceVerified,uncollected=Math.max(0,total-paid);
 const eligible=f.milestones.filter(m=>m.canClaim),hasClaims=f.milestones.some(m=>m.claimIds.length||m.claimed>0);
 const allocationNeeded=Number(f.unallocatedReceiptAmount)>0&&f.milestones.some(m=>m.claimRemaining>0);
 const settled=!unknownPrice&&uncollected===0&&Number(f.outstanding||0)===0&&!f.scheduleReconciliationNeeded;
 const promise=f.followUp.promiseDate||'',next=f.followUp.nextFollowUp||'',today=Daily.today(d);
 const missedPromise=!!promise&&promise<today&&!settled,followupDue=!!next&&next<=today&&!settled;
 let state='not_final',tone='neutral',label='التنفيذ الفني مستمر',action='';
 if(base.finalApproved){
  if(unknownPrice){state='reconcile';tone='danger';label='تسليم معتمد — راجع مرجع التعاقد والقيمة';action='مراجعة المرجع المالي';}
  else if(allocationNeeded||f.scheduleReconciliationNeeded){state='reconcile';tone='warn';label='تسليم معتمد — مطابقة المقبوضات والمطالبات مطلوبة';action='مراجعة تخصيص القبض؛ لا تطلب المبلغ المحصل مرة ثانية';}
  else if(settled){state='settled';tone='good';label='التسليم معتمد — لا رصيد تحصيل باقٍ وفق السجلات';action='عرض كشف المشروع';}
  else if(eligible.length&&uncollected>0){state='claim_ready';tone='danger';label='تسليم معتمد — مطلوب إصدار المطالبة المستحقة';action='إصدار مطالبة وفق جدول الدفعات';}
  else if(Number(f.outstanding)>0){state=missedPromise?'promise_overdue':Number(f.overdueKnownAmount)>0?'overdue':'collection';tone=state==='collection'&&!followupDue?'warn':'danger';label=state==='promise_overdue'?'وعد الدفع تجاوز موعده — متابعة التحصيل مطلوبة':state==='overdue'?'مطالبات مستحقة متأخرة — متابعة التحصيل مطلوبة':'مطالبة صادرة — بانتظار التحصيل';action='فتح المطالبة وتحديث موعد المتابعة';}
  else {state='schedule_review';tone='warn';label='التسليم معتمد — مراجعة شروط الدفعات المتبقية';action='راجع شرط المطالبة؛ لا إنشاء تلقائي لمبلغ';}
 }
 if(f.fullyCollected){state=f.scheduleReconciliationNeeded?'reconcile':'collected';tone=f.scheduleReconciliationNeeded?'warn':'good';label=f.financialLabel;action=f.scheduleReconciliationNeeded?'مطابقة الأموال الموجودة؛ لا تطلب قبضًا إضافيًا':'مراجعة مستندات الإقفال المالي';}
 const needsAck=base.finalApproved&&!base.acknowledged&&!settled;
 if(needsAck&&tone==='warn')tone='danger';
 return {...base,state,tone,label,nextAction:action,needsAction:base.finalApproved&&!settled,needsAck,canAck:needsAck,
  sourceNumber:f.sourceNumber||'',sourceType:f.sourceType||'',value:total,paid,outstanding:Number(f.outstanding||0),uncollected,
  eligibleClaimAmount:sum(eligible,'notClaimed'),eligibleMilestoneIds:eligible.map(m=>m.id),hasClaims,allocationNeeded,
  dueKnownAmount:f.dueKnownAmount,overdueKnownAmount:f.overdueKnownAmount,unknownDueAmount:f.unknownDueAmount,
  promiseDate:promise,nextFollowUp:next,missedPromise,followupDue,sourceVerified:f.sourceVerified};
}
function action(d,u,p,type,b,D){
 if(type!=='finance_handoff_ack')return {handled:false};
 D.assert(fin(u),'FINANCE_ONLY','تأكيد الاستلام المالي للمالك والحسابات فقط',403);
 D.assert(p&&p.finalTechnicalApproved,'FINAL_APPROVAL_REQUIRED','لم يصدر الاعتماد الفني النهائي');
 D.assert(b.approvalKey===key(p),'APPROVAL_CHANGED','تغيرت نسخة الاعتماد؛ حدّث الحالة قبل التأكيد',409);
 const previous=(p.financeHandoffAcks||[]).find(a=>a.approvalKey===b.approvalKey);
 if(previous)return {handled:true,result:{existing:true,handoffId:previous.id}};
 const r={id:'FACK-'+crypto.randomUUID(),approvalKey:b.approvalKey,by:u.id,at:D.now(),note:D.text(b.note,1000)};
 (p.financeHandoffAcks??=[]).push(r);
 D.notify(d,[p.pm,...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)].filter(id=>id!==u.id),'finance_handoff_received',p.id,'أكدت الحسابات استلام التسليم المعتمد للمتابعة — '+p.name+'؛ التأكيد لا يعني إصدار مطالبة أو تحصيل المال.');
 D.event(d,u,type,p.id,{handoffId:r.id,approvalKey:r.approvalKey});
 return {handled:true,result:{handoffId:r.id,projectId:p.id}};
}
module.exports={view,common,key,action};
