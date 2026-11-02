'use strict';
// Dual approval, scoped activity catalogue, immutable costing snapshots, reversible disposal.
// This module does not post salary deductions, journal entries, or commercial value changes.
const crypto = require('node:crypto');
const W = require('./workflow');
const id = prefix => prefix + '-' + crypto.randomUUID();
const at = () => new Date().toISOString();
const clone = x => JSON.parse(JSON.stringify(x));
const n = x => Number.isFinite(Number(x)) ? Number(x) : 0;
const fin = u => ['Owner','Accountant'].includes(u?.role);
const removed = x => !!x?.removedAt;
const live = rows => (rows || []).filter(x => !removed(x));
const leaf = tasks => live(tasks).filter(t => !t.isSummary);
const closed = p => !!p?.operationalClosed || p?.operationalStatus === 'archived' || removed(p);
const text = (x,max=2000) => String(x??'').trim().slice(0,max);
function fail(code,message,status=400) { const e = new Error(message); e.code=code;e.status=status;throw e; }
function check(ok,code,msg,status=400){if(!ok)fail(code,msg,status);}
function validDate(v){check(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'INVALID_DATE','تاريخ غير صحيح');return v;}
function hours(v){check(typeof v==='number'||typeof v==='string'&&v.trim()!=='','INVALID_HOURS','الساعات يجب أن تكون رقمًا');const x=Number(v);check(Number.isFinite(x)&&x>=.25&&x<=24&&Number.isInteger(x*4),'INVALID_HOURS','الساعات بين ربع ساعة و24 ساعة، بمضاعفات ربع ساعة');return x;}
function revisionLabel(v){const s=text(v||'R0',24).toUpperCase().replace(/^REV\s*/,'R').replace(/\s+/g,'');check(/^R\d{1,4}$/.test(s),'INVALID_WORK_REVISION','اكتب المراجعة مثل R0 أو Rev1');return s;}
function init(d){
 d.costRates=Array.isArray(d.costRates)?d.costRates:[];
 // Previous rates are preserved for reconciliation; no historical rate is fabricated.
 d.ops.controls=d.ops.controls||{version:1,installedAt:at(),costPolicy:'ROUND_HALF_UP_EGP_PER_APPROVED_ENTRY',pastRates:'UNVERIFIED_UNTIL_OWNER_DEFINES_EFFECTIVE_DATES'};
 return d;
}
function ownerIds(d){return d.teamUsers.filter(x=>x.active!==false&&x.role==='Owner').map(x=>x.id);}
function reviewerId(p,ts){return p?.tasks.find(t=>t.id===ts.taskId)?.checker || p?.checker || '';}
function privateTime(d,ts){const role=ts.roleAtSubmit||d.teamUsers.find(x=>x.id===ts.user)?.role;return role==='Accountant'||ts.activityType==='financial_administration';}
function canReadTime(d,u,p,ts){
 if(fin(u)||ts.user===u.id)return true;
 if(!p||privateTime(d,ts))return false;
 if(u.role==='Project Manager'&&p.pm===u.id)return true;
 return u.role==='Checker'&&(ts.status==='pending'||!!ts.correctionRequestedAt)&&canApprove(d,u,p,ts);
}
function canApprove(d,u,p,ts){
 if(ts.user===u.id)return false;
 if(u.role==='Owner')return true;
 if(!p)return false;
 const targetRole=ts.roleAtSubmit||d.teamUsers.find(x=>x.id===ts.user)?.role;
 return u.role==='Checker'&&['Engineer','Project Engineer','Project Manager'].includes(targetRole)&&!privateTime(d,ts)&&reviewerId(p,ts)===u.id;
}
function approverIds(d,p,ts){return [...new Set([...ownerIds(d),reviewerId(p,ts)])].filter(k=>{const u=d.teamUsers.find(x=>x.id===k&&x.active!==false);return u&&canApprove(d,u,p,ts)});}
function historicalRate(d,userId,date){return d.costRates.filter(x=>x.userId===userId&&x.effectiveFrom<=date&&x.active!==false).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||n(b.sequence)-n(a.sequence))[0]||null;}
function costSnapshot(d,ts,by){
 const rate=historicalRate(d,ts.user,ts.date);if(!rate)return null;
 const quarters=Math.round(n(ts.approvedHours??ts.hours)*4),basisQuarterEGP=quarters*rate.rateEGP;
 check(Number.isSafeInteger(basisQuarterEGP),'COST_OVERFLOW','قيمة التكلفة خارج النطاق');
 return {currency:'EGP',rateId:rate.id,rateEGP:rate.rateEGP,effectiveFrom:rate.effectiveFrom,workDate:ts.date,approvedHours:quarters/4,basisQuarterEGP,amountEGP:Math.floor((basisQuarterEGP+2)/4),roundingPolicy:'ROUND_HALF_UP_EGP_PER_APPROVED_ENTRY',capturedAt:at(),capturedBy:by};
}
function costSummary(d,pid){
 const rows=d.timesheets.filter(t=>(!pid||t.projectId===pid)&&!['rejected','superseded','void'].includes(t.status));
 const approved=rows.filter(t=>t.status==='approved'),priced=approved.filter(t=>t.costSnapshot&&Number.isSafeInteger(t.costSnapshot.amountEGP));
 const total=(r,key='hours')=>Math.round(r.reduce((s,t)=>s+n(t[key]??t.hours),0)*100)/100;
 return {loggedHours:total(rows),approvedHours:total(approved,'approvedHours'),pendingHours:total(rows.filter(t=>t.status==='pending')),returnedHours:total(rows.filter(t=>t.status==='returned')),knownCostEGP:priced.reduce((s,t)=>s+t.costSnapshot.amountEGP,0),unpricedHours:total(approved.filter(t=>!t.costSnapshot),'approvedHours'),unpricedCount:approved.filter(t=>!t.costSnapshot).length,complete:approved.every(t=>!!t.costSnapshot)&&!rows.some(t=>['pending','returned'].includes(t.status)),policy:'Approved-only; price snapshots; not payroll; no automatic GL posting'};
}
function safeTime(d,u,p,ts){
 const keys=['id','projectId','taskId','user','date','hours','note','status','approvedHours','approvedBy','approvedAt','activityType','activityId','activityLabel','revisionLabel','tool','roleAtSubmit','createdAt','updatedAt','revision','dailyDayId','submittedAt','correctionRequestedAt','correctionReason','reviewNote','reviewedBy','reviewedAt'];
 const r=Object.fromEntries(keys.map(k=>[k,ts[k]??'']));
 r.activityLabel=ts.activityLabel||p?.tasks.find(t=>t.id===ts.taskId)?.name||ts.activityType||'—';
 r.revisionLabel=ts.revisionLabel||'غير موثق / Legacy';
 r.reviewHistory=clone(ts.reviewHistory||[]);r.editHistory=(ts.editHistory||[]).map(e=>({at:e.at,by:e.by,date:e.date,hours:e.hours,note:e.note,activityLabel:e.activityLabel,revisionLabel:e.revisionLabel}));
 r.canReview=ts.status==='pending'&&canApprove(d,u,p,ts);
 r.canCorrect=['approved','rejected'].includes(ts.status)&&(!closed(p)||!!ts.dailyDayId)&&canApprove(d,u,p,ts);
 r.canEdit=!ts.dailyDayId&&(ts.status==='returned'||!d.dailyTime?.policy?.enabled&&ts.status==='pending')&&ts.user===u.id&&(!closed(p)||!!ts.dailyDayId);r.canRequestCorrection=ts.user===u.id&&['pending','approved','rejected'].includes(ts.status)&&!ts.correctionRequestedAt;
 if(fin(u)){r.costSnapshot=clone(ts.costSnapshot||null);r.costHistory=clone(ts.costHistory||[]);r.costState=ts.status!=='approved'?'not_approved':ts.costSnapshot?'priced':'rate_missing';}
 return r;
}
function taskActivityOptions(d,p,t){
 const custom=live(t.timeActivities||[]).map(x=>({id:x.id,label:x.label,code:x.code||'',custom:true,createdAt:x.createdAt||'',createdBy:x.createdBy||''}));
 const src=W.scopeOptions(W.source(d,p));const root=src.find(x=>x.id===t.scopeItemId);
 const children=root?src.filter(x=>x.parentId===root.id):[];
 const parts=(t.executionBoard?.parts||[]).map(r=>({id:'PART:'+r.id,label:r.label,code:r.code}));
 const opts=[{id:'TASK',label:t.name,code:t.scopeServiceCode||''},...parts,...children.map(x=>({id:'SCOPE:'+x.id,label:x.label,code:x.serviceCode}))];
 return [...opts,...custom];
}
function chooseActivity(d,p,t,b){
 if(!t)return {activityId:'ROLE',activityLabel:text(b.activityType,80)};
 const opts=taskActivityOptions(d,p,t);const selected=opts.find(x=>x.id===(b.activityId||'TASK'));
 check(selected,'ACTIVITY_NOT_AVAILABLE','اختر نشاطًا من قائمة التكليف نفسه');return {activityId:selected.id,activityLabel:selected.label};
}
function addActivity(d,u,p,b,ctx){
 check(p&&!closed(p),'PROJECT_ARCHIVED','لا تضف نشاطًا جديدًا لمشروع مؤرشف');const t=p.tasks.find(x=>x.id===b.taskId&&!removed(x));check(t,'TASK_NOT_FOUND','التكليف غير موجود');
 check(!t.isSummary,'SUMMARY_TASK','اختر مهمة تنفيذية، لا الحزمة الرئيسية');
 check(u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id||['Engineer','Project Engineer'].includes(u.role)&&(t.executionBoard?.parts?.length?t.executionBoard.parts.some(r=>(r.assignee||t.assignee)===u.id):t.assignee===u.id)||u.role==='Checker'&&reviewerId(p,{taskId:t.id})===u.id,'FORBIDDEN','النشاط داخل تكليفك فقط',403);
 const label=text(b.label,150);check(label,'LABEL_REQUIRED','اكتب اسم النشاط الفرعي');
 const previous=(t.timeActivities||[]).find(x=>x.label.trim().toLowerCase()===label.toLowerCase()&&!removed(x));if(previous)return {activityId:previous.id,existing:true};
 const a={id:id('ACT'),label,code:text(b.code,40),createdAt:at(),createdBy:u.id,kind:'time_activity_only'};(t.timeActivities??=[]).push(a);
 return {activityId:a.id,taskId:t.id};
}
function timeAdd(d,u,p,b,ctx){
 check(!d.dailyTime?.policy?.enabled,'USE_DAILY_ENTRY','سجّل الساعات من نموذج اليوم ثم أرسل اليوم كاملًا للاعتماد.');
 const {O}=ctx;check(p&&!closed(p),'PROJECT_ARCHIVED','المشروع مؤرشف؛ لا تسجل تنفيذًا جديدًا عليه');
 const choice=O.timeChoices(d,u).find(x=>x.id===p.id);check(choice,'FORBIDDEN','الساعات على تكليفاتك ومشروعاتك فقط',403);
 let t=null,activityType='task';if(b.taskId){t=p.tasks.find(x=>x.id===b.taskId&&!removed(x));check(t&&choice.tasks.some(x=>x.id===t.id)&&!t.isSummary,'WRONG_ASSIGNEE','اختر مهمة تنفيذية متاحة لك',403);}
 else{activityType=text(b.activityType,80);check(!choice.taskRequired&&choice.activities.includes(activityType),'TASK_REQUIRED','اختر مهمة أو نشاطًا مسموحًا لدورك');}
 const h=hours(b.hours),date=validDate(b.date),note=text(b.note,4000);check(note,'NOTE_REQUIRED','اكتب وصف العمل');
 const total=d.timesheets.filter(x=>x.user===u.id&&x.date===date&&!['rejected','superseded','void'].includes(x.status)).reduce((s,x)=>s+n(x.hours),0);
 check(total+h<=24,'DAILY_HOURS_EXCEEDED','إجمالي ساعات اليوم لا يتجاوز 24 ساعة');
 const act=chooseActivity(d,p,t,b);
 const ts={id:id('TS'),user:u.id,roleAtSubmit:u.role,projectId:p.id,taskId:t?.id||'',activityType,...act,revisionLabel:revisionLabel(b.revisionLabel),tool:text(b.tool,60),date,hours:h,note,status:'pending',revision:1,createdAt:at(),reviewHistory:[],editHistory:[]};
 d.timesheets.push(ts);ctx.notify(d,approverIds(d,p,ts),'timesheet_submitted',p.id,'ساعات عمل بانتظار الاعتماد: '+u.name,privateTime(d,ts));return {timesheetId:ts.id};
}
function timeReview(d,u,p,b,ctx){
 const ts=d.timesheets.find(x=>x.id===b.timesheetId&&x.projectId===(p?.id||''));check(ts,'NOT_FOUND','سجل الوقت غير موجود',404);
 check(canApprove(d,u,p,ts),'FORBIDDEN','اعتماد الوقت للمالك أو المراجع المعيّن، ولا يسمح باعتماد ساعاتك بنفسك',403);
 check(ts.status==='pending','TIMESHEET_NOT_PENDING','الساعات لم تعد بانتظار الاعتماد؛ حدّث الصفحة',409);
 if(b.timeRevision!==undefined)check(Number(b.timeRevision)===n(ts.revision||1),'STALE_TIMESHEET','تغير سجل الوقت؛ راجعه مجددًا',409);
 const decision=b.decision||'approve',reason=text(b.reason,2000);check(['approve','return','reject'].includes(decision),'INVALID_DECISION','قرار غير صالح');
 let approvedHours=0;
 if(decision==='approve'){approvedHours=b.approvedHours===undefined?ts.hours:hours(b.approvedHours);check(approvedHours<=ts.hours,'INVALID_APPROVED_HOURS','الساعات المعتمدة لا تتجاوز المسجلة');check(approvedHours===ts.hours||reason,'REASON_REQUIRED','اذكر سبب الاعتماد الجزئي');}
 else check(reason,'REASON_REQUIRED','سبب الإرجاع أو الرفض مطلوب');
 const entry={id:id('TREV'),at:at(),by:u.id,decision,submittedHours:ts.hours,approvedHours,reason,timeRevision:ts.revision||1};
 (ts.reviewHistory??=[]).push(entry);ts.reviewedBy=u.id;ts.reviewedAt=entry.at;ts.reviewNote=reason;
 if(decision==='approve'){ts.status='approved';ts.approvedHours=approvedHours;ts.approvedBy=u.id;ts.approvedAt=entry.at;ts.costSnapshot=costSnapshot(d,ts,u.id);}
 else {ts.status=decision==='return'?'returned':'rejected';ts.approvedHours=0;}
 ts.revision=n(ts.revision||1)+1;ts.correctionRequestedAt='';
 ctx.notify(d,[ts.user],'timesheet_reviewed',p?.id||'','نتيجة مراجعة الساعات: '+(decision==='approve'?'معتمدة':decision==='return'?'مرتجعة للتصحيح':'مرفوضة')+(reason?' — '+reason:''),privateTime(d,ts));
 return {timesheetId:ts.id,status:ts.status,approvedHours:ts.approvedHours};
}
function timeEdit(d,u,p,b,ctx){
 const ts=d.timesheets.find(x=>x.id===b.timesheetId&&x.projectId===(p?.id||''));check(ts&&ts.user===u.id,'FORBIDDEN','التعديل لصاحب سجل الوقت',403);
 check(!ts.dailyDayId,'USE_DAILY_DAY','صحّح هذا السطر من يومه في تسجيل ساعاتي');
 check((!closed(p)||!!ts.dailyDayId)&&(ts.status==='returned'||!d.dailyTime?.policy?.enabled&&ts.status==='pending'),'TIME_LOCKED','السجل مقفل؛ اطلب إرجاعًا موثقًا قبل تصحيحه',409);
 check(Number(b.timeRevision)===n(ts.revision||1),'STALE_TIMESHEET','تغير سجل الساعات',409);
 const h=hours(b.hours),date=validDate(b.date),note=text(b.note,4000);check(note,'NOTE_REQUIRED','وصف العمل مطلوب');if(ts.dailyDayId)check(date===ts.date,'DAY_DATE_LOCKED','تاريخ اليوم ثابت؛ صحح التوزيع دون نقل الساعات ليوم آخر');
 check(d.timesheets.filter(x=>x.id!==ts.id&&x.user===u.id&&x.date===date&&!['rejected','superseded','void'].includes(x.status)).reduce((s,x)=>s+n(x.hours),0)+h<=24,'DAILY_HOURS_EXCEEDED','إجمالي اليوم يتجاوز 24 ساعة');
 (ts.editHistory??=[]).push({at:at(),by:u.id,date:ts.date,hours:ts.hours,note:ts.note,activityLabel:ts.activityLabel,revisionLabel:ts.revisionLabel,revision:ts.revision||1});
 Object.assign(ts,{date,hours:h,note,revisionLabel:revisionLabel(b.revisionLabel||ts.revisionLabel),tool:text(b.tool??ts.tool,60),status:'pending',approvedHours:0,updatedAt:at(),revision:n(ts.revision||1)+1});
 ctx.notify(d,approverIds(d,p,ts),'timesheet_resubmitted',p?.id||'','أعيد تقديم الساعات بعد التصحيح: '+u.name,privateTime(d,ts));return {timesheetId:ts.id};
}
function timeReopen(d,u,p,b,ctx){
 const ts=d.timesheets.find(x=>x.id===b.timesheetId&&x.projectId===(p?.id||''));check(ts&&canApprove(d,u,p,ts),'FORBIDDEN','التصحيح للمالك أو المراجع المختص',403);
 check(['approved','rejected'].includes(ts.status),'TIME_NOT_CLOSED','لا يوجد قرار مقفل لإعادته');const reason=text(b.reason);check(reason,'REASON_REQUIRED','سبب التصحيح مطلوب');
 check(!closed(p)||!!ts.dailyDayId,'PROJECT_ARCHIVED','أعد فتح المشروع إداريًا قبل إعادة سجل للتصحيح');
 (ts.reviewHistory??=[]).push({id:id('TREV'),decision:'reopen',by:u.id,at:at(),reason,previousStatus:ts.status,submittedHours:ts.hours,approvedHours:ts.approvedHours??ts.hours});
 if(ts.costSnapshot)(ts.costHistory??=[]).push({...ts.costSnapshot,replacedAt:at(),replacedBy:u.id,reason});
 ts.costSnapshot=null;ts.status='returned';ts.approvedHours=0;ts.reviewNote=reason;ts.reviewedAt=at();ts.reviewedBy=u.id;ts.revision=n(ts.revision||1)+1;ts.correctionRequestedAt='';
 ctx.notify(d,[ts.user],'timesheet_correction_requested',p?.id||'','ساعات تحتاج تصحيحًا موثقًا — '+reason,privateTime(d,ts));return {timesheetId:ts.id};
}
function rateSet(d,u,b){
 check(u.role==='Owner','OWNER_ONLY','تحديد سعر التكلفة للمالك فقط',403);check(d.teamUsers.some(x=>x.id===b.userId),'INVALID_USER','الموظف غير موجود');
 check(typeof b.rateEGP==='number'||typeof b.rateEGP==='string'&&b.rateEGP.trim()!=='','INVALID_RATE','أدخل سعرًا صريحًا؛ الخانة الفارغة ليست صفرًا');const rate=Number(b.rateEGP),date=validDate(b.effectiveFrom),reason=text(b.reason);check(Number.isSafeInteger(rate)&&rate>=0&&rate<=1000000,'INVALID_RATE','السعر بالجنيه الصحيح من صفر إلى مليون');check(reason,'REASON_REQUIRED','اكتب مرجع أو سبب السعر');
 init(d);const entry={id:id('RATE'),userId:b.userId,rateEGP:rate,currency:'EGP',effectiveFrom:date,recordedAt:at(),recordedBy:u.id,reason,sequence:d.costRates.length+1};d.costRates.push(entry);
 return {rateId:entry.id};
}
function timePrice(d,u,p,b){
 check(u.role==='Owner','OWNER_ONLY','تثبيت أو تصحيح السعر التاريخي للمالك',403);const ts=d.timesheets.find(t=>t.id===b.timesheetId&&t.projectId===(p?.id||''));check(ts&&ts.status==='approved','TIME_NOT_APPROVED','يلزم سجل ساعات معتمد');const reason=text(b.reason);check(reason,'REASON_REQUIRED','اكتب سبب تثبيت/تصحيح التكلفة');const snapshot=costSnapshot(d,ts,u.id);check(snapshot,'RATE_MISSING','عرّف سعر الموظف بتاريخ العمل أولًا');
 if(ts.costSnapshot)(ts.costHistory??=[]).push({...ts.costSnapshot,replacedAt:at(),replacedBy:u.id,reason});ts.costSnapshot=snapshot;ts.costPricedReason=reason;return {timesheetId:ts.id};
}
function splitTask(d,u,p,b,ctx){
 ctx.checkPM(d,u,p);ctx.ensureNotFinal(p);const t=p.tasks.find(x=>x.id===b.taskId&&!removed(x));check(t&&!t.isSummary,'TASK_NOT_FOUND','اختر الحزمة الأصلية غير المفصلة');
 check(!t.submissions?.length&&!t.reviewCycles?.length&&!n(t.progress)&&!n(t.approvedProgress)&&!d.timesheets.some(x=>x.projectId===p.id&&x.taskId===t.id),'TASK_HAS_HISTORY','الحزمة لها تنفيذ أو ساعات/تاريخ؛ لا تقسّم الماضي. أنشئ تكليف مراجعة موثقًا بدلًا منه',409);
 const scope=W.scopeOptions(W.source(d,p));const options=scope.filter(x=>x.parentId===t.scopeItemId);check(options.length,'NO_SCOPE_CHILDREN','لا توجد تفاصيل مشمولة مثبتة للحزمة؛ حدد النطاق المعتمد أولًا');
 const children=b.children;check(Array.isArray(children)&&children.length===options.length,'CHILDREN_REQUIRED','وزّع كل تفاصيل الحزمة المشمولة');const seen=new Set();let sum=0;
 for(const c of children){check(options.some(x=>x.id===c.scopeItemId)&&!seen.has(c.scopeItemId),'INVALID_SCOPE','تفاصيل نطاق غير صالحة أو مكررة');seen.add(c.scopeItemId);sum+=Number(c.weight);check(Number.isFinite(Number(c.weight))&&Number(c.weight)>0,'INVALID_WEIGHT','وزن كل جزء موجب');check(!leaf(p.tasks).some(x=>x.id!==t.id&&x.scopeItemId===c.scopeItemId),'DUPLICATE_SCOPE_TASK','هذا الجزء موزع بالفعل');}
 check(Math.abs(sum-n(t.weight||1))<.00001,'WEIGHT_TOTAL','مجموع أوزان الأجزاء يجب أن يساوي وزن الحزمة الأصلي');
 const ids=[];for(const c of children){const s=options.find(x=>x.id===c.scopeItemId),e=ctx.user(d,c.assignee||t.assignee),ch=ctx.user(d,c.checker||t.checker||p.checker);check(['Engineer','Project Engineer'].includes(e.role)&&ch.role==='Checker','INVALID_TEAM','اختر مهندسًا ومراجعًا صحيحين');const due=validDate(c.due||t.due),start=c.startDate||t.startDate||'';if(start)check(validDate(start)<=due,'DATE_ORDER','موعد البداية بعد التسليم');const planned=Number(c.plannedHours??0);check(Number.isFinite(planned)&&planned>=0&&planned<=100000,'INVALID_HOURS','ساعات التخطيط غير صالحة');const child={id:id('TSK'),parentTaskId:t.id,name:s.label,scopeItemId:s.id,scopeServiceCode:s.serviceCode,assignee:e.id,checker:ch.id,assignedBy:u.id,assignedAt:at(),startDate:start,due,weight:Number(c.weight),plannedHours:planned,priority:t.priority||'Normal',assignmentNotes:text(c.assignmentNotes||t.assignmentNotes,4000),required:true,status:'todo',progress:0,approvedProgress:0,submissions:[],assessments:[],reviewCycles:[]};p.tasks.push(child);ids.push(child.id);const beforeIds=new Set(d.ops.notifications.map(n=>n.id));ctx.notify(d,[e.id],'task_assigned',p.id,'تكليف تفصيلي: '+s.label);for(const nt of d.ops.notifications)if(!beforeIds.has(nt.id))nt.taskId=child.id;}
 t.isSummary=true;t.childTaskIds=ids;t.requiredBeforeSplit=t.required!==false;t.required=false;t.splitAt=at();t.splitBy=u.id;
 return {taskId:t.id,childTaskIds:ids};
}
function taskExtras(d,p,t){return {isSummary:!!t.isSummary,splitAt:t.splitAt||'',splitBy:t.splitBy||'',parentTaskId:t.parentTaskId||'',childTaskIds:t.childTaskIds||[],activities:taskActivityOptions(d,p,t),revisionLabel:t.revisionLabel||'R0',canBreakdown:!t.isSummary&&!!t.scopeItemId&&W.scopeOptions(W.source(d,p)).some(x=>x.parentId===t.scopeItemId)&&!n(t.progress)&&!t.submissions?.length&&!t.reviewCycles?.length&&!d.timesheets.some(x=>x.projectId===p.id&&x.taskId===t.id)};}
// Dependencies are checked before every mutation, not only when drawing a button.
function record(d,kind,rid){const rows=kind==='project'?d.data:kind==='quote'?d.commercial.quotes:kind==='contract'?d.commercial.contracts:null;check(rows,'INVALID_RECORD_KIND','نوع سجل غير صحيح');const r=rows.find(x=>x.id===rid);check(r,'NOT_FOUND','السجل غير موجود',404);return r;}
function recordAccess(d,u,kind,r){check(u.role==='Owner'||kind==='project'&&u.role==='Project Manager'&&r.pm===u.id,'FORBIDDEN','إدارة السجل للمالك أو مدير مشروعه ضمن الصلاحيات',403);}
function pristineTask(t){
 return !removed(t)&&!n(t.progress)&&!n(t.approvedProgress)&&['todo','draft',''].includes(t.status||'')&&!['submissions','assessments','reviewCycles','events','reviewHistory','timeActivities'].some(k=>t[k]?.length)&&!t.updatedAt&&!t.workRevision&&!t.confirmedAt&&!t.returnedAt;
}
function unusedChildren(r){return live(r.tasks||[]).filter(pristineTask);}
function dependencies(d,kind,r){
 const result=[];const add=(label,rows)=>{if(rows.length)result.push({label,count:rows.length})};
 if(kind==='project'){
  add('مهام لها تنفيذ أو تاريخ / Used tasks',live(r.tasks||[]).filter(t=>!pristineTask(t)));add('ساعات / Timesheets',d.timesheets.filter(x=>x.projectId===r.id));add('أوامر تشغيل / Orders',d.ops.orders.filter(x=>x.projectId===r.id));
  add('مستندات تجارية مرتبطة',live([...d.commercial.quotes,...d.commercial.contracts]).filter(x=>[x.projectId,x.sourceProjectId].includes(r.id)||[r.sourceQuoteId,r.sourceContractId].includes(x.id)));
  add('سجلات مالية مرتبطة',[...d.customerReceipts,...d.journalEntries,...d.masters.vendorBills,...d.masters.expenses,...d.vendorPayments,...d.ops.claims].filter(x=>x.projectId===r.id));
  add('إسناد مرتبط',d.awards.filter(x=>x.projectId===r.id));
  add('موقف مالي يتطلب مراجعة المالك', ['value','revisedContractValue','invoice','paid','retention'].some(k=>n(r[k])!==0)?[r]:[]);
  add('تاريخ تشغيل قائم',r.events?.length||r.finalTechnicalApproved||r.legacyWorkflow||n(r.stage)>0||r.workflowState&&!['draft','planning'].includes(r.workflowState)?[r]:[]);
 }else{
  add('مشاريع مرتبطة',live(d.data).filter(p=>[p.sourceQuoteId,p.sourceContractId].includes(r.id)||[r.projectId,r.sourceProjectId].includes(p.id)));
  add('أوامر تشغيل',d.ops.orders.filter(o=>[o.sourceId,o.quoteId,o.contractId].includes(r.id)));
  add('مستندات ومراجعات مرتبطة',live(d.commercial.contracts).filter(c=>c.id!==r.id&&(kind==='quote'?c.quoteId===r.id:c.parentContractId===r.id)));
  add('سجلات مالية مرتبطة',[...d.customerReceipts,...d.ops.claims].filter(x=>[x.contractId,x.quoteId,x.sourceId].includes(r.id)));
  add('دفعات / مطالبات المستند',(r.schedule||r.paymentSchedule||[]).filter(x=>n(x.claimed)||n(x.paid)||x.claimId));
 }
 return result;
}
function recordInfo(d,u,kind,r){
 recordAccess(d,u,kind,r);const deps=dependencies(d,kind,r),isDraft=kind==='project'?!r.finalTechnicalApproved&&!closed(r):r.status==='draft';
 const safeDeps=u.role==='Owner'?deps:deps.map(x=>({label:x.label.includes('مالية')||x.label.includes('تجارية')?'روابط تتطلب مراجعة المالك':x.label,count:x.label.includes('مالية')||x.label.includes('تجارية')?null:x.count}));
 return {kind,id:r.id,name:kind==='project'?r.name:r.number,projectName:r.projectName||r.name||'',status:r.status||r.operationalStatus||'open',removed:removed(r),archived:kind==='project'?!!r.operationalClosed:!!r.documentArchived,operationalClosed:!!r.operationalClosed,canRemove:isDraft&&!deps.length&&!removed(r),canCancel:kind!=='project'&&['draft','approved'].includes(r.status)&&!deps.length&&!removed(r),canArchive:kind!=='project'&&!removed(r)&&!r.documentArchived,canRestore:removed(r)||!!r.documentArchived,dependencies:safeDeps,reason:r.removeReason||r.documentArchiveReason||'',removedAt:r.removedAt||'',removedBy:r.removedBy||'',canRequestClose:kind==='project'&&u.role==='Project Manager'&&!closed(r),canClose:kind==='project'&&u.role==='Owner'&&!closed(r),canReopen:kind==='project'&&u.role==='Owner'&&!!r.operationalClosed&&!removed(r),unusedTasks:kind==='project'?unusedChildren(r).map(t=>({id:t.id,name:t.name})):[],disposalSummary:kind==='project'?(deps.length?'هذا مشروع مستخدم أو مرتبط بسجلات محفوظة. الأرشفة لا تمحو المهام أو الساعات أو الأرصدة، وإعادة الفتح لا تعتمد العمل تلقائيًا.':'الإزالة تخص المشروع ومهامه المسودة غير المستخدمة فقط؛ لا تُحذف سجلات العميل أو مستندات مالية.'): 'السجل المحدد فقط؛ لا تُحذف روابطه ضمنيًا.'};
}
function manageRecord(d,u,b,ctx){
 const {kind,recordId,operation}=b,r=record(d,kind,recordId);recordAccess(d,u,kind,r);const info=recordInfo(d,u,kind,r),reason=text(b.reason);check(reason,'REASON_REQUIRED','اكتب سبب الإجراء');
 if(operation==='remove'){check(info.canRemove,'RECORD_LINKED','الإزالة للمسودات غير المستخدمة فقط؛ استخدم الإلغاء/الأرشفة وحافظ على الروابط',409);r.removedAt=at();r.removedBy=u.id;r.removeReason=reason;
  if(kind==='project'){const batch=id('BIN');r.removalBatch=batch;r.removedChildren=[];for(const t of unusedChildren(r)){t.removedAt=r.removedAt;t.removedBy=u.id;t.removeReason=reason;t.removedWithProject=batch;r.removedChildren.push(t.id);}for(const c of d.projectCostCenters.filter(x=>x.projectId===r.id&&!removed(x))){c.removedAt=r.removedAt;c.removedWithProject=batch;}}
 }
 else if(operation==='restore'){check(info.canRestore,'NOT_REMOVED','السجل ليس في السلة/الأرشيف');if(kind!=='project')check(!live(d.commercial[kind==='quote'?'quotes':'contracts']).some(x=>x.id!==r.id&&x.number===r.number),'DUPLICATE_DOCUMENT_NUMBER','رقم المستند مستخدم؛ راجعه قبل الاسترجاع');(r.disposalHistory??=[]).push({operation:'restore',reason,by:u.id,at:at(),removedAt:r.removedAt||'',removedBy:r.removedBy||'',previousReason:r.removeReason||r.documentArchiveReason||''});if(kind==='project'&&r.removalBatch){for(const t of r.tasks||[])if(t.removedWithProject===r.removalBatch){delete t.removedAt;delete t.removedBy;delete t.removeReason;delete t.removedWithProject;}for(const c of d.projectCostCenters)if(c.projectId===r.id&&c.removedWithProject===r.removalBatch){delete c.removedAt;delete c.removedWithProject;}delete r.removalBatch;delete r.removedChildren;}
  delete r.removedAt;delete r.removedBy;delete r.removeReason;r.documentArchived=false;}
 else if(operation==='cancel'){check(info.canCancel,'CANCELLATION_BLOCKED','المستند مستخدم؛ لا يلغى أثره المالي ضمنيًا. يمكن أرشفته مع الحفاظ على الحقوق.',409);(r.disposalHistory??=[]).push({operation:'cancel',previousStatus:r.status,reason,by:u.id,at:at()});r.status='cancelled';r.cancelledAt=at();r.cancelledBy=u.id;r.cancelReason=reason;}
 else if(operation==='archive'){check(info.canArchive,'ARCHIVE_BLOCKED','استخدم إنهاء المشروع من بطاقة المشروع');r.documentArchived=true;r.documentArchiveReason=reason;r.documentArchivedAt=at();r.documentArchivedBy=u.id;}
 else if(operation==='request_close'){check(info.canRequestClose,'FORBIDDEN','طلب الإنهاء لمهندس المشروعات',403);ctx.notify(d,ownerIds(d),'project_close_requested',r.id,'طلب مهندس المشروعات إنهاء/أرشفة المشروع — '+reason);}
 else fail('INVALID_OPERATION','إجراء سجل غير صالح');
 return {recordId:r.id,kind,operation};
}
function recordList(d,u,kind){const rows=kind==='project'?d.data:kind==='quote'?d.commercial.quotes:kind==='contract'?d.commercial.contracts:[];return rows.filter(r=>u.role==='Owner'||kind==='project'&&u.role==='Project Manager'&&r.pm===u.id).map(r=>recordInfo(d,u,kind,r));}
function action(d,u,p,type,b,ctx){
 const map={time_activity_add:()=>addActivity(d,u,p,b,ctx),timesheet_add:()=>timeAdd(d,u,p,b,ctx),timesheet_approve:()=>timeReview(d,u,p,{...b,decision:'approve'},ctx),timesheet_review:()=>timeReview(d,u,p,b,ctx),timesheet_edit:()=>timeEdit(d,u,p,b,ctx),timesheet_reopen:()=>timeReopen(d,u,p,b,ctx),cost_rate_set:()=>rateSet(d,u,b),timesheet_price:()=>timePrice(d,u,p,b),task_breakdown:()=>splitTask(d,u,p,b,ctx),record_manage:()=>manageRecord(d,u,b,ctx)};
 return map[type]?{handled:true,result:map[type]()}:{handled:false};
}
module.exports={hours,revisionLabel,ownerIds,approverIds,privateTime,validDate,pristineTask,unusedChildren,init,live,leaf,removed,closed,fin,check,fail,canReadTime,canApprove,safeTime,costSummary,historicalRate,taskActivityOptions,taskExtras,recordInfo,recordList,action};
