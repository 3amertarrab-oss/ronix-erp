'use strict';
/* R42.3.9.10: explicit engineer handoff and schedule-only revisions.
 * No automatic invoice, receipt, time approval, project archive or reconciliation.
 * Content fingerprints deliberately exclude plan dates and checker evaluation.
 */
const crypto = require('node:crypto');
const B = require('./execution-board');
const C = require('./controls');
const W = require('./workflow');
const P = require('./site/assets/planning-r395');
const copy = v => JSON.parse(JSON.stringify(v));
const now = () => new Date().toISOString();
const uid = p => p + '-' + crypto.randomUUID();
const digest = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clean = v => String(v ?? '').trim().slice(0, 2000);
function check(ok, code, message, status=400) {
  if (!ok) { const e = Error(message); Object.assign(e,{code,status}); throw e; }
}
const engineers = new Set(['Engineer','Project Engineer']);
const requiredTasks = p => C.leaf(p.tasks).filter(t => t.required !== false);
function items(t) {
  return B.has(t) ? t.executionBoard.parts.map(r => ({r, id:r.id, assignee:r.assignee||t.assignee, checker:r.checker||t.checker, label:r.label, part:true})) :
    [{r:t,id:t.id,assignee:t.assignee,checker:t.checker,label:t.name,part:false}];
}
function signature(t, userId) {
  return digest(items(t).filter(x=>x.assignee===userId).map(x=>({
    id:x.id, assignee:x.assignee, checker:x.checker, progress:x.r.progress,
    completedNote:x.r.completedNote||'', remainingNote:x.r.remainingNote||'',
    progressNote:x.r.progressNote||'', submissionId:x.r.submissions?.at(-1)?.id||''
  })));
}
function latest(t,userId) { return (t.completionDeclarations||[]).filter(r=>r.by===userId).at(-1)||null; }
function current(t,userId) {
  const r=latest(t,userId);
  return !!r && ['submitted','approved'].includes(r.status) && r.signature===signature(t,userId);
}
function owners(t) { return [...new Set(items(t).map(x=>x.assignee).filter(Boolean))]; }
function exact100(t,userId) {
  const a=items(t).filter(x=>!userId||x.assignee===userId);
  return a.length>0 && a.every(x=>typeof x.r.progress==='number'&&x.r.progress===100);
}
function conflictsFor(t){return items(t).filter(x=>Number(x.r.approvedProgress)>Number(x.r.progress??0)&&x.r.status==='confirmed');}
function taskState(d,p,t,u) {
  const own=items(t).filter(x=>x.assignee===u.id), assigned=engineers.has(u.role)&&own.length>0;
  const staff=owners(t), missing=staff.filter(id=>!current(t,id));
  const active=!p.operationalClosed&&!p.finalTechnicalApproved&&!t.removedAt&&!t.isSummary;
  const eligible=assigned&&active&&exact100(t,u.id);
  const mine=latest(t,u.id), valid=current(t,u.id);
  const complete=staff.length>0&&items(t).every(x=>!!x.assignee)&&!missing.length;
  let reason='';
  if(p.operationalClosed)reason='المشروع مؤرشف؛ لا يوجد تسليم جديد';
  else if(p.finalTechnicalApproved)reason='التسليم النهائي معتمد؛ التاريخ محفوظ';
  else if(!assigned)reason='تأكيد الإنهاء للمهندس المسؤول عن هذا التكليف';
  else if(valid)reason='تم تأكيد تسليم هذا التكليف؛ يبقى اكتمال المشروع مشروطاً ببقية التكليفات والمراجعة';
  else if(!exact100(t,u.id))reason='استكمل إلى 100%: '+own.filter(x=>x.r.progress!==100).map(x=>x.label).join('، ');
  return {conflicts:conflictsFor(t).map(x=>({id:x.id,label:x.label,part:x.part,checker:x.checker||p.checker,engineer:x.r.progress,approved:x.r.approvedProgress})),canDeclare:eligible&&!valid, ownAssigned:assigned, ownDeclared:valid,
    state:p.finalTechnicalApproved?'final_approved':complete?'engineer_delivered':mine?.status==='returned'?'returned':'awaiting_engineer',
    reason, allEngineersDeclared:complete, missingEngineerIds:missing,
    declaration:mine?{id:mine.id,by:mine.by,at:mine.at,status:mine.status,reason:mine.reason||''}:null,
    history:(t.completionDeclarations||[]).map(r=>({id:r.id,by:r.by,at:r.at,status:r.status,reason:r.reason||''})),
    confirmations:(t.completionDeclarations||[]).filter(r=>latest(t,r.by)?.id===r.id).map(r=>({id:r.id,by:r.by,at:r.at,status:r.status,valid:current(t,r.by)}))};
}
const technicallyApproved=t=>B.has(t)?B.summary(t.executionBoard).allApproved:t.status==='confirmed'&&Number(t.approvedProgress)===100&&(!t.submissions?.length||t.reviewedSubmissionId===t.submissions.at(-1).id);
function projectState(d,p,u) {
  const ts=requiredTasks(p), coverage=W.scopeCoverage(d,p), missing=[];
  const external=require('./supplier-scope').work(d,p.id),externalPending=external.filter(x=>!x.accepted),hasWork=ts.length+external.length>0;
  for(const t of ts) {
    if(!items(t).length||items(t).some(x=>!x.assignee))missing.push({taskId:t.id,name:t.name,userId:'',reason:'تكليف غير مسند'});
    for(const id of owners(t))if(!current(t,id))missing.push({taskId:t.id,name:t.name,userId:id,reason:'تأكيد إنهاء المهندس لم يسجل للنسخة الحالية'});
  }
  const pending=ts.filter(t=>!technicallyApproved(t)).map(t=>({taskId:t.id,name:t.name}));
  const pendingParts=ts.flatMap(t=>items(t).filter(({r})=>!technicallyApproved(r)).map(({r,id,label,assignee,checker,part})=>({taskId:t.id,partId:part?id:'',name:label,assignee,checker:checker||p.checker,status:r.status||'todo',progress:r.progress??null,approvedProgress:r.approvedProgress??null})));
  const conflicts=ts.flatMap(t=>conflictsFor(t).map(x=>({kind:'review_conflict',taskId:t.id,partId:x.part?x.id:'',name:x.label,actorIds:[x.checker||p.checker].filter(Boolean)})));
  const blockers=[...conflicts,...coverage.missing.map(name=>({kind:'scope',name,actorIds:[p.pm].filter(Boolean)})),...missing.map(r=>({kind:'handoff',name:r.name,taskId:r.taskId,actorIds:[r.userId||p.pm].filter(Boolean)})),...pendingParts.map(r=>({kind:r.status==='submitted'?'review':'work',name:r.name,taskId:r.taskId,partId:r.partId,actorIds:[r.status==='submitted'?r.checker:r.assignee].filter(Boolean)}))];
  blockers.push(...externalPending.map(x=>({kind:'supplier_receipt',name:x.description,agreementId:x.agreementId,itemId:x.itemId,actorIds:[p.pm].filter(Boolean)})));
  if(!hasWork&&!blockers.length)blockers.push({kind:'scope',name:'لا توجد أعمال مطلوبة موزعة',actorIds:[p.pm].filter(Boolean)});
  const declarationsReady=hasWork&&!missing.length;
  const exactWorkComplete=hasWork&&ts.every(t=>exact100(t))&&!externalPending.length;
  const ready=!p.operationalClosed&&!p.finalTechnicalApproved&&exactWorkComplete&&declarationsReady&&!pending.length&&!conflicts.length&&coverage.complete;
  for(const t of ts)for(const x of items(t)){if(x.r.progress!==100&&!blockers.some(b=>b.taskId===t.id&&b.partId===(x.part?x.id:'')&&['work','review','review_conflict'].includes(b.kind)))blockers.push({kind:'work',taskId:t.id,partId:x.part?x.id:'',name:x.label,actorIds:[x.assignee].filter(Boolean)});}
  const scope=W.scopeOptions(W.source(d,p));
  for(const b of blockers){const r=b.kind==='scope'?scope.find(x=>x.label===b.name):null;b.scopeItemId=r?.id||'';b.key=[b.kind,b.taskId||'',b.partId||'',b.scopeItemId||b.name,(b.actorIds||[]).join(',')].join('|');b.route=b.kind==='supplier_receipt'?'awards':b.kind==='scope'?'projects':['review','review_conflict'].includes(b.kind)?'review':'tasks';b.actionLabel=b.kind==='supplier_receipt'?'استلام بند المورد':b.kind==='scope'?'عرض وتوزيع النطاق':b.kind==='handoff'?'تأكيد تسليم المهندس':b.kind==='review_conflict'?'إعادة فتح موثقة':b.kind==='review'?'مراجعة الجزء':'فتح العمل المطلوب';}
  return {requiredAssignments:ts.length+external.length, externalAssignments:external.length, internalAssignments:ts.length, externalPending, exactWorkComplete, declarationsReady, missingDeclarations:missing,
    pendingTechnical:pending, pendingParts, blockers, missingScope:coverage.missing, readyForFinalApproval:ready,
    canFinalApprove:ready&&ts.length>0&&u?.role==='Checker'&&p.checker===u.id,
    finalApproved:!!p.finalTechnicalApproved, finalApprovalId:p.finalApprovalRecord?.id||'',
    state:p.finalTechnicalApproved?'final_approved':ready?'ready_for_final':declarationsReady?'final_review_pending':'awaiting_engineer'};
}
function requireFinal(d,u,p) {
  const s=projectState(d,p,u);
  check(s.requiredAssignments>0,'NO_REQUIRED_WORK','لا يمكن اعتماد مشروع دون أعمال مطلوبة');
  check(!s.externalPending.length,'SUPPLIER_RECEIPTS_REQUIRED','أعمال المورد تنتظر استلام مهندس المشروعات، لا اعتماد التشيكر.');
  check(!s.missingScope.length,'CONTRACT_SCOPE_NOT_ASSIGNED','أعمال متعاقد عليها لم توزع: '+s.missingScope.join('؛ '));
  check(!s.pendingTechnical.length,'PENDING_TASKS','استكمل مراجعة الأجزاء المطلوبة للنسخة الحالية');
  check(requiredTasks(p).every(t=>exact100(t)),'WORK_NOT_100','نسب المهندسين لم تكتمل؛ لا يصدر اعتماد نهائي بناءً على نسبة المراجع وحدها',409);
  check(s.declarationsReady,'ENGINEER_HANDOFF_REQUIRED','يلزم تأكيد إنهاء المهندس لكل تكليف قبل الاعتماد النهائي: '+s.missingDeclarations.map(x=>x.name).join('، '),409);
}
function stampFinal(p,record) {
  record.engineerDeclarations=requiredTasks(p).flatMap(t=>owners(t).map(id=>({taskId:t.id,declarationId:latest(t,id).id,by:id,signature:signature(t,id)})));
  record.deliveryHash=digest(record.engineerDeclarations);
  for(const t of requiredTasks(p))for(const id of owners(t)) {const r=latest(t,id);r.status='approved';r.finalApprovalId=record.id;r.approvedAt=record.at;}
}
function planSnapshot(t) {
  return {startDate:t.startDate||'',startTime:t.startTime||'',due:t.due||'',dueTime:t.dueTime||'',plannedHours:Number(t.plannedHours||0),priority:t.priority||'Normal',plannedEndDateTime:t.plannedEndDateTime||'',planCalculation:copy(t.planCalculation||null)};
}
function planState(d,p,t,u) {
  const o=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued');
  const canEdit=!p.operationalClosed&&!p.finalTechnicalApproved&&!t.isSummary&&!C.removed(t)&&
    (u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id)&&!!(o?.pmAck||!o&&p.legacyWorkflow);
  return {canEdit,hash:digest(planSnapshot(t)),history:copy(t.scheduleChanges||[])};
}
function conflicts(d,p,scopeId,exceptId='') {
  const scope=W.scopeOptions(W.source(d,p)),selected=scope.find(x=>x.id===scopeId);
  if(!selected)return [];
  return C.leaf(p.tasks).filter(t=>t.id!==exceptId&&(t.scopeItemId===selected.id||selected.parentId&&t.scopeItemId===selected.parentId||scope.some(s=>s.id===t.scopeItemId&&s.parentId===selected.id)));
}
function invalidateAfter(d,u,p,type,b) {
  if(!p)return;
  // Checker reopens/returns invalidate only the affected engineers' confirmations.
  const tid=b.taskId, t=p.tasks.find(x=>x.id===tid);
  if(!t)return;
  let invalidIds=[];
  if(type==='execution_part_reopen')invalidIds=items(t).filter(x=>x.id===b.partId).map(x=>x.assignee);
  if(type==='execution_parts_review')invalidIds=items(t).filter(x=>(b.parts||[]).some(y=>y.id===x.id&&y.decision==='return')).map(x=>x.assignee);
  if(['checker_return','checker_reopen'].includes(type))invalidIds=owners(t);
  for(const id of owners(t)){
    const r=latest(t,id);if(!r||!['submitted','approved'].includes(r.status))continue;
    if(invalidIds.includes(id)||r.signature!==signature(t,id)){
      r.status=invalidIds.includes(id)?'returned':'superseded';r.invalidatedAt=now();r.invalidatedBy=u.id;
      r.reason=clean(b.reason)||'تغير العمل أو أعيد للمراجعة؛ يلزم تأكيد إنهاء جديد بعد استكماله';
    }
  }
}
function action(d,u,p,type,b,ctx) {
  if(!['engineer_complete','reschedule_task'].includes(type))return {handled:false};
  check(p,'PROJECT_REQUIRED','حدد المشروع');
  const t=C.leaf(p.tasks).find(x=>x.id===b.taskId);check(t,'TASK_NOT_FOUND','التكليف غير موجود',404);
  if(type==='reschedule_task'){
    ctx.checkPM(d,u,p);check(!p.operationalClosed&&!p.finalTechnicalApproved,'PROJECT_CLOSED','المشروع مغلق فنيًا أو مؤرشف؛ لا تعاد جدولة التنفيذ السابق');
    const allowed=new Set(['taskId','startDate','startTime','due','dueTime','plannedHours','planningDriver','planningCalendar','lastDayHours','priority','reason','expectedPlanHash']);
    check(Object.keys(b).every(k=>allowed.has(k)),'SCHEDULE_ONLY','هذا الإجراء للمواعيد والساعات المخططة فقط؛ لا يغير النطاق أو المهندس أو الأوزان');
    check(b.expectedPlanHash===digest(planSnapshot(t)),'PLAN_CONFLICT','تغير التخطيط؛ افتح أحدث خطة قبل تعديلها',409);
    const reason=clean(b.reason);check(reason,'REASON_REQUIRED','سبب تعديل التخطيط مطلوب');
    const before=planSnapshot(t),cal=b.planningCalendar||t.planCalculation?.calendar||d.dailyTime?.policy||{};
    const plan=P.resolve({...b,planningDriver:b.planningDriver||'hours',planningCalendar:cal});
    const priority=b.priority||t.priority||'Normal';check(['Normal','High','Urgent','Low'].includes(priority),'INVALID_PRIORITY','أولوية غير صحيحة');
    const after={startDate:plan.startDate,startTime:plan.startTime,due:plan.due,dueTime:plan.dueTime,plannedHours:plan.plannedHours,priority,plannedEndDateTime:plan.endDateTime,planCalculation:plan};
    if(digest(before)===digest(after))return {handled:true,result:{taskId:t.id,unchanged:true}};
    const at=now();(t.scheduleChanges??=[]).push({id:uid('PLAN'),at,by:u.id,reason,before,after:copy(after)});Object.assign(t,after);
    const recipients=[...owners(t),...items(t).map(x=>x.checker||p.checker),p.pm,...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)];
    ctx.notify(d,recipients,'task_rescheduled',p.id,'تم تحديث خطة '+t.name+'؛ النهاية '+plan.due+' '+plan.dueTime+' — '+reason);
    return {handled:true,result:{taskId:t.id,plannedEndDateTime:plan.endDateTime,plannedHours:plan.plannedHours,afterDeadline:!!p.deadline&&plan.due>p.deadline}};
  }
  check(engineers.has(u.role),'ENGINEER_ONLY','تأكيد التسليم للمهندس المكلف فقط',403);
  check(items(t).some(x=>x.assignee===u.id),'WRONG_ASSIGNEE','هذا التكليف ليس مسندًا إليك',403);
  if(current(t,u.id))return {handled:true,result:{taskId:t.id,declarationId:latest(t,u.id).id,existing:true}};
  ctx.ensureNotFinal(p);
  check(exact100(t,u.id),'WORK_NOT_100','استكمل جميع الأجزاء المسندة إليك إلى 100% قبل تأكيد التسليم');
  const mine=items(t).filter(x=>x.assignee===u.id), reviewers=[...new Set(mine.map(x=>x.checker||p.checker))];
  for(const id of reviewers)check(d.teamUsers.some(x=>x.id===id&&x.active!==false&&x.role==='Checker'),'CHECKER_REQUIRED','يلزم مراجع فعال للتسليم');
  if(B.has(t)){
    const toSend=mine.filter(x=>!['submitted','confirmed'].includes(x.r.status));
    if(toSend.length)B.action(d,u,p,'execution_parts_submit',{taskId:t.id,parts:toSend.map(x=>({id:x.id,basePartRevision:x.r.revision,percent:100,completedNote:x.r.completedNote||'',remainingNote:x.r.remainingNote||'',progressNote:x.r.progressNote||'',eta:x.r.eta||''}))},{...ctx,notify:()=>{}});
  }else if(!['submitted','confirmed'].includes(t.status)){
    const s={id:uid('SUB'),revision:(t.workRevision||0)+1,percent:100,completedNote:t.completedNote||'',remainingNote:t.remainingNote||'',progressNote:t.progressNote||'',eta:t.eta||'',by:u.id,at:now()};
    t.workRevision=s.revision;(t.submissions??=[]).push(s);t.status='submitted';t.updatedAt=s.at;
  }
  const record={id:uid('HANDOFF'),by:u.id,at:now(),status:'submitted',engineerPercent:100,note:clean(b.note),signature:signature(t,u.id),items:items(t).filter(x=>x.assignee===u.id).map(x=>({id:x.id,submissionId:x.r.submissions?.at(-1)?.id||'',progress:x.r.progress}))};
  (t.completionDeclarations??=[]).push(record);
  ctx.notify(d,[...reviewers,p.pm,p.projectEngineer,...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)],'engineer_handoff',p.id,'أنهى '+u.name+' أعماله 100% وأكد تسليم '+t.name+' — اعتماد المشروع النهائي مشروط ببقية التكليفات والمراجعة');
  return {handled:true,result:{taskId:t.id,declarationId:record.id,engineerDelivered:true}};
}
module.exports={requiredTasks,items,conflictsFor,owners,signature,current,exact100,taskState,projectState,requireFinal,stampFinal,planSnapshot,planState,conflicts,invalidateAfter,action};
