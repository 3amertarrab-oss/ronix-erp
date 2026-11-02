'use strict';
// Shared server state for the approved V20 accounts and 1007 commercial editor.
const R = require('./finance-v20-core');
const crypto = require('node:crypto');
const copy = x => JSON.parse(JSON.stringify(x));
function fail(message, status=400) { const e=Error(message); e.status=status; e.code='UNIFIED_VALIDATION'; throw e; }
function check(test,message,status) { if(!test) fail(message,status); }
const accounting = u => ['Owner','Accountant'].includes(u.role);
const commercial = u => ['Owner','Project Manager','Accountant'].includes(u.role);
function root(d) { return d.extensions?.unified || {version:1,finance:{revision:0,payload:null},commercial:{revision:0,documents:[]},links:[]}; }
function writable(d) { d.extensions ||= {}; return d.extensions.unified ||= copy(root(d)); }
function allowed(u,area,write=false) { check(area==='finance'?accounting(u):commercial(u),'هذا القسم غير متاح لدورك',403); if(write&&area==='approve')check(['Owner','Project Manager'].includes(u.role),'اعتماد المستند للمالك أو مدير المشروعات',403); }
function revision(actual,expected) { check(Number.isInteger(expected)&&actual===expected,'توجد تعديلات أحدث على الخادم. نزّل نسخة تعديلاتك ثم أعد تحميل أحدث نسخة.',409); }
function catalog(d) { return {projects:d.data.filter(p=>!p.removedAt).map(p=>({id:p.id,name:p.name,customerId:p.customerId||'',client:p.client||''})),customers:d.masters.customers.filter(c=>c.active!==false&&!c.removedAt).map(c=>({id:c.id,name:c.name}))}; }
function read(d,u,area) { allowed(u,area); const a=root(d),result={...copy(a[area]),...catalog(d),links:copy(a.links),role:u.role};if(area==='commercial')for(const doc of result.documents){const native=d.commercial[doc.draft.state.kind==='quote'?'quotes':'contracts'].find(x=>x.id===doc.id);doc.lifecycle=native?.removedAt?'removed':native?.documentArchived?'archived':native?.status||doc.status;}return result; }
function mediaReferences(value) {let count=0;const visit=v=>{if(!v||typeof v!=='object')return;if(v.$ronixBlob)count++;for(const x of Object.values(v))visit(x);};visit(value);return count;}
function validateFinance(value) { try { return R.validate(value); } catch(e) { fail(e.message); } }
function saveFinance(d,u,b) {
 allowed(u,'finance',true); const a=writable(d); revision(a.finance.revision,b.baseRevision);
 const payload=validateFinance(b.payload),codes=new Set(payload.projects.map(p=>p.code));
 check(mediaReferences(payload)===0,'توجد مرفقات سحابية لم تُنزّل. استخدم تصدير JSON الكامل من نسخة الحسابات قبل الاستيراد');
 for(const l of a.links)check(codes.has(l.financeCode),'لا تحذف مشروعًا ماليًا مرتبطًا؛ استخدم الأرشفة');
 for(const l of a.links){const before=a.finance.payload?.projects.find(p=>p.code===l.financeCode),after=payload.projects.find(p=>p.code===l.financeCode);if(before?.unifiedSourceId)check(after.unifiedSourceId===before.unifiedSourceId,'مرجع العقد المرتبط لا يُستبدل من استيراد الحسابات',409);}
 a.finance={revision:a.finance.revision+1,payload,updatedAt:new Date().toISOString(),updatedBy:u.id};
 return copy(a.finance);
}
function amounts(state) {
 check(state&&typeof state==='object'&&!Array.isArray(state),'مسودة غير صالحة');
 check(['quote','contract'].includes(state.kind)&&['execution','engineering'].includes(state.path),'نوع مستند غير صالح');
 check(['EGP','SAR','USD','AED','SYP','TRY'].includes(state.currency),'عملة غير مدعومة');
 for(const k of ['items','engineering','terms','payments'])check(Array.isArray(state[k]),'جدول مفقود: '+k);
 const scale=state.currency==='EGP'?1:100,n=v=>{check(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12,'قيمة مالية غير صالحة');return v;};
 const scope=r=>r.scope==='غير موجود'?'':r.scope==='كتابة يدوية'?String(r.manual||'').trim():r.scope;
 const active=state.path==='engineering'?state.engineering.filter(r=>r.on):state.items.filter(r=>r.on&&scope(r)&&(r.id!=='steel2'||state.items.find(x=>x.id==='steel')?.on));
 const mode=r=>r.priceMode||'priced';
 const term=state.terms.find(r=>r.name==='الحليات');
 const effective=r=>!r||r.on===false||['غير موجود','لا يُذكر'].includes(r.value)?'':r.value==='كتابة يدوية'?String(r.manual||'').trim():r.value;
 const linked=state.path==='execution'&&effective(term)==='تُحاسب بالمتر الطولي وبنفس سعر تركيب المتر المسطح للألواح.';
 const panels=state.items.filter(r=>['roof','wall'].includes(r.id)&&r.on&&scope(r)==='تركيب فقط'&&mode(r)==='priced');
 const panel=linked?(panels.find(r=>r.id===state.trimSource)||(panels.length===1?panels[0]:null)):null;
 const round=v=>Math.round((v+Number.EPSILON)*scale)/scale;
 const lines=active.map(r=>{check(['priced','free','included'].includes(mode(r)),'طريقة تسعير غير صالحة');const rate=mode(r)!=='priced'?0:r.id==='trims'&&scope(r)==='تركيب فقط'&&panel?panel.rate:r.rate;return {id:r.id,description:String(r.name||''),unit:String(r.unit||''),qty:n(r.qty),unitPrice:n(rate),amount:round(n(r.qty)*n(rate)),included:true};});
 const subtotal=lines.reduce((a,r)=>a+Math.round(r.amount*scale),0),discount=Math.min(Math.round(n(state.discount)*scale),subtotal),net=subtotal-discount;
 const vat=state.vat?Math.round(net*n(state.vatRate)/100):0,stamp=state.stamp?Math.round(net*n(state.stampRate)/100):0;
 check(!state.vat||state.vatRate<=100,'نسبة ضريبة غير صالحة');check(!state.stamp||state.stampRate<=100,'نسبة دمغة غير صالحة');
 const total=(net+vat+stamp)/scale;check(Number.isSafeInteger(net+vat+stamp),'القيمة تتجاوز الحد المدعوم');
 return {subtotal:subtotal/scale,discount:discount/scale,net:net/scale,vat:vat/scale,stamp:stamp/scale,total,lines};
}
function saveDocument(d,u,b) {
 allowed(u,'commercial',true);const a=writable(d);revision(a.commercial.revision,b.baseRevision);
 check(b.draft?.schema==='ronix-commercial-draft'&&b.draft.version===1007,'اختر مسودة 1007 صحيحة');
 const old=a.commercial.documents.find(x=>x.id===b.id);check(!old||old.status==='draft','المستند المعتمد ثابت. أنشئ مراجعة مستقلة.',409);
 const state=b.draft.state,totals=amounts(state);check(typeof state.reference==='string'&&state.reference.trim(),'رقم المستند مطلوب');
 check(!old||old.draft.state.kind===state.kind,'تحويل العرض إلى عقد يحتاج نسخة عقد مستقلة',409);
 check(!a.commercial.documents.some(x=>x.id!==b.id&&x.draft.state.reference===state.reference),'رقم المستند مستخدم بالفعل',409);
 const p=d.data.find(p=>p.id===b.projectId&&!p.removedAt);check(p,'اختر مشروعًا موجودًا');
 const c=d.masters.customers.find(c=>c.id===(p.customerId||b.customerId)&&c.active!==false&&!c.removedAt);check(c,'اختر عميلًا موجودًا');
 check(state.client===c.name&&state.project===p.name,'اسم العميل والمشروع يجب أن يطابق السجل المرتبط');
 check(!old||old.projectId===p.id&&old.customerId===c.id,'لا يمكن نقل مستند محفوظ إلى مشروع أو عميل آخر',409);
 if(b.parentId){const parent=a.commercial.documents.find(x=>x.id===b.parentId);check(parent&&parent.projectId===p.id&&parent.customerId===c.id,'مرجع التحويل لا يطابق المشروع والعميل');}
 const doc={id:old?.id||'U-'+crypto.randomUUID(),projectId:p.id,customerId:c.id,parentId:old?.parentId||b.parentId||'',status:'draft',draft:copy(b.draft),totals,updatedAt:new Date().toISOString(),updatedBy:u.id};
 if(old)a.commercial.documents[a.commercial.documents.indexOf(old)]=doc;else a.commercial.documents.push(doc);
 a.commercial.revision++;return {revision:a.commercial.revision,document:copy(doc)};
}
function paymentAmounts(state) {
 const t=amounts(state).total,scale=state.currency==='EGP'?1:100,units=Math.round(t*scale);
 const basis=state.payments.map(p=>Math.round(p.percent*100));
 check(basis.reduce((a,b)=>a+b,0)===10000,'مجموع نسب الدفعات يجب أن يكون 100%');
 const parts=basis.map((p,i)=>({i,value:units*p/10000})),out=parts.map(p=>Math.floor(p.value)),remaining=units-out.reduce((a,b)=>a+b,0),order=[...parts].sort((a,b)=>(b.value%1)-(a.value%1));
 for(let i=0;i<remaining;i++)out[order[i%order.length].i]++;
 return out.map(n=>n/scale);
}
function approve(d,u,b) {
 allowed(u,'approve',true);const a=writable(d);revision(a.commercial.revision,b.baseRevision);
 const doc=a.commercial.documents.find(x=>x.id===b.id);check(doc&&doc.status==='draft','المستند غير متاح للاعتماد');
 const s=doc.draft.state,t=amounts(s);check(!s.example&&t.total>0&&t.lines.length&&t.lines.every(l=>l.qty>0&&l.description&&l.unit),'أكمل المستند قبل اعتماده');
 check(R.dateOK(s.date),'تاريخ المستند غير صالح');check(s.discount<=t.subtotal,'الخصم يتجاوز مجموع البنود');
 check(s.payments.length&&s.payments.every(p=>typeof p.percent==='number'&&Number.isFinite(p.percent)&&p.percent>=0&&p.percent<=100&&Math.abs(p.percent*100-Math.round(p.percent*100))<1e-6&&String(p.label||'').trim())&&s.payments.reduce((v,p)=>v+Math.round(p.percent*100),0)===10000,'يجب أن يكون مجموع الدفعات 100% وبمنزلتين للنسب');
 check(!d.commercial[s.kind==='quote'?'quotes':'contracts'].some(x=>x.id!==doc.id&&x.number===s.reference),'رقم المستند مستخدم في البرنامج الأساسي',409);
 // The full approved editor state stays immutable; technical scope references exact item IDs.
 const native={id:doc.id,projectId:doc.projectId,customerId:doc.customerId,client:s.client,projectName:s.project,number:s.reference,date:s.date,contractDate:s.date,currency:s.currency,language:s.lang,status:s.kind==='quote'?'approved':'active',revision:s.revision,lines:t.lines.map(l=>({...l,qty:l.qty,unitPrice:l.unitPrice})),integrated1007:{total:t.total,sourceId:doc.id,state:copy(s)},terms:'',exclusions:'',quoteId:s.kind==='contract'&&a.commercial.documents.find(x=>x.id===doc.parentId)?.draft.state.kind==='quote'?doc.parentId:''};
 const schedule=s.payments.map((p,i)=>({id:doc.id+'-M'+i,label:p.label,percent:p.percent,trigger:p.label,startRequired:i===0}));
 if(s.kind==='quote')native.paymentSchedule=schedule;else native.schedule=schedule;
 d.commercial[s.kind==='quote'?'quotes':'contracts'].push(native);
 doc.status='approved';doc.approvedAt=new Date().toISOString();doc.approvedBy=u.id;doc.totals=t;a.commercial.revision++;
 return {revision:a.commercial.revision,document:copy(doc)};
}
function link(d,u,b) {
 allowed(u,'finance',true);const a=writable(d);revision(a.finance.revision,b.baseRevision);
 check(d.data.some(p=>p.id===b.projectId&&!p.removedAt),'المشروع غير موجود');
 const fp=a.finance.payload?.projects.find(p=>p.code===b.financeCode);check(fp,'المشروع المالي غير موجود');
 check(!a.links.some(l=>l.projectId===b.projectId||l.financeCode===b.financeCode),'أحد المشروعين مرتبط بالفعل',409);
 const p=d.data.find(p=>p.id===b.projectId),customer=d.masters.customers.find(c=>c.id===p.customerId);
 check(customer&&R.normName(fp.client)===R.normName(customer.name),'طابق عميل المشروعين قبل الربط');
 a.links.push({projectId:p.id,financeCode:fp.code,createdAt:new Date().toISOString(),createdBy:u.id});a.finance.revision++;
 return {revision:a.finance.revision,links:copy(a.links)};
}
function handoff(d,u,b) {
 allowed(u,'finance',true);const a=writable(d);revision(a.commercial.revision,b.baseRevision);
 const doc=a.commercial.documents.find(x=>x.id===b.id);check(doc?.status==='approved'&&doc.draft.state.kind==='contract','اختر عقدًا معتمدًا');
 const native=d.commercial.contracts.find(x=>x.id===doc.id);check(native&&['active','approved'].includes(native.status)&&!native.removedAt&&!native.documentArchived,'العقد أُلغي أو أُرشف في البرنامج الأساسي؛ لا يمكن إرساله للحسابات',409);
 const existing=a.links.find(x=>x.projectId===doc.projectId);
 if(existing){const fp=a.finance.payload?.projects.find(p=>p.code===existing.financeCode);check(fp?.unifiedSourceId===doc.id,'المشروع مرتبط بحسابات موجودة؛ راجعها دون إنشاء عقد أو رصيد ثانٍ',409);return {revision:a.finance.revision,replayed:true,financeCode:existing.financeCode};}
 revision(a.finance.revision,b.financeRevision);
 const s=doc.draft.state,rate=s.currency==='EGP'?1:R.rate(b.rate);
 const payload=a.finance.payload?copy(a.finance.payload):R.normalize({projects:[],assignments:[],payments:[]});
 check(!payload.projects.some(p=>p.code===doc.projectId),'كود المشروع موجود في الحسابات. اربط السجل الموجود بعد مراجعته.',409);
 const original=doc.totals.total;
 payload.projects.push({code:doc.projectId,name:s.project,client:s.client,contract:R.fx(original,rate),originalContract:original,contractCurrency:s.currency,contractRate:rate,state:'نشط',kind:s.path==='engineering'?'هندسي':'تنفيذ',unifiedSourceId:doc.id,note:'مرجع العقد: '+s.reference});
 if(!payload.customers.some(c=>R.normName(c.name)===R.normName(s.client)))payload.customers.push({id:doc.customerId,name:s.client,phone:'',email:'',note:''});
 a.finance={revision:a.finance.revision+1,payload:validateFinance(payload),updatedAt:new Date().toISOString(),updatedBy:u.id};
 a.links.push({projectId:doc.projectId,financeCode:doc.projectId,sourceDocumentId:doc.id,createdAt:new Date().toISOString(),createdBy:u.id});
 return {revision:a.finance.revision,financeCode:doc.projectId};
}
function projection(d,p) {
 const a=root(d),l=a.links.find(l=>l.projectId===p.id),f=a.finance.payload;if(!l||!f)return null;
 const fp=f.projects.find(x=>x.code===l.financeCode);if(!fp)return null;
 const value=R.projectBookTotal(fp),invoiced=R.sum(f.claims.filter(c=>R.active(c)),c=>R.claimAmount(c,l.financeCode));
 const paid=R.sum(f.clientReceipts.filter(r=>r.code===l.financeCode)),allocated=R.sum(f.claimSettlements.filter(s=>s.code===l.financeCode));
 const outstanding=Math.max(0,R.delta(invoiced,allocated)),advance=Math.max(0,R.delta(paid,allocated)),unbilled=Math.max(0,R.delta(value,invoiced)),uncollected=Math.max(0,R.delta(value,paid));
 const vendorOutstanding=R.sum(f.assignments.filter(x=>x.code===l.financeCode),x=>Math.max(0,R.delta(R.assignmentTotal(x),R.sum(f.payments.filter(y=>y.code===l.financeCode&&y.designer===x.designer)))));
 const blockers=[];
 if(outstanding)blockers.push('مطالبات غير محصلة: '+outstanding);
 if(advance)blockers.push('قبض غير مخصص للمطالبات: '+advance);
 if(unbilled)blockers.push('قيمة لم تصدر عنها مطالبات: '+unbilled);
 if(vendorOutstanding)blockers.push('مستحقات مصممين غير مسددة: '+vendorOutstanding);
 if(!fp.unifiedSourceId||!a.commercial.documents.some(x=>x.id===fp.unifiedSourceId&&x.status==='approved'))blockers.push('طابق مرجع العقد المعتمد مع الحسابات قبل الإقفال');
 const source=a.commercial.documents.find(x=>x.id===fp.unifiedSourceId);
 if(source&&(source.projectId!==p.id||source.draft.state.kind!=='contract'))blockers.push('مرجع العقد لا يطابق المشروع');
 if(source&&(source.draft.state.currency!==R.projectCurrency(fp)||R.cents(source.totals.total)!==R.cents(R.projectOriginalTotal(fp))))blockers.push('قيمة الحسابات أو عملتها تختلف عن العقد؛ راجع التعديلات المعتمدة');
 if(Number(p.paid)||Number(p.invoice)||d.customerReceipts.some(r=>r.projectId===p.id)||d.ops.claims.some(c=>c.projectId===p.id))blockers.push('توجد سجلات مالية قديمة؛ يلزم فحص النقل والمطابقة قبل الإقفال');
 if((d.masters.vendorBills||[]).some(b=>b.projectId===p.id&&!['void','cancelled'].includes(b.status)&&Number(b.amount)>Number(b.paid||0)))blockers.push('فواتير موردين قديمة غير مسددة');
 return {currency:'EGP',contractCurrency:R.projectCurrency(fp),originalValue:R.projectOriginalTotal(fp),value,invoiced,paid,outstanding,advance,unbilled,uncollected,vendorOutstanding,retention:0,bookedReceipts:paid,closeBlockers:blockers,canFinancialClose:!blockers.length,closureNeedsReview:!!p.financialClosed&&!!blockers.length,financialClosed:!!p.financialClosed&&!blockers.length,recordedFinancialClosed:!!p.financialClosed,followUp:copy(p.followUp||{}),customerId:p.customerId||'',contractId:fp.unifiedSourceId||'',sourceId:fp.unifiedSourceId||'',sourceType:'contract',sourceNumber:a.commercial.documents.find(x=>x.id===fp.unifiedSourceId)?.draft.state.reference||'',schedule:[],operationalClosed:!!p.operationalClosed,reconciliation:false,source:'approved-v20',financeCode:l.financeCode};
}
function syncIdentity(d,previous) {
 const a=d.extensions?.unified,old=root(previous);if(!a?.finance.payload)return;
 const before=JSON.stringify(a.finance.payload),Clients=require('./finance-v20-clients');
 for(const l of a.links){
  const p=d.data.find(p=>p.id===l.projectId),fp=a.finance.payload.projects.find(p=>p.code===l.financeCode);
  check(p&&fp,'لا تحذف سجلًا مرتبطًا من أحد الأقسام؛ استخدم الأرشفة');
  const prior=previous.data.find(x=>x.id===p.id),oldFP=old.finance.payload?.projects.find(x=>x.code===fp.code);if(!prior||!oldFP)continue;
  const coreRenamed=p.name!==prior.name,financeRenamed=fp.name!==oldFP.name;
  check(!(coreRenamed&&financeRenamed&&p.name!==fp.name),'تعارض في اسم المشروع بين القسمين',409);
  if(financeRenamed&&!coreRenamed)p.name=fp.name;else fp.name=p.name;
  const customer=d.masters.customers.find(c=>c.id===p.customerId),oldCustomer=previous.masters.customers.find(c=>c.id===prior.customerId);if(!customer||!oldCustomer)continue;
  const fc=Clients.sync(a.finance.payload).customers.find(c=>c.name===oldFP.client);
  if(fp.client!==oldFP.client&&customer.name===oldCustomer.name){
   const oldFC=old.finance.payload.customers.find(c=>c.name===oldFP.client),renamed=oldFC&&a.finance.payload.customers.find(c=>c.id===oldFC.id&&c.name===fp.client);
   if(renamed){check(!d.masters.customers.some(c=>c.id!==customer.id&&c.name===renamed.name),'اسم العميل موجود في البرنامج؛ راجع التطابق قبل الدمج',409);customer.name=renamed.name;for(const project of d.data)if(project.customerId===customer.id)project.client=customer.name;}
   else {const target=d.masters.customers.find(c=>c.name===fp.client);check(target,'أضف العميل في البرنامج الأساسي أولًا، أو غيّر الاسم من دليل العملاء',409);p.customerId=target.id;p.client=target.name;}
  }else if(customer.name!==fp.client){
   check(fp.client===oldFP.client||customer.name===fp.client,'تعارض في عميل المشروع؛ راجع السجلين',409);
   if(fc)a.finance.payload=Clients.save(a.finance.payload,{...fc,name:customer.name});
   else fp.client=customer.name;
  }
 }
 if(before!==JSON.stringify(a.finance.payload)&&a.finance.revision===old.finance.revision)a.finance.revision++;
 validateFinance(a.finance.payload);
}
function migration(value,d) {
 const result={readOnly:true,kind:'unknown',warnings:[],matches:[],unmatched:[]};
 if(Array.isArray(value.projects)&&Array.isArray(value.assignments)&&Array.isArray(value.payments)){
  const finance=validateFinance(value);result.kind='finance-v20';result.counts=Object.fromEntries(R.arrays.map(k=>[k,finance[k].length]));
  result.unresolvedMediaReferences=mediaReferences(finance);if(result.unresolvedMediaReferences)result.warnings.push('توجد مرفقات سحابية تحتاج تنزيل الملفات الفعلية قبل النقل.');
  for(const p of finance.projects){const exact=d.data.filter(x=>x.id===p.code);if(exact.length===1)result.matches.push({financeCode:p.code,projectId:exact[0].id,requiresCustomerReview:true});else result.unmatched.push({financeCode:p.code,reason:'لا يوجد كود مشروع مطابق؛ يلزم اختيار يدوي'});}
 }else if(Array.isArray(value.data)&&value.commercial&&value.masters){require('./domain').normalizeBackup(value);result.kind='erp-r42';result.counts={projects:value.data.length,quotes:value.commercial.quotes?.length||0,contracts:value.commercial.contracts?.length||0,customers:value.masters.customers?.length||0};result.warnings.push('استعادة بيانات R42 تتطلب حساب المالك ونسخة احتياطية مستقلة. رموز الدخول ليست جزءًا مضمونًا من ملف البيانات.');}
 else if(value.schema==='ronix-commercial-draft'){amounts(value.state);result.kind='commercial-1007';result.counts={documents:1};result.warnings.push('يجب اختيار المشروع والعميل قبل حفظ المستند في النظام المشترك.');}
 else fail('تنسيق النسخة غير معروف');
 result.warnings.push('هذا فحص فقط؛ لم يتم استيراد أو اعتماد أو تسوية أي سجل.');return result;
}
module.exports={R,root,read,saveFinance,saveDocument,approve,link,handoff,projection,syncIdentity,migration,amounts,paymentAmounts,accounting,commercial};
