'use strict';
// Follow-up records never write progress, approvals, dates, money or work assignments.
const W=require('./workflow'),C=require('./controls'),B=require('./execution-board'),H=require('./completion'),O=require('./operations'),V=require('./finance-view'),Daily=require('./daily-time');
const terminal=r=>['resolved','closed'].includes(r.status);
const activeIds=(d,ids)=>[...new Set(ids.filter(id=>d.teamUsers.some(u=>u.id===id&&u.active!==false)))];
const owners=d=>d.teamUsers.filter(u=>u.role==='Owner'&&u.active!==false).map(u=>u.id);
const accounts=d=>d.teamUsers.filter(u=>u.role==='Accountant'&&u.active!==false).map(u=>u.id);
const manager=(u,p)=>u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id;
const accountingKinds=new Set(['commercial','order','accounts_ack','advance','claim','collection']);
const confidentialKinds=new Set(['accounts_ack','advance','claim','collection']);
const financeUser=u=>['Owner','Accountant'].includes(u.role);
function escalationTargets(d,u,p){u=require('./access').original(u);const own=owners(d).filter(id=>id!==u.id);if(u.role==='Owner')return [];if(u.id===p.pm||u.role==='Accountant')return own;const managers=activeIds(d,[p.pm]).filter(id=>id!==u.id);return managers.length?managers:own;}
function reassignTargets(d,u,p,r,current){return activeIds(d,r.kind==='custom'?customActors(d,u,p):current?.actorIds||[]).filter(id=>id!==r.targetId);}
function init(d){if(!d.ops.followups)d.ops.followups=[];}
function points(d,p){
 const rows=[],today=Daily.today(d),own=owners(d),fin=accounts(d),order=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued');
 const add=(kind,key,label,actors,extra={})=>rows.push({kind,key,label,actorIds:activeIds(d,actors),taskId:'',partId:'',version:'',route:'projects',...extra});
 if(p.removedAt)return rows;
 const source=W.source(d,p),ready=source&&['approved','active','closed'].includes(source.doc.status);
 if(!p.operationalClosed&&!O.historical(p)){
  if(!ready)add('commercial','commercial','استكمال واعتماد العقد أو عرض السعر',[...fin,...own]);
  else if(!order)add('order','order','إصدار أمر تشغيل للمشروع الموجود',[p.pm,...fin,...own]);
  if(order&&!order.pmAck)add('pm_ack','pm_ack','تأكيد استلام أمر التشغيل',[p.pm,...(!p.pm?own:[])]);
  if(order&&!order.accountsAck)add('accounts_ack','accounts_ack','تأكيد استلام الحسابات لأمر التشغيل',fin.length?fin:own,{route:'orders'});
  if((order?.pmAck||p.opsReopenedAt)&&!p.finalTechnicalApproved){
   const ts=C.leaf(p.tasks),coverage=W.scopeCoverage(d,p);
   const external=require('./supplier-scope').work(d,p.id);
   if((!ts.length&&!external.length)||!coverage.complete||ts.some(t=>H.items(t).some(x=>!x.assignee)))add('assign','assign','استكمال تسكين وتوزيع الأعمال',[p.pm,...(!p.pm?own:[])]);
   for(const t of ts){
    for(const x of H.items(t)){
     const r=x.r,key=t.id+':'+x.id,extra={taskId:t.id,partId:x.part?x.id:'',version:r.submissions?.at(-1)?.id||'',due:t.due||'',route:'tasks'};
     if(r.status==='confirmed'&&Number(r.approvedProgress)>Number(r.progress??0))add('review','review:'+key,'تصحيح تعارض الاعتماد: '+x.label,[x.checker||p.checker],{...extra,route:'review'});
     else if(r.status==='submitted')add('review','review:'+key,'مراجعة '+x.label,[x.checker||p.checker],{...extra,route:'review'});
     else if(!(x.part?B.finished(r):O.approved(t))&&x.assignee)add('work','work:'+key,(r.status==='returned'?'معالجة الملاحظات وإعادة إرسال ':'تنفيذ وإرسال ')+x.label,[x.assignee],extra);
    }
    for(const id of H.owners(t))if(H.exact100(t,id)&&!H.current(t,id))add('handoff','handoff:'+t.id+':'+id,'تأكيد إنهاء وتسليم '+t.name,[id],{taskId:t.id,version:H.signature(t,id),route:'tasks'});
   }
   for(const x of external.filter(x=>!x.accepted))add('supplier_receipt','supplier_receipt:'+x.agreementId+':'+x.itemId,'استلام بند المورد: '+x.description,[p.pm],{route:'awards',version:x.agreementId,agreementId:x.agreementId});
   if(H.projectState(d,p).readyForFinalApproval){if(ts.length)add('final','final','تأكيد التشيكر للاعتماد النهائي',[p.checker],{route:'review'});else add('external_final','external_final','تأكيد تسليم الأعمال الخارجية وإبلاغ الحسابات',[p.pm],{route:'projects'});}
  }
 }
 if(ready){
  const f=V.view(d,p,today),actors=fin.length?fin:own,version=source.type+':'+source.doc.id;
  if(W.schedule(source).some(r=>r.startRequired===true)&&f.paid===0)add('advance','advance','متابعة الدفعة المقدمة — لا قبض مسجل',actors,{route:'collections',version});
  if(f.milestones.some(m=>m.canClaim))add('claim','claim',p.finalTechnicalApproved?'مراجعة وإصدار المطالبات المستحقة بعد التسليم':'إصدار مطالبة الدفعة المقدمة المستحقة',actors,{route:'collections',version});
  if(f.outstanding>0)add('collection','collection','متابعة تحصيل المطالبات المفتوحة',actors,{route:'collections',version,due:f.milestones.filter(m=>m.claimRemaining>0&&m.dueDate).map(m=>m.dueDate).sort()[0]||''});
 }
 return rows;
}
function canRequest(u,p,x){if(confidentialKinds.has(x.kind)&&!financeUser(u))return false;return manager(u,p)||u.role==='Accountant'&&(accountingKinds.has(x.kind)||x.kind==='custom')||u.role==='Checker'&&p.checker===u.id&&['assign','handoff','work','review'].includes(x.kind);}
function manage(u,p,r){return manager(u,p)||u.role==='Accountant'&&r.createdBy===u.id;}
function readable(u,p,r){if(confidentialKinds.has(r.kind)&&!financeUser(u))return false;return manager(u,p)||r.createdBy===u.id||r.targetId===u.id||(r.escalationRecipients||[]).includes(u.id);}
function customActors(d,u,p){return activeIds(d,manager(u,p)?[p.pm,p.checker,p.projectEngineer,...C.leaf(p.tasks).flatMap(t=>H.items(t).flatMap(x=>[x.assignee,x.checker])),...(financeUser(u)?accounts(d):[]),...owners(d)]:[p.pm,...owners(d)]);}
function projectView(d,u,p){
 const eligible=points(d,p).filter(x=>canRequest(u,p,x));
 const rows=(d.ops.followups||[]).filter(r=>r.projectId===p.id&&readable(u,p,r)&&!terminal(r));
 return {canRequest:!p.removedAt&&(!p.operationalClosed||eligible.length>0),canManage:manager(u,p),points:eligible,customActors:customActors(d,u,p),openCount:rows.length,overdueCount:rows.filter(r=>r.dueDate<Daily.today(d)).length};
}
function view(d,u,p){const available=points(d,p);return (d.ops.followups||[]).filter(r=>r.projectId===p.id&&readable(u,p,r)).map(r=>{
 const current=available.find(x=>x.key===r.pointKey),active=!terminal(r),suggested=current?.actorIds||[],changed=active&&r.kind!=='custom'&&(!current||current.version!==r.version||!suggested.includes(r.targetId));
 const escalationRecipients=escalationTargets(d,u,p);const reassignCandidates=reassignTargets(d,u,p,r,current);
 const {evidence,...publicRecord}=r;return {...JSON.parse(JSON.stringify(publicRecord)),projectName:p.name,overdue:active&&r.dueDate<Daily.today(d),promiseOverdue:active&&!!r.promisedDate&&r.promisedDate<Daily.today(d),responsibilityChanged:changed,targetInactive:!d.teamUsers.some(x=>x.id===r.targetId&&x.active!==false),suggestedActors:suggested,canManage:active&&manage(u,p,r),canReply:active&&r.targetId===u.id,canRemind:active&&!changed&&d.teamUsers.some(x=>x.id===r.targetId&&x.active!==false)&&manage(u,p,r)&&Date.now()-Date.parse(r.lastNotifiedAt)>=300000,escalationRecipients:r.escalationRecipients||[],escalationTargets:escalationRecipients,escalationLabel:escalationRecipients.length?'تصعيد إلى '+escalationRecipients.map(id=>d.teamUsers.find(x=>x.id===id)?.name||id).join('، '):'لا يوجد مستوى تصعيد أعلى؛ وجّه القرار مباشرة',reassignCandidates,canEscalate:active&&(manage(u,p,r)||r.targetId===u.id)&&!r.escalatedAt&&escalationRecipients.length>0,canReassign:active&&manager(u,p)&&reassignCandidates.length>0,reassignReason:reassignCandidates.length?'':'لا يوجد مسؤول بديل مطابق للتكليف الحالي؛ عدّل المسؤولية من المشروع أولًا',canOpenAction:active&&!!current&&current.version===r.version&&current.actorIds.includes(u.id),actionRoute:current?.route||'projects'};
});}
function emit(d,D,ids,p,r,type,message){
 for(const id of activeIds(d,ids).filter(id=>!confidentialKinds.has(r.kind)||financeUser(d.teamUsers.find(x=>x.id===id)))){d.ops.notifications.unshift({id:D.uid('NTF'),userId:id,type,projectId:p.id,taskId:r.taskId||'',followupId:r.id,message,financial:confidentialKinds.has(r.kind),createdAt:D.now(),readAt:null,targetRoute:'flowFollowups',senderId:r.lastActor||r.createdBy});}
}
function history(d,D,u,p,r,type,details={}){r.lastActor=u.id;r.updatedAt=D.now();r.history.push({type,at:r.updatedAt,by:u.id,...details});D.event(d,u,type,p.id,{followupId:r.id,...details});}
function completed(d,p,r){
 const order=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued'),src=W.source(d,p);
 if(r.kind==='commercial')return !!src&&['approved','active','closed'].includes(src.doc.status);
 if(r.kind==='order')return !!order;
 if(r.kind==='pm_ack')return !!order?.pmAck;
 if(r.kind==='accounts_ack')return !!order?.accountsAck;
 if(r.kind==='assign')return C.leaf(p.tasks).length>0&&W.scopeCoverage(d,p).complete&&C.leaf(p.tasks).every(t=>H.items(t).every(x=>!!x.assignee));
 if(r.kind==='final')return !!p.finalTechnicalApproved;
 if(['advance','claim','collection'].includes(r.kind)){
  if(!src||r.version!==src.type+':'+src.doc.id||!r.evidence)return false;
  const f=V.view(d,p,Daily.today(d)),e=r.evidence;
  if(r.kind==='advance')return f.receipts.some(x=>x.status==='posted'&&x.amount>0&&!e.receiptIds.includes(x.id));
  if(!e.milestones.length)return false;
  return e.milestones.every(x=>{const m=f.milestones.find(m=>m.id===x.id);return m&&(r.kind==='claim'?m.claimed>=x.amount&&d.ops.claims.some(c=>c.projectId===p.id&&c.sourceId===src.doc.id&&c.milestoneId===x.id&&!e.claimIds.includes(c.id)):m.claimed>=x.claimed&&m.allocated>=x.claimed);});
 }
 const t=p.tasks.find(t=>t.id===r.taskId&&!t.removedAt);if(!t)return false;
 if(r.kind==='handoff')return H.current(t,r.targetId)&&H.signature(t,r.targetId)===r.version;
 const x=r.partId?t.executionBoard?.parts.find(x=>x.id===r.partId):t;if(!x)return false;
 if(r.kind==='review')return (x.assessments||[]).some(a=>a.submissionId===r.version);
 if(r.kind==='work')return (x.submissions||[]).some(s=>s.at>=r.createdAt&&s.id!==r.version);
 return false;
}
function reconcile(d,D){
 init(d);
 for(const r of d.ops.followups){if(terminal(r)||r.kind==='custom')continue;const p=d.data.find(p=>p.id===r.projectId);if(!p||p.removedAt||p.operationalClosed&&!confidentialKinds.has(r.kind)||!completed(d,p,r))continue;
  r.status='resolved';r.resolvedAt=D.now();r.resolution='تم تنفيذ الإجراء المطلوب في سجل المشروع؛ لا يعني اكتمال المشروع كله';
  history(d,D,{id:'system',role:'System'},p,r,'flow_followup_resolved',{reason:r.resolution});
  emit(d,D,[r.createdBy,r.targetId,p.pm,...owners(d)],p,r,'flow_followup_resolved','تمت معالجة المتابعة: '+r.label);
 }
}
function action(d,u,p,type,b,D){
 if(!type.startsWith('flow_followup_'))return {handled:false};
 D.assert(p,'PROJECT_REQUIRED','اختر المشروع');init(d);
 if(type==='flow_followup_create'){
  D.assert(!p.removedAt,'PROJECT_ARCHIVED','المشروع في السلة');
  const manual=b.pointKey==='custom',point=manual?{key:'custom',kind:'custom',label:D.text(b.subject,180),actorIds:customActors(d,u,p),taskId:'',partId:'',version:''}:points(d,p).find(x=>x.key===b.pointKey);
  D.assert(point&&(!p.operationalClosed||confidentialKinds.has(point.kind)&&financeUser(u))&&(manual||canRequest(u,p,point)),'POINT_UNAVAILABLE','تغيرت الخطوة أو لا تملك متابعتها؛ حدث الشاشة',409);
  D.assert(point.label,'SUBJECT_REQUIRED','اكتب موضوع التعطيل');D.assert(point.actorIds.includes(b.targetId),'INVALID_TARGET','اختر المسؤول المتاح لهذه الخطوة',403);
  const message=D.text(b.message,2000);D.assert(message,'MESSAGE_REQUIRED','وضح المطلوب أو سبب الاستعجال');const dueDate=D.C.validDate(b.dueDate);D.assert(dueDate>=Daily.today(d),'PAST_DEADLINE','موعد الرد يبدأ من اليوم');
  const prior=d.ops.followups.find(r=>r.projectId===p.id&&!terminal(r)&&r.pointKey===point.key&&r.version===point.version&&(!manual||r.targetId===b.targetId&&r.label===point.label));
  if(prior){D.assert(readable(u,p,prior),'FOLLOWUP_EXISTS','يوجد طلب متابعة قائم لهذه الخطوة عند الإدارة',409);return {handled:true,result:{existing:true,followupId:prior.id}};}
  const r={id:D.uid('FUP'),projectId:p.id,pointKey:point.key,kind:point.kind,label:point.label,taskId:point.taskId,partId:point.partId,version:point.version,targetId:b.targetId,createdBy:u.id,createdAt:D.now(),assignedAt:D.now(),status:'open',urgency:b.urgency==='normal'?'normal':'urgent',dueDate,message,promisedDate:'',lastNotifiedAt:D.now(),reminderCount:0,history:[],replies:[]};if(['advance','claim','collection'].includes(r.kind)){const f=V.view(d,p,Daily.today(d));r.evidence={receiptIds:f.receipts.map(x=>x.id),claimIds:d.ops.claims.map(x=>x.id),milestones:f.milestones.filter(m=>r.kind==='claim'?m.canClaim:m.claimRemaining>0).map(m=>({id:m.id,amount:m.amount,claimed:m.claimed}))};}d.ops.followups.push(r);
  history(d,D,u,p,r,type,{targetId:r.targetId,dueDate,message});emit(d,D,[r.targetId],p,r,type,'استعجال: '+r.label+' — الرد قبل '+dueDate);return {handled:true,result:{followupId:r.id}};
 }
 const r=d.ops.followups.find(r=>r.id===b.followupId&&r.projectId===p.id);D.assert(r&&readable(u,p,r),'FOLLOWUP_NOT_FOUND','المتابعة غير متاحة',403);D.assert(!terminal(r),'FOLLOWUP_CLOSED','المتابعة انتهت؛ تاريخها محفوظ',409);
 if(type==='flow_followup_ack'||type==='flow_followup_reply'){
  D.assert(r.targetId===u.id,'TARGET_ONLY','الرد للمسؤول المحدد',403);
  if(type==='flow_followup_ack'){if(r.acknowledgedAt)return {handled:true,result:{followupId:r.id,existing:true}};r.acknowledgedAt=D.now();if(r.status==='open')r.status='acknowledged';history(d,D,u,p,r,type);}
  else {const message=D.text(b.message,2000);D.assert(message,'MESSAGE_REQUIRED','وضح السبب وما ستفعله');const promisedDate=b.promisedDate?D.C.validDate(b.promisedDate):'';D.assert(!promisedDate||promisedDate>=Daily.today(d),'PAST_PROMISE','موعد الإنجاز المتوقع يبدأ من اليوم');r.replies.push({at:D.now(),by:u.id,message,promisedDate});r.promisedDate=promisedDate;r.status='replied';history(d,D,u,p,r,type,{message,promisedDate});}
  emit(d,D,[r.createdBy,p.pm,...owners(d)].filter(id=>id!==u.id),p,r,type,'رد على المتابعة: '+r.label);
 }else{
  D.assert(manage(u,p,r)||type==='flow_followup_escalate'&&r.targetId===u.id,'MANAGER_ONLY','الإجراء للمالك أو مهندس المشروعات أو منشئ المتابعة من الحسابات',403);
  if(type==='flow_followup_remind'){const current=points(d,p).find(x=>x.key===r.pointKey);D.assert(d.teamUsers.some(x=>x.id===r.targetId&&x.active!==false)&&(r.kind==='custom'||current&&current.version===r.version&&current.actorIds.includes(r.targetId)),'RESPONSIBILITY_CHANGED','تغيرت المسؤولية أو المرحلة؛ راجع المتابعة قبل تذكير الشخص السابق',409);D.assert(Date.now()-Date.parse(r.lastNotifiedAt)>=300000,'REMINDER_COOLDOWN','تم إرسال التنبيه بالفعل؛ يمكن التذكير بعد خمس دقائق',409);r.lastNotifiedAt=D.now();r.reminderCount++;history(d,D,u,p,r,type);emit(d,D,[r.targetId],p,r,type,'تذكير باستعجال: '+r.label);}
  else if(type==='flow_followup_escalate'){D.assert(!r.escalatedAt,'ALREADY_ESCALATED','تم التصعيد بالفعل',409);const reason=D.text(b.reason,2000);D.assert(reason,'REASON_REQUIRED','اذكر سبب التصعيد');const ids=escalationTargets(d,u,p);D.assert(ids.length,'NO_ESCALATION_TARGET','لا يوجد مستوى أعلى متاح؛ وجه قرار المتابعة دون تصعيد لنفسك',409);r.escalatedAt=D.now();r.escalationRecipients=ids;r.urgency='urgent';history(d,D,u,p,r,type,{reason,recipientIds:ids});emit(d,D,ids,p,r,type,'تصعيد تعطيل: '+r.label+' — '+reason);}
  else if(type==='flow_followup_close'){const reason=D.text(b.reason,2000);D.assert(reason,'REASON_REQUIRED','وضح سبب إغلاق المتابعة');r.status='closed';r.closedAt=D.now();r.closedBy=u.id;r.resolution=reason;history(d,D,u,p,r,type,{reason});emit(d,D,[r.createdBy,r.targetId],p,r,type,'أُغلقت المتابعة إداريًا: '+r.label+' — '+reason);}
  else if(type==='flow_followup_reassign'){D.assert(manager(u,p),'MANAGER_ONLY','نقل المتابعة للمالك أو مهندس المشروعات',403);const current=points(d,p).find(x=>x.key===r.pointKey),ids=reassignTargets(d,u,p,r,current);D.assert(ids.length,'NO_REASSIGNMENT_TARGET','لا يوجد مسؤول بديل متاح لهذه الخطوة',409);D.assert(ids.includes(b.targetId),'INVALID_TARGET','المسؤول الجديد يجب أن يطابق التكليف الحالي',403);const reason=D.text(b.reason,2000);D.assert(reason&&b.targetId!==r.targetId,'REASON_REQUIRED','اختر مسؤولًا آخر ووضح السبب');const previous=r.targetId;r.targetId=b.targetId;r.assignedAt=D.now();r.status='open';r.acknowledgedAt='';r.promisedDate='';r.escalatedAt='';r.escalationRecipients=[];if(current)r.version=current.version;r.lastNotifiedAt=D.now();history(d,D,u,p,r,type,{previous,targetId:r.targetId,reason});emit(d,D,[previous,r.targetId],p,r,type,'نُقلت مسؤولية المتابعة: '+r.label);}
  else throw new D.AppError('UNKNOWN_ACTION','إجراء متابعة غير معروف');
 }
 return {handled:true,result:{followupId:r.id}};
}
function auditReadable(d,u,a){const r=(d.ops.followups||[]).find(r=>r.id===a.details?.followupId),p=r&&d.data.find(p=>p.id===r.projectId);return !!p&&readable(u,p,r);}
function validate(d,D){init(d);D.assert(Array.isArray(d.ops.followups),'INVALID_FOLLOWUPS','سجل المتابعات غير صالح');const ids=new Set();for(const r of d.ops.followups){D.assert(r.id&&!ids.has(r.id)&&d.data.some(p=>p.id===r.projectId)&&d.teamUsers.some(u=>u.id===r.targetId)&&Array.isArray(r.history)&&Array.isArray(r.replies)&&['open','acknowledged','replied','resolved','closed'].includes(r.status),'INVALID_FOLLOWUP','ربط متابعة أو حالتها غير صالح');ids.add(r.id);}}
module.exports={init,points,projectView,view,action,reconcile,validate,auditReadable};
