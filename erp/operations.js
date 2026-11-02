'use strict';
// R42.3.9.2: pure, non-financial read models. Never migrates or rewrites past work.
const C=require('./controls');
const B=require('./execution-board');
const Handoff=require('./completion');
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const copy = v => JSON.parse(JSON.stringify(v));
const finance = u => ['Owner', 'Accountant'].includes(u?.role);
const archived = C.closed;
const historical = p => !!p.legacyWorkflow && !p.opsReopenedAt && !p.tasks.some(t => t.scopeItemId || t.submissions?.length);
const required = p => C.leaf(p.tasks).filter(t => t.required !== false);
const approved = t => B.has(t)?B.summary(t.executionBoard).allApproved:t.status === 'confirmed' && n(t.approvedProgress) === 100 &&
  (!t.submissions?.length || t.reviewedSubmissionId === t.submissions.at(-1).id);
function percent(tasks, key) {
  const rows = C.leaf(tasks).filter(t => t.required !== false);
  const weight = t => Math.max(0.01, n(t.weight) || 1);
  const denominator = rows.reduce((s, t) => s + weight(t), 0);
  const value=t=>{if(!B.has(t))return n(t[key]);const detail=B.summary(t.executionBoard);return key==='approvedProgress'?detail.checkerPercent:key==='progress'?detail.engineerPercent:n(t[key])};
  // A returned part with no fresh measurement is unknown, never zero or the old approval.
  if(rows.some(t=>B.has(t)&&t.executionBoard.parts.some(part=>part.status==='returned'&&(key==='progress'?part.progress:part.approvedProgress)==null)))return null;
  if(rows.some(t=>value(t)==null))return null;
  return denominator ? Math.round(rows.reduce((s, t) => s + weight(t) * Math.max(0, Math.min(100, value(t))), 0) / denominator * 100) / 100 : 0;
}
const canReadTime=C.canReadTime;
function timeRows(d, u, p) {
  return d.timesheets.filter(t => t.projectId === p.id && t.status !== 'rejected' && canReadTime(d, u, p, t));
}
function timeTotals(rows) {
  const total = status => Math.round(rows.filter(t => !status || t.status === status).reduce((s,t) => s+n(status==='approved'?(t.approvedHours??t.hours):t.hours),0)*100)/100;
  return {logged:total(), approved:total('approved'), pending:total('pending'),returned:total('returned')};
}
function taskFacts(d,p,t,u) {
  const s=t.submissions?.at(-1), a=t.assessments?.at(-1);
  const hasReview = !!a || (t.status==='confirmed' && (n(t.approvedProgress)>0 || t.hasLegacyReview)) || !!t.checkerReviewedAt;
  return {
    assignedAt:t.assignedAt||'', assignedBy:t.assignedBy||'', updatedAt:t.updatedAt||'',
    lastUpdatedAt:t.updatedAt||a?.at||s?.at||t.assignedAt||t.checkerReviewedAt||'',
    progressNote:t.progressNote||'', approved:approved(t),
    submittedAt:s?.at||'', submittedPercent:s?s.percent:null,
    reviewRecorded:hasReview, reviewForCurrentSubmission:!!s&&t.reviewedSubmissionId===s.id,
    lastReview:a?{by:a.by,at:a.at,percent:a.percent,reason:a.reason||'',decision:a.decision,workRevision:a.workRevision}:null,
    reviewedAt:a?.at||t.checkerReviewedAt||t.confirmedAt||'',
    updateRequestNote:t.updateRequestNote||'',updateRequestedAt:t.updateRequestedAt||'',updateRequestedBy:t.updateRequestedBy||'',
    hours:timeTotals(timeRows(d,u,p).filter(x=>x.taskId===t.id)),
  };
}
function team(p) {
 return [...new Set(C.leaf(p.tasks).flatMap(t=>Handoff.owners(t)))].map(id=>({id,taskIds:C.leaf(p.tasks).filter(t=>Handoff.owners(t).includes(id)).map(t=>t.id),taskNames:C.leaf(p.tasks).flatMap(t=>Handoff.items(t).filter(x=>x.assignee===id).map(x=>x.label))}));
}

function summary(d,p,u,today=new Date().toISOString().slice(0,10)) {
  const rows = C.leaf(p.tasks), active = !archived(p) && !historical(p);
  const missing = rows.filter(t=>!t.assignee);
  const hours=timeTotals(timeRows(d,u,p));
  return {
    tasks:rows.length,required:required(p).length,assigned:rows.length-missing.length,unassigned:missing.length,
    notStarted:rows.filter(t=>t.status==='todo').length,
    working:rows.filter(t=>['in_progress','reviewed'].includes(t.status)).length,
    submitted:rows.filter(t=>t.status==='submitted').length, returned:rows.filter(t=>t.status==='returned').length,
    approved:rows.filter(approved).length,
    overdue:active?rows.filter(t=>!approved(t)&&t.due&&t.due<today).length:0,
    plannedHours:Math.round(rows.reduce((s,t)=>s+n(t.plannedHours),0)*100)/100,
    unplanned:rows.filter(t=>n(t.plannedHours)<=0).length,
    loggedHours:hours.logged,approvedHours:hours.approved,pendingHours:hours.pending,
    lastUpdate:rows.map(t=>taskFacts(d,p,t,u).lastUpdatedAt).filter(Boolean).sort().at(-1)||'',
    progressQuality:historical(p)?'legacy_unverified':required(p).some(t=>B.has(t)&&t.executionBoard.parts.some(part=>part.status==='returned'&&(part.progress==null||part.approvedProgress==null)))?'rework_unmeasured':rows.length?'calculated':'not_assigned',
    historical:historical(p),archived:archived(p),team:team(p)
  };
}
function nextAction(d,p,coverage) {
  const owners=d.teamUsers.filter(x=>x.role==='Owner'&&x.active!==false).map(x=>x.id);
  const order=d.ops.orders.find(x=>x.projectId===p.id&&x.status==='issued');
  if(archived(p))return {code:'archived',actors:[],label:'مؤرشف — الرجوع للسجل فقط',en:'Archived — history only'};
  if(historical(p))return {code:'legacy',actors:owners,label:'سجل تاريخي يحتاج مطابقة، وليس تكليفًا جديدًا',en:'Historical record; not a new assignment'};
  if(p.finalTechnicalApproved)return {code:'final',actors:[p.pm].filter(Boolean),label:'الاعتماد الفني مكتمل — المتابعة لدى مهندس المشروعات',en:'Technical approval complete — PM follow-up'};
  if(!order)return {code:'order',actors:owners,label:'يلزم إصدار أمر تشغيل من المرجع المعتمد',en:'Issue a work order from the approved source'};
  if(!order.pmAck)return {code:'ack',actors:[p.pm].filter(Boolean),label:'تأكيد استلام مهندس المشروعات',en:'PM must acknowledge receipt'};
  const external=require('./supplier-scope').work(d,p.id);
  if((!p.tasks.length&&!external.length) || (coverage?.strict && !coverage.complete))return {code:'assign',actors:[p.pm].filter(Boolean),label:'توزيع الأعمال المتعاقد عليها واستكمال التسكين',en:'Assign the remaining contracted scope'};
  const conflicts=C.leaf(p.tasks).flatMap(t=>Handoff.conflictsFor(t));
  if(conflicts.length)return {code:'review_conflict',actors:[...new Set(conflicts.map(x=>x.checker||p.checker))],label:'تصحيح تعارض اعتماد المراجع مع تقديم المهندس',en:'Resolve approval / engineer submission conflict'};
  const sub=p.tasks.filter(t=>t.status==='submitted');
  if(sub.length)return {code:'review',actors:[...new Set(sub.map(t=>t.checker||p.checker).filter(Boolean))],label:'مراجعة تقديمات المهندسين',en:'Review engineer submissions'};
  const ret=p.tasks.filter(t=>t.status==='returned');
  if(ret.length)return {code:'rework',actors:[...new Set(ret.flatMap(t=>Handoff.items(t).filter(x=>x.r.status==='returned').map(x=>x.assignee)).filter(Boolean))],label:'معالجة ملاحظات المراجع وإعادة التقديم',en:'Resolve review comments and resubmit'};
  const handoff=Handoff.projectState(d,p);
  if(required(p).length&&required(p).every(t=>Handoff.exact100(t))&&!handoff.declarationsReady)return {code:'engineer_handoff',actors:[...new Set(handoff.missingDeclarations.map(x=>x.userId).filter(Boolean))],label:'تأكيد إنهاء المهندسين وإرسال التسليم النهائي',en:'Engineers confirm completion and submit final handoff'};
  if(external.some(x=>!x.accepted))return {code:'supplier_receipt',actors:[p.pm].filter(Boolean),route:'awards',label:'استلام بنود المورد الخارجية',en:'Projects engineer accepts external supplier items'};
  if(handoff.readyForFinalApproval&&!required(p).length)return {code:'external_final',actors:[p.pm].filter(Boolean),route:'projects',label:'تأكيد التسليم النهائي للأعمال الخارجية وإبلاغ الحسابات',en:'Confirm external final handoff'};
  if(handoff.readyForFinalApproval)return {code:'approve',actors:[p.checker].filter(Boolean),label:'تأكيد الاعتماد الفني النهائي',en:'Confirm final technical approval'};
  return {code:'work',actors:[...new Set(p.tasks.filter(t=>!approved(t)).flatMap(t=>Handoff.owners(t)).filter(Boolean))],label:'تنفيذ المهام وتحديث المنجز والمتبقي',en:'Execute tasks and update completed / remaining work'};
}
function directoryProject(d,p,u,canOpen,W) {
  const sm=summary(d,p,u);
  return {id:p.id,name:p.name,pm:p.pm,checker:p.checker,projectEngineer:p.projectEngineer||'',deadline:p.deadline||'',
    priority:p.priority||'Normal',operationalClosed:archived(p),historical:sm.historical,
    finalTechnicalApproved:!!p.finalTechnicalApproved,scopeProgress:require('./scope-progress').view(d,p),
    engineerPercent:percent(p.tasks,'progress'),checkerPercent:percent(p.tasks,'approvedProgress'),
    imageAvailable:W.imageEligible(d,p),imageRevision:d.projectImages[p.id]?.updatedAt||'',
    canOpen,team:sm.team,totalTasks:sm.tasks,summary:{tasks:sm.tasks,approved:sm.approved,submitted:sm.submitted,returned:sm.returned,progressQuality:sm.progressQuality},
    nextAction:nextAction(d,p,W.scopeCoverage(d,p))};
}
function timeChoices(d,u) {
  const rows=[];
  for(const p of d.data){
    if(archived(p)||p.projectDraft===true)continue;
    const own=C.leaf(p.tasks).filter(t=>Handoff.owners(t).includes(u.id));
    let tasks=[],activities=[];
    if(u.role==='Engineer')tasks=own;
    if(u.role==='Project Engineer'){tasks=own;if(p.projectEngineer===u.id)activities=['coordination'];}
    if(u.role==='Checker')tasks=C.leaf(p.tasks).filter(t=>(t.checker||p.checker)===u.id);
    if(u.role==='Project Manager'&&p.pm===u.id){tasks=C.leaf(p.tasks);activities=['project_management'];}
    if(u.role==='Owner'){tasks=C.leaf(p.tasks);activities=['management'];}
    if(u.role==='Accountant'){tasks=[];activities=['financial_administration'];}
    if(!tasks.length&&!activities.length)continue;
    rows.push({id:p.id,name:p.name,taskRequired:!activities.length,tasks:tasks.map(t=>({id:t.id,name:t.name})),activities});
  }
  return rows;
}
module.exports={n,copy,finance,archived,historical,approved,percent,canReadTime,timeRows,timeTotals,taskFacts,team,summary,nextAction,directoryProject,timeChoices};
