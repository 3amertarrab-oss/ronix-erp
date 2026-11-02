'use strict';
// Owner read model. No financial, task-state, approval or time-entry mutations.
const C=require('./controls');
const clone=x=>JSON.parse(JSON.stringify(x));
const round=n=>Math.round(n*100)/100;
const valid=s=>typeof s==='string'&&s?Number.isFinite(Date.parse(s)):false;
const stamp=s=>valid(s)?Date.parse(s):null;
const plan=t=>({assignee:t.assignee||'',checker:t.checker||'',due:t.due||'',dueTime:t.dueTime||'',plannedEndDateTime:t.plannedEndDateTime||''});
function lanes(t){return t.executionBoard?.parts?.length?t.executionBoard.parts:[t];}
const tracked=new Set(['issue_order','plan_task','task_breakdown','reschedule_task','execution_board_enable','engineer_submit','execution_parts_submit','engineer_complete']);
function before(p,type){if(!tracked.has(type))return null;return (p?.tasks||[]).map(t=>({id:t.id,assignedAt:t.ownerInitialAssignedAt33??t.assignedAt??'',plan:plan(t),submissions:lanes(t).flatMap(r=>(r.submissions||[]).map(s=>s.id))}));}
function capture(p,type,previous,at){
 if(!p||!previous)return;
 for(const t of p.tasks||[]){
  const old=previous.find(x=>x.id===t.id),next=plan(t);
  if(t.ownerInitialAssignedAt33===undefined)t.ownerInitialAssignedAt33=old?old.assignedAt:(t.assignedAt||at);
  if(!old||JSON.stringify(old.plan)!==JSON.stringify(next)){
   (t.ownerPlanHistory33??=[]).push({at,before:old?.plan||null,after:next});
  }
  const ids=new Set(old?.submissions||[]);
  for(const r of lanes(t))for(const s of r.submissions||[]){
   if(!ids.has(s.id)&&!s.ownerTiming33)s.ownerTiming33={assignee:s.by||r.assignee||t.assignee,checker:r.checker||t.checker||p.checker,plan:clone(r===t?next:{...next,due:r.due||next.due,dueTime:r.due?r.dueTime||'':next.dueTime,plannedEndDateTime:r.due?r.plannedEndDateTime||'':next.plannedEndDateTime})};
  }
 }
}
// Stored date-only schedules mean end of the calendar day in the office's Cairo timezone.
function localEpoch(date,time='23:59:59'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}(:\d{2})?$/.test(time))return null;
 const desired=Date.parse(date+'T'+time+'Z');if(!Number.isFinite(desired))return null;
 let guess=desired;
 const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){const a=Object.fromEntries(f.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));const seen=Date.parse(`${a.year}-${a.month}-${a.day}T${a.hour}:${a.minute}:${a.second}Z`);guess+=desired-seen;}
 return guess;
}
function due(plan){
 if(!plan)return null;
 if(plan.plannedEndDateTime&&/[zZ]|[+-]\d\d:\d\d$/.test(plan.plannedEndDateTime))return stamp(plan.plannedEndDateTime);
 return localEpoch(plan.due,plan.dueTime||'23:59:59');
}
function hours(d,p){
 const all=d.timesheets.filter(t=>t.projectId===p.id&&!C.removed(t));
 const excluded=all.filter(t=>['rejected','superseded','void'].includes(t.status));
 const rows=all.filter(t=>!excluded.includes(t)),people=new Map();
 let logged=0,approved=0,pending=0,returned=0,other=0;
 for(const t of rows){const h=Math.max(0,Number(t.hours)||0),a=t.status==='approved'?Math.min(h,Math.max(0,Number(t.approvedHours??h))):0;logged+=h;approved+=a;
  if(t.status==='pending')pending+=h;else if(t.status==='returned')returned+=h;else other+=h-a;
  const person=people.get(t.user)||{id:t.user,name:d.teamUsers.find(u=>u.id===t.user)?.name||t.user||'—',logged:0,approved:0};person.logged+=h;person.approved+=a;people.set(t.user,person);
 }
 return {logged:round(logged),approved:round(approved),pending:round(pending),returned:round(returned),other:round(other),excluded:round(excluded.reduce((s,t)=>s+(Number(t.hours)||0),0)),people:[...people.values()].map(x=>({...x,logged:round(x.logged),approved:round(x.approved)})),entries:rows.length};
}
function journey(d,p,now=Date.now()){
 const rows=[],actor=id=>({actorId:id||'',actorName:d.teamUsers.find(u=>u.id===id)?.name||id||'—'});
 const closed=!!p.operationalClosed;
 function add(x){
  const start=stamp(x.start),end=stamp(x.end),active=!!x.active&&!closed;
  const effectiveEnd=end??(active?now:null),known=start!==null&&effectiveEnd!==null&&effectiveEnd>=start;
  const deadline=due(x.plan),delay=known&&deadline!==null?Math.max(0,effectiveEnd-Math.max(start,deadline)):null;
  rows.push({...x,...actor(x.actorId),active,elapsedMs:known?effectiveEnd-start:null,overdueMs:delay,dueAt:deadline===null?'':new Date(deadline).toISOString()});
 }
 const order=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued');
 if(order){add({id:'order:'+order.id,kind:'receipt',label:'استلام أمر التشغيل',labelEn:'Work order receipt',scope:'',taskId:'',actorId:order.pmAck?.by||order.pmId||p.pm,start:order.issuedAt||'',end:order.pmAck?.at||(closed?p.operationalClosedAt:'')||'',active:!order.pmAck&&!closed,plan:null});}
 let returns=0,reviews=0,unknown=0;
 for(const t of C.leaf(p.tasks||[])){
  // Before PM acknowledgement no engineer possession is inferred from the initial assignment.
  if(order&&!order.pmAck)continue;
  for(const r of lanes(t)){
   const part=r!==t,scope=part?t.name+' · '+r.label:t.name;
   const subs=(r.submissions||[]).filter(s=>valid(s.at)).sort((a,b)=>stamp(a.at)-stamp(b.at));
   const assessments=(r.assessments||[]).filter(a=>valid(a.at)&&(!a.kind||a.kind!=='parts_review'));
   const reopen=(r.reopenHistory||[]).filter(a=>valid(a.at));
   let start=t.ownerInitialAssignedAt33??t.assignedAt??'';
   if(part&&valid(t.executionBoard.createdAt)&&(!valid(start)||stamp(t.executionBoard.createdAt)>stamp(start)))start=t.executionBoard.createdAt;
   const firstAssign=((part?r.assignmentHistory:t.assignmentHistory)||[]).filter(x=>valid(x.at)).sort((a,b)=>stamp(a.at)-stamp(b.at))[0];
   if(firstAssign&&stamp(firstAssign.at)<stamp(start))start=''; // Original assignment time was not retained.
   if(valid(order?.pmAck?.at)&&valid(start)&&stamp(order.pmAck.at)>stamp(start))start=order.pmAck.at;
   if(subs.length&&valid(start)&&stamp(start)>stamp(subs[0].at))start='';
   let who=firstAssign?.previousAssignee||subs[0]?.by||r.assignee||t.assignee;
   let phase={kind:'execution',actorId:who,start,reason:'',plan:null};
   const events=[...subs.map(s=>({kind:'submit',at:s.at,data:s})),...assessments.map(a=>({kind:'review',at:a.at,data:a})),...reopen.map(a=>({kind:'reopen',at:a.at,data:a})),...((part?r.assignmentHistory:t.assignmentHistory)||[]).filter(a=>valid(a.at)).map(a=>({kind:'assign',at:a.at,data:a}))].sort((a,b)=>stamp(a.at)-stamp(b.at)||({submit:0,review:1,reopen:2,assign:3}[a.kind]-{submit:0,review:1,reopen:2,assign:3}[b.kind]));
   const base={scope,taskId:t.id,partId:part?r.id:'',plan:null};let sequence=0,cycle=0;
   function finish(end,active=false,override={}){
    if(!phase)return;
    const labels={execution:['التنفيذ الأولي','Initial execution'],rework:['تعديل وإعادة تسليم','Rework & resubmission'],continue:['استكمال التنفيذ','Continued execution'],review:['مراجعة','Review']};
    const label=labels[phase.kind]||labels.execution;
    add({...base,...phase,id:`${t.id}:${r.id}:${sequence++}`,label:label[0],labelEn:label[1],cycle,end:end||'',active,...override});
   }
   for(const e of events){
    if(e.kind==='submit'){
     const s=e.data;reviews++;cycle++;
     if(phase?.kind!=='review')finish(s.at,false,{actorId:s.by||phase?.actorId,plan:s.ownerTiming33?.plan||null});
     else finish(s.at); // A recorded superseding submission still ends the preceding review interval.
     phase={kind:'review',actorId:s.ownerTiming33?.checker||assessments.find(a=>a.submissionId===s.id)?.by||r.checker||t.checker||p.checker,start:s.at,submissionId:s.id,plan:null,reason:''};
    }else if(e.kind==='review'){
     const a=e.data;if(phase?.kind!=='review'||phase.submissionId!==a.submissionId)continue;
     finish(a.at,false,{actorId:a.by||phase.actorId,reason:a.reason||'',decision:a.decision||''});
     if(a.decision==='returned'){returns++;phase={kind:'rework',actorId:subs.find(s=>s.id===a.submissionId)?.by||r.assignee||t.assignee,start:a.at,reason:a.reason||'',plan:null};}
     else if(a.decision==='approved'||Number(a.percent)===100)phase=null;
     else phase={kind:'continue',actorId:subs.find(s=>s.id===a.submissionId)?.by||r.assignee||t.assignee,start:a.at,reason:a.reason||'',plan:null};
    }else if(e.kind==='reopen'){
     finish(e.at);returns++;phase={kind:'rework',actorId:r.assignee||t.assignee,start:e.at,reason:e.data.reason||'',plan:null};
    }else if(e.kind==='assign'&&phase&&phase.kind!=='review'&&e.data.nextAssignee!==phase.actorId){
     finish(e.at);phase={...phase,start:e.at,actorId:e.data.nextAssignee};
    }
   }
   if(phase){
    const terminal=r.status==='confirmed'||t.isSummary||p.finalTechnicalApproved||closed;
    let end=terminal?(r.confirmedAt||t.confirmedAt||p.finalTechnicalApprovedAt||p.operationalClosedAt||''):'';
    if(!subs.length&&terminal){phase.start='';}
    // Current plan is a valid current deadline only for the assignee, never a checker deadline.
    finish(end,!terminal,{plan:phase.kind==='review'?null:terminal?null:plan(part&&r.due?{...t,...r}:t)});
   }
   if(!events.length&&!valid(start))unknown++;
  }
 }
 const earliest=rows.map(r=>stamp(r.start)).filter(v=>v!==null);rows.sort((a,b)=>(stamp(a.start)??stamp(a.end)??Infinity)-(stamp(b.start)??stamp(b.end)??Infinity)||a.id.localeCompare(b.id));
 return {rows,returns,reviews,unknown,from:earliest.length?new Date(Math.min(...earliest)).toISOString():'',asOf:new Date(now).toISOString(),hasParts:p.tasks.some(t=>t.executionBoard?.parts?.length),maxElapsedMs:Math.max(60000,...rows.map(r=>r.elapsedMs||0))};
}
function view(d,p,now=Date.now()){return {hours:hours(d,p),journey:journey(d,p,now)};}
module.exports={view,hours,journey,before,capture,localEpoch,due};
