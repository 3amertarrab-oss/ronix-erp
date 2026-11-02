'use strict';
// R395: detailed engineer input, per-part checker decisions. No financial/time writes.
const crypto=require('node:crypto');
const C=require('./controls');
const W=require('./workflow');
const clone=x=>JSON.parse(JSON.stringify(x));
const now=()=>new Date().toISOString();
const uid=p=>p+'-'+crypto.randomUUID();
const check=C.check;
const text=(s,n=3000)=>String(s??'').trim().slice(0,n);
const DETAIL=[
 {code:'wire',label:'Wire Frame',group:'modeling',weight:25},
 {code:'connections',label:'Connections',group:'modeling',weight:40},
 {code:'ga',label:'GA Drawings',group:'fabrication',weight:10},
 {code:'assembly',label:'Assembly Drawings',group:'fabrication',weight:20},
 {code:'single',label:'Single Parts',group:'fabrication',weight:5}
];
function templateFor(d,p,t){
 const s=W.scopeOptions(W.source(d,p)).find(x=>x.id===t.scopeItemId);
 if(s&&!s.parentId&&s.serviceCode==='SRV-ST-DETL')return 'steel_detailing_65_35';
 return '';
}
function has(t){return t?.executionBoard?.template==='steel_detailing_65_35'&&Array.isArray(t.executionBoard.parts);}
function validPercent(v){check(v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100,'INVALID_PERCENT','نسبة الجزء بين 0 و100');return Number(v);}
function finished(r){return r.status==='confirmed'&&r.approvedProgress===100&&!!r.submissions?.length&&r.reviewedSubmissionId===r.submissions.at(-1).id;}
function summary(board){
 const a=board.parts;const total=a.reduce((s,x)=>s+x.weight,0);
 const pct=k=>{if(!total)return null;const reviewed=a.some(x=>Number.isFinite(x[k]));if(!reviewed)return null;return Math.round(a.reduce((s,x)=>s+x.weight*(Number.isFinite(x[k])?x[k]:0),0)/total*100)/100};
 const group=g=>{const rows=a.filter(x=>x.group===g),weight=rows.reduce((s,x)=>s+x.weight,0);const weighted=k=>weight&&rows.some(x=>Number.isFinite(x[k]))?Math.round(rows.reduce((s,x)=>s+x.weight*(Number.isFinite(x[k])?x[k]:0),0)/weight*100)/100:null;return {weight,reported:weighted('progress'),approved:weighted('approvedProgress')};};
 return {engineerPercent:pct('progress'),checkerPercent:pct('approvedProgress'),modeling:group('modeling'),fabrication:group('fabrication'),allApproved:a.length>0&&a.every(finished),pending:a.filter(r=>r.status==='submitted').length,returned:a.filter(r=>r.status==='returned').length};
}
function sync(t){
 const s=summary(t.executionBoard);
 // A reopened board with no current part values must not retain the old
 // package totals. Previous decisions remain in assessments/reopenHistory.
 t.progress=s.engineerPercent;
 t.approvedProgress=s.checkerPercent;
 if(s.allApproved){t.status='confirmed';t.confirmedAt=now();}
 else if(s.pending)t.status='submitted';else if(s.returned)t.status='returned';else t.status='in_progress';
 t.updatedAt=now();return s;
}
function initialize(d,u,p,t,{fresh=false,reason=''}={}){
 check(templateFor(d,p,t),'SCOPE_TEMPLATE_UNAVAILABLE','قالب 65/35 متاح لحزمة Full Detailing فقط؛ لا يضاف إلى Design أو بند منفرد');
 check(!has(t),'ALREADY_DETAILED','لوحة الأجزاء موجودة بالفعل',409);
 if(!fresh){check(reason,'REASON_REQUIRED','اكتب سبب الانتقال للمتابعة التفصيلية');check(!['submitted','confirmed'].includes(t.status),'TASK_LOCKED','أكمل مراجعة التقديم الحالي أو أعد فتحه موثقًا قبل الانتقال للتفصيل',409);}
 const pristine=t.status==='todo'&&Number(t.progress||0)===0&&Number(t.approvedProgress||0)===0&&!t.submissions?.length&&!t.assessments?.length;
 t.executionBoard={version:1,template:'steel_detailing_65_35',createdAt:now(),createdBy:u.id,reason:reason||'قالب الحزمة المعتمد',baseline:!pristine?{progress:t.progress,approvedProgress:t.approvedProgress,status:t.status,workRevision:t.workRevision||0,at:now(),note:'تقييم إجمالي سابق محفوظ؛ لا يوزع على الأجزاء بالتخمين'}:null,parts:DETAIL.map(x=>({...x,id:uid('PART'),progress:pristine?0:null,approvedProgress:null,status:'todo',revision:0,assignee:t.assignee,checker:t.checker||p.checker,completedNote:'',remainingNote:'',submissions:[],assessments:[]}))};
 return t.executionBoard;
}
function safe(d,u,p,t){
 const eligible=!!templateFor(d,p,t);if(!has(t))return {eligible,enabled:false,canEnable:eligible&&!p.operationalClosed&&!p.finalTechnicalApproved&&(u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id||['Engineer','Project Engineer'].includes(u.role)&&t.assignee===u.id)&&!['submitted','confirmed'].includes(t.status)};
 const b=t.executionBoard,active=!p.operationalClosed&&!p.finalTechnicalApproved&&!t.removedAt;
 return {eligible,enabled:true,template:b.template,baseline:clone(b.baseline),summary:summary(b),parts:b.parts.map(r=>({...clone(r),canEdit:active&&['Engineer','Project Engineer'].includes(u.role)&&(r.assignee||t.assignee)===u.id&&!['submitted','confirmed'].includes(r.status),canReview:active&&u.role==='Checker'&&(r.checker||t.checker||p.checker)===u.id&&r.status==='submitted',canReopen:!p.operationalClosed&&!t.removedAt&&u.role==='Checker'&&(r.checker||t.checker||p.checker)===u.id&&['submitted','confirmed'].includes(r.status)}))};
}
function validate(t){
 if(!has(t))return;const b=t.executionBoard;
 check(b.parts.length===5&&new Set(b.parts.map(x=>x.id)).size===5&&new Set(b.parts.map(x=>x.code)).size===5,'BAD_EXECUTION_PARTS','بيانات لوحة الأجزاء غير مكتملة');
 for(const r of b.parts){const expected=DETAIL.find(x=>x.code===r.code);check(expected&&r.weight===expected.weight&&r.group===expected.group,'BAD_PART_WEIGHT','أوزان الأجزاء لا تطابق قالب 65/35');for(const key of ['progress','approvedProgress'])if(r[key]!==null)validPercent(r[key]);}
}
function action(d,u,p,type,b,ctx){
 if(!['execution_board_enable','execution_parts_save','execution_parts_submit','execution_parts_review','execution_part_reopen'].includes(type))return {handled:false};
 check(p&&!p.operationalClosed,'PROJECT_ARCHIVED','أعد فتح المشروع إداريًا قبل تعديل التنفيذ');
 const t=p.tasks.find(x=>x.id===b.taskId&&!x.removedAt);check(t&&!t.isSummary,'TASK_NOT_FOUND','اختر التكليف التنفيذي',404);
 if(type==='execution_board_enable'){const engineer=['Engineer','Project Engineer'].includes(u.role)&&t.assignee===u.id;if(engineer){check(d.ops.orders.some(o=>o.projectId===p.id&&o.status==='issued'&&o.pmAck),'ACK_REQUIRED','استلام مهندس المشروعات مطلوب قبل التنفيذ');}else ctx.checkPM(d,u,p);ctx.ensureNotFinal(p);initialize(d,u,p,t,{reason:text(b.reason)});return {handled:true,result:{taskId:t.id,boardEnabled:true}};}
 check(has(t),'BOARD_REQUIRED','لم تفعل لوحة الأجزاء لهذا التكليف');
 const board=t.executionBoard;
 if(type==='execution_part_reopen'){
  check(u.role==='Checker','CHECKER_ONLY','الإجراء للمراجع',403);const r=board.parts.find(x=>x.id===b.partId);check(r&&(r.checker||t.checker||p.checker)===u.id,'FORBIDDEN','الجزء لمراجع آخر',403);check(['confirmed','submitted'].includes(r.status),'PART_NOT_LOCKED','هذا الجزء متاح للتحديث بالفعل',409);
  const reason=text(b.reason);check(reason,'REASON_REQUIRED','سبب إعادة الفتح مطلوب');
  (r.reopenHistory??=[]).push({at:now(),by:u.id,reason,progress:r.progress,approvedProgress:r.approvedProgress,reviewedSubmissionId:r.reviewedSubmissionId,status:r.status});
  r.revision++;r.status='returned';r.lastReturnReason=reason;r.progress=null;r.approvedProgress=null;r.reviewedSubmissionId='';r.updatedAt=now();
  // A previous package-level final approval remains in history; reopen only affected scope.
  if(p.finalTechnicalApproved){(p.technicalApprovalHistory??=[]).push(clone(p.finalApprovalRecord||{by:p.finalTechnicalApprovedBy,at:p.finalTechnicalApprovedAt}));p.finalTechnicalApproved=false;p.accountsReady=false;p.engineeringGate='revision_open';p.engineeringStatus='revision_required';}
  sync(t);ctx.notify(d,[r.assignee||t.assignee],'part_reopened',p.id,r.label+' — '+reason);return {handled:true,result:{taskId:t.id,partId:r.id}};
 }
 ctx.ensureNotFinal(p);
 const list=b.parts;check(Array.isArray(list)&&list.length>0&&list.length<=5,'PARTS_REQUIRED','اختر أجزاء العمل المطلوب حفظها أو مراجعتها');check(new Set(list.map(x=>x.id)).size===list.length,'DUPLICATE_PART','الجزء مكرر داخل الطلب');
 if(type==='execution_parts_save'||type==='execution_parts_submit'){
  check(['Engineer','Project Engineer'].includes(u.role),'ENGINEER_ONLY','تحديث الإنجاز للمهندس المكلف',403);
  const normalized=list.map(x=>{const r=board.parts.find(r=>r.id===x.id);check(r&&(r.assignee||t.assignee)===u.id,'WRONG_ASSIGNEE','لا تعدل جزءًا لمهندس آخر',403);check(!['submitted','confirmed'].includes(r.status),'PART_LOCKED','جزء مرسل أو معتمد؛ حدّث الشاشة أو اطلب إعادة فتح',409);check(Number(x.basePartRevision)===r.revision,'STALE_PART','تغير هذا الجزء؛ أعد فتح اللوحة',409);const per=validPercent(x.percent);return {r,per,completed:text(x.completedNote),remaining:text(x.remainingNote),note:text(x.progressNote),eta:x.eta?C.validDate(x.eta):''};});
  const sent=[];for(const {r,per,completed,remaining,note,eta}of normalized){r.progress=per;r.completedNote=completed;r.remainingNote=remaining;r.progressNote=note;r.eta=eta;r.updatedAt=now();r.updatedBy=u.id;r.revision++;r.status='in_progress';
   if(type==='execution_parts_submit'){const checker=d.teamUsers.find(x=>x.id===(r.checker||t.checker||p.checker)&&x.role==='Checker'&&x.active!==false);check(checker,'CHECKER_REQUIRED','حدد مراجعًا فعالًا');const s={id:uid('SUBP'),revision:r.revision,percent:per,completedNote:completed,remainingNote:remaining,progressNote:note,eta,by:u.id,at:now()};r.submissions.push(s);r.status='submitted';sent.push({partId:r.id,submissionId:s.id});ctx.notify(d,[checker.id],'part_review_required',p.id,'مراجعة '+r.label+' — '+t.name);}
  }
  const s=sync(t);if(type==='execution_parts_submit'){const rec={id:uid('SUB'),revision:(t.workRevision||0)+1,percent:s.engineerPercent??t.progress,parts:sent,by:u.id,at:now(),kind:'parts_submission'};t.workRevision=rec.revision;(t.submissions??=[]).push(rec);}
  ctx.notify(d,[p.pm,...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)],'parts_updated',p.id,'تحديث أجزاء '+t.name+' — '+u.name);
  return {handled:true,result:{taskId:t.id,partsUpdated:normalized.map(x=>x.r.id),submitted:type==='execution_parts_submit'}};
 }
 check(u.role==='Checker','CHECKER_ONLY','المراجعة الفنية للمراجع المعيّن',403);
 const reviews=list.map(x=>{const r=board.parts.find(r=>r.id===x.id);check(r&&(r.checker||t.checker||p.checker)===u.id,'FORBIDDEN','جزء غير مسند لهذا المراجع',403);const s=r.submissions.at(-1);check(r.status==='submitted'&&s&&s.id===x.submissionId,'STALE_SUBMISSION','التقديم لم يعد منتظرًا أو تغير',409);const per=validPercent(x.percent),reason=text(x.reason),decision=x.decision||'assess';check(['assess','return'].includes(decision),'INVALID_DECISION','قرار غير صحيح');check(!(decision==='return'||per!==s.percent)||reason,'REASON_REQUIRED','اذكر سبب الإرجاع أو تعديل نسبة المهندس');check(per<=s.percent,'REVIEW_EXCEEDS_SUBMISSION','نسبة الاعتماد لا تتجاوز آخر نسبة قدمها المهندس؛ أعد الجزء للتحديث أولًا',409);return {r,s,per,reason,decision};});
 for(const {r,s,per,reason,decision}of reviews){const a={id:uid('REVP'),submissionId:s.id,engineerPercent:s.percent,percent:per,reason,decision:decision==='return'?'returned':per===100?'approved':'assessed',by:u.id,at:now()};r.assessments.push(a);r.approvedProgress=per;r.reviewedSubmissionId=s.id;r.status=decision==='return'?'returned':per===100?'confirmed':'reviewed';r.lastReturnReason=decision==='return'?reason:'';r.revision++;r.updatedAt=now();if(r.status==='confirmed'){r.confirmedAt=a.at;r.confirmedBy=u.id;r.lockedSubmissionId=s.id;}ctx.notify(d,[r.assignee||t.assignee,p.pm,...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)],r.status==='confirmed'?'part_approved_closed':'part_review_result',p.id,(r.status==='confirmed'?'تم اعتماد وإقفال ':'نتيجة مراجعة ')+r.label+' — '+per+'% — '+(u.name||u.id)+' — '+a.at+(reason?' — '+reason:''));}
 const result=sync(t);(t.assessments??=[]).push({id:uid('REV'),decision:result.allApproved?'approved':'parts_assessed',parts:reviews.map(x=>x.r.id),percent:result.checkerPercent,engineerPercent:result.engineerPercent,by:u.id,at:now(),kind:'parts_review'});
 if(result.allApproved)t.reviewedSubmissionId=t.submissions?.at(-1)?.id||'';
 return {handled:true,result:{taskId:t.id,partsReviewed:reviews.length,allApproved:result.allApproved}};
}
module.exports={DETAIL,has,templateFor,summary,finished,initialize,safe,validate,action};
