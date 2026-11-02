'use strict';
/* Pure role-scoped read model. No timesheet totals, financial figures, made-up
 * presence status, or inferred hours from percentage completion. */
const C=require('./controls'),H=require('./completion'),B=require('./execution-board'),Flow=require('./flow-followups'),Daily=require('./daily-time');
const finRole=r=>['Owner','Accountant'].includes(r),engineer=r=>['Engineer','Project Engineer'].includes(r);
const pct=n=>n===null||n===undefined?null:Math.max(0,Math.min(100,Number(n)));
const unique=a=>[...new Set(a.filter(Boolean))];
function related(p,id,role){return p.pm===id||p.checker===id||p.projectEngineer===id||C.leaf(p.tasks).some(t=>H.items(t).some(x=>x.assignee===id||(x.checker||p.checker)===id))||role==='Accountant';}
function weighted(rows,key){if(!rows.length||rows.some(x=>x[key]===null))return null;const w=rows.reduce((n,x)=>n+x.weight,0);return w?Math.round(rows.reduce((n,x)=>n+x.weight*x[key],0)/w*100)/100:null;}
function entry(d,p,u,points,today){
 const all=C.leaf(p.tasks).flatMap(t=>H.items(t).map(x=>{const r=x.r,a=r.assessments?.at(-1);return {taskId:t.id,partId:x.part?x.id:'',name:x.label,assignee:x.assignee,checker:x.checker||p.checker,weight:(Number(t.weight)||1)*(x.part?(Number(r.weight)||1)/100:1),progress:pct(r.progress),approvedProgress:r.status==='confirmed'||a?pct(r.approvedProgress):null,status:r.status||'todo',completedNote:r.completedNote||'',remainingNote:r.remainingNote||'',progressNote:r.progressNote||r.lastReturnReason||'',due:t.due||'',dueTime:t.dueTime||'',updatedAt:r.updatedAt||a?.at||r.submissions?.at(-1)?.at||t.updatedAt||t.assignedAt||'',handoffValid:H.current(t,x.assignee),approved:x.part?B.finished(r):H.requiredTasks({tasks:[t]}).length>0&&r.status==='confirmed'&&r.approvedProgress===100&&(!r.submissions?.length||r.reviewedSubmissionId===r.submissions.at(-1).id)};}));
 const own=all.filter(x=>x.assignee===u.id),reviewing=all.filter(x=>x.checker===u.id),final=!!p.finalTechnicalApproved;
 const tasksFor=u.role==='Checker'?reviewing:own;
 let actions=points.filter(x=>x.actorIds.includes(u.id));
 const times=u.role==='Checker'?d.timesheets.filter(t=>t.projectId===p.id&&t.status==='pending'&&C.canApprove(d,u,p,t)):[];
 actions=[...actions,...times.map(t=>({key:'time:'+t.id,kind:'time',label:'اعتماد وقت: '+(d.teamUsers.find(x=>x.id===t.user)?.name||t.user),taskId:t.taskId||'',partId:'',timesheetId:t.id,actorIds:[u.id],route:'review',targetTab:'time'}))];
 const waiting=engineer(u.role)?points.filter(x=>!x.actorIds.includes(u.id)&&(['review','final'].includes(x.kind)||x.kind==='assign')&&(x.kind==='assign'||x.kind==='final'||own.some(t=>t.taskId===x.taskId))):[];
 const done=tasksFor.filter(x=>x.approved).length;
 const openAssignments=engineer(u.role)?unique(own.filter(x=>!final&&(!x.approved||!x.handoffValid)).map(x=>x.taskId)).length:0;
 const late=tasksFor.filter(x=>x.due&&x.due<today&&!x.approved&&(u.role==='Checker'?x.status==='submitted':x.status!=='submitted')).length;
 const inbound=(d.ops.followups||[]).filter(f=>f.projectId===p.id&&f.targetId===u.id&&!['closed','resolved'].includes(f.status));
 const blocked=inbound.some(f=>f.urgency==='urgent'||f.dueDate<today)||engineer(u.role)&&tasksFor.some(x=>x.status==='returned');
 const waitingCount=waiting.length;let label=actions.length?'إجراءات مطلوبة منك':openAssignments?'متابعة أعمالك':waitingCount?'بانتظار إجراء من غيرك':final?'التسليم معتمد نهائيًا':tasksFor.length&&done===tasksFor.length?'أجزاؤك معتمدة — متابعة اكتمال المشروع':'متابعة المشروع — لا إجراء مباشر حاليًا';
 if(late)label='يوجد عمل متأخر يحتاج متابعة';else if(blocked)label='متابعة أو تصحيح مطلوب';
 return {projectId:p.id,role:u.role,taskCount:unique(tasksFor.map(x=>x.taskId)).length,partCount:tasksFor.length,openAssignments,
  openActions:actions.length,pendingReviews:actions.filter(a=>a.kind==='review').length,pendingTimes:times.length,
  ownEngineerPercent:engineer(u.role)?weighted(own,'progress'):null,ownApprovedPercent:engineer(u.role)?weighted(own,'approvedProgress'):null,
  approvedParts:done,waitingForOthers:waitingCount,overdueCount:late,label,tone:late||blocked?'busy':actions.length||openAssignments?'working':'idle',
  actions:actions.map(x=>({key:x.key,kind:x.kind,label:x.label,taskId:x.taskId||'',partId:x.partId||'',route:x.route,actorIds:x.actorIds,targetTab:x.targetTab||'',timesheetId:x.timesheetId||''})),
  waiting:waiting.map(x=>({kind:x.kind,label:x.label,actorIds:x.actorIds,taskId:x.taskId||'',partId:x.partId||'',route:x.route})),
  rows:tasksFor,latestUpdate:tasksFor.map(x=>x.updatedAt).filter(Boolean).sort().at(-1)||'',
  participation:u.role==='Project Manager'?'مهندس المشروعات':u.role==='Checker'?'المراجع':u.role==='Accountant'?'المتابعة المالية':own.length?'مهندس تنفيذ':'تنسيق المشروع'};
}
function view(d,viewer){
 if(!['Owner','Project Manager','Accountant'].includes(viewer.role))return null;
 const today=Daily.today(d),projects=d.data.filter(p=>!C.removed(p)&&!p.operationalClosed&&(viewer.role!=='Project Manager'||p.pm===viewer.id));
 const cache=new Map(projects.map(p=>[p.id,Flow.points(d,p)]));
 const people=d.teamUsers.filter(u=>u.active!==false&&u.role!=='Owner'&&(viewer.role!=='Project Manager'||projects.some(p=>related(p,u.id,u.role)&&u.role!=='Accountant')));
 return {version:1,asOf:today,people:people.map(u=>{const rows=projects.filter(p=>related(p,u.id,u.role)).map(p=>entry(d,p,u,cache.get(p.id),today));return {id:u.id,name:u.name,role:u.role,projects:rows,projectCount:rows.length,openActions:rows.reduce((n,r)=>n+r.openActions,0),openAssignments:rows.reduce((n,r)=>n+r.openAssignments,0),waitingForOthers:rows.reduce((n,r)=>n+r.waitingForOthers,0),overdueCount:rows.reduce((n,r)=>n+r.overdueCount,0)};})};
}
module.exports={view,entry,weighted};
