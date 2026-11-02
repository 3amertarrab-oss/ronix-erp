'use strict';
// R42.3.9.4: project metadata lifecycle only. No money, approvals or transactions are fabricated.
const crypto = require('node:crypto');
const W = require('./workflow');
const C = require('./controls');
const str = (x,max=2000)=>String(x??'').trim().slice(0,max);
const now = ()=>new Date().toISOString();
const uid = p=>p+'-'+crypto.randomUUID();
const clone = x=>JSON.parse(JSON.stringify(x));
const assert=C.check;
const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
function validDate(x){if(!x)return '';assert(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x,'INVALID_DATE','تاريخ غير صحيح');return x;}
function manager(d,u,p){return u.role==='Owner'||u.role==='Project Manager'&&(!p||p.pm===u.id);}
function isDraft(p){return p?.projectDraft===true||p?.workflowState==='draft';}
function order(d,p){return d.ops.orders.find(x=>x.projectId===p.id&&x.status==='issued');}
function rights(d,u,p){return {draft:isDraft(p),canEdit:manager(d,u,p)&&!C.closed(p),canCopy:manager(d,u,p)&&!C.removed(p),canChangeTeam:manager(d,u,p)&&!C.closed(p)&&!order(d,p),canChangeCustomer:u.role==='Owner'&&isDraft(p)&&!p.sourceQuoteId&&!p.sourceContractId&&!d.customerReceipts.some(r=>r.projectId===p.id)&&!order(d,p)};}
function chooseUser(d,id,roles,optional=true){if(!id&&optional)return '';const u=d.teamUsers.find(x=>x.id===id&&x.active!==false);assert(u&&roles.includes(u.role),'INVALID_TEAM','اختر موظفًا فعالًا بالدور المناسب');return u.id;}
function metadata(d,u,p,b){
 assert(manager(d,u,p),'FORBIDDEN','إدارة المشروع للمالك أو مديره المعيّن فقط',403);
 const result={};
 if(hasOwn(b,'name')){result.name=str(b.name,250);assert(result.name,'PROJECT_NAME_REQUIRED','اكتب اسم المشروع');}
 for(const k of ['location','projectDescription'])if(hasOwn(b,k))result[k]=str(b[k],k==='location'?300:4000);
 if(hasOwn(b,'deadline'))result.deadline=validDate(b.deadline);
 if(hasOwn(b,'startDate'))result.startDate=validDate(b.startDate);
 assert(!(result.startDate??p?.startDate)||!(result.deadline??p?.deadline)||(result.startDate??p?.startDate)<=(result.deadline??p?.deadline),'DATE_ORDER','موعد البداية يجب ألا يتجاوز التسليم');
 if(hasOwn(b,'priority')){assert(['Urgent','High','Normal','Low'].includes(b.priority),'INVALID_PRIORITY','أولوية غير صحيحة');result.priority=b.priority;}
 for(const [k,roles]of [['pm',['Project Manager','Owner']],['checker',['Checker']],['projectEngineer',['Project Engineer']]])if(hasOwn(b,k)){
  assert(!p||!order(d,p)||b[k]===(p[k]||''),'TEAM_AFTER_HANDOVER','بعد إصدار الأمر، احتفظ بفريق التسليم الحالي؛ توزيع المهندسين يتم من المهام',409);
  if(u.role==='Project Manager'&&k==='pm')assert(b[k]===u.id,'FORBIDDEN','لا يمكنك نقل مشروعك لمدير آخر',403);
  result[k]=chooseUser(d,b[k],roles);
 }
 if(hasOwn(b,'customerId')){
  assert(u.role==='Owner','FORBIDDEN','تحديد العميل التجاري للمالك فقط',403);
  assert(!p||rights(d,u,p).canChangeCustomer||b.customerId===(p.customerId||''),'CUSTOMER_LOCKED','العميل مرتبط بالتعاقد أو الحركات؛ لا تغيّره من بيانات المشروع',409);
  const c=b.customerId?d.masters.customers.find(c=>c.id===b.customerId&&c.active!==false):null;
  assert(!b.customerId||c,'CUSTOMER_REQUIRED','اختر عميلًا صحيحًا');result.customerId=c?.id||'';result.client=c?.name||'';
 }
 return result;
}
function create(d,u,b){
 assert(['Owner','Project Manager'].includes(u.role),'FORBIDDEN','إنشاء المشروع للمالك أو مهندس المشروعات',403);
 const m=metadata(d,u,null,b);assert(m.name,'PROJECT_NAME_REQUIRED','اكتب اسم المشروع');
 if(u.role==='Project Manager')m.pm=u.id;
 const p={id:W.nextProjectId(d),identityToken:uid('PID'),name:m.name,customerId:'',client:'',projectDraft:true,workflowState:'draft',operationalStatus:'draft',operationalClosed:false,priority:'Normal',pm:u.role==='Project Manager'?u.id:'',checker:'',projectEngineer:'',deadline:'',startDate:'',tasks:[],events:[],stage:0,invoice:0,paid:0,retention:0,docs:0,value:0,revisedContractValue:0,createdAt:now(),createdBy:u.id,...m};
 d.data.push(p);return {projectId:p.id,draft:true};
}
function edit(d,u,p,b){
 assert(p&&!C.closed(p),'PROJECT_ARCHIVED','المشروع مؤرشف؛ افتحه بإجراء موثق قبل تعديل بياناته');
 const m=metadata(d,u,p,b);assert(Object.keys(m).length,'NO_CHANGES','لا توجد بيانات للتحديث');
 const before=Object.fromEntries(Object.keys(m).map(k=>[k,p[k]??'']));
 (p.metadataHistory??=[]).push({at:now(),by:u.id,before,after:clone(m),reason:str(b.reason)||'تعديل بيانات المشروع'});
 // Keep the existing image tied to the same identity after a display-name edit.
 const im=d.projectImages?.[p.id];const trusted=im&&W.imageEligible(d,p);
 Object.assign(p,m,{updatedAt:now(),updatedBy:u.id});if(trusted&&m.name){im.name=m.name;im.projectIdentity=W.projectIdentity(p);}
 return {projectId:p.id,updatedFields:Object.keys(m)};
}
function copy(d,u,p,b){
 assert(p&&manager(d,u,p),'FORBIDDEN','نسخ بيانات المشروع للمالك أو مديره فقط',403);
 const body={name:str(b.name,250)||p.name+' — نسخة',location:p.location||'',projectDescription:p.projectDescription||'',priority:p.priority||'Normal',pm:u.role==='Project Manager'?u.id:p.pm||'',checker:p.checker||'',projectEngineer:p.projectEngineer||'',deadline:'',startDate:''};
 if(u.role==='Owner')body.customerId=b.keepCustomer===true?(p.customerId||''):'';
 const result=create(d,u,body),q=d.data.find(x=>x.id===result.projectId);q.copiedFrom=p.id;
 // An optional planning reference is not an assignment and has no progress weight.
 if(b.copyPlan===true)q.planningTemplate=C.leaf(p.tasks).map(t=>({name:t.name,plannedHours:Number(t.plannedHours)||0,weight:Number(t.weight)||1,priority:t.priority||'Normal',assignmentNotes:t.assignmentNotes||'',source:'planning_reference_only'}));
 if(b.copyImage===true&&W.imageEligible(d,p)){q.imageCopiedByChoice=true;d.projectImages[q.id]={...clone(d.projectImages[p.id]),name:q.name,builtin:false,projectIdentity:W.projectIdentity(q),updatedAt:now(),updatedBy:u.id};}
 return {...result,copiedFrom:p.id,hasTemplate:!!q.planningTemplate?.length};
}
function action(d,u,p,type,b){
 if(type==='project_create')return {handled:true,result:create(d,u,b)};
 if(type==='project_update')return {handled:true,result:edit(d,u,p,b)};
 if(type==='project_copy')return {handled:true,result:copy(d,u,p,b)};
 return {handled:false};
}
module.exports={isDraft,rights,metadata,action};
