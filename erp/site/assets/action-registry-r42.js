'use strict';

/* R42 contextual action registry.
 *
 * The registry only describes and renders actions. The workspace owns event
 * dispatch, permissions from the server, and the resulting navigation or
 * command. Keeping this module side-effect free makes every visible button
 * easy to audit in browser and Node tests.
 */
(function expose(global){
 const KINDS=new Set(['navigate','record','command']);
 const text=value=>String(value??'').trim();
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[char]));

 function translator(context){
  if(typeof context.translate==='function')return context.translate;
  return (ar,en)=>context.lang==='en'?(en||ar):ar;
 }

 function permitted(context,key,fallback=true){
  const permissions=context.permissions||{};
  return permissions[key]===undefined?fallback:permissions[key]===true;
 }

 function featured(context,key,fallback=true){
  const features=context.features||{};
  return features[key]===undefined?fallback:features[key]!==false;
 }

 function reason(context,key,fallback){
  return text((context.disabledReasons||{})[key])||fallback;
 }

 function countLabel(label,value){
  return Number.isInteger(value)&&value>=0?`${label} (${value})`:label;
 }

 function action(base,context){
  const allowed=base.permission?permitted(context,base.permission):true;
  const available=base.available!==false;
  return {
   id:base.id,
   label:base.label,
   kind:base.kind,
   route:base.route||'',
   record:base.record||'',
   command:base.command||'',
   visible:base.visible!==false,
   enabled:base.enabled!==false&&allowed&&available,
   disabledReason:base.enabled===false||!allowed||!available?text(base.disabledReason)||'غير متاح في السياق الحالي':'',
   primary:base.primary===true,
   mobilePriority:Number.isInteger(base.mobilePriority)?base.mobilePriority:50,
   projectId:text(base.projectId||context.projectId),
   customerId:text(base.customerId||context.customerId),
   financePage:text(base.financePage||context.financePage)
  };
 }

 function projectActions(context,T){
  const counts=context.counts||{},hasProject=!!text(context.projectId);
  return [
   action({id:'project.overview',label:T('نظرة عامة','Overview'),kind:'navigate',route:'projects',primary:true,mobilePriority:1,available:hasProject,disabledReason:T('اختر مشروعًا أولًا','Select a project first')},context),
   action({id:'project.tasks',label:countLabel(T('المهام والتنفيذ','Tasks & delivery'),counts.tasks),kind:'navigate',route:'tasks',mobilePriority:2,visible:featured(context,'tasks'),permission:'tasks',available:hasProject,disabledReason:reason(context,'tasks',T('لا توجد صلاحية لعرض مهام هذا المشروع','Tasks are unavailable for this project'))},context),
   action({id:'project.commercial',label:T('العرض والعقد','Quote & contract'),kind:'record',record:'commercial',route:'commercial',mobilePriority:3,visible:featured(context,'commercial')&&permitted(context,'commercial'),permission:'commercial',available:hasProject&&context.hasCommercial!==false,disabledReason:reason(context,'commercial',T('لا يمكن إدارة المرجع التجاري لهذا المشروع','The commercial record cannot be managed for this project'))},context),
   action({id:'project.finance',label:T('المطالبات والتحصيل','Claims & collection'),kind:'navigate',route:'collections',financePage:'claims',mobilePriority:4,visible:featured(context,'finance')&&permitted(context,'finance'),available:hasProject&&context.hasFinance!==false,disabledReason:reason(context,'finance',T('لا يوجد حساب مالي مرتبط','No linked financial account'))},context),
   action({id:'project.cost',label:T('التكلفة','Cost'),kind:'navigate',route:'fin',financePage:'costcenters',mobilePriority:6,visible:featured(context,'cost')&&permitted(context,'cost',permitted(context,'finance')),available:hasProject&&context.hasCost!==false,disabledReason:reason(context,'cost',T('لا توجد تكلفة مرتبطة بالمشروع','No project cost is available'))},context),
   action({id:'project.files',label:countLabel(T('الصور والملفات','Images & files'),counts.files),kind:'command',command:'project-files',mobilePriority:5,visible:featured(context,'files'),permission:'files',available:hasProject&&context.hasFiles!==false,disabledReason:reason(context,'files',T('لا توجد صورة محفوظة ولا صلاحية لرفع صورة جديدة','No saved image or permission to upload one'))},context)
  ];
 }

 function customerActions(context,T){
  const counts=context.counts||{},hasCustomer=!!text(context.customerId);
  return [
   action({id:'customer.profile',label:T('ملف العميل','Customer profile'),kind:'navigate',route:'customers',primary:true,mobilePriority:1,available:hasCustomer,disabledReason:T('اختر عميلًا أولًا','Select a customer first')},context),
   action({id:'customer.projects',label:countLabel(T('المشاريع','Projects'),counts.projects),kind:'navigate',route:'projects',mobilePriority:2,visible:featured(context,'projects'),permission:'projects',available:hasCustomer,disabledReason:reason(context,'projects',T('لا توجد مشاريع مرتبطة','No linked projects'))},context),
   action({id:'customer.statement',label:T('كشف الحساب','Account statement'),kind:'navigate',route:'fin',financePage:'clients',mobilePriority:3,visible:featured(context,'finance')&&permitted(context,'finance'),available:hasCustomer&&context.hasFinance!==false,disabledReason:reason(context,'statement',T('لا يوجد حساب مالي مرتبط','No linked financial account'))},context),
   action({id:'customer.receipt',label:T('تسجيل قبض','Record receipt'),kind:'command',command:'customer-receipt',mobilePriority:4,visible:featured(context,'receipts')&&permitted(context,'receipts',permitted(context,'finance')),available:hasCustomer,disabledReason:reason(context,'receipt',T('اختر عميلًا أولًا','Select a customer first'))},context)
  ];
 }

 function financeActions(context,T){
  const page=text(context.financePage)||'dashboard';
  const pages=[
   ['dashboard',T('نظرة عامة','Overview'),1],
   ['projects',T('المشروعات','Projects'),2],
   ['clients',T('العملاء','Customers'),3],
   ['claims',T('التحصيل','Collection'),4],
   ['costcenters',T('مراكز التكلفة','Cost centers'),10],
   ['designers',T('المصممون','Designers'),11],
   ['payments',T('دفعات المصممين','Designer payments'),12],
   ['advanced',T('المالية المتقدمة','Advanced finance'),13],
   ['reports',T('التقارير','Reports'),14]
  ];
  return pages.map(([id,label,priority])=>action({
   id:`finance.${id}`,
   label,
   kind:'navigate',
   route:id==='claims'?'collections':'fin',
   financePage:id,
   primary:id===page,
   mobilePriority:priority,
   visible:featured(context,id),
   permission:id==='reports'?'reports':'finance',
   disabledReason:reason(context,id,T('هذا القسم غير متاح لدورك','This section is unavailable for your role'))
  },context));
 }

 function validate(actions){
  const errors=[],seen=new Set();
  if(!Array.isArray(actions))return {valid:false,errors:['actions must be an array']};
  actions.forEach((item,index)=>{
   const at=`actions[${index}]`;
   if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`${at} must be an object`);return;}
   if(!/^[a-z0-9._-]+$/i.test(text(item.id)))errors.push(`${at}.id is invalid`);
   else if(seen.has(item.id))errors.push(`${at}.id is duplicated`);else seen.add(item.id);
   if(!text(item.label))errors.push(`${at}.label is required`);
   if(!KINDS.has(item.kind))errors.push(`${at}.kind is invalid`);
   if(item.kind==='navigate'&&!text(item.route))errors.push(`${at}.route is required`);
   if(item.kind==='record'&&!text(item.record))errors.push(`${at}.record is required`);
   if(item.kind==='command'&&!text(item.command))errors.push(`${at}.command is required`);
   for(const key of ['visible','enabled','primary'])if(typeof item[key]!=='boolean')errors.push(`${at}.${key} must be boolean`);
   if(!Number.isInteger(item.mobilePriority)||item.mobilePriority<0||item.mobilePriority>99)errors.push(`${at}.mobilePriority must be an integer from 0 to 99`);
   for(const key of ['disabledReason','projectId','customerId','financePage'])if(typeof item[key]!=='string')errors.push(`${at}.${key} must be a string`);
   if(!item.enabled&&!text(item.disabledReason))errors.push(`${at}.disabledReason is required when disabled`);
  });
  return {valid:errors.length===0,errors};
 }

 function build(scope,context={}){
  if(!context||typeof context!=='object'||Array.isArray(context))throw new TypeError('context must be an object');
  const T=translator(context);let actions;
  if(scope==='project')actions=projectActions(context,T);
  else if(scope==='customer')actions=customerActions(context,T);
  else if(scope==='finance')actions=financeActions(context,T);
  else throw new RangeError('scope must be project, customer or finance');
  const result=validate(actions);if(!result.valid)throw new Error(`Invalid action registry: ${result.errors.join('; ')}`);
  return actions;
 }

 function render(actions){
  const result=validate(actions);if(!result.valid)throw new Error(`Invalid actions: ${result.errors.join('; ')}`);
  return actions.filter(item=>item.visible).sort((a,b)=>a.mobilePriority-b.mobilePriority).map(item=>{
   const attrs=[
    ['data-action42',item.id],['data-action-kind42',item.kind],['data-route42',item.route],
    ['data-record42',item.record],['data-command42',item.command],['data-project42',item.projectId],
    ['data-customer42',item.customerId],['data-finance-page42',item.financePage],['data-finance-page',item.financePage],
    ['data-mobile-priority42',item.mobilePriority]
   ].filter(([,value])=>value!==''&&value!==undefined).map(([key,value])=>`${key}="${escape(value)}"`).join(' ');
   const disabled=item.enabled?'':` disabled aria-disabled="true" title="${escape(item.disabledReason)}"`;
   return `<button type="button" ${attrs} class="action42${item.primary?' primary active':''}"${disabled}>${escape(item.label)}</button>`;
  }).join('');
 }

 const api=Object.freeze({build,render,validate});
 global.RonixActionRegistry42=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
