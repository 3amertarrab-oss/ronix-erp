'use strict';
const crypto = require('node:crypto');
const W = require('./workflow');
const O = require('./operations');
const C = require('./controls');
const F = require('./flex');
const B = require('./execution-board');
const P = require('./site/assets/planning-r395');
const V = require('./finance-view');
const Daily = require('./daily-time');
const Handoff = require('./completion');
const Commercial = require('./commercial-link');
const Scope = require('./scope-management');
const Flow = require('./flow-followups');
const Integrity = require('./finance-integrity');
const ScopeProgress = require('./scope-progress');
const CollectionStatus=require('./collection-status');
const Updates=require('./workflow-update');
const OwnerInsights=require('./owner-insights');
const Workflow34=require('./workflow-r3934');
const RoleStatus=require('./role-status');
const RELEASE = require('./release.json');
const Access=require('./access');
const Supplier=require('./supplier-flow');
const ROLES=['Owner','Accountant','Project Manager','Engineer','Checker'];
const FINANCE=new Set(['Owner','Accountant','Project Manager']);
const LEGACY_KEYS={ronixv2:'data',ronixTimesheets:'timesheets',ronixCommercialV3:'commercial',ronixMastersV31:'masters',ronixRates:'rates',ronixTeamUsersV1:'teamUsers',ronixAwardsV1:'awards',ronixVendorPaymentsV1:'vendorPayments',ronixProjectImagesV1:'projectImages',ronixCustomerReceiptsV1:'customerReceipts',ronixProjectCostCentersV1:'projectCostCenters',ronixJournalEntriesV1:'journalEntries'};
const PROJECT_FIN_FIELDS=['value','revisedContractValue','invoice','paid','retention','billingPriority','customerId','client','sourceQuoteId','sourceQuoteNumber','sourceContractId','sourceContractNumber','commercialSourceType','costCenterId','followUp','health','healthMode'];
const clone=x=>JSON.parse(JSON.stringify(x));
const now=()=>new Date().toISOString();
const uid=p=>p+'-'+crypto.randomUUID();
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
class AppError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status}}
function assert(ok,code,msg,status=400){if(!ok)throw new AppError(code,msg,status)}
function text(v,max=2000){return String(v??'').trim().slice(0,max)}
function num(v){return Number(v)||0}
function range(v,min,max,name){const n=Number(v);assert(Number.isFinite(n)&&n>=min&&n<=max,'INVALID_NUMBER','قيمة غير صحيحة: '+name);return n}
function money(v){const n=range(v,0,1e12,'المبلغ');assert(Number.isSafeInteger(n),'INTEGER_EGP_REQUIRED','أدخل المبلغ بالجنيه الصحيح دون قروش');return n}
function date(v,required=false){if(!v&&!required)return '';assert(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'INVALID_DATE','تاريخ غير صحيح');return v}
function requireRole(u,...roles){assert(u&&roles.includes(u.role),'FORBIDDEN','غير مسموح لهذا الحساب',403)}
function normalizeBackup(raw,previous){
 assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'BAD_BACKUP','ملف النسخة غير صالح');
 assert(Array.isArray(raw.data)&&raw.commercial&&Array.isArray(raw.commercial.quotes)&&Array.isArray(raw.commercial.contracts)&&raw.masters&&Array.isArray(raw.masters.customers),'BAD_BACKUP','النسخة لا تحتوي المشاريع والعقود والعروض والعملاء المطلوبة');
 const d=clone(raw),ext=raw.extensions||{};
 for(const k of ['timesheets','teamUsers','awards','vendorPayments','customerReceipts','projectCostCenters','journalEntries']){
   if(!Array.isArray(d[k]))d[k]=clone(Array.isArray(ext[k])?ext[k]:previous?.[k]||[]);
 }
 d.rates=d.rates||previous?.rates||{}; d.projectImages=d.projectImages||ext.projectImages||previous?.projectImages||{};
 d.masters.vendors=d.masters.vendors||[];d.masters.vendorBills=d.masters.vendorBills||[];d.masters.expenses=d.masters.expenses||[];
 if(!d.teamUsers.some(u=>u.id==='owner'))d.teamUsers.unshift({id:'owner',name:'Eng. Amer Tarrab',role:'Owner',active:true,rate:0});
 if(!d.ops)d.ops={orders:[],notifications:[],audit:[],idempotency:{},claims:[]};
 for(const k of ['orders','notifications','audit','claims'])if(!Array.isArray(d.ops[k]))d.ops[k]=[];
 d.ops.idempotency=d.ops.idempotency||{};
 d.version=RELEASE.build;d.schemaVersion=RELEASE.schemaVersion;
 // Add a missing cost-center master only where existing project and receipt IDs agree.
 d.ops.migrations=d.ops.migrations||[];
 if(!d.ops.migrations.some(x=>x.id==='R4391-centers')){
   const added=[];for(const p of d.data){const rs=d.customerReceipts.filter(r=>r.projectId===p.id&&r.costCenterId===p.costCenterId);if(p.costCenterId&&rs.length&&!d.projectCostCenters.some(c=>c.id===p.costCenterId||c.projectId===p.id)){d.projectCostCenters.push({id:p.costCenterId,projectId:p.id,name:p.id+' — '+p.name,status:'active',createdAt:now(),createdBy:'system',recoveredFrom:'project-and-existing-receipt-identifiers'});added.push(p.costCenterId)}}
   d.ops.migrations.push({id:'R4391-centers',at:now(),added,policy:'additive; no amounts, approvals or original receipts changed'});
 }
 if(!Array.isArray(raw.costRates))d.costRates=clone(previous?.costRates||[]);Access.migrate(d);Supplier.init(d);C.init(d);Daily.init(d);validateStructure(d);return d;
}
function validateStructure(d){
 Daily.validate(d);Flow.validate(d,module.exports);Supplier.validate(d,module.exports);
 for(const [label,rows] of [['projects',d.data],['quotes',d.commercial.quotes],['contracts',d.commercial.contracts],['customers',d.masters.customers],['vendors',d.masters.vendors],['receipts',d.customerReceipts],['timesheets',d.timesheets],['team',d.teamUsers]]){
 const ids=new Set();for(const r of rows){assert(r&&typeof r.id==='string'&&r.id&&!ids.has(r.id),'DUPLICATE_ID','كود مفقود أو مكرر في '+label);ids.add(r.id)}
 }
 const rateIds=new Set();for(const r of d.costRates||[]){assert(r&&typeof r.id==='string'&&!rateIds.has(r.id),'DUPLICATE_RATE','مرجع سعر مفقود أو مكرر');rateIds.add(r.id);assert(Number.isSafeInteger(r.rateEGP)&&r.rateEGP>=0&&r.rateEGP<=1000000,'INVALID_RATE','سعر تكلفة غير صحيح');date(r.effectiveFrom,true);}
 for(const t of d.timesheets){if(!t.costSnapshot)continue;const c=t.costSnapshot,h=Number(t.approvedHours??t.hours),basis=h*4*c.rateEGP;assert(t.status==='approved'&&Number.isInteger(h*4)&&h>0&&h<=Number(t.hours)&&Number.isSafeInteger(c.rateEGP)&&c.rateEGP>=0&&Number.isSafeInteger(basis)&&c.basisQuarterEGP===basis&&c.amountEGP===Math.floor((basis+2)/4)&&c.approvedHours===h&&c.workDate===t.date,'INVALID_COST_SNAPSHOT','مرجع تكلفة لا يطابق الساعات أو السعر المثبت');}
 for(const p of d.data){if(p.financeHandoffAcks!==undefined){assert(Array.isArray(p.financeHandoffAcks),'BAD_HANDOFF_ACKS','سجل استلام الحسابات غير صالح');const ackKeys=new Set();for(const a of p.financeHandoffAcks){assert(a&&typeof a.id==='string'&&typeof a.approvalKey==='string'&&a.approvalKey&&!ackKeys.has(a.approvalKey)&&typeof a.by==='string'&&typeof a.at==='string'&&Number.isFinite(Date.parse(a.at)),'BAD_HANDOFF_ACK','سجل استلام الحسابات مكرر أو غير صالح');ackKeys.add(a.approvalKey);}}assert(Array.isArray(p.tasks),'INVALID_TASKS','المهام غير صالحة للمشروع '+p.id);const ids=new Set();for(const t of p.tasks){assert(t.id&&!ids.has(t.id),'DUPLICATE_TASK','كود مهمة مفقود أو مكرر');ids.add(t.id);B.validate(t)}}
}
function project(d,id){const p=d.data.find(x=>x.id===id&&!C.removed(x));assert(p,'NOT_FOUND','المشروع غير موجود',404);return p}
function user(d,id){const u=d.teamUsers.find(x=>x.id===id&&x.active!==false);assert(u,'INVALID_USER','المستخدم غير موجود أو غير فعال');return u}
function isPM(u,p){return p.pm===u.id&&['Owner','Project Manager'].includes(u.role)}
function visible(u,p){return FINANCE.has(u.role)||isPM(u,p)||p.projectEngineer===u.id||(u.role==='Checker'&&(p.checker===u.id||p.tasks.some(t=>t.checker===u.id)))||p.tasks.some(t=>Handoff.items(t).some(x=>x.assignee===u.id))}
function pct(p,key){return O.percent(p.tasks,key)}
function latestReport(t){return t.submissions?.[t.submissions.length-1]||null}
function pending(t){return t.status==='submitted'&&!!latestReport(t)}
function complete(t){if(B.has(t))return B.summary(t.executionBoard).allApproved;return t.status==='confirmed'&&num(t.approvedProgress)===100&&(!latestReport(t)||t.reviewedSubmissionId===latestReport(t).id)}
function technicalState(p){if(p.finalTechnicalApproved)return 'approved';if(p.legacyWorkflow&&!p.opsReopenedAt&&!p.tasks.some(t=>t.submissions?.length))return 'legacy_record';if(p.tasks.some(t=>pending(t)))return 'awaiting_review';if(p.tasks.some(t=>t.status==='returned'))return 'rework';if(p.tasks.some(t=>num(t.progress)>0))return 'working';return 'planning'}
function notify(d,ids,type,projectId,message,financial=false){for(const id of new Set(ids.filter(Boolean))){const u=d.teamUsers.find(x=>x.id===id&&x.active!==false);if(!u||financial&&!FINANCE.has(u.role))continue;d.ops.notifications.unshift({id:uid('NTF'),userId:id,type,projectId,message,financial,createdAt:now(),readAt:null})}}
function engineerRole3910(u){return ['Engineer','Project Engineer'].includes(u?.role)}
function financeIds(d){return d.teamUsers.filter(u=>u.active!==false&&FINANCE.has(u.role)).map(u=>u.id)}
function notifyOps(d,p,type,message){notify(d,[p.pm,p.projectEngineer,...d.teamUsers.filter(u=>u.role==='Owner').map(u=>u.id)],type,p.id,message)}
function event(d,u,type,pid,details={}){const previous=d.ops.audit[d.ops.audit.length-1]?.hash||'';const a={id:uid('EVT'),at:now(),userId:u.id,role:u.actualRole||u.role,type,projectId:pid,details,previous};a.hash=hash(a);d.ops.audit.push(a);return a}
function safeTask(t){return {planCalculation:clone(t.planCalculation||null),id:t.id,name:t.name,assignee:t.assignee,checker:t.checker,assignmentNotes:t.assignmentNotes||'',scopeItemId:t.scopeItemId||'',scopeServiceCode:t.scopeServiceCode||'',required:t.required!==false,weight:num(t.weight)||1,plannedHours:num(t.plannedHours),startDate:t.startDate||'',startTime:t.startTime||t.planCalculation?.startTime||'',dueTime:t.dueTime||t.planCalculation?.dueTime||'',plannedEndDateTime:t.plannedEndDateTime||t.planCalculation?.endDateTime||'',due:t.due||'',priority:t.priority||'Normal',progress:B.has(t)?B.summary(t.executionBoard).engineerPercent:num(t.progress),approvedProgress:B.has(t)?B.summary(t.executionBoard).checkerPercent:num(t.approvedProgress),status:t.status,completedNote:t.completedNote||'',remainingNote:t.remainingNote||'',eta:t.eta||'',workRevision:t.workRevision||0,submissions:clone(t.submissions||[]),assessments:clone(t.assessments||[]),reviewedSubmissionId:t.reviewedSubmissionId||'',lastReturnReason:t.lastReturnReason||'',progressNote:t.progressNote||'',updatedAt:t.updatedAt||'',assignedAt:t.assignedAt||'',assignmentHistory:clone(t.assignmentHistory||[]),hasLegacyReview:!t.submissions?.length&&!!t.reviewCycles?.length}}
function canEditImage(u,p){return !C.closed(p)&&(u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id||['Engineer','Project Engineer'].includes(u.role)&&C.leaf(p.tasks).some(t=>t.assignee===u.id));}
function safeProject(p){return {id:p.id,name:p.name,pm:p.pm,projectEngineer:p.projectEngineer,checker:p.checker,priority:p.priority,deadline:p.deadline||'',technicalState:technicalState(p),engineerPercent:pct(p,'progress'),checkerPercent:pct(p,'approvedProgress'),finalTechnicalApproved:!!p.finalTechnicalApproved,finalTechnicalApprovedAt:p.finalTechnicalApprovedAt||'',finalTechnicalApprovedBy:p.finalTechnicalApprovedBy||'',operationalClosed:!!p.operationalClosed,operationalClosedAt:p.operationalClosedAt||'',operationalClosedBy:p.operationalClosedBy||'',operationalCloseReason:p.operationalCloseReason||'',financialClosed:!!p.financialClosed,financialClosedAt:p.financialClosedAt||'',financialClosedBy:p.financialClosedBy||'',legacyWorkflow:!!p.legacyWorkflow,technicalBrief:p.opsTechnicalBrief||'',tasks:C.live(p.tasks).map(safeTask)}}
function publicUser(u){return {id:u.id,name:u.name,role:u.role,active:u.active!==false}}
function snapshot(d,u,revision){
 const realUser=Access.original(u);u=Access.effective(u);
 const ps=d.data.filter(p=>!C.removed(p)&&visible(u,p)),pids=new Set(ps.map(p=>p.id)),fin=FINANCE.has(u.role);
 const out={release:RELEASE,revision,user:publicUser(u),users:d.teamUsers.filter(x=>x.active!==false).map(publicUser),projects:ps.map(p=>{
   const x=safeProject(p);
   if(!fin){delete x.financialClosed;delete x.financialClosedAt;delete x.financialClosedBy;}
   if(!fin&&!isPM(u,p)&&u.role!=='Checker'&&p.projectEngineer!==u.id)x.tasks=x.tasks.filter(t=>Handoff.items(p.tasks.find(r=>r.id===t.id)).some(x=>x.assignee===u.id));
   x.tasks=x.tasks.map(t=>{const raw=p.tasks.find(z=>z.id===t.id);const y={...t,...O.taskFacts(d,p,raw,u),...C.taskExtras(d,p,raw),execution:B.safe(d,u,p,raw)};if(raw.isSummary){const children=C.leaf(p.tasks).filter(x=>x.parentTaskId===raw.id);y.progress=O.percent(children,'progress');y.approvedProgress=O.percent(children,'approvedProgress');}y.completion=Handoff.taskState(d,p,raw,u);y.planEdit=Handoff.planState(d,p,raw,u);return y;});
   x.flex={...F.rights(d,u,p),location:p.location||'',description:p.projectDescription||'',startDate:p.startDate||'',planningTemplate:clone(p.planningTemplate||[])};if(fin){x.flex.customerId=p.customerId||'';}
   x.scopeProgress=ScopeProgress.view(d,p);x.completion=Handoff.projectState(d,p,u);x.summary=O.summary(d,p,u);x.team=x.summary.team;x.totalTasks=p.tasks.length;
   x.canEditImage=canEditImage(u,p);x.imageUpdatedBy=d.projectImages[p.id]?.updatedBy||'';x.scopeOptions=W.scopeOptions(W.source(d,p));x.scopeCoverage=W.scopeCoverage(d,p);x.imageAvailable=W.imageEligible(d,p);x.imageRevision=d.projectImages[p.id]?.updatedAt||'';
   x.nextAction=p.projectDraft?{code:'draft',label:'ربط مرجع معتمد وإصدار أمر التشغيل',en:'Link an approved source and issue order',actors:d.teamUsers.filter(x=>x.active!==false&&['Owner','Accountant'].includes(x.role)).map(x=>x.id)}:O.nextAction(d,p,x.scopeCoverage);x.operation=W.uiState(d,p);if(x.operation.state==='awaiting_pm'||x.operation.state==='ready_for_planning'||x.operation.state==='draft')x.technicalState=x.operation.state;
   x.scopeManagement=Scope.view(d,u,p);x.commercialLink=Commercial.summary(d,u,p);x.flow=Flow.projectView(d,u,p);
   x.commercialApproved=!!W.source(d,p)&&['approved','active','closed'].includes(W.source(d,p).doc.status);
   x.collectionStatus=CollectionStatus.view(d,p,u);
   if(['Owner','Project Manager'].includes(realUser.role))x.ownerInsights=OwnerInsights.view(d,p);
   x.workflow34=Workflow34.view(d,p,realUser);
   if(p.finalTechnicalApproved&&!p.financialClosed)x.nextAction={code:x.workflow34.state,label:x.workflow34.label,en:x.workflow34.label,actors:['pm_receipt','pm_direction','pm_close'].includes(x.workflow34.state)?[p.pm]:d.teamUsers.filter(z=>z.role==='Accountant'&&z.active!==false).map(z=>z.id)};
   if(fin){x.finance=V.view(d,p);x.financialClosed=x.finance.financialClosed;}
   return x;
 }),orders:d.ops.orders.filter(o=>pids.has(o.projectId)).map(o=>{
   const z={id:o.id,projectId:o.projectId,issuedAt:o.issuedAt,issuedBy:o.issuedBy,status:o.status,pmId:o.pmId,pmAck:o.pmAck,technicalBrief:o.technicalBrief,deadline:o.deadline};
   if(fin){z.contractId=o.contractId||'';z.quoteId=o.quoteId||'';z.sourceType=o.sourceType||'contract';z.accountsAck=o.accountsAck}return z;
 }),timesheets:d.timesheets.filter(t=>C.canReadTime(d,u,ps.find(p=>p.id===t.projectId),t)).map(t=>C.safeTime(d,u,ps.find(p=>p.id===t.projectId),t)),notifications:d.ops.notifications.filter(n=>n.userId===u.id&&(!n.financial||fin)).slice(0,250).map(n=>clone(n)),audit:d.ops.audit.filter(a=>pids.has(a.projectId)||a.userId===u.id).filter(a=>!a.type.startsWith('flow_followup_')||Flow.auditReadable(d,u,a)).filter(a=>fin||a.type.startsWith('flow_followup_')||['engineer_complete','reschedule_task','execution_board_enable','execution_parts_save','execution_parts_submit','execution_parts_review','execution_part_reopen','time_activity_add','timesheet_review','timesheet_edit','timesheet_reopen','task_breakdown','task_request_update','issue_order','ack_order','plan_task','engineer_update','engineer_submit','checker_assess','checker_return','checker_reopen','final_approve','timesheet_add','timesheet_approve','project_image_update'].includes(a.type)).slice(-120).map(a=>({id:a.id,at:a.at,userId:a.userId,type:a.type,projectId:a.projectId,details:a.details}))};
 out.flowFollowups=ps.flatMap(p=>Flow.view(d,u,p));
 out.directory=d.data.filter(p=>!C.removed(p)&&(!O.archived(p)||visible(u,p))).map(p=>({...O.directoryProject(d,p,u,visible(u,p),W),flex:{...F.rights(d,u,p)}}));
 out.timeChoices=O.timeChoices(d,u).map(p=>({...p,tasks:p.tasks.filter(t=>!d.data.find(x=>x.id===p.id)?.tasks.find(x=>x.id===t.id)?.isSummary).map(t=>({...t,activities:C.taskActivityOptions(d,d.data.find(x=>x.id===p.id),d.data.find(x=>x.id===p.id).tasks.find(x=>x.id===t.id))}))}));
 out.records=u.role==='Owner'||u.role==='Project Manager'?C.recordList(d,u,'project'):[];
 if(u.role==='Owner')out.records.push(...C.recordList(d,u,'quote'),...C.recordList(d,u,'contract'));
 out.daily=Daily.view(d,u);out.dailyAdmin=Daily.admin(d,u);
 out.audit=out.audit.filter(a=>!a.type.startsWith('timesheet_')&&!a.type.startsWith('daily_')||a.userId===u.id||fin||u.role==='Project Manager'&&ps.some(p=>p.pm===u.id&&p.id===a.projectId));
 if(!fin&&u.role!=='Project Manager'){for(const p of out.projects){delete p.summary.loggedHours;delete p.summary.approvedHours;delete p.summary.pendingHours;for(const t of p.tasks)delete t.hours;}}
 out.controls={version:1,timeApproval:'owner_or_assigned_checker',hoursEntry:'timesheets_only'};
 if(fin){out.costSummary=C.costSummary(d);out.costRates=clone(d.costRates||[]);out.legacyRates=clone(d.rates||{});out.projects.forEach(p=>p.laborCost=C.costSummary(d,p.id));}
 if(u.role==='Project Manager')out.sources=W.sourceRows(d).filter(s=>s.projectId&&ps.some(p=>p.id===s.projectId)).map(({total,...safe})=>safe);
 if(fin){
   out.legacyActivity=d.data.flatMap(p=>(p.events||[]).map(e=>({projectId:p.id,userId:e.user,at:e.at,message:e.text,legacy:true}))).slice(0,300);
   out.contracts=C.live(d.commercial.contracts).map(c=>({id:c.id,number:c.number,projectId:c.projectId,client:c.client,status:c.status,scope:c.scope||'',total:contractTotal(c),schedule:c.schedule||[]}));
   out.sources=W.sourceRows(d);out.customers=d.masters.customers.filter(c=>c.active!==false).map(c=>({id:c.id,name:c.name,phone:c.phone||'',email:c.email||'',address:c.address||''}));
   out.receiptLedger=d.customerReceipts.map(r=>({id:r.id,projectId:r.projectId||'',customerId:r.customerId,customerName:d.masters.customers.find(x=>x.id===r.customerId)?.name||r.customerName||'',amount:num(r.amount),date:r.date,status:r.status,opening:!!r.openingBalance||/^OPEN-/i.test(r.id)||r.kind==='opening',unallocated:!!r.unallocated}));
    out.receipts=d.customerReceipts.slice(0,250).map(r=>({id:r.id,projectId:r.projectId||'',customerId:r.customerId,amount:num(r.amount),date:r.date,method:r.method||'',reference:r.reference||'',unallocated:!!r.unallocated,status:r.status}));
 }
 out.employeeStatus=RoleStatus.view(d,u);
 out.user=publicUser(realUser);out.supplier=Supplier.view(d,realUser,module.exports);out.projects.forEach(p=>{p.projectCost=Supplier.cost(d,p.id,module.exports);p.externalWork=Supplier.projectWork(d,p.id,realUser);});
 if(!FINANCE.has(realUser.role))out.projects.forEach(p=>delete p.projectCost);
 return out;
}
function legacyAccounts(p){return p?.legacyWorkflow===true&&!p.opsReopenedAt&&p.legacyWorkflowType==='PRE_R42_3_ACCOUNTS'&&!!p.accountsEnteredAt}
function contractTotal(c){return W.total(c,'contract')}
function checkP(u,p){assert(visible(u,p),'FORBIDDEN','لا تملك صلاحية على هذا المشروع',403)}
function checkPM(d,u,p){assert(u.role==='Owner'||isPM(u,p),'FORBIDDEN','التوزيع لمهندس المشروعات أو المالك فقط',403);const o=d.ops.orders.find(x=>x.projectId===p.id&&x.status==='issued');assert(o?.pmAck||(!o&&p.legacyWorkflow),'ACK_REQUIRED','يجب أن يؤكد مهندس المشروعات استلام أمر التشغيل أولًا؛ المالك لا يتجاوز خطوة الاستلام')}
function task(p,id){const t=p.tasks.find(t=>t.id===id&&!C.removed(t));assert(t,'TASK_NOT_FOUND','المهمة غير موجودة',404);return t}
function reviewer(u,p,t){assert(u.role==='Checker'&&(t?.checker||p.checker)===u.id,'CHECKER_ONLY','الإجراء للـChecker المعيّن فقط',403)}
function ensureNotFinal(p){assert(p&&!p.operationalClosed,'PROJECT_ARCHIVED','المشروع مؤرشف؛ يلزم إعادة فتح إدارية موثقة قبل التنفيذ');assert(!p.finalTechnicalApproved,'TECHNICALLY_CLOSED','المشروع معتمد فنيًا؛ يلزم إعادة فتح موثقة من المراجع')}
function addSubmission(t,u){const r={id:uid('SUB'),revision:(t.workRevision||0)+1,percent:num(t.progress),completedNote:t.completedNote||'',remainingNote:t.remainingNote||'',progressNote:t.progressNote||'',eta:t.eta||'',by:u.id,at:now()};t.workRevision=r.revision;(t.submissions??=[]).push(r);t.status='submitted';return r}
function runAction(d,u,a){
 const actual=Access.original(u);Supplier.init(d);Daily.enforce(d,actual,a.type);
 if(Supplier.handles(a.type)){const beforeIds=new Set(d.ops.notifications.map(n=>n.id));const result=Supplier.action(d,actual,a,module.exports);for(const n of d.ops.notifications)if(!beforeIds.has(n.id))n.senderId=actual.id;Flow.reconcile(d,module.exports);validateStructure(d);return result;}
 Daily.enforce(d,actual,a.type);u=Access.effective(u);
 const type=a.type;assert(typeof type==='string','ACTION_REQUIRED','الإجراء مطلوب');let p=a.projectId?project(d,a.projectId):null;if(p)checkP(u,p);
 const ownerBefore33=OwnerInsights.before(p,type);
 const b=a.payload||{};Daily.enforce(d,u,type);let result={};const notificationIds=new Set(d.ops.notifications.map(n=>n.id));
 const context={O,notify,user,checkPM,ensureNotFinal};
 const result34=Workflow34.action(d,actual,p,type,b,module.exports);
 const updateResult=result34.handled?result34:Updates.action(d,actual,p,type,b,module.exports);
 const collectionResult=updateResult.handled?updateResult:CollectionStatus.action(d,u,p,type,b,module.exports);
 const flowResult=collectionResult.handled?collectionResult:Flow.action(d,u,p,type,b,module.exports);
 const handoffResult=flowResult.handled?flowResult:Handoff.action(d,u,p,type,b,context);
 const dailyResult=handoffResult.handled?handoffResult:Daily.action(d,u,type,b,context);const flexResult=dailyResult.handled?dailyResult:F.action(d,u,p,type,b);
 const boardResult=flexResult.handled?flexResult:B.action(d,u,p,type,b,context);const controlled=boardResult.handled?boardResult:C.action(d,u,p,type,b,context);
 if(controlled.handled)result=controlled.result;else switch(type){
 case 'scope_weights_set':{
   assert(p,'PROJECT_REQUIRED','حدد المشروع');result=ScopeProgress.setWeights(d,u,p,b,module.exports);break;
 }
 case 'supplier_bill_correct':{
   assert(p,'PROJECT_REQUIRED','حدد المشروع');result=Integrity.correctBill(d,u,p,b,module.exports);break;
 }
 case 'scope_include':{
   assert(p,'PROJECT_REQUIRED','حدد المشروع');result=Scope.include(d,u,p,b,module.exports,notify);break;
 }
 case 'commercial_link':{
   assert(p,'PROJECT_REQUIRED','حدد المشروع');result=Commercial.link(d,u,p,b,module.exports);break;
 }
 case 'issue_order':{
   requireRole(u,'Owner','Accountant','Project Manager');const type=b.sourceType||(b.quoteId?'quote':'contract'),id=b.sourceId||(type==='quote'?b.quoteId:b.contractId);
   assert(['quote','contract'].includes(type),'INVALID_SOURCE','اختر عرض سعر أو عقدًا');
   const c=(type==='quote'?d.commercial.quotes:d.commercial.contracts).find(x=>x.id===id&&!C.removed(x));
   assert(c&&!c.documentArchived,'SOURCE_REQUIRED','مرجع التشغيل غير موجود أو مؤرشف');assert(!c.changeOrderDraft&&!c.parentContractId,'REVISION_IS_NOT_ORDER','هذه مراجعة؛ افتح المشروع/العقد الأصلي ولا تنشئ مشروعًا ثانيًا');
   assert(type==='quote'?c.status==='approved':['approved','active'].includes(c.status),'APPROVED_SOURCE_REQUIRED','اعتمد عرض السعر أو العقد أولًا');
   const linked=W.docProject(d,c,type);assert(!p||!linked||linked.id===p.id,'SOURCE_PROJECT_MISMATCH','المرجع مرتبط بمشروع آخر');p=p||linked;
   if(p){checkP(u,p);assert(!C.removed(p),'NOT_FOUND','المشروع في السلة',404)}
   if(u.role==='Project Manager'){assert(p&&isPM(u,p),'FORBIDDEN','اختر مشروعك الموجود أولًا',403);assert(c.projectId===p.id||c.sourceProjectId===p.id||c.createdBy===u.id,'FORBIDDEN','المستند غير متاح لهذا الحساب',403);}
   if(!p){const similar=d.data.filter(x=>!C.removed(x)&&!x.operationalClosed&&W.normalizedName(x.name)===W.normalizedName(c.projectName));assert(!similar.length||b.confirmNewProject===true,'EXISTING_PROJECT_CANDIDATE','يوجد مشروع بنفس الاسم: '+similar.map(x=>x.id).join('، ')+'؛ اختره أو أكد صراحة إنشاء مشروع مستقل',409)}
   if(p){if(F.isDraft(p)&&!p.customerId){p.customerId=c.customerId;p.client=c.client||d.masters.customers.find(x=>x.id===c.customerId)?.name||'';}assert(!c.customerId||p.customerId===c.customerId,'CUSTOMER_MISMATCH','عميل المرجع لا يطابق المشروع');const old=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued');if(old){result={existing:true,orderId:old.id,projectId:p.id};break}}
   const pm=user(d,b.pmId);assert(pm.role==='Project Manager','INVALID_PM','حدد مهندس المشروعات من قائمة مديري المشاريع');
   const externalOnly=b.externalOnly===true;const checker=externalOnly?null:user(d,b.checkerId);assert(externalOnly||checker.role==='Checker','INVALID_CHECKER','حدد المراجع للعمل الداخلي أو اختر تشغيلًا خارجيًا بالكامل.');
   assert(d.masters.customers.some(x=>x.id===c.customerId),'CUSTOMER_REQUIRED','المرجع يحتاج عميلًا صحيحًا');
   const scope=W.scopeOptions({type,doc:c});assert(scope.length,'SCOPE_REQUIRED','حدد نطاق العمل في المرجع المعتمد');const value=c.integrated1007?W.total(c,type):money(W.total(c,type));assert(value>0,'SOURCE_VALUE_REQUIRED','قيمة مرجع التشغيل غير مكتملة');
   const deadline=date(b.deadline,true);const brief=text(b.technicalBrief,6000)||scope.filter(x=>!x.parentId).map(x=>x.label).join('\n');
   if(!p){p={id:W.nextProjectId(d),identityToken:uid('PID'),name:text(c.projectName,250)||c.number,client:c.client,customerId:c.customerId,value,revisedContractValue:value,stage:0,invoice:0,paid:0,retention:0,docs:0,tasks:[],events:[],priority:'Normal',createdAt:now()};d.data.push(p)}
   assert(!p.operationalClosed&&!p.finalTechnicalApproved,'PROJECT_CLOSED','افتح المشروع الموجود ولا تصدر تكليفًا مكررًا لمشروع منتهٍ');
   c.projectId=p.id;p.commercialSourceType=type;
   if(type==='quote'){p.sourceQuoteId=c.id;p.sourceQuoteNumber=c.number;}
   else{p.sourceContractId=c.id;p.sourceContractNumber=c.number;if(c.quoteId){const q=d.commercial.quotes.find(x=>x.id===c.quoteId);assert(q&&!q.projectId||q&&q.projectId===p.id,'QUOTE_PROJECT_MISMATCH','العرض مرتبط بمشروع آخر');assert(!q.customerId||q.customerId===p.customerId,'QUOTE_CUSTOMER_MISMATCH','عميل العرض لا يطابق العقد');q.projectId=p.id;p.sourceQuoteId=q.id;p.sourceQuoteNumber=q.number;}}
   p.value=value;p.revisedContractValue=value;p.costCenterId=p.costCenterId||'CC-'+p.id;
   if(!d.projectCostCenters.some(x=>x.id===p.costCenterId))d.projectCostCenters.push({id:p.costCenterId,projectId:p.id,name:p.id+' — '+p.name,status:'active',createdAt:now(),createdBy:u.id});
   const o={id:uid('ORD'),projectId:p.id,sourceType:type,sourceId:c.id,sourceNumber:c.number,contractId:type==='contract'?c.id:'',quoteId:type==='quote'?c.id:c.quoteId||'',sourceSnapshot:{revision:c.revision||1,total:value,currency:c.currency||'EGP',scope:clone(scope)},issuedBy:u.id,issuedAt:now(),status:'issued',pmId:pm.id,pmAck:null,accountsAck:null,technicalBrief:brief,deadline};
   p.pm=pm.id;p.checker=checker?.id||'';p.executionMode=externalOnly?'external_only':'internal_or_mixed';p.opsTechnicalBrief=brief;p.deadline=deadline;p.projectDraft=false;p.operationalStatus='active';p.workflowState='awaiting_pm';d.ops.orders.push(o);
   const initialTask=externalOnly?null:Updates.assignInitial(d,u,p,o,b,module.exports);
   notify(d,[pm.id],'order_issued',p.id,'وصل أمر تشغيل جديد؛ مطلوب تأكيد الاستلام');notify(d,financeIds(d).filter(id=>id!==u.id),'order_issued',p.id,'وصل مرجع التعاقد المعتمد للتشغيل والمتابعة المالية',true);result={orderId:o.id,projectId:p.id,taskId:initialTask?.id||''};break;
 }
 case 'link_contract':{
   requireRole(u,'Owner','Accountant','Project Manager');assert(p,'PROJECT_REQUIRED','حدد المشروع');if(u.role==='Project Manager')assert(isPM(u,p),'FORBIDDEN','العقد لمشروع غير مسند إليك',403);const c=d.commercial.contracts.find(x=>x.id===b.contractId&&!C.removed(x)&&!x.documentArchived);
   assert(c&&!c.changeOrderDraft&&!c.parentContractId&&['approved','active'].includes(c.status),'APPROVED_SOURCE_REQUIRED','اختر عقدًا أصليًا معتمدًا');
   assert(c.customerId===p.customerId&&(!c.projectId||c.projectId===p.id),'CONTRACT_PROJECT_MISMATCH','العقد تابع لعميل أو مشروع مختلف');
   assert(c.quoteId&&c.quoteId===p.sourceQuoteId,'QUOTE_PROJECT_MISMATCH','يلزم نفس عرض السعر للمشروع الحالي');
   assert(!p.sourceContractId||p.sourceContractId===c.id,'SOURCE_ALREADY_LINKED','المشروع مرتبط بعقد آخر');
   assert(W.total(c,'contract')===num(p.revisedContractValue??p.value),'VALUE_CHANGE_REQUIRES_REVIEW','قيمة العقد تختلف؛ يلزم مراجعة تغيير النطاق/القيمة أولًا');
   c.projectId=p.id;p.sourceContractId=c.id;p.sourceContractNumber=c.number;
   // Keep the existing quote schedule and accounting authority; switching them could reset issued claims.
   result={projectId:p.id,contractId:c.id,governingSource:p.commercialSourceType};break;
 }

 case 'ack_order':{
   assert(p,'PROJECT_REQUIRED','المشروع مطلوب');assert(!p.operationalClosed,'PROJECT_ARCHIVED','المشروع مؤرشف؛ لا تبدأ تكليفًا جديدًا قبل إعادة الفتح');const o=d.ops.orders.find(o=>o.projectId===p.id&&o.status==='issued');assert(o,'ORDER_NOT_FOUND','أمر التشغيل غير موجود');
   if(isPM(u,p)&&b.department==='pm'){assert(!o.pmAck,'ALREADY_ACKNOWLEDGED','تم تأكيد الاستلام مسبقًا',409);o.pmAck={by:u.id,at:now()}}
   else{requireRole(u,'Accountant');assert(b.department==='accounts','INVALID_DEPARTMENT','جهة غير صحيحة');assert(!o.accountsAck,'ALREADY_ACKNOWLEDGED','تم تأكيد الاستلام مسبقًا',409);o.accountsAck={by:u.id,at:now()}}
   notify(d,d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id),'order_acknowledged',p.id,'تم تأكيد استلام التكليف بواسطة '+u.name);break;
 }
 case 'plan_task':{
   checkPM(d,u,p);ensureNotFinal(p);const e=user(d,b.assignee);assert(['Engineer','Project Engineer'].includes(e.role),'INVALID_ENGINEER','حدد المهندس المنفذ');const ch=user(d,b.checker||p.checker);assert(ch.role==='Checker','INVALID_CHECKER','حدد المراجع');
   let t=b.taskId?task(p,b.taskId):null;assert(!t||!t.isSummary&&!['confirmed','submitted'].includes(t.status),'TASK_LOCKED','لا تعدّل توزيع مهمة مرسلة أو معتمدة؛ أعد فتحها أولًا');
   if(!t){t={id:uid('TSK'),status:'todo',progress:0,approvedProgress:0,reviewCycles:[],submissions:[],assessments:[]};p.tasks.push(t)}
   const autoPlan=(b.startDate&&Number(b.plannedHours)>0||b.planningDriver)?P.resolve({...b,planningDriver:b.planningDriver||'hours'}):null; if(autoPlan)Object.assign(b,{startDate:autoPlan.startDate,due:autoPlan.due,plannedHours:autoPlan.plannedHours,startTime:autoPlan.startTime,dueTime:autoPlan.dueTime});
   const selected=W.scopeOptions(W.source(d,p)).find(x=>x.id===b.scopeItemId);assert(selected,'SCOPE_REQUIRED','اختر نوع العمل من نطاق التعاقد المعتمد');assert(!Supplier.overlap(d,p,selected.id),'SCOPE_EXTERNALLY_ASSIGNED','هذا البند مسند لمورد خارجي؛ راجع اتفاق المورد بدل تكرار تكليف داخلي.',409);assert(!C.leaf(p.tasks).some(x=>x.id!==t.id&&((x.scopeItemId===selected.id)||(selected.parentId&&x.scopeItemId===selected.parentId)||W.scopeOptions(W.source(d,p)).some(z=>z.id===x.scopeItemId&&z.parentId===selected.id))),'SCOPE_ALREADY_ASSIGNED','النطاق موزع بالفعل؛ افتح المهمة أو استخدم تفصيل الحزمة بدل مضاعفة وزنها');assert(!B.has(t)||t.scopeItemId===selected.id,'PART_SCOPE_LOCKED','نطاق لوحة الأجزاء مثبت؛ تغيير النطاق يحتاج إجراء مستقل');assert(!B.has(t)||!t.executionBoard.parts.some(r=>r.submissions.length)||t.assignee===e.id&&t.checker===ch.id,'PART_TEAM_LOCKED','لا تغير مسؤوليات أجزاء لها تقديمات؛ احتفظ بالفريق والتاريخ');const name=selected.label;t.scopeItemId=selected.id;t.scopeServiceCode=selected.serviceCode;t.assignmentNotes=text(b.assignmentNotes,4000);const start=date(b.startDate),due=date(b.due,true);assert(!start||start<=due,'DATE_ORDER','موعد التسليم يسبق البداية');
   if(b.taskId&&(t.assignee!==e.id||t.checker!==ch.id))(t.assignmentHistory??=[]).push({at:now(),by:u.id,previousAssignee:t.assignee,previousChecker:t.checker,nextAssignee:e.id,nextChecker:ch.id});
   Object.assign(t,{name,assignee:e.id,checker:ch.id,assignedBy:u.id,assignedAt:now(),startDate:start,due,weight:range(b.weight??1,0.01,10000,'الوزن'),plannedHours:range(b.plannedHours??0,0,100000,'الساعات'),priority:text(b.priority||'Normal',20),required:b.required!==false});
   if(autoPlan){const plan=autoPlan;(t.planningHistory??=[]).push({at:now(),by:u.id,previous:clone(t.planCalculation||null),next:clone(plan)});Object.assign(t,{startDate:plan.startDate,due:plan.due,plannedHours:plan.plannedHours,startTime:plan.startTime,dueTime:plan.dueTime,plannedEndDateTime:plan.endDateTime,planCalculation:plan});}
   if(!b.taskId&&B.templateFor(d,p,t)==='steel_detailing_65_35')B.initialize(d,u,p,t,{fresh:true});
   if(B.has(t)){assert(!t.executionBoard.parts.some(r=>r.assignmentHistory?.length)||t.executionBoard.parts.every(r=>r.assignee===e.id),'SUPPORT_TEAM_PRESERVED','استخدم توزيع الدعم لتغيير مسؤول الجزء؛ لا يُستبدل فريق الأجزاء بتعديل الحزمة',409);for(const part of t.executionBoard.parts){part.assignee=e.id;part.checker=ch.id;}}
   notify(d,[e.id],'task_assigned',p.id,'تم تكليفك: '+t.name);result={taskId:t.id};break;
 }
 case 'engineer_update':case 'engineer_submit':{
   ensureNotFinal(p);requireRole(u,'Engineer','Project Engineer');const t=task(p,b.taskId);assert(!t.isSummary,'SUMMARY_READ_ONLY','حدّث الأعمال التفصيلية لا الحزمة الإجمالية');assert(!B.has(t),'USE_PARTS_BOARD','حدّث نسب الأجزاء من لوحة الإنجاز التفصيلية');assert(t.assignee===u.id,'WRONG_ASSIGNEE','المهمة لمهندس آخر',403);assert(!['submitted','confirmed'].includes(t.status),'TASK_LOCKED','المهمة مرسلة للمراجعة أو معتمدة');
   t.progress=range(b.percent,0,100,'نسبة الإنجاز');t.completedNote=text(b.completedNote);t.remainingNote=text(b.remainingNote);t.eta=date(b.eta);t.progressNote=text(b.progressNote);t.status='in_progress';t.updatedAt=now();
   if(type==='engineer_submit'){const ch=user(d,t.checker||p.checker);assert(ch.role==='Checker','CHECKER_REQUIRED','يلزم تحديد المراجع');const s=addSubmission(t,u);notify(d,[ch.id],'review_required',p.id,'تحديث جاهز للمراجعة: '+t.name);result={submissionId:s.id}}
   notifyOps(d,p,type,'تحديث من المهندس: '+t.name);break;
 }
 case 'checker_assess':case 'checker_return':{
   ensureNotFinal(p);const t=task(p,b.taskId);reviewer(u,p,t);assert(!B.has(t),'USE_PARTS_REVIEW','راجع كل جزء من لوحة الأجزاء');assert(pending(t),'NOT_PENDING_REVIEW','لا يوجد تقديم جديد منتظر المراجعة',409);
   const s=latestReport(t);assert(b.submissionId===s.id,'STALE_SUBMISSION','تغير تقديم المهندس؛ حدث الصفحة أولًا',409);
   const percent=range(b.percent,0,100,'نسبة المراجع'),reason=text(b.reason);assert(type!=='checker_return'||reason,'RETURN_REASON_REQUIRED','سبب الإرجاع مطلوب');assert(percent===s.percent||reason,'ASSESSMENT_REASON_REQUIRED','اكتب سبب تعديل نسبة المهندس');
   assert(percent<=s.percent,'REVIEW_EXCEEDS_SUBMISSION','نسبة الاعتماد لا تتجاوز آخر نسبة قدمها المهندس؛ أعد العمل لتحديثه أولًا',409);
   const assessment={id:uid('REV'),submissionId:s.id,workRevision:s.revision,engineerPercent:s.percent,percent,reason,decision:type==='checker_return'?'returned':percent===100?'approved':'assessed',by:u.id,at:now()};(t.assessments??=[]).push(assessment);
   t.approvedProgress=percent;t.checkerReviewedProgress=percent;t.checkerRemainingActual=100-percent;t.checkerReviewedAt=assessment.at;t.checkerReviewedBy=u.id;t.reviewedSubmissionId=s.id;t.status=type==='checker_return'?'returned':percent===100?'confirmed':'reviewed';
   if(type==='checker_return'){t.lastReturnReason=reason;t.returnedAt=assessment.at;t.returnedBy=u.id}else if(percent===100){t.confirmedAt=assessment.at;t.confirmedBy=u.id}
   (t.reviewCycles??=[]).push({cycle:(t.reviewCycles?.length||0)+1,state:t.status,by:u.id,at:assessment.at,reason,reviewedProgress:percent,submissionId:s.id});
   notify(d,[t.assignee],'review_result',p.id,(type==='checker_return'?'أعيد العمل: ':'نتيجة المراجعة: ')+t.name+' — '+percent+'%'+(reason?' — '+reason:''));notifyOps(d,p,'review_result','تمت مراجعة '+t.name+' — '+percent+'%');result={assessmentId:assessment.id};break;
 }
 case 'checker_reopen':{
   assert(p&&!p.operationalClosed,'PROJECT_ARCHIVED','أعد فتح المشروع إداريًا أولًا');p.opsReopenedAt=now();reviewer(u,p,b.taskId?task(p,b.taskId):null);const reason=text(b.reason);assert(reason,'REASON_REQUIRED','سبب إعادة الفتح مطلوب');
   if(b.taskId){const t=task(p,b.taskId);assert(!B.has(t),'USE_PART_REOPEN','اختر الجزء المطلوب إعادة فتحه من لوحة الأجزاء');assert(!t.isSummary,'SUMMARY_READ_ONLY','أعد فتح العمل التفصيلي');(t.reopenHistory??=[]).push({at:now(),by:u.id,reason,progress:t.progress,approvedProgress:t.approvedProgress,status:t.status,workRevision:t.workRevision||0});t.progress=0;t.status='returned';t.lastReturnReason=reason;t.approvedProgress=0;t.workRevision=(t.workRevision||0)+1;notify(d,[t.assignee],'task_reopened',p.id,'أعيد فتح '+t.name+' — '+reason)}
   else{p.finalTechnicalApproved=false;p.accountsReady=false;p.engineeringGate='revision_open';p.engineeringStatus='revision_required';p.workflowState='engineering_active'}
   if(p.finalTechnicalApproved){p.finalTechnicalApproved=false;p.accountsReady=false;p.engineeringGate='revision_open';p.engineeringStatus='revision_required';p.workflowState='engineering_active'}
   notifyOps(d,p,'engineering_reopened','أعيد فتح المراجعة: '+reason);notify(d,financeIds(d),'engineering_reopened',p.id,'أعيد فتح الاعتماد الفني؛ المستندات المالية السابقة محفوظة',true);break;
 }
 case 'final_approve':{
   assert(p&&!p.operationalClosed,'PROJECT_ARCHIVED','المشروع مؤرشف');reviewer(u,p,null);assert(!p.finalTechnicalApproved,'ALREADY_APPROVED','الاعتماد النهائي مسجل بالفعل',409);Handoff.requireFinal(d,u,p);const ts=C.leaf(p.tasks).filter(t=>t.required!==false);assert(ts.length&&ts.every(complete),'PENDING_TASKS','يلزم اعتماد 100% لكل المهام المطلوبة');
   const coverage=W.scopeCoverage(d,p);assert(coverage.complete,'CONTRACT_SCOPE_NOT_ASSIGNED','أعمال متعاقد عليها لم توزع بعد: '+coverage.missing.join('؛ '));const at=now();p.finalTechnicalApproved=true;p.finalTechnicalApprovedAt=at;p.finalTechnicalApprovedBy=u.id;p.accountsReady=true;p.accountsHandoffAt=at;p.accountsEnteredAt=p.accountsEnteredAt||at;p.engineeringGate='checker_final_approved';p.engineeringStatus='completed';p.workflowState='accounts_active';if(num(p.stage)<4)p.stage=4;
   const manifest=ts.map(t=>({taskId:t.id,workRevision:t.workRevision||0,submissionId:t.reviewedSubmissionId||null,percent:num(t.approvedProgress)}));if(p.finalApprovalRecord&&!(p.technicalApprovalHistory||[]).some(x=>x.id===p.finalApprovalRecord.id))(p.technicalApprovalHistory??=[]).push(clone(p.finalApprovalRecord));p.finalApprovalRecord={id:uid('APP'),by:u.id,at,tasks:manifest,hash:hash(manifest),scope:{sourceId:W.source(d,p)?.doc.id||'',sourceType:W.source(d,p)?.type||'',hash:Scope.stamp(W.source(d,p)),itemIds:W.scopeOptions(W.source(d,p)).map(x=>x.id)}};Handoff.stampFinal(p,p.finalApprovalRecord);
   const recipients=[p.pm,p.projectEngineer,...ts.flatMap(t=>Handoff.owners(t)),...d.teamUsers.filter(x=>x.role==='Owner').map(x=>x.id)];
   notify(d,recipients,'final_approved',p.id,'اكتملت كافة الأعمال واعتمد التشيكر التسليم النهائي — '+p.name+'؛ مطلوب استلام مهندس المشروعات والتواصل مع العميل ثم توجيه الحسابات.');
result={finalApprovalId:p.finalApprovalRecord.id,projectId:p.id};break;
 }
 case 'task_request_update':{
   checkPM(d,u,p);ensureNotFinal(p);const t=task(p,b.taskId);assert(t.assignee,'ASSIGNEE_REQUIRED','حدد مهندس المهمة أولًا');
   const note=text(b.note);assert(note,'NOTE_REQUIRED','اكتب طلب التحديث');
   t.updateRequestNote=note;t.updateRequestedAt=now();t.updateRequestedBy=u.id;
   notify(d,[t.assignee],'task_update_requested',p.id,'طلب تحديث: '+t.name+' — '+note);break;
 }
 case 'finance_followup':{
   requireRole(u,'Owner','Accountant');p.followUp={...(p.followUp||{}),status:text(b.status,60),dueDate:date(b.dueDate),promiseDate:date(b.promiseDate),nextFollowUp:date(b.nextFollowUp),note:text(b.note),lastContact:date(b.lastContact),updatedAt:now(),updatedBy:u.id};if(b.promisedAmount!==undefined)p.followUp.promisedAmount=money(b.promisedAmount);notify(d,financeIds(d).filter(id=>id!==u.id),'finance_followup',p.id,'تحديث متابعة التحصيل',true);break;
 }
 case 'receipt_add':{
   requireRole(u,'Owner','Accountant');const amount=money(b.amount);assert(amount>0,'AMOUNT_REQUIRED','المبلغ أكبر من صفر');
   const customerId=p?p.customerId:b.customerId;
   assert(d.masters.customers.some(x=>x.id===customerId),'CUSTOMER_REQUIRED',p?'عميل المشروع غير مكتمل؛ راجع ربط المشروع. لم يُسجل أي قبض.':'حدد عميلًا صحيحًا للقبض العام');
   if(p)assert(!b.customerId||b.customerId===customerId,'CUSTOMER_MISMATCH','عميل سند القبض ثابت من المشروع؛ حدّث النموذج بعد مراجعة الربط',409);
   const receiptSource=p?W.source(d,p):null,receiptContract=receiptSource?.doc||null;
   if(p&&receiptContract){
    assert(!receiptContract.customerId||receiptContract.customerId===customerId,'RECEIPT_SOURCE_CUSTOMER_MISMATCH','عميل المرجع مختلف عن عميل المشروع؛ راجع الربط قبل تسجيل الدفعة',409);
    const linked=W.docProject(d,receiptContract,receiptSource.type);
    assert(!linked||linked.id===p.id,'RECEIPT_SOURCE_PROJECT_MISMATCH','المرجع مرتبط بمشروع آخر؛ راجع ربط المشروع',409);
   }
   if(b.sourceId)assert(receiptContract?.id===b.sourceId,'RECEIPT_SOURCE_CHANGED','تغير مرجع المشروع؛ افتح سند القبض من المشروع مجددًا',409);
   assert(!receiptContract?.currency||receiptContract.currency==='EGP','CURRENCY_NOT_SUPPORTED','شاشة القبض هذه بالجنيه المصري؛ لا يمكن تسجيل عملة أخرى أو افتراض سعر صرف');
   const dt=date(b.date,true),accountId=text(b.accountId||'BANK-MAIN-EGP',80);assert(['BANK-MAIN-EGP','CASH-MAIN-EGP'].includes(accountId),'ACCOUNT_INVALID','اختر البنك أو الصندوق');const method=text(b.method||(accountId.startsWith('BANK')?'bank_transfer':'cash'),40);assert(['bank_transfer','cash','instapay','wallet','cheque','other'].includes(method),'METHOD_INVALID','طريقة القبض غير صالحة');
   const id=uid('RCPT'),reference=text(b.reference,160)||('AUTO-'+id.split('-').pop().slice(0,8).toUpperCase());assert(!d.customerReceipts.some(r=>r.status==='posted'&&String(r.reference||'').toLowerCase()===reference.toLowerCase()),'DUPLICATE_RECEIPT','مرجع القبض مستخدم مسبقًا',409);
   // An unassigned receipt is an advance until finance applies it to an issued milestone.
   // Never credit AR without recording which claim received the money.
   const ar=0,advance=amount,costCenterId=p?(p.costCenterId||'CC-'+p.id):'';const r={id,projectId:p?.id||'',customerId,costCenterId,contractId:p?.sourceContractId||'',quoteId:p?.sourceQuoteId||'',amount,date:dt,accountId,method,reference,note:text(b.note),status:'posted',arApplied:ar,advanceApplied:advance,unallocated:!p,createdBy:u.id,createdAt:now()};
   if(b.attachmentData){assert(/^data:(image\/(png|jpeg)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(b.attachmentData)&&b.attachmentData.length<4e6,'INVALID_ATTACHMENT','مرفق غير صالح أو أكبر من 3 MB');r.attachmentData=b.attachmentData;r.attachmentName=text(b.attachmentName,160)}
   d.customerReceipts.unshift(r);if(p){p.paid=money(num(p.paid)+amount);if(p.financialClosed){p.financialClosed=false;p.financialReopenedAt=now();p.financialReopenedBy=u.id;p.financialReopenReason='receipt_after_close';notify(d,financeIds(d),'financial_reopened',p.id,'وصل قبض بعد الإقفال المالي؛ أعيدت الحالة المالية للمراجعة تلقائيًا',true)}}
   const lines=[{account:accountId,debit:amount,credit:0,projectId:p?.id||'',costCenterId}];if(ar)lines.push({account:'1100-ACCOUNTS-RECEIVABLE',debit:0,credit:ar,projectId:p.id,costCenterId});if(advance)lines.push({account:'2100-CUSTOMER-ADVANCES',debit:0,credit:advance,projectId:p?.id||'',costCenterId});
   d.journalEntries.unshift({id:uid('JE'),date:dt,sourceType:'customer_receipt',sourceId:r.id,projectId:p?.id||'',costCenterId,status:'posted',createdAt:now(),createdBy:u.id,lines});
   if(p&&!d.projectCostCenters.some(c=>c.projectId===p.id))d.projectCostCenters.push({id:costCenterId,projectId:p.id,name:p.id+' — '+p.name,status:'active',createdAt:now(),createdBy:u.id});
   if(b.claimId){Updates.allocateClaimReceipt(d,u,p,r,b,module.exports);}
   notify(d,financeIds(d).filter(id=>id!==u.id),'receipt_added',p?.id||'','تم تسجيل قبض '+amount.toLocaleString('en-US')+' EGP — مرجع '+reference,true);result={receiptId:r.id,reference,unallocated:!p};break;
 }
 case 'receipt_allocate':{
   requireRole(u,'Owner','Accountant');assert(p,'PROJECT_REQUIRED','حدد المشروع');
   const r=d.customerReceipts.find(x=>x.id===b.receiptId&&x.projectId===p.id&&x.customerId===p.customerId&&x.status==='posted');assert(r,'RECEIPT_NOT_FOUND','سند قبض منشور لنفس المشروع والعميل مطلوب');
   const src=W.source(d,p),s=W.schedule(src).find(x=>x.id===b.milestoneId);assert(s&&num(s.claimed)>0,'CLAIM_NOT_FOUND','حدد دفعة صدرت لها مطالبة من المرجع الحالي');
   const claims=d.ops.claims.filter(x=>x.projectId===p.id&&x.sourceId===src.doc.id&&x.milestoneId===s.id);assert(claims.length,'CLAIM_NOT_FOUND','لا توجد مطالبة صادرة لهذه الدفعة');
   const amount=money(b.amount),applied=(r.allocations||[]).reduce((sum,x)=>sum+num(x.amount),0),remaining=num(r.amount)-applied,claimRemaining=num(s.claimed)-num(s.paid);
   // Earlier releases may store milestone.paid without a receipt-level allocation.
   // That cash is already applied to the project and must never be used again.
   const projectAvailable=Math.max(0,d.customerReceipts.filter(x=>x.projectId===p.id&&x.status==='posted').reduce((sum,x)=>sum+num(x.amount),0)-W.schedule(src).reduce((sum,x)=>sum+num(x.paid),0));
   assert(amount>0&&amount<=remaining&&amount<=claimRemaining&&amount<=projectAvailable,'ALLOCATION_EXCEEDS_BALANCE','المبلغ يتجاوز الرصيد غير الموزع أو المطالبة');
   const fromAr=Math.min(amount,Math.max(0,num(r.arApplied)-(r.allocations||[]).reduce((sum,x)=>sum+num(x.fromAr),0))),fromAdvance=amount-fromAr;
   const entry={id:uid('ALLOC'),receiptId:r.id,claimId:claims.at(-1).id,milestoneId:s.id,sourceId:src.doc.id,amount,fromAr,fromAdvance,at:now(),by:u.id};(r.allocations??=[]).push(entry);s.paid=money(num(s.paid)+amount);
   if(fromAdvance)d.journalEntries.unshift({id:uid('JE'),date:date(b.date)||new Date().toISOString().slice(0,10),sourceType:'receipt_allocation',sourceId:entry.id,projectId:p.id,costCenterId:r.costCenterId||p.costCenterId,status:'posted',createdAt:now(),createdBy:u.id,lines:[{account:'2100-CUSTOMER-ADVANCES',debit:fromAdvance,credit:0,projectId:p.id,costCenterId:r.costCenterId||p.costCenterId},{account:'1100-ACCOUNTS-RECEIVABLE',debit:0,credit:fromAdvance,projectId:p.id,costCenterId:r.costCenterId||p.costCenterId}]});
   s.status=num(s.paid)>=num(s.claimed)?'paid':'partial';notify(d,financeIds(d).filter(id=>id!==u.id),'receipt_allocated',p.id,'تم تخصيص '+amount.toLocaleString('en-US')+' EGP من سند '+r.reference+' على المطالبة '+entry.claimId,true);result={allocationId:entry.id,receiptId:r.id,claimId:entry.claimId,remainingReceipt:num(r.amount)-applied-amount};break;
 }
 case 'project_operational_close':{
   requireRole(u,'Owner');assert(p,'PROJECT_REQUIRED','المشروع مطلوب');const reason=text(b.reason,1000);assert(reason,'REASON_REQUIRED','سبب إنهاء المشروع مطلوب');assert(!p.operationalClosed,'PROJECT_ALREADY_CLOSED','المشروع منتهي/مؤرشف بالفعل',409);p.operationalClosed=true;p.operationalClosedAt=now();p.operationalClosedBy=u.id;p.operationalCloseReason=reason;p.operationalCloseType=text(b.closeType||'completed',40);p.operationalStatus='archived';notify(d,[p.pm,p.projectEngineer,p.checker].filter(Boolean),'project_closed',p.id,'تم إنهاء وأرشفة المشروع إداريًا — '+reason);notify(d,financeIds(d),'project_closed',p.id,'تم إنهاء المشروع إداريًا مع بقاء الحقوق المالية قابلة للمتابعة',true);result={projectId:p.id,operationalClosed:true};break;
 }
 case 'project_operational_reopen':{
   requireRole(u,'Owner');assert(p,'PROJECT_REQUIRED','المشروع مطلوب');const reason=text(b.reason,1000);assert(reason,'REASON_REQUIRED','سبب إعادة الفتح مطلوب');assert(p.operationalClosed,'PROJECT_NOT_CLOSED','المشروع غير مؤرشف');p.operationalClosed=false;p.operationalReopenedAt=now();p.operationalReopenedBy=u.id;p.operationalReopenReason=reason;p.operationalStatus='active';notify(d,[p.pm,p.projectEngineer,p.checker].filter(Boolean),'project_reopened',p.id,'أعيد فتح المشروع إداريًا — '+reason);result={projectId:p.id,operationalClosed:false};break;
 }
 case 'project_financial_close':{
   requireRole(u,'Owner','Accountant');assert(p,'PROJECT_REQUIRED','حدد المشروع');const reason=text(b.reason,1000);assert(reason,'REASON_REQUIRED','اكتب ملاحظة الإقفال');
   const f=W.financeSummary(d,p);assert(f.canFinancialClose,'OPEN_FINANCIAL_ITEMS','لا يمكن إعلان الحسابات مسوّاة: '+f.closeBlockers.join('؛ '),409);
   p.financialClosed=true;p.financialClosedAt=now();p.financialClosedBy=u.id;p.financialCloseReason=reason;p.financialCloseSnapshot={invoiced:f.invoiced,paid:f.paid,outstanding:f.outstanding,advance:f.advance,retention:f.retention,vendorOutstanding:f.vendorOutstanding,unbilled:f.unbilled};
   notify(d,financeIds(d),'financial_closed',p.id,'تم الإقفال المالي بعد فحص الأرصدة؛ أي قبض لاحق يبقى مسموحًا',true);result={projectId:p.id,financialClosed:true};break;
 }
 case 'project_financial_reopen':{
   requireRole(u,'Owner','Accountant');assert(p,'PROJECT_REQUIRED','حدد المشروع');assert(p.financialClosed,'NOT_FINANCIALLY_CLOSED','لا يوجد إقفال مسجل');const reason=text(b.reason,1000);assert(reason,'REASON_REQUIRED','اذكر سبب المراجعة');
   (p.financialCloseHistory??=[]).push({closedAt:p.financialClosedAt,closedBy:p.financialClosedBy,reason:p.financialCloseReason,snapshot:clone(p.financialCloseSnapshot||{})});
   p.financialClosed=false;p.financialReopenedAt=now();p.financialReopenedBy=u.id;p.financialReopenReason=reason;notify(d,financeIds(d),'financial_reopened',p.id,'أعيد فتح المتابعة المالية دون تغيير الأرصدة',true);result={projectId:p.id};break;
 }
 case 'claim_issue':{
   requireRole(u,'Owner','Accountant');assert(p,'PROJECT_REQUIRED','حدد المشروع');const src=W.source(d,p);assert(src&&(src.type==='quote'?src.doc.status==='approved':['active','approved'].includes(src.doc.status)),'APPROVED_SOURCE_REQUIRED','يلزم عرض سعر أو عقد معتمد');
   assert(!src.doc.currency||src.doc.currency==='EGP','CURRENCY_NOT_SUPPORTED','مطالبات هذا المسار بالجنيه المصري');
   const rows=W.schedule(src),s=rows.find(x=>x.id===b.milestoneId);assert(s,'MILESTONE_REQUIRED','اختر دفعة من المرجع المعتمد');
   const perc=rows.reduce((a,x)=>a+num(x.percent),0);assert(Math.abs(perc-100)<.001&&rows.every(x=>num(x.percent)>0),'SCHEDULE_INVALID','جدول الدفعات يجب أن يجمع 100%');
   const direction=(p.financeDirections||[]).find(x=>x.sourceId===src.doc.id&&x.milestoneId===s.id&&!x.claimId);assert(actual.role!=='Accountant'||direction,'DIRECTION_REQUIRED','يلزم توجيه مالي من المالك أو مهندس المشروعات لهذه الدفعة',409);
   const advance=s.startRequired===true||/advance|contract award|توقيع|مقدمة/i.test([s.label,s.trigger].join(' '));assert(advance||p.finalTechnicalApproved||legacyAccounts(p),'TECHNICAL_APPROVAL_REQUIRED','مطالبة التسليم تتطلب اعتمادًا فنيًا نهائيًا');
   const total=W.total(src.doc,src.type);assert(total>0,'SOURCE_VALUE_MISSING','قيمة المرجع غير مكتملة');const amount=W.milestoneAmounts(src).find(x=>x.id===s.id).amount,due=money(Math.max(0,amount-num(s.claimed)));assert(due>0,'ALREADY_CLAIMED','هذه الدفعة مطالب بها بالفعل');
   const cl={id:uid('CLM'),projectId:p.id,sourceType:src.type,sourceId:src.doc.id,contractId:src.type==='contract'?src.doc.id:'',quoteId:src.type==='quote'?src.doc.id:src.doc.quoteId||'',milestoneId:s.id,amount:due,date:date(b.date,true),dueDate:date(b.dueDate),by:u.id};
   if(cl.dueDate)s.dueDate=cl.dueDate;
   if(direction){direction.claimId=cl.id;cl.directionId=direction.id;}
   d.ops.claims.push(cl);s.claimed=num(s.claimed)+due;s.claimId=cl.id;s.claimedBy=u.id;s.claimedAt=now();s.status='issued';p.invoice=money(num(p.invoice)+due);
   if(p.financialClosed){p.financialClosed=false;p.financialReopenedAt=now();p.financialReopenedBy=u.id;p.financialReopenReason='new_claim'}
   if(p.finalTechnicalApproved&&!p.operationalClosed)p.stage=5;
   notify(d,financeIds(d).filter(x=>x!==u.id),'claim_issued',p.id,'تم إصدار مطالبة '+due.toLocaleString('en-US')+' EGP',true);result={claimId:cl.id};break;
 }

 case 'contract_repair_empty':{
   requireRole(u,'Owner');const c=d.commercial.contracts.find(x=>x.id===b.contractId);assert(c&&!(c.lines||[]).length,'REPAIR_NOT_APPLICABLE','هذا الإصلاح للعقد ذي البنود المفقودة فقط');const q=d.commercial.quotes.find(x=>x.id===c.quoteId);assert(q&&q.customerId===c.customerId&&(q.lines||[]).some(l=>l.included!==false),'QUOTE_REQUIRED','لا يوجد عرض مصدر مطابق');
   c.repairHistory=(c.repairHistory||[]).concat([{at:now(),by:u.id,reason:'Owner explicitly restored missing priced lines from matching source quotation',beforeLines:clone(c.lines||[]),quoteId:q.id}]);c.lines=clone(q.lines.filter(l=>l.included!==false));if(c.projectId){const pp=project(d,c.projectId);pp.value=contractTotal(c);pp.revisedContractValue=pp.value}result={contractId:c.id,total:contractTotal(c)};break;
 }
 case 'notification_read':{
   const n=d.ops.notifications.find(x=>x.id===b.id&&x.userId===u.id);assert(n,'NOT_FOUND','الإشعار غير موجود',404);if(!n.readAt)n.readAt=now();break;
 }
 default:throw new AppError('UNKNOWN_ACTION','إجراء غير معروف');
 }
 OwnerInsights.capture(p||d.data.find(x=>x.id===result.projectId),type,ownerBefore33,now());
 Handoff.invalidateAfter(d,u,p,type,b);
 for(const nt of d.ops.notifications){if(notificationIds.has(nt.id))continue;
   nt.senderId=u.id;nt.taskId=nt.taskId||b.taskId||(nt.type==='order_issued'?'':result.taskId)||'';
   nt.targetRoute=nt.followupId?'flowFollowups':(type.startsWith('daily_')||type.startsWith('timesheet_'))?'timesheets':type==='ack_order'||type==='issue_order'&&nt.type==='order_issued'?'orders':nt.taskId?(d.teamUsers.find(x=>x.id===nt.userId)?.role==='Checker'?'review':'tasks'):nt.financial?'collections':'projects';
   if(['engineer_handoff','final_approved','accounts_handover','finance_handoff_received'].includes(nt.type)){const recipient=d.teamUsers.find(x=>x.id===nt.userId);nt.targetRoute=nt.type==='final_approved'&&['Owner','Project Manager'].includes(recipient?.role)?'projects':recipient?.role==='Checker'?'review':FINANCE.has(recipient?.role)&&nt.type!=='engineer_handoff'?'collections':nt.taskId&&engineerRole3910(recipient)?'tasks':'projects';nt.targetStage='final_delivery';}
   if(result.timesheetId)nt.timesheetId=result.timesheetId; if(result.dayId)nt.dayId=result.dayId;
   if(type.startsWith('daily_')||type.startsWith('timesheet_')){const recipient=d.teamUsers.find(x=>x.id===nt.userId),decisionRequest=['timesheet_submitted','timesheet_resubmitted','daily_exception_requested','daily_correction_requested'].includes(nt.type)||type==='timesheet_correction_request';if(decisionRequest){nt.targetRoute=recipient?.role==='Checker'?'review':'timeReports';if(recipient?.role==='Checker')nt.targetTab='time';}nt.workDate=b.date||d.timesheets.find(t=>t.id===(nt.timesheetId||b.timesheetId))?.date||d.dailyTime?.days.find(x=>x.id===(nt.dayId||b.dayId))?.date||'';}
 }
 if(!type.startsWith('flow_followup_')&&!['finance_handoff_ack','finance_direction','claim_mark_sent'].includes(type))event(d,u,type,p?.id||result.projectId||'',{...(type.startsWith('daily_')?{dayId:result.dayId||b.dayId||'',date:b.date||'',decision:b.decision||'',userId:b.userId||u.id}:{}),taskId:b.taskId||result.taskId||'',timesheetId:result.timesheetId||b.timesheetId||'',recordId:result.recordId||'',operation:result.operation||'',...(type==='time_activity_add'?{activityId:result.activityId,label:text(b.label,150)}:{}),...(type==='task_breakdown'?{childTaskIds:result.childTaskIds}:{}),...(type==='finance_followup'?{status:p.followUp.status}:{}),...(type==='receipt_add'?{receiptId:result.receiptId}:{}),...(type.startsWith('project_')?{reason:text(b.reason),closeType:text(b.closeType)}:{}),...(type==='checker_return'||type==='checker_assess'?{percent:Number(b.percent),reason:text(b.reason)}:{})});return result;
}
function issues(d){const out=[];const add=(id,severity,record,message)=>out.push({id,severity,record,message,status:'OPEN'});const pids=new Set(d.data.map(p=>p.id)),cids=new Set(d.masters.customers.map(c=>c.id));
 for(const r of d.customerReceipts){if(r.projectId&&!pids.has(r.projectId))add('DATA-RECEIPT-PROJECT','Critical',r.id,'سند قبض مرتبط بمشروع غير موجود');if(!r.projectId&&!r.unallocated)add('DATA-RECEIPT-PROJECT','Medium',r.id,'سند قبض بلا مشروع ويحتاج توزيعًا');if(!cids.has(r.customerId))add('DATA-RECEIPT-CUSTOMER','Critical',r.id,'سند قبض مرتبط بعميل غير موجود');if(r.needsReconciliation)add('DATA-RECONCILIATION','Medium',r.id,'السجل محفوظ ويحتاج مطابقة مستنداته؛ ليس إصلاحًا مكتملًا')}
 for(const v of d.masters.vendorBills){if(v.projectId&&!pids.has(v.projectId))add('DATA-VENDOR-PROJECT','Critical',v.id,'فاتورة مورد مرتبطة بمشروع مفقود')}
 for(const c of d.commercial.contracts){if(c.status==='active'&&!(c.lines||[]).length)add('CONTRACT-EMPTY-LINES','High',c.id,'عقد فعال دون بنود مسعرة؛ يتطلب مراجعة المالك قبل المطالبة');if(c.status==='active'&&contractTotal(c)<=0)add('CONTRACT-NO-VALUE','High',c.id,'قيمة العقد الفعال غير مثبتة')}
 for(const p of d.data){if(p.finalTechnicalApproved&&!p.tasks.filter(t=>t.required!==false).every(complete))add('CHK-FINAL-PENDING','Critical',p.id,'اعتماد نهائي مع أعمال غير معتمدة');if(p.recoveredAt)add('PROJECT-RECOVERED','Medium',p.id,'مرجع مشروع مستعاد؛ بياناته التجارية تحتاج مستند المصدر');for(const t of p.tasks){if(t.status==='submitted'&&!latestReport(t))add('CHK-LEGACY-SUBMISSION','Medium',t.id,'تقديم قديم يحتاج إعادة إرسال موثقة من المهندس');if(t.status==='confirmed'&&t.checkerReviewedProgress!=null&&Number(t.checkerReviewedProgress)!==Number(t.approvedProgress))add('CHK-OLD-ASSESSMENT','Medium',t.id,'تقييم تاريخي لا يساوي آخر نسبة معتمدة؛ محفوظ دون تعديل تلقائي')}}
 for(const j of d.journalEntries){const diff=(j.lines||[]).reduce((s,l)=>s+num(l.debit)-num(l.credit),0);if(Math.abs(diff)>0.00001)add('FIN-UNBALANCED','Critical',j.id,'قيد غير متوازن')}
 for(const kind of ['quotes','contracts']){const groups=new Map();for(const c of d.commercial[kind]){const ids=groups.get(c.number)||[];ids.push(c.id);groups.set(c.number,ids)}for(const [number,ids] of groups)if(ids.length>1)add('COM-DUPLICATE-NUMBER','High',number,'أرقام مستندات تاريخية مكررة، لم تُحذف أو تُعدّل: '+ids.join(', '))}
 for(const p of d.data){const f=W.financeSummary(d,p);if(f.closureNeedsReview)add('FIN-CLOSED-WITH-BALANCE','Critical',p.id,'إقفال سابق غير مسوّى: '+f.closeBlockers.join('؛ '));if(d.projectImages[p.id]&&!W.imageEligible(d,p))add('IMAGE-IDENTITY-MISMATCH','High',p.id,'الصورة لا تطابق هوية المشروع؛ لا تعرض حتى إعادة اختيارها');if(f.bookedReceipts!==num(p.paid))add('FIN-RECEIPTS-TOTAL','High',p.id,'إجمالي المقبوض لا يطابق مجموع السندات المثبتة')}
 for(const p of d.data){const f=V.view(d,p);if(f.claimsRemainingBySchedule>0&&f.unallocatedReceiptAmount>0)add('FIN-RECEIPT-NOT-APPLIED','High',p.id,'قبض غير مخصص مع مطالبة مفتوحة: '+f.unallocatedReceiptAmount+' EGP');for(const a of f.supplierAwards||[])if(a.overbilled>0)add('FIN-AWARD-OVERBILLED','High',a.id,'فاتورة مورد تتجاوز قيمة الإسناد: '+a.overbilled+' EGP');}
 for(const t of d.timesheets){if(t.status==='approved'&&!t.costSnapshot)add('COST-RATE-UNVERIFIED','Medium',t.id,'ساعات معتمدة دون سعر تاريخي مثبت؛ ليست تكلفة صفرية');}
 return out;
}
function legacyState(d){d=clone(d);d.data=C.live(d.data);d.commercial.quotes=C.live(d.commercial.quotes);d.commercial.contracts=C.live(d.commercial.contracts);const s={};for(const [k,name] of Object.entries(LEGACY_KEYS))s[k]=JSON.stringify(name==='projectImages'?Object.fromEntries(d.data.filter(p=>W.imageEligible(d,p)).map(p=>[p.id,d.projectImages[p.id]])):d[name]);s.ronixLegacyArchiveV1=JSON.stringify(d.legacyArchive||{});return s}
function financeBatch(d,u,b,commercialOnly=false){
 u=Access.effective(u);
 if(commercialOnly)requireRole(u,'Owner','Accountant','Project Manager');else requireRole(u,'Owner','Accountant');assert(b.state&&typeof b.state==='object','STATE_REQUIRED','البيانات مطلوبة');let updates={};
 for(const [k,v] of Object.entries(b.state)){assert(LEGACY_KEYS[k],'INVALID_DATASET','مجموعة بيانات غير مسموحة');try{updates[LEGACY_KEYS[k]]=typeof v==='string'?JSON.parse(v):v}catch(_){throw new AppError('INVALID_JSON','بيانات غير صالحة')}}
 Supplier.guardBatch(d,updates,module.exports);Integrity.validate(d,updates,module.exports);
 assert(!updates.teamUsers||hash(updates.teamUsers)===hash(d.teamUsers),'USE_TEAM_ADMIN','تعديل الفريق عبر إدارة الحسابات فقط');
 for(const kind of ['quotes','contracts'])if(updates.commercial?.[kind]){
   for(const v of updates.commercial[kind])if(!d.commercial[kind].some(x=>x.id===v.id))assert(!v.removedAt&&!v.documentArchived&&!v.cancelledAt,'USE_RECORD_MANAGER','إنشاء مستند بإجراءات إزالة أو أرشفة غير مسموح');
   for(const old of d.commercial[kind]){const v=updates.commercial[kind].find(x=>x.id===old.id);if(C.removed(old)){if(v)assert(hash(v)===hash(old),'REMOVED_RECORD_LOCKED','المستند في السلة؛ استرجعه قبل التعديل');else updates.commercial[kind].push(clone(old));}
   else if(v){assert(hash(v.scopeAmendments||[])===hash(old.scopeAmendments||[]),'SCOPE_HISTORY_IMMUTABLE','سجل تصحيحات النطاق محفوظ ولا يعدل من محرر المستند',409);const pp=W.docProject(d,old,kind==='quotes'?'quote':'contract');if(old.documentArchived||pp?.operationalClosed){for(const key of ['number','projectId','customerId','client','status','lines','quoteId','scope','terms','exclusions','changeOrders'])assert(hash(v[key]??null)===hash(old[key]??null),'ARCHIVED_DOCUMENT_READ_ONLY','المستند مؤرشف؛ أظهره من الأرشيف أو أعد فتح المشروع قبل تعديل شروطه',409);}if(old.status==='cancelled')assert(v.status==='cancelled','CANCELLED_DOCUMENT_LOCKED','المستند ملغي؛ لا تعيد تفعيله عبر الحفظ الجماعي');for(const key of ['documentArchived','documentArchiveReason','documentArchivedAt','documentArchivedBy','disposalHistory','cancelledAt','cancelledBy','cancelReason'])if(old[key]!==undefined)v[key]=clone(old[key]);assert(!v.removedAt,'USE_RECORD_MANAGER','الإزالة من إدارة السجلات فقط');}}
 }
 // The legacy finance workbench cannot mutate task approvals, hours or technical workflow.
 if(updates.data){assert(Array.isArray(updates.data),'BAD_PROJECTS','بيانات مشاريع غير صالحة');for(const np of updates.data){const old=d.data.find(p=>p.id===np.id);if(!old)throw new AppError('USE_WORK_ORDER','أنشئ المشروع من أمر التشغيل في لوحة الإدارة');for(const k of PROJECT_FIN_FIELDS){if(np[k]!==undefined){if(['paid','invoice'].includes(k)&&hash(np[k])!==hash(old[k]))throw new AppError('USE_LEDGER_ACTION','إجمالي القبض والمطالبات يُحسب من السندات والإصدار؛ لا يُعدل يدويًا',409);if(['quote','quotation'].includes(old.commercialSourceType)&&['commercialSourceType','sourceQuoteId','sourceQuoteNumber','sourceContractId','sourceContractNumber','value','revisedContractValue'].includes(k)&&hash(np[k])!==hash(old[k]))continue;old[k]=clone(np[k])}}}}
 if(updates.timesheets)assert(hash(updates.timesheets)===hash(d.timesheets),'USE_TIMESHEETS','تعديل الساعات عبر شاشة التشغيل فقط');
 // Posted accounting evidence is immutable in the legacy bulk editor. Corrections
 // require a dedicated audited action; replacing a row would erase its history.
 for(const k of ['customerReceipts','vendorPayments','journalEntries'])if(updates[k])for(const old of d[k]){
   const current=updates[k].find(x=>x.id===old.id);
   assert(current&&hash(current)===hash(old),'POSTED_LEDGER_IMMUTABLE','السندات والدفعات والقيود المسجلة لا تعدل بالحفظ الجماعي؛ استخدم إجراء تسوية موثق',409);
 }
 const newPayments=(updates.vendorPayments||[]).filter(x=>!d.vendorPayments.some(old=>old.id===x.id));
 const bills=updates.masters?.vendorBills||d.masters.vendorBills;
 for(const payment of newPayments){const bill=bills.find(x=>x.id===payment.billId);
   assert(bill&&bill.vendorId===payment.vendorId&&bill.projectId===payment.projectId&&num(payment.amount)>0&&Number.isSafeInteger(Number(payment.amount))&&payment.status==='posted','INVALID_VENDOR_PAYMENT_LINK','دفعة المورد تتطلب فاتورة وموردًا ومشروعًا متطابقين ومبلغًا صحيحًا',409);
 }
 if(updates.masters)for(const bill of bills){const previous=d.masters.vendorBills.find(x=>x.id===bill.id),difference=num(bill.paid)-num(previous?.paid);
   const paidNow=newPayments.filter(x=>x.billId===bill.id).reduce((sum,x)=>sum+num(x.amount),0);
   assert(difference===paidNow&&difference>=0&&num(bill.paid)<=num(bill.amount),'VENDOR_PAYMENT_MISMATCH','مدفوع فاتورة المورد لا يطابق سند دفعة جديدة؛ سجل الدفعة من شاشة دفعات الموردين',409);
 }
 for(const payment of newPayments)assert(updates.masters?.vendorBills?.some(x=>x.id===payment.billId),'VENDOR_PAYMENT_MISMATCH','دفعة المورد تتطلب تحديث رصيد الفاتورة في نفس العملية',409);
 if(updates.commercial){if(u.role==='Accountant'&&!commercialOnly){
   for(const [kind,rows] of Object.entries(updates.commercial)){for(const c of rows){const old=d.commercial[kind]?.find(x=>x.id===c.id);assert(old,'OWNER_CONTRACT_ONLY','إنشاء العقد واعتماده للمالك فقط',403);if(kind==='contracts'){const a={...c},b={...old};delete a.schedule;delete b.schedule;assert(hash(a)===hash(b),'OWNER_CONTRACT_ONLY','تعديل شروط العقد واعتماده للمالك فقط',403);const terms=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['claimed','paid','claimId','claimedAt','claimedBy','status'].includes(k))));assert(hash(terms(c.schedule||[]))===hash(terms(old.schedule||[])),'OWNER_CONTRACT_ONLY','تعديل نسب وشروط الدفعات للمالك فقط',403)}else assert(hash(c)===hash(old),'OWNER_QUOTE_ONLY','تعديل العروض للمالك فقط',403)}}
 }
 if(updates.commercial)for(const kind of ['quotes','contracts'])for(const old of d.commercial[kind]){
   const current=updates.commercial[kind]?.find(x=>x.id===old.id);if(!current)continue;
   const oldRows=kind==='quotes'?old.paymentSchedule:old.schedule,newRows=kind==='quotes'?current.paymentSchedule:current.schedule;
   for(const previous of oldRows||[]){const next=(newRows||[]).find(x=>x.id===previous.id);if(!next)continue;
     for(const field of ['claimed','paid','claimId','claimedBy','claimedAt'])assert(hash(next[field]??null)===hash(previous[field]??null),'CLAIM_LEDGER_IMMUTABLE','حالة المطالبة والتخصيص لا تعدل من محرر المرجع التجاري',409);
   }
 }
 // Only changed records go through the transactional batch; existing old defects remain reported.
 for(const kind of ['quotes','contracts'])for(const doc of updates.commercial[kind]||[]){const before=d.commercial[kind].find(x=>x.id===doc.id);if(!before||hash(before.lines)!==hash(doc.lines)||before.status!==doc.status){for(const l of doc.lines||[]){if(l.included===false)continue;const q=Number(l.qty),price=Number(l.unitPrice??l.rate??0),discount=Number(l.discount||0);assert(Number.isFinite(q)&&q>=0&&Number.isFinite(price)&&price>=0&&Number.isFinite(discount)&&discount>=0&&discount<=100,'INVALID_PRICING','راجع كمية وسعر وخصم البند؛ لا تقبل قيم سالبة أو غير رقمية');if(['approved','active'].includes(doc.status))assert(q>0,'INVALID_QUANTITY','كمية البند المعتمد يجب أن تكون أكبر من صفر')}}if(!before||before.number!==doc.number)assert(!(updates.commercial[kind]||[]).some(x=>x.id!==doc.id&&x.number===doc.number),'DUPLICATE_DOCUMENT_NUMBER','رقم المستند مستخدم؛ استخدم رقم مراجعة مستقل');}
 for(const c of updates.commercial.contracts||[]){const old=d.commercial.contracts.find(x=>x.id===c.id);if((!old||old.status!=='active')&&c.status==='active'){assert(!c.changeOrderDraft,'CHANGE_ORDER_NOT_CONTRACT','مسودة تعديل العقد لا تفعّل كعقد جديد مستقل');assert(contractTotal(c)>0,'CONTRACT_VALUE_MISSING','لا تفعيل لعقد دون بنود مسعرة');}
 if(old){for(const s of c.schedule||[]){const was=old.schedule?.find(x=>x.id===s.id);if(num(s.claimed)>num(was?.claimed)){const p=d.data.find(p=>p.id===c.projectId);const adv=s.startRequired===true||/advance|contract award|توقيع|مقدمة/i.test([s.label,s.trigger].join(' '));assert(adv||p?.finalTechnicalApproved||legacyAccounts(p),'TECHNICAL_APPROVAL_REQUIRED','مطالبة التسليم تحتاج اعتماد المراجع')}}}}
 for(const k of ['quotes','contracts']){const ids=new Set((updates.commercial[k]||[]).map(x=>x.id));assert(d.commercial[k].every(x=>ids.has(x.id)),'DELETION_BLOCKED','حذف مستندات سابقة غير مسموح في الحفظ الجماعي')}
 d.commercial=clone(updates.commercial);
 }
 if(updates.masters){for(const k of ['customers','vendors','vendorBills','expenses']){assert(Array.isArray(updates.masters[k]),'INVALID_MASTERS','مجموعة بيانات غير صالحة: '+k);const ids=new Set(updates.masters[k].map(x=>x.id));assert(d.masters[k].every(x=>ids.has(x.id)),'DELETION_BLOCKED','حذف سجل سابق غير مسموح في الحفظ الجماعي')}}
 if(updates.rates){requireRole(u,'Owner');assert(hash(updates.rates)===hash(d.rates),'USE_RATE_HISTORY','غيّر سعر التكلفة من شاشة الأسعار التاريخية؛ لا تستبدل أسعار الماضي')}
 if(updates.projectImages)for(const [id,im] of Object.entries(updates.projectImages)){assert(hash(d.projectImages[id]||null)===hash(im),'USE_PROJECT_IMAGE','غيّر صورة المشروع من زر الصورة في المشاريع والتشغيل')}
 for(const k of ['masters','awards','vendorPayments','customerReceipts','projectCostCenters','journalEntries'])if(updates[k]!==undefined){
   if(Array.isArray(d[k])&&Array.isArray(updates[k])){const incoming=new Set(updates[k].map(x=>x.id));assert(d[k].every(x=>incoming.has(x.id)),'DELETION_BLOCKED','حذف السجلات السابقة غير مسموح عبر حفظ جماعي');}
   d[k]=clone(updates[k]);
 }
 for(const r of d.customerReceipts){assert(num(r.amount)>0&&Number.isSafeInteger(Number(r.amount)),'INVALID_RECEIPT_AMOUNT','قيمة سند القبض غير صالحة');assert((!r.projectId&&r.unallocated||d.data.some(p=>p.id===r.projectId))&&d.masters.customers.some(c=>c.id===r.customerId),'BROKEN_RECEIPT_LINK','ربط سند القبض غير صالح')}
 for(const j of d.journalEntries)assert(Math.abs((j.lines||[]).reduce((s,l)=>s+num(l.debit)-num(l.credit),0))<.00001,'UNBALANCED_JOURNAL','القيد غير متوازن');
 validateStructure(d);event(d,u,'finance_legacy_save','',{datasets:Object.keys(updates)});return {saved:true};
}
module.exports={Updates,checkPM,ensureNotFinal,Access,Supplier,notify,RoleStatus,CollectionStatus,Scope,Flow,Commercial,Handoff,Daily,canEditImage,B,P,V,C,O,W,RELEASE,ROLES,FINANCE,LEGACY_KEYS,AppError,assert,clone,now,uid,hash,text,normalizeBackup,validateStructure,publicUser,snapshot,visible,project,user,runAction,issues,legacyState,financeBatch,event};
