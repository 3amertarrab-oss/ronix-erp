'use strict';
// R399: daily personal capture, explicit submission and scoped administration.
// Does not create fictitious working hours, attendance, payroll deductions or finance postings.
const crypto=require('node:crypto'),C=require('./controls'),P=require('./site/assets/planning-r395');
const copy=x=>JSON.parse(JSON.stringify(x)),now=()=>new Date().toISOString(),id=p=>p+'-'+crypto.randomUUID();
const check=C.check,DAY=86400000;
const OWNER=u=>u.role==='Owner',ADMIN=u=>['Owner','Accountant','Project Manager'].includes(u.role);
const ACTIVE=t=>!['superseded','void'].includes(t.status);
function today(d,time=new Date()){const zone=d.dailyTime?.policy?.timezone||'Africa/Cairo';return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);}
function date(v){P.civil(v);return v;}
function init(d){
 if(!d.dailyTime)d.dailyTime={version:1,policy:{enabled:true,effectiveFrom:today(d),hoursPerDay:8,workdayStart:'09:00',timezone:'Africa/Cairo',nonWorkingWeekdays:[],holidays:[]},enrolled:{},days:[],exemptions:[],audit:[],installedAt:now()};
 const x=d.dailyTime;check(x.version===1&&Array.isArray(x.days)&&Array.isArray(x.exemptions)&&x.policy,'BAD_DAILY_STATE','سجل الأيام غير صالح؛ احتفظ بالبيانات وراجع الدعم');x.enrolled=x.enrolled||{};x.audit=x.audit||[];
 for(const u of d.teamUsers||[])if(!x.enrolled[u.id])x.enrolled[u.id]=today(d);
 return x;
}
function policy(d){return d.dailyTime?.policy||{enabled:false,effectiveFrom:'',hoursPerDay:8,workdayStart:'09:00',timezone:'Africa/Cairo',nonWorkingWeekdays:[],holidays:[]};}
const ownRows=(d,user,day)=>d.timesheets.filter(t=>t.user===user&&t.date===day&&ACTIVE(t));
const findDay=(d,user,day)=>d.dailyTime?.days.find(x=>x.user===user&&x.date===day);
function dayState(d,user,day){const rec=findDay(d,user,day),rows=ownRows(d,user,day);if(rec?.status==='exception_pending')return 'exception_pending';if(rec?.status==='excused')return 'excused';if(rec?.status==='returned'||rows.some(t=>t.status==='returned'))return 'returned';if(rec?.status==='draft')return 'draft';if(rec?.status==='submitted'||rows.length)return 'submitted';return 'missing';}
function exempt(d,user,day){return (d.dailyTime?.exemptions||[]).some(x=>x.user===user&&day>=x.from&&day<=x.to&&!x.revokedAt);}
function requiredDates(d,user,asof=today(d)){
 const pol=policy(d);if(!pol.enabled||user.role==='Owner'||user.active===false)return [];
 const from=[pol.effectiveFrom,d.dailyTime.enrolled[user.id]||asof].sort().at(-1);if(from>=asof)return [];
 const a=P.civil(from),b=P.civil(asof),c=P.calendar(pol);check((b-a)/DAY<3700,'DAILY_RANGE','فترة التسجيل تتطلب مراجعة إعدادات المالك');let dates=[];
 for(let t=a;t<b;t+=DAY){const dt=new Date(t).toISOString().slice(0,10);if(P.isWork(t,c)&&!exempt(d,user.id,dt))dates.push(dt);}
 return dates;
}
function missing(d,user,asof=today(d)){return requiredDates(d,user,asof).filter(dt=>!['submitted','excused'].includes(dayState(d,user.id,dt)));}
function gate(d,u){const dates=missing(d,u);return {required:dates.length>0,dates:dates.slice(0,90),total:dates.length,today:today(d)};}
const ALLOWED=new Set(['daily_save','daily_submit','daily_exception_request','daily_correction_request','timesheet_edit','timesheet_correction_request','time_activity_add','notification_read','flow_followup_create','flow_followup_ack','flow_followup_reply','flow_followup_remind','flow_followup_escalate','flow_followup_close','flow_followup_reassign']);
function enforce(d,u,type){if(OWNER(u)||ALLOWED.has(type))return;const g=gate(d,u);check(!g.required,'DAILY_ENTRY_REQUIRED','أكمل تسجيل يوم '+g.dates[0]+' للمتابعة. لا يتطلب انتظار اعتماد الساعات.',409);}
function targetDay(d,u,day){date(day);check(day<=today(d),'FUTURE_WORK_DAY','لا تسجل ساعات فعلية ليوم لم يأتِ بعد');const from=d.dailyTime?.enrolled[u.id]||policy(d).effectiveFrom;check(!policy(d).enabled||(day>=from||ownRows(d,u.id,day).some(t=>t.status==='returned')),'BEFORE_DAILY_POLICY','هذا اليوم سابق لتفعيل التسجيل اليومي؛ التاريخ السابق محفوظ للمراجعة');}
function audit(d,u,action,day,extra={}){d.dailyTime.audit.push({id:id('DAYEVT'),at:now(),by:u.id,action,dayId:day.id,user:day.user,date:day.date,...extra});}
function ensureEditable(d,u,dt){targetDay(d,u,dt);let r=findDay(d,u.id,dt);check(!r||['draft','returned'].includes(r.status)||dayState(d,u.id,dt)==='returned','DAY_LOCKED','تم إرسال اليوم. اطلب تصحيحًا موثقًا بدل تعديل التسجيل مباشرة.',409);check(r||!ownRows(d,u.id,dt).length||ownRows(d,u.id,dt).some(t=>t.status==='returned'),'DAY_HAS_EXISTING_TIME','هذا اليوم له تسجيل سابق محفوظ؛ استخدم طلب تصحيح بدل إنشاء يوم مكرر.',409);return r;}
function choices(d,u,O){return O.timeChoices(d,u).map(p=>({...p,tasks:p.tasks.map(t=>({...t,activities:C.taskActivityOptions(d,d.data.find(q=>q.id===p.id),d.data.find(q=>q.id===p.id).tasks.find(q=>q.id===t.id))}))}));}
function lines(d,u,dt,input,O,{draft=false,record=null}={}){
 check(Array.isArray(input)&&input.length>=1&&input.length<=20,'DAY_LINES_REQUIRED','أدخل سطر عمل واحدًا على الأقل، وبحد أقصى 20 توزيعًا');let total=record?ownRows(d,u.id,dt).filter(t=>t.status!=='returned').reduce((a,t)=>a+Number(t.hours),0):0,seen=new Set();const allowed=choices(d,u,O);
 return input.map(v=>{
  check(!v.user||v.user===u.id,'WRONG_TIME_OWNER','تسجيل اليوم باسم الحساب الحالي فقط',403);
  const h=C.hours(v.hours);total+=h;check(total<=24,'DAILY_HOURS_EXCEEDED','مجموع اليوم لا يتجاوز 24 ساعة');
  const note=String(v.note||'').trim().slice(0,4000);check(note||draft,'NOTE_REQUIRED','اكتب وصف العمل لكل سطر قبل إرسال اليوم');
  const old=v.id?d.timesheets.find(t=>t.id===v.id&&t.user===u.id&&t.dailyDayId===record?.id):null;
  if(v.id){check(old&&old.status==='returned','BAD_DAY_LINE','سطر التصحيح غير متاح',409);check(!seen.has(v.id),'DUPLICATE_DAY_LINE','سطر الوقت مكرر');seen.add(v.id);}
  const projectId=String(v.projectId||'');let taskId=String(v.taskId||''),activityId=String(v.activityId||'TASK'),activityType='task',activityLabel='';
  if(!projectId){check(!taskId,'OFFICE_TASK','نشاط المكتب غير مرتبط بمهمة مشروع');activityId='OFFICE';activityType='office_work';activityLabel='عمل داخلي / إداري';}
  else {
   const p=d.data.find(p=>p.id===projectId&&!p.removedAt);check(p,'PROJECT_NOT_FOUND','اختر المشروع الصحيح');
   const inherited=old&&old.projectId===projectId&&old.taskId===taskId&&(old.activityId||(old.taskId?'TASK':'ROLE'))===activityId;
   if(inherited){activityType=old.activityType||'task';activityLabel=old.activityLabel||p.tasks.find(t=>t.id===taskId)?.name||activityType;}
   else{const opt=allowed.find(p=>p.id===projectId);check(opt,'PROJECT_NOT_ASSIGNED','المشروع غير متاح لتسجيلك أو مؤرشف',403);
    if(taskId){const t=opt.tasks.find(t=>t.id===taskId);check(t,'TASK_NOT_ASSIGNED','المهمة ليست ضمن تكليفاتك',403);const a=t.activities.find(a=>a.id===activityId);check(a,'ACTIVITY_NOT_AVAILABLE','اختر النشاط من التكليف');activityLabel=a.label;}
    else{activityType=String(v.activityType||'');check(!opt.taskRequired&&opt.activities.includes(activityType),'TASK_REQUIRED','اختر المهمة أو نشاط الدور');activityId='ROLE';activityLabel=activityType;}
   }
  }
  return {id:old?.id||'',projectId,taskId,activityId,activityType,activityLabel,revisionLabel:C.revisionLabel(v.revisionLabel),tool:String(v.tool||'').trim().slice(0,60),hours:h,note,date:dt};
 });
}
function approvalIds(d,ts){return C.approverIds(d,d.data.find(p=>p.id===ts.projectId),ts);}
function submit(d,u,b,ctx,draft){
 const dt=b.date;let rec=ensureEditable(d,u,dt);
 if(!rec&&ownRows(d,u.id,dt).some(t=>t.status==='returned')){rec={id:id('DAY'),user:u.id,date:dt,status:'returned',revision:0,createdAt:now(),timeIds:ownRows(d,u.id,dt).map(t=>t.id),draftLines:[],history:[],legacyLinked:true};d.dailyTime.days.push(rec);for(const ts of ownRows(d,u.id,dt))ts.dailyDayId=rec.id;audit(d,u,'legacy_day_linked_for_correction',rec);}
 if(rec)check(Number(b.dayRevision)===rec.revision,'DAY_CONFLICT','تغير اليوم من جلسة أخرى؛ راجعه قبل الحفظ',409);
 const l=lines(d,u,dt,b.lines,ctx.O,{draft,record:rec});
 if(rec&&dayState(d,u.id,dt)==='returned')check((rec.timeIds||[]).filter(k=>d.timesheets.find(t=>t.id===k)?.status==='returned').every(k=>l.some(x=>x.id===k)),'DAY_HISTORY_REQUIRED','احتفظ بكل سطور اليوم المرتجع؛ لا تحذف سجلًا سابقًا',409);
 if(!rec){rec={id:id('DAY'),user:u.id,date:dt,status:'draft',revision:0,createdAt:now(),timeIds:[],draftLines:[],history:[]};d.dailyTime.days.push(rec);}
 rec.history.push({status:rec.status,at:now(),by:u.id,revision:rec.revision});rec.draftLines=l;rec.revision++;rec.updatedAt=now();
 if(draft){rec.status=rec.timeIds.length?'returned':'draft';audit(d,u,'draft_saved',rec);return {dayId:rec.id,date:dt,draft:true};}
 const produced=(rec.timeIds||[]).filter(k=>d.timesheets.find(t=>t.id===k)?.status!=='returned');for(const row of l){let ts=row.id?d.timesheets.find(t=>t.id===row.id):null;
  if(ts){(ts.editHistory??=[]).push({at:now(),by:u.id,...copy(ts),editHistory:undefined,reviewHistory:undefined});Object.assign(ts,row,{id:ts.id,status:'pending',approvedHours:0,costSnapshot:null,revision:(ts.revision||1)+1,updatedAt:now()});}
  else{ts={...row,id:id('TS'),user:u.id,roleAtSubmit:u.role,status:'pending',revision:1,createdAt:now(),dailyDayId:rec.id,submittedAt:now(),reviewHistory:[],editHistory:[]};d.timesheets.push(ts);}
  ts.dailyDayId=rec.id;ts.submittedAt=now();ts.correctionRequestedAt='';produced.push(ts.id);
  ctx.notify(d,approvalIds(d,ts),'timesheet_submitted',ts.projectId,'ساعات بانتظار الاعتماد: '+u.name+' — '+dt,C.privateTime(d,ts));
 }
 rec.timeIds=produced;rec.draftLines=[];rec.status='submitted';rec.submittedAt=now();rec.totalHours=ownRows(d,u.id,dt).reduce((s,x)=>s+Number(x.hours),0);audit(d,u,'day_submitted',rec,{timeIds:produced,totalHours:rec.totalHours});return {dayId:rec.id,date:dt,timeIds:produced};
}
function safeDraft(row){const allowed=['id','projectId','taskId','activityId','activityType','activityLabel','revisionLabel','tool','hours','note','date'];return Object.fromEntries(allowed.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));}
function summaryDay(d,r,details=false){const ts=ownRows(d,r.user,r.date);return {id:r.id,user:r.user,date:r.date,status:dayState(d,r.user,r.date),revision:r.revision,submittedAt:r.submittedAt||'',updatedAt:r.updatedAt||'',totalHours:ts.length?ts.reduce((s,t)=>s+Number(t.hours),0):r.totalHours||0,correctionRequestedAt:r.correctionRequestedAt||'',reason:details?r.reason||'':'',correctionReason:details?r.correctionReason||'':'',...(details?{draftLines:(r.draftLines||[]).map(safeDraft),timeIds:[...(r.timeIds||[])]}:{})};}
function view(d,u){const pol=copy(policy(d)),g=gate(d,u),own=(d.dailyTime?.days||[]).filter(r=>r.user===u.id).sort((a,b)=>b.date.localeCompare(a.date)).filter((r,i)=>i<60||!['submitted','excused'].includes(dayState(d,r.user,r.date))||r.correctionRequestedAt).map(r=>summaryDay(d,r,true));return {policy:pol,gate:g,days:own,canAdmin:ADMIN(u),canConfigure:OWNER(u),enrolledFrom:d.dailyTime?.enrolled[u.id]||g.today,officeActivity:{id:'OFFICE',label:'عمل داخلي / إداري — دون مشروع'}};}
function admin(d,u){if(!ADMIN(u))return null;const scopedIds=u.role==='Project Manager'?new Set(d.data.filter(p=>p.pm===u.id).flatMap(p=>p.tasks.map(t=>t.assignee))):null;const users=d.teamUsers.filter(x=>x.active!==false&&x.role!=='Owner'&&(!scopedIds||scopedIds.has(x.id)));
 return {people:users.map(x=>{const ms=missing(d,x),rs=d.timesheets.filter(t=>t.user===x.id&&ACTIVE(t)&&(!scopedIds||d.data.some(p=>p.id===t.projectId&&p.pm===u.id)));return {user:x.id,name:x.name,missingCount:ms.length,oldestMissing:ms[0]||'',scope:scopedIds?'assigned_projects':'all',loggedHours:rs.reduce((s,t)=>s+Number(t.hours),0)};}),days:(d.dailyTime?.days||[]).filter(r=>!scopedIds||scopedIds.has(r.user)).map(r=>{const s=summaryDay(d,r,OWNER(u));if(scopedIds){s.totalHours=d.timesheets.filter(t=>t.user===r.user&&t.date===r.date&&ACTIVE(t)&&d.data.some(p=>p.id===t.projectId&&p.pm===u.id)).reduce((n,t)=>n+Number(t.hours),0);delete s.timeIds;delete s.draftLines;}return s;}),exemptions:OWNER(u)?copy(d.dailyTime.exemptions):[]};}
function action(d,u,type,b,ctx){
 if(!type.startsWith('daily_')&&type!=='timesheet_correction_request')return {handled:false};init(d);let result={};
 if(type==='daily_save'||type==='daily_submit'){check(!b.userId||b.userId===u.id,'WRONG_TIME_OWNER','لا تسجل باسم موظف آخر',403);result=submit(d,u,b,ctx,type==='daily_save');}
 else if(type==='daily_exception_request'){
  targetDay(d,u,b.date);const old=findDay(d,u.id,b.date);check(!old||['missing','draft','exception_pending'].includes(old.status),'DAY_ALREADY_RECORDED','هذا اليوم له ساعات؛ استخدم طلب تصحيح');check(!ownRows(d,u.id,b.date).length,'DAY_HAS_TIME','يوجد تسجيل وقت لهذا اليوم');const reason=String(b.reason||'').trim().slice(0,2000);check(reason,'REASON_REQUIRED','اكتب سبب عدم تسجيل وقت عمل');const r=old||{id:id('DAY'),user:u.id,date:b.date,revision:0,createdAt:now(),timeIds:[]};if(!old)d.dailyTime.days.push(r);Object.assign(r,{status:'exception_pending',reason,revision:r.revision+1,updatedAt:now(),draftLines:[]});audit(d,u,'exception_requested',r);ctx.notify(d,C.ownerIds(d),'daily_exception_requested','','طلب استثناء يوم '+b.date+' من '+u.name);result={dayId:r.id};
 }else if(type==='daily_exception_decide'){
  check(OWNER(u),'OWNER_ONLY','قرار الاستثناء للمالك',403);const r=d.dailyTime.days.find(x=>x.id===b.dayId);check(r&&r.status==='exception_pending','EXCEPTION_NOT_PENDING','الطلب لم يعد معلقًا',409);check(r.user!==u.id,'SELF_APPROVAL','لا يعتمد الموظف طلبه بنفسه',403);const reason=String(b.reason||'').trim().slice(0,2000);check(reason,'REASON_REQUIRED','سبب القرار مطلوب');check(['approve','return'].includes(b.decision),'INVALID_DECISION','قرار غير صحيح');Object.assign(r,{status:b.decision==='approve'?'excused':'draft',decisionReason:reason,decidedBy:u.id,decidedAt:now(),revision:r.revision+1});audit(d,u,'exception_'+b.decision,r,{reason});ctx.notify(d,[r.user],'daily_exception_decided','',b.decision==='approve'?'اعتمد استثناء يوم '+r.date:'أعيد طلب يوم '+r.date+' — '+reason);result={dayId:r.id};
 }else if(type==='daily_correction_request'){
  const r=d.dailyTime.days.find(x=>x.id===b.dayId&&x.user===u.id);check(r&&r.status==='submitted','DAY_NOT_SUBMITTED','اختر يومًا مرسلًا');const reason=String(b.reason||'').trim().slice(0,2000);check(reason,'REASON_REQUIRED','اذكر التصحيح المطلوب');check(!r.correctionRequestedAt,'CORRECTION_PENDING','يوجد طلب تصحيح لهذا اليوم',409);r.correctionRequestedAt=now();r.correctionReason=reason;audit(d,u,'correction_requested',r,{reason});ctx.notify(d,C.ownerIds(d),'daily_correction_requested','','طلب تصحيح يوم '+r.date+' من '+u.name);result={dayId:r.id};
 }else if(type==='daily_reopen'){
  check(OWNER(u),'OWNER_ONLY','إعادة فتح اليوم للمالك فقط',403);const r=d.dailyTime.days.find(x=>x.id===b.dayId);check(r&&r.user!==u.id&&r.status==='submitted','DAY_NOT_REOPENABLE','اليوم غير متاح لإعادة الفتح أو يخصك',409);const reason=String(b.reason||'').trim().slice(0,2000);check(reason,'REASON_REQUIRED','سبب إعادة الفتح مطلوب');
  for(const ts of ownRows(d,r.user,r.date)){(ts.reviewHistory??=[]).push({id:id('TREV'),at:now(),by:u.id,decision:'reopen_day',reason,previousStatus:ts.status,approvedHours:ts.approvedHours??ts.hours});if(ts.costSnapshot)(ts.costHistory??=[]).push({...copy(ts.costSnapshot),replacedAt:now(),replacedBy:u.id,reason});ts.costSnapshot=null;ts.status='returned';ts.approvedHours=0;ts.revision=(ts.revision||1)+1;ts.reviewNote=reason;}
  r.status='returned';r.correctionRequestedAt='';r.revision++;r.draftLines=ownRows(d,r.user,r.date).map(x=>copy(x));audit(d,u,'day_reopened',r,{reason});ctx.notify(d,[r.user],'daily_reopened','','أعيد فتح يوم '+r.date+' للتصحيح — '+reason);result={dayId:r.id};
 }else if(type==='timesheet_correction_request'){
  const ts=d.timesheets.find(t=>t.id===b.timesheetId&&t.user===u.id);check(ts&&['pending','approved','rejected'].includes(ts.status),'TIME_LOCKED','اختر تسجيلًا يخصك');const reason=String(b.reason||'').trim().slice(0,2000);check(reason,'REASON_REQUIRED','اكتب التصحيح المطلوب');check(!ts.correctionRequestedAt,'CORRECTION_PENDING','طلب التصحيح موجود بالفعل',409);ts.correctionRequestedAt=now();ts.correctionReason=reason;ctx.notify(d,approvalIds(d,ts),'timesheet_correction_requested',ts.projectId,'طلب تصحيح ساعات من '+u.name+' — '+reason,C.privateTime(d,ts));result={timesheetId:ts.id};
 }else if(type==='daily_policy_set'){
  check(OWNER(u),'OWNER_ONLY','إعدادات الأيام للمالك فقط',403);const reason=String(b.reason||'').trim().slice(0,1000);check(reason,'REASON_REQUIRED','اذكر سبب تغيير سياسة الأيام');const c=P.calendar(b.policy||{}),from=date(b.policy.effectiveFrom);check(from<=today(d),'POLICY_FUTURE','التفعيل من اليوم أو تاريخ سابق موثق');const old=copy(d.dailyTime.policy);d.dailyTime.policy={...c,enabled:b.policy.enabled!==false,effectiveFrom:from};d.dailyTime.audit.push({id:id('DAYEVT'),at:now(),by:u.id,action:'policy_set',reason,previous:old,next:copy(d.dailyTime.policy)});result={configured:true};
 }else if(type==='daily_exemption_add'){
  check(OWNER(u),'OWNER_ONLY','تحديد الإجازة أو الاستثناء للمالك',403);check(d.teamUsers.some(x=>x.id===b.userId),'INVALID_USER','اختر الموظف');const from=date(b.from),to=date(b.to);check(to>=from&&(P.civil(to)-P.civil(from))/DAY<=366,'EXEMPTION_RANGE','نطاق الإجازة غير صحيح');const reason=String(b.reason||'').trim().slice(0,1000);check(reason,'REASON_REQUIRED','سبب الاستثناء مطلوب');const x={id:id('EXC'),user:b.userId,from,to,reason,by:u.id,at:now()};d.dailyTime.exemptions.push(x);result={exemptionId:x.id};
 }else return {handled:false};
 return {handled:true,result};
}
function validate(d){if(!d.dailyTime)return;const x=d.dailyTime;P.calendar(x.policy);date(x.policy.effectiveFrom);const ids=new Set(),keys=new Set();for(const r of x.days){const k=r.user+':'+r.date;check(r.id&&!ids.has(r.id)&&!keys.has(k),'DUPLICATE_DAY','يوجد يوم مكرر');date(r.date);ids.add(r.id);keys.add(k);check(d.teamUsers.some(u=>u.id===r.user),'DAY_USER','اليوم مرتبط بموظف غير موجود');for(const tid of r.timeIds||[])check(d.timesheets.some(t=>t.id===tid&&t.user===r.user&&t.date===r.date&&t.dailyDayId===r.id),'DAY_LINK','رابط يوم وساعات غير صحيح');}}
module.exports={init,today,policy,gate,enforce,missing,requiredDates,dayState,view,admin,action,validate,ADMIN};
