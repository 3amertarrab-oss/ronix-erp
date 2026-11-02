'use strict';
// All report fields are allowlisted. This module never exports a raw database object.
const C=require('./controls'),W=require('./workflow');
const specs=[
 ['supplier_cost','التعاقد والساعات والمدفوع للموردين','Contract less time and supplier cash','finance'],['supplier_refunds','استردادات دفعات الموردين','Supplier refunds','finance'],
 ['projects','المشاريع','Projects','all'],['tasks','المهام والتقدم','Tasks & progress','all'],['execution_parts','نسب الأجزاء والأوزان','Part progress & weights','all'],['reviews','المراجعات الفنية','Technical reviews','all'],['timesheets','الساعات والاعتمادات','Time & approvals','time_admin'],['time_history','تاريخ الوقت والتصحيحات','Time decision history','time_admin'],['activities','الأنشطة الفرعية','Activity catalogue','all'],['orders','أوامر التشغيل','Work orders','all'],['notifications','إشعاراتي','My notifications','all'],['audit','سجل النشاط','Activity log','all'],
 ['employees','الموظفون','Employees','owner'],['customers','العملاء','Customers','finance'],['vendors','الموردون','Vendors','finance'],['quotes','عروض الأسعار','Quotations','finance'],['quote_lines','بنود العروض','Quotation lines','finance'],['contracts','العقود','Contracts','finance'],['contract_lines','بنود العقود','Contract lines','finance'],['schedules','جداول الدفعات','Payment schedules','finance'],['claims','المطالبات','Claims','finance'],['receipts','سندات القبض','Receipts','finance'],['allocations','توزيعات القبض','Receipt allocations','finance'],['awards','أوامر الإسناد','Subcontracts','finance'],['award_lines','بنود الإسناد','Subcontract lines','finance'],['vendor_bills','فواتير الموردين','Vendor bills','finance'],['vendor_payments','دفعات الموردين','Vendor payments','finance'],['expenses','المصروفات','Expenses','finance'],['cost_centers','مراكز التكلفة','Cost centers','finance'],['journals','سطور القيود','Journal lines','finance'],['project_cost','تكلفة الوقت حسب المشروع','Project time costing','finance'],['cost_rates','أسعار التكلفة التاريخية','Historical cost rates','finance'],['records','سلة السجلات وحالاتها','Records & disposal','owner']
];
const permitted=(s,u)=>s[3]==='all'||s[3]==='time_admin'&&['Owner','Accountant','Project Manager'].includes(u.role)||s[3]==='finance'&&C.fin(u)||s[3]==='owner'&&u.role==='Owner';
function available(u){return specs.filter(s=>permitted(s,u)).map(([id,ar,en])=>({id,ar,en}));}
const col=(key,title,type='text',width=22,sum=false)=>({key,title,type,width,sum});
const pcols=[col('projectId','كود المشروع','text',18),col('projectName','المشروع','text',32)];
const tcols=[...pcols,col('taskId','كود المهمة','text',22),col('task','المهمة','text',40)];
function taskState(p,t,D){if(p.operationalClosed||D.O.historical(p))return 'history';if(D.O.approved(t))return 'approved';if(t.status==='submitted')return 'submitted';if(t.status==='returned')return 'returned';if(t.status==='todo')return 'todo';return 'working';}
function build(d,u,kind,filters={},D){
 const spec=specs.find(s=>s[0]===kind);C.check(spec&&permitted(spec,u),'EXPORT_FORBIDDEN','هذا التقرير غير مسموح لهذا الدور',403);
 const snap=D.snapshot(d,u,0),fin=C.fin(u),byId=new Map(d.data.map(p=>[p.id,p]));
 const pname=id=>byId.get(id)?.name||'',uname=id=>d.teamUsers.find(x=>x.id===id)?.name||id||'',base=(pid,extra={})=>({projectId:pid||'',projectName:pname(pid),...extra});
 let rows=[],columns=[],notes=[];
 const float=(key,title,sum=false)=>col(key,title,'decimal',18,sum),money=(key,title,sum=false)=>col(key,title,'money',21,sum),dt=(key,title)=>col(key,title,'date',20);
 const tasks=snap.projects.flatMap(p=>p.tasks.filter(t=>!t.isSummary).map(t=>({p,t})));
 if(kind==='projects'){
  const ps=fin?snap.projects:snap.directory;
  rows=ps.map(p=>base(p.id,{pm:uname(p.pm),engineers:(p.team||[]).map(x=>uname(x.id)).join('، '),checker:uname(p.checker),deadline:p.deadline,progress:p.engineerPercent,approved:p.checkerPercent,state:p.operationalClosed?'archived':p.flex?.draft||p.projectDraft?'draft':'active',progressQuality:p.summary?.progressQuality||'',_uid:p.pm,...(fin?{value:p.finance.value,claimed:p.finance.invoiced,received:p.finance.paid,claimRemaining:p.finance.outstanding,uncollected:p.finance.uncollected,financialState:p.finance.financialLabel}:{})}));
  columns=[...pcols,col('pm','مهندس المشروعات'),col('engineers','المهندسون','text',32),col('checker','المراجع'),dt('deadline','التسليم'),float('progress','إنجاز المهندس %'),float('approved','اعتماد المراجع %'),col('state','الحالة'),col('progressQuality','توثيق النسبة')];
  if(fin)columns.push(money('value','قيمة التعاقد',true),money('claimed','مطالب به',true),money('received','مقبوض',true),money('claimRemaining','متبقي المطالبات',true),money('uncollected','غير محصل من التعاقد',true),col('financialState','الحالة المالية'));
 }
 if(kind==='tasks'){
  rows=tasks.map(({p,t})=>base(p.id,{taskId:t.id,task:t.name,parent:t.parentTaskId,engineer:uname(t.assignee),checker:uname(t.checker||p.checker),priority:t.priority,start:t.startDate,deadline:t.due,weight:t.weight,planned:t.plannedHours,progress:t.progress,approved:t.approvedProgress,reviewRecorded:t.reviewRecorded?'نعم':'لم تراجع',completed:t.completedNote,remaining:t.remainingNote,blocker:t.progressNote,revision:t.workRevision,state:taskState(byId.get(p.id),t,D),status:t.status,_uid:t.assignee,_date:t.due}));
  columns=[...tcols,col('engineer','المهندس'),col('checker','المراجع'),col('priority','الأولوية'),dt('start','البداية'),dt('deadline','التسليم'),float('weight','الوزن'),float('planned','ساعات مخططة',true),float('progress','نسبة المهندس %'),float('approved','نسبة المراجع %'),col('reviewRecorded','حالة المراجعة'),col('state','التصفية'),col('status','الحالة'),col('revision','نسخة التقديم','number',14),col('completed','المنجز','text',40),col('remaining','المتبقي','text',40),col('blocker','العوائق','text',40)];
 }
 if(kind==='reviews'){
  rows=tasks.flatMap(({p,t})=>(t.assessments||[]).map(r=>base(p.id,{taskId:t.id,task:t.name,id:r.id,submissionId:r.submissionId,engineer:uname(t.assignee),reviewer:uname(r.by),date:r.at,engineerProgress:r.engineerPercent,approved:r.percent,decision:r.decision,revision:r.workRevision,reason:r.reason,_uid:t.assignee,state:r.decision})));
  columns=[...tcols,col('id','رقم المراجعة'),col('submissionId','التقديم'),col('engineer','المهندس'),col('reviewer','المراجع'),dt('date','التاريخ'),float('engineerProgress','نسبة المهندس %'),float('approved','نسبة المراجع %'),col('decision','القرار'),col('revision','المراجعة','number'),col('reason','السبب','text',40)];notes.push('السجل الفني التفصيلي الجديد فقط؛ الدورات القديمة محفوظة في السجل والنسخة الاحتياطية ولا تنشأ لها موافقات مفترضة.');
 }
 if(kind==='timesheets'){
  rows=snap.timesheets.map(t=>base(t.projectId,{id:t.id,taskId:t.taskId,task:byId.get(t.projectId)?.tasks.find(x=>x.id===t.taskId)?.name||'',employee:uname(t.user),activity:t.activityLabel,workRevision:t.revisionLabel,tool:t.tool,date:t.date,hours:t.hours,approvedHours:t.status==='approved'?(t.approvedHours===''?t.hours:t.approvedHours):0,status:t.status,state:t.status,_canReview:t.canReview,note:t.note,reviewer:uname(t.reviewedBy||t.approvedBy),reviewDate:t.reviewedAt||t.approvedAt,reason:t.reviewNote,_uid:t.user,...(fin?{rate:t.costSnapshot?.rateEGP??null,cost:t.status==='approved'?(t.costSnapshot?.amountEGP??null):null,costState:t.costState,priceDate:t.costSnapshot?.effectiveFrom||'',rateId:t.costSnapshot?.rateId||''}:{})}));
  columns=[col('id','رقم سجل الوقت'),...tcols,col('employee','الموظف'),col('activity','النشاط','text',32),col('workRevision','مراجعة العمل'),col('tool','الأداة'),dt('date','تاريخ العمل'),float('hours','ساعات مسجلة',true),float('approvedHours','ساعات معتمدة',true),col('status','حالة الساعات'),col('note','وصف العمل','text',40),col('reviewer','صاحب القرار'),dt('reviewDate','وقت القرار'),col('reason','ملاحظة القرار','text',36)];
  if(fin)columns.push(money('rate','سعر الساعة المثبت'),money('cost','التكلفة المعتمدة',true),col('costState','حالة التسعير'),dt('priceDate','تاريخ سريان السعر'),col('rateId','مرجع السعر'));
  notes.push('الساعات المسجلة تشمل السجل المرفوض/المرتجع عند اختيار كل الحالات؛ التكلفة فقط للمعتمد المسعّر. الخلية المالية الفارغة ليست صفرًا.');
 }
 if(kind==='time_history'){
  for(const t of snap.timesheets){const common=base(t.projectId,{id:t.id,taskId:t.taskId,employee:uname(t.user),activity:t.activityLabel,workRevision:t.revisionLabel,_uid:t.user});
   for(const h of t.reviewHistory||[])rows.push({...common,event:'decision',eventId:h.id,decision:h.decision,date:h.at,by:uname(h.by),submitted:h.submittedHours,accepted:h.approvedHours,reason:h.reason,state:h.decision});
   for(const h of t.editHistory||[])rows.push({...common,event:'value_before_edit',date:h.at,by:uname(h.by),submitted:h.hours,workRevision:h.revisionLabel,reason:h.note,workDate:h.date,state:'edit'});
   if(fin)for(const h of [...(t.costHistory||[]).map(x=>({...x,previous:true})),...(t.costSnapshot?[t.costSnapshot]:[])])rows.push({...common,event:h.previous?'previous_cost_snapshot':'current_cost_snapshot',date:h.replacedAt||h.capturedAt,by:uname(h.replacedBy||h.capturedBy),accepted:h.approvedHours,rate:h.rateEGP,cost:h.amountEGP,reason:h.reason||'',workDate:h.workDate,state:'pricing'});
  }
  columns=[col('id','سجل الوقت'),...pcols,col('taskId','المهمة'),col('employee','الموظف'),col('activity','النشاط','text',32),col('workRevision','المراجعة'),col('event','نوع الحدث'),col('eventId','معرف القرار'),dt('date','وقت الحدث'),col('by','المستخدم'),dt('workDate','تاريخ العمل السابق'),float('submitted','ساعات مسجلة'),float('accepted','ساعات معتمدة'),col('decision','القرار'),col('reason','السبب / القيمة السابقة','text',40)];if(fin)columns.push(money('rate','السعر المثبت'),money('cost','قيمة الصورة التاريخية'));
  notes.push('تاريخ القرارات والتصحيحات وليس مجموع تكلفة؛ لا تجمع الصور المالية السابقة والحالية. غير مؤرخ تاريخيًا يبقى بلا تاريخ مفترض.');
 }
 if(kind==='activities'){
  rows=tasks.flatMap(({p,t})=>(t.activities||[]).map(a=>base(p.id,{taskId:t.id,task:t.name,id:a.id,activity:a.label,source:a.custom?'custom':'contracted',createdAt:a.createdAt,createdBy:uname(a.createdBy),_uid:t.assignee})));
  columns=[...tcols,col('id','معرف النشاط'),col('activity','النشاط','text',40),col('source','مصدر النشاط'),dt('createdAt','وقت الإضافة'),col('createdBy','أضافه')];
 }
 if(kind==='execution_parts'){
  rows=tasks.flatMap(({p,t})=>(t.execution?.parts||[]).map(r=>base(p.id,{taskId:t.id,task:t.name,partId:r.id,part:r.label,group:r.group,weight:r.weight,engineer:uname(r.assignee||t.assignee),checker:uname(r.checker||t.checker||p.checker),progress:r.progress,approved:r.approvedProgress,contribution:r.progress===null?'':r.weight*r.progress/100,approvedContribution:r.approvedProgress===null?'':r.weight*r.approvedProgress/100,status:r.status,state:p.operationalClosed?'history':r.status,revision:r.revision,completed:r.completedNote,remaining:r.remainingNote,_uid:r.assignee||t.assignee})));
  columns=[...tcols,col('partId','معرف الجزء'),col('part','جزء العمل'),col('group','القسم'),float('weight','الوزن %'),col('engineer','المهندس'),col('checker','المراجع'),float('progress','إنجاز الجزء %'),float('approved','اعتماد الجزء %'),float('contribution','مساهمة الإنجاز %'),float('approvedContribution','مساهمة المعتمد %'),col('status','حالة الجزء'),col('state','حالة السجل'),float('revision','مراجعة الجزء'),col('completed','المنجز','text',38),col('remaining','المتبقي','text',38)];
  notes.push('نسبة الجزء 0–100 × الوزن /100 = المساهمة. غير المراجع فارغ وليس اعتمادًا صفرًا. لا تجمع مساهمات مشروعات مختلفة كإجمالي مشروع واحد.');
 }
 if(kind==='orders'){
  rows=snap.orders.map(o=>base(o.projectId,{id:o.id,issuedAt:o.issuedAt,by:uname(o.issuedBy),pm:uname(o.pmId),pmAck:o.pmAck?.at||'',deadline:o.deadline,status:o.status,brief:o.technicalBrief,_uid:o.pmId,...(fin?{contract:o.contractId,quote:o.quoteId,accountsAck:o.accountsAck?.at||''}:{})}));
  columns=[col('id','الأمر'),...pcols,dt('issuedAt','الإصدار'),col('by','المصدر'),col('pm','مهندس المشروعات'),dt('pmAck','استلام PM'),dt('deadline','التسليم'),col('status','الحالة'),col('brief','النطاق الفني','text',40)];if(fin)columns.push(col('contract','العقد'),col('quote','العرض'),dt('accountsAck','استلام الحسابات'));
 }
 if(kind==='notifications'){
  rows=d.ops.notifications.filter(x=>x.userId===u.id&&(!x.financial||fin)).map(x=>base(x.projectId,{id:x.id,taskId:x.taskId,sender:uname(x.senderId),type:x.type,message:x.message,date:x.createdAt,read:x.readAt||'',state:x.readAt?'read':'unread',_uid:u.id}));
  columns=[col('id','الإشعار'),...pcols,col('taskId','المهمة'),col('sender','المرسل'),col('type','النوع'),col('message','الرسالة','text',44),dt('date','الوقت'),dt('read','تم الاطلاع')];
 }
 if(kind==='audit'){
  const ids=new Set(snap.projects.map(p=>p.id));
  rows=d.ops.audit.filter(a=>fin||((ids.has(a.projectId)||a.userId===u.id)&&['execution_board_enable','execution_parts_save','execution_parts_submit','execution_parts_review','execution_part_reopen','plan_task','engineer_update','engineer_submit','checker_assess','checker_return','checker_reopen','final_approve','task_breakdown','time_activity_add','timesheet_add','timesheet_review','timesheet_approve','timesheet_edit','timesheet_reopen','ack_order','task_request_update','project_image_update'].includes(a.type))).map(a=>base(a.projectId,{id:a.id,date:a.at,employee:uname(a.userId),type:a.type,taskId:a.details?.taskId||'',timesheetId:a.details?.timesheetId||'',testOwner:fin?a.testOwnerId||'':'',_uid:a.userId}));
  columns=[col('id','الإجراء'),...pcols,dt('date','الوقت'),col('employee','المستخدم'),col('type','النوع'),col('taskId','المهمة'),col('timesheetId','سجل الوقت')];if(fin)columns.push(col('testOwner','جلسة اختبار المالك'));
 }
 if(kind==='employees'){
  rows=d.teamUsers.map(x=>({id:x.id,name:x.name,role:x.role,active:x.active!==false?'active':'disabled',state:x.active!==false?'active':'disabled'}));columns=[col('id','معرف الدخول'),col('name','الاسم'),col('role','الدور'),col('active','الحالة')];notes.push('لا كلمات مرور ولا رموز جلسات في التقرير.');
 }
 if(['customers','vendors'].includes(kind)){
  rows=d.masters[kind].map(x=>({id:x.id,name:x.name,contact:x.contactPerson,phone:x.phone,email:x.email,address:x.address,taxNo:x.taxNo,commercialReg:x.commercialReg,category:x.category||'',active:x.active!==false?'active':'disabled',state:x.active!==false?'active':'disabled',notes:x.notes}));
  columns=[col('id','الكود'),col('name','الاسم','text',32),col('contact','مسؤول الاتصال'),col('phone','الهاتف','text'),col('email','البريد','text',32),col('address','العنوان','text',40),col('taxNo','الرقم الضريبي','text'),col('commercialReg','السجل التجاري','text'),col('category','الفئة'),col('active','الحالة'),col('notes','ملاحظات','text',40)];
 }
 if(['quotes','contracts','quote_lines','contract_lines','schedules'].includes(kind)){
  const qs=kind.startsWith('quote'),types=kind==='schedules'?['quote','contract']:[qs?'quote':'contract'];
  for(const type of types){for(const r of C.live(d.commercial[type==='quote'?'quotes':'contracts'])){
   const p=W.docProject(d,r,type);const b=base(p?.id,{id:r.id,number:r.number,sourceType:type,client:r.client,customerId:r.customerId,revision:r.revision||'',status:r.status,state:r.documentArchived||p?.operationalClosed?'archived':r.status,date:r.date||r.contractDate,total:W.total(r,type),parent:r.parentContractId||'',isRevision:!!r.changeOrderDraft||!!r.parentContractId,governing:!!p&&!p.operationalClosed&&!r.documentArchived&&W.source(d,p)?.doc.id===r.id,_date:r.date||r.contractDate});
   if(kind.endsWith('_lines'))(r.lines||[]).forEach((l,i)=>rows.push({...b,line:i+1,included:l.included!==false?'yes':'no',description:l.description,qty:l.qty,unit:l.unit,price:l.unitPrice??l.rate,discount:l.discount??0,net:l.included===false?0:Number(l.qty||0)*Number(l.unitPrice??l.rate??0)*(1-Number(l.discount||0)/100),scope:(l.scopeItems||[]).filter(x=>x.included!==false).map(x=>x.ar||x.en).join(' | ')}));
   else if(kind==='schedules')W.schedule({type,doc:r}).forEach(x=>rows.push({...b,milestoneId:x.id,label:x.label,percent:x.percent,trigger:x.trigger,claimed:x.claimed||0,paid:x.paid||0}));
   else rows.push(b);
  }}
  columns=[col('id','معرف المستند'),col('number','رقم المستند','text',30),col('sourceType','نوع المرجع'),...pcols,col('client','العميل'),col('status','الحالة'),col('state','حالة العرض'),col('isRevision','مراجعة لا بيع جديد'),col('governing','مرجع التشغيل الحالي')];
  if(kind.endsWith('_lines'))columns.push(col('line','السطر','number',10),col('included','مشمول'),col('description','وصف البند','text',40),float('qty','الكمية'),col('unit','الوحدة'),money('price','السعر'),float('discount','خصم %'),money('net','صافي البند'),col('scope','النطاق المشمول','text',44));
  else if(kind==='schedules')columns.push(col('milestoneId','الدفعة'),col('label','اسم الدفعة'),float('percent','النسبة %'),col('trigger','شرط الاستحقاق'),money('claimed','مطالب به'),money('paid','محصل موزع'));
  else columns.push(dt('date','التاريخ'),money('total','قيمة المستند'),col('parent','المستند الأصلي'));
  notes.push('قيمة المستند ليست إيرادًا إضافيًا عند وجود عرض/عقد/مراجعة لنفس العمل. لا يُجمع عمود القيم إجمالًا. الحالة والمرجع الحاكم محفوظان.');
 }
 if(kind==='claims'){
  // One authoritative schedule per project; ops.claims is history, not an extra receivable.
  rows=C.live(d.data).flatMap(p=>{const s=W.source(d,p);return W.schedule(s).filter(x=>Number(x.claimed)>0||x.claimId).map(x=>base(p.id,{id:x.claimId||'LEGACY:'+p.id+':'+x.id,sourceType:s?.type,source:s?.doc.number,milestone:x.id,label:x.label,amount:Number(x.claimed||0),allocated:Number(x.paid||0),date:x.claimedAt||'',status:x.status||'recorded',sentAt:d.ops.claims.find(c=>c.id===x.claimId)?.sentAt||'',sentReference:d.ops.claims.find(c=>c.id===x.claimId)?.sentReference||'',directionId:d.ops.claims.find(c=>c.id===x.claimId)?.directionId||''}))});
  columns=[col('id','المطالبة'),...pcols,col('sourceType','المرجع'),col('source','رقم المرجع'),col('milestone','الدفعة'),col('label','بيان الدفعة'),money('amount','مطالب به',true),money('allocated','محصل موزع',true),dt('date','تاريخ الإصدار'),col('status','الحالة'),dt('sentAt','تأكيد الإرسال'),col('sentReference','مرجع الإرسال'),col('directionId','التوجيه المالي')];notes.push('المصدر: جدول المرجع الحاكم لكل مشروع مرة واحدة. لا تُضاف أحداث ops.claims ثانيةً.');
 }
 if(kind==='receipts'||kind==='allocations'){
  rows=d.customerReceipts.map(r=>base(r.projectId,{id:r.id,client:r.customerName||d.masters.customers.find(x=>x.id===r.customerId)?.name,customerId:r.customerId,amount:r.amount,date:r.date,method:r.method,account:r.accountId,reference:r.reference,status:r.status,state:r.status,unallocated:!!r.unallocated,opening:!!r.openingBalance,milestone:r.milestoneId||'',arApplied:r.arApplied??null,advanceApplied:r.advanceApplied??null,notes:r.note||'',reconciliation:r.needsReconciliation?'needs_reconciliation':''}));
  columns=[col('id','سند القبض'),...pcols,col('customerId','كود العميل'),col('client','العميل'),dt('date','التاريخ'),col('status','الحالة')];
  if(kind==='receipts')columns.push(money('amount','مبلغ السند'),col('method','الطريقة'),col('account','الحساب'),col('reference','المرجع'),col('unallocated','غير موزع'),col('opening','رصيد افتتاحي'),col('notes','ملاحظات','text',38));
  else columns.push(col('milestone','الدفعة'),money('arApplied','جزء مقابل المطالبات'),money('advanceApplied','جزء دفعة مقدمة'),col('unallocated','غير موزع'));
  columns.push(col('reconciliation','حاجة المطابقة'));notes.push('السند المعكوس ليس قبضًا جديدًا. هذا تفصيل للحركات وحالاتها؛ لا تجمع مبلغ السند مع أعمدة توزيعه.');
 }
 if(kind==='awards'||kind==='award_lines'){
  rows=d.awards.flatMap(r=>{const b=base(r.projectId,{id:r.id,number:r.number,vendor:d.masters.vendors.find(x=>x.id===r.vendorId)?.name||r.vendorId,date:r.date,status:r.status,type:r.documentType||r.type,scope:r.scope,retention:r.retentionPct});return kind==='awards'?[b]:(r.items||[]).map((l,i)=>({...b,line:i+1,description:l.description,qty:l.qty,unit:l.unit||l.uom,rate:l.rate,lineValue:r.supplierFlowVersion===1?D.Supplier.lineAmount(l):null,costCode:l.costCode}));});
  columns=[col('id','المعرف'),col('number','أمر الإسناد'),...pcols,col('vendor','المورد'),dt('date','التاريخ'),col('status','الحالة'),col('type','النوع')];if(kind==='awards')columns.push(col('scope','النطاق','text',44),float('retention','احتجاز %'));else columns.push(col('line','السطر','number'),col('description','الوصف','text',40),float('qty','الكمية'),col('unit','الوحدة'),money('rate','السعر'),money('lineValue','قيمة بند الإسناد'),col('costCode','بند التكلفة'));
 }
 if(['vendor_bills','vendor_payments','expenses','cost_centers'].includes(kind)){
  const source=kind==='vendor_bills'?d.masters.vendorBills:kind==='vendor_payments'?d.vendorPayments:kind==='expenses'?d.masters.expenses:d.projectCostCenters;
  rows=source.map(x=>base(x.projectId,{id:x.id,date:x.date,vendor:d.masters.vendors.find(v=>v.id===x.vendorId)?.name||x.vendorId||'',amount:x.amount,paid:x.paid,reference:x.reference,description:x.description||x.name,notes:x.notes||x.note,status:x.status,award:x.awardId,bill:x.billId}));
  columns=[col('id','المعرف'),...pcols,dt('date','التاريخ'),col('vendor','المورد'),col('description','البيان','text',40)];if(kind!=='cost_centers')columns.push(money('amount','القيمة',true));if(kind==='vendor_bills')columns.push(money('paid','المدفوع',true));columns.push(col('status','الحالة'),col('reference','المرجع'),col('award','الإسناد'),col('bill','الفاتورة'),col('notes','ملاحظات','text',36));
 }
 if(kind==='journals'){
  rows=d.journalEntries.flatMap(j=>(j.lines||[]).map((l,i)=>base(l.projectId||j.projectId,{id:j.id,date:j.date,sourceType:j.sourceType,source:j.sourceId,status:j.status,line:i+1,account:l.account,debit:l.debit,credit:l.credit,center:l.costCenterId||j.costCenterId})));
  columns=[col('id','القيد'),dt('date','التاريخ'),...pcols,col('sourceType','نوع المصدر'),col('source','رقم المصدر'),col('status','الحالة'),col('line','السطر','number',10),col('account','الحساب'),money('debit','مدين',true),money('credit','دائن',true),col('center','مركز التكلفة')];
 }
 if(kind==='project_cost'){
  rows=C.live(d.data).map(p=>base(p.id,{...C.costSummary(d,p.id),state:p.operationalClosed?'archived':p.flex?.draft||p.projectDraft?'draft':'active'}));
  columns=[...pcols,col('state','الحالة'),float('loggedHours','وقت مسجل',true),float('approvedHours','وقت معتمد',true),float('pendingHours','وقت معلق',true),float('returnedHours','مرتجع للتصحيح',true),float('unpricedHours','معتمد غير مسعر',true),money('knownCostEGP','تكلفة الوقت المثبتة',true),col('complete','اكتمال الوقت والتسعير')];notes.push('تكلفة الوقت فقط وليست إجمالي مصروفات/ربحية المشروع. لا تُنشئ قيد رواتب جديدًا.');
 }
 if(kind==='supplier_cost'){
  rows=C.live(d.data).map(p=>base(p.id,{...D.Supplier.cost(d,p.id,D),state:p.operationalClosed?'archived':'active'}));
  columns=[...pcols,col('currency','العملة'),money('contractValue','قيمة تعاقد العميل',true),float('approvedHours','ساعات معتمدة',true),float('unpricedHours','ساعات معتمدة غير مسعرة',true),money('knownLaborCost','تكلفة ساعات مثبتة',true),money('vendorPayments','صافي المدفوع للموردين',true),money('remaining','المتبقي بعد الساعات والمدفوعات',true),money('liabilities','مستخلصات غير مدفوعة',true),money('commitments','قيمة اتفاقات الموردين'),col('complete','اكتمال تسعير الساعات'),col('calculable','حساب العملة متاح'),col('state','حالة المشروع')];
  notes.push('مؤشر إداري وليس ربحًا نهائيًا أو رصيد بنك. لا تُخصم قيمة الاتفاق أو المستخلص مرة ثانية مع الدفع. السعر المفقود لا يعني تكلفة صفرية؛ راجع الساعات غير المسعرة. تقارير كل عملة مستقلة؛ لا تجمع عملات مختلفة.');
 }
 if(kind==='supplier_refunds'){
  rows=(d.supplierFlow?.refunds||[]).map(r=>base(r.projectId,{...r,vendor:d.masters.vendors.find(v=>v.id===r.vendorId)?.name||r.vendorId}));
  columns=[col('id','المعرف'),...pcols,col('vendor','المورد'),dt('date','التاريخ'),money('amount','مبلغ مسترد',true),col('paymentId','سند الدفع الأصلي'),col('agreementId','اتفاق المورد'),col('accountId','الحساب'),col('reason','سبب الاسترداد','text',38)];
  notes.push('الاسترداد حركة نقدية عكسية موثقة. لا يمحو الدفع الأصلي، ويخصم من صافي المدفوع في تقرير مركز تكلفة المشروع.');
 }
 if(kind==='cost_rates'){
  rows=(d.costRates||[]).map(r=>({id:r.id,employee:uname(r.userId),date:r.effectiveFrom,rate:r.rateEGP,currency:r.currency,by:uname(r.recordedBy),recordedAt:r.recordedAt,sequence:r.sequence,reason:r.reason,_uid:r.userId}));
  columns=[col('id','مرجع السعر'),col('employee','الموظف'),dt('date','سريان السعر'),money('rate','سعر الساعة'),col('currency','العملة'),col('sequence','التسلسل','number'),col('by','ثبته'),dt('recordedAt','وقت التسجيل'),col('reason','المرجع / السبب','text',40)];notes.push('التسلسل الأعلى لنفس الموظف وتاريخ السريان هو المرجع عند الاعتماد الجديد؛ الاعتمادات الماضية تحتفظ بصورتها المثبتة.');
 }
 if(kind==='records'){
  rows=['project','quote','contract'].flatMap(k=>C.recordList(d,u,k).map(r=>({kind:k,id:r.id,name:r.name,projectName:r.projectName,status:r.status,state:r.removed?'removed':r.archived?'archived':'active',reason:r.reason,removedAt:r.removedAt,by:uname(r.removedBy),links:r.dependencies.map(x=>x.label+': '+x.count).join(' | ')})));
  columns=[col('kind','نوع السجل'),col('id','المعرف'),col('name','الاسم / الرقم'),col('projectName','المشروع','text',32),col('status','الحالة'),col('state','السلة / الأرشيف'),col('reason','السبب','text',40),dt('removedAt','وقت الإزالة'),col('by','المستخدم'),col('links','الروابط','text',44)];
 }
 // Only explicit documented filters. Never silently truncate a report.
 for(const k of Object.keys(filters))C.check(['projectId','taskId','userId','state','from','to','search','priority','kind'].includes(k),'INVALID_EXPORT_FILTER','تصفية غير معروفة');
 const f=Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,String(v??'').slice(0,200)]));
 for(const k of ['from','to'])if(f[k])C.check(/^\d{4}-\d{2}-\d{2}$/.test(f[k])&&!isNaN(Date.parse(f[k]))&&new Date(f[k]).toISOString().slice(0,10)===f[k],'INVALID_EXPORT_DATE','تاريخ التصفية غير صحيح');
 if(f.from&&f.to)C.check(f.from<=f.to,'INVALID_DATE_RANGE','نهاية الفترة قبل بدايتها');
 rows=rows.filter(r=>{if(f.kind&&r.kind!==f.kind)return false;if(f.projectId&&r.projectId!==f.projectId)return false;if(f.taskId&&r.taskId!==f.taskId)return false;if(f.userId&&r._uid!==f.userId)return false;if(f.priority&&r.priority!==f.priority)return false;if(f.state&&f.state!=='all'){let state=r.state||r.status||'';if(kind==='timesheets'&&f.state==='review'){if(!r._canReview)return false;}else if(kind==='tasks'&&f.state==='all_current'){if(state==='history')return false;}else if(kind==='tasks'&&f.state==='active'){if(!['todo','working','returned'].includes(state))return false;}else if(['quotes','contracts','quote_lines','contract_lines','schedules'].includes(kind)&&f.state==='current'){if(state==='archived'||state==='removed')return false;}else if(kind==='projects'&&f.state==='active'){if(!['active','draft'].includes(state))return false;}else if(state!==f.state)return false;}const date=String(r._date||r.date||r.deadline||r.issuedAt||'').slice(0,10);if(f.from&&date<f.from)return false;if(f.to&&date>f.to)return false;if(f.search&&!Object.values(r).some(v=>String(v??'').toLowerCase().includes(f.search.toLowerCase())))return false;return true;});
 C.check(rows.length<=100000,'EXPORT_TOO_LARGE','التقرير أكبر من 100000 سطر؛ قلل التصفية',413);
 const clean=rows.map(r=>Object.fromEntries(columns.map(c=>[c.key,r[c.key]??''])));
 return {kind,title:spec[1]+' / '+spec[2],columns,rows:clean,filters:f,notes,totals:Object.fromEntries(columns.filter(c=>c.sum).map(c=>[c.key,clean.reduce((s,r)=>s+(typeof r[c.key]==='number'?r[c.key]:0),0)]))};
}
module.exports={available,build};
