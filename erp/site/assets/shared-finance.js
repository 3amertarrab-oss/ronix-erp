'use strict';
// Storage adapter only. The approved V20 arithmetic and document templates remain intact.
const R20Cloud={state:{user:null}};
(async()=>{
 let session,revision=0,pending=null,inflight=false,blocked=false,importing=false,timer,catalog,importPreview=null;
 const MAX_IMPORT_BYTES=8*1024*1024;
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bar=document.createElement('section');bar.className='panel';bar.style.cssText='position:sticky;top:0;z-index:30;border:2px solid #b58a48';
 bar.innerHTML='<button class="btn" id="sharedMenu">☰ الأقسام</button><b>حسابات RONIX المشتركة</b> <span id="sharedStatus" role="status">جارٍ التحميل…</span><div class="actions"><button class="btn" id="sharedReload">تحديث</button><button class="btn" id="sharedExport">نسخة من بيانات هذه الشاشة</button><button class="btn" id="sharedLink">ربط مشروع البرنامج</button><button class="btn" id="sharedMigration">دمج نسخة V20 بأمان</button></div><input type="file" accept=".json,application/json" id="sharedFile" hidden><div id="sharedDetails"></div>';
 document.querySelector('.main').prepend(bar);
 const status=t=>bar.querySelector('#sharedStatus').textContent=t;
 async function api(path,body){const r=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Ronix-CSRF':session.csrf},body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok){const e=Error(j.message||'تعذر الاتصال');e.status=r.status;throw e;}return j;}
 function exportLocal(){download('RONIX_V20_SHARED_'+r14Today()+'.json',JSON.stringify(data,null,2),'application/json');}
 async function flush(){
  clearTimeout(timer);if(inflight||blocked||!pending)return;
  inflight=true;const payload=pending;pending=null;status('جارٍ الحفظ على الخادم…');
  try{const result=await api('unified/finance',{baseRevision:revision,payload});revision=result.revision;status('تم الحفظ والمزامنة ✓');}
  catch(e){pending=pending||payload;blocked=true;status(e.status===409?'تعارض: تعديلاتك محفوظة هنا. نزّلها قبل التحديث.':'لم يصل الحفظ للخادم: '+e.message+' — احتفظ بنسخة ثم أعد المحاولة.');}
  finally{inflight=false;if(pending&&!blocked)timer=setTimeout(flush,100);}
 }
 r14Persist=function(next,action='حفظ',details={}){
  try{
   if(importing)throw Error('انتظر اكتمال دمج النسخة قبل تعديل الحسابات.');
   if(blocked)throw Error('الحفظ متوقف. نزّل تعديلاتك قبل تحديث النسخة.');
   const linked=R16.reconcile(next),checked=R19.sync(R18Clients.sync(linked.data));
   checked.schemaVersion=19;checked.currency='EGP';
   const previousLinks=JSON.parse(r14Saved).claimSettlements||[];
   if(JSON.stringify(previousLinks)!==JSON.stringify(checked.claimSettlements))checked.auditTrail.push({id:r14Id('AUD'),at:new Date().toISOString(),action:'تحديث ربط التحصيل بالمطالبات',before:previousLinks,after:R14.copy(checked.claimSettlements)});
   checked.auditTrail.push({id:r14Id('AUD'),at:new Date().toISOString(),action,...details});
   pending=R14.validate(checked);data=checked;r14Saved=JSON.stringify(checked);clearTimeout(timer);timer=setTimeout(flush,250);status('تعديلات بانتظار المزامنة…');return true;
  }catch(e){r14Failures++;status(e.message);alert(e.message);return false;}
 };
 save=function(){return r14Persist(data);};
 async function refresh(force=false){
  if(inflight)return false;
  if((pending||blocked)&&!force)return false;
  const pendingAtStart=pending,blockedAtStart=blocked;
  const result=await api('unified/finance');
  if(inflight||pending!==pendingAtStart||blocked!==blockedAtStart)return false;
  catalog=result;
  data=result.payload?R19.sync(R18Clients.sync(result.payload)):r14Empty();revision=result.revision;r14Saved=JSON.stringify(data);pending=null;blocked=false;render();status('متصل — النسخة '+revision);
  return true;
 }
 bar.querySelector('#sharedMenu').onclick=()=>document.querySelector('.side').classList.toggle('r20-open');
 document.querySelector('.side').addEventListener('click',e=>{if(e.target.closest('.nav'))document.querySelector('.side').classList.remove('r20-open');});
 bar.querySelector('#sharedExport').onclick=exportLocal;
 bar.querySelector('#sharedReload').onclick=async()=>{if((pending||blocked)&&!confirm('ستفقد التعديلات غير المحفوظة في هذه الشاشة. نزّل نسخة أولًا. هل تريد فتح أحدث نسخة من الخادم؟'))return;try{await refresh(true);}catch(e){status(e.message);}};
 bar.querySelector('#sharedLink').onclick=()=>{
  const host=bar.querySelector('#sharedDetails');
  host.innerHTML='<label>مشروع البرنامج<select id="erpProject">'+catalog.projects.map(p=>`<option value="${E(p.id)}">${E(p.id+' — '+p.name)}</option>`).join('')+'</select></label><label>مشروع الحسابات<select id="financeProject">'+data.projects.map(p=>`<option value="${E(p.code)}">${E(p.code+' — '+p.name)}</option>`).join('')+'</select></label><button class="btn" id="confirmLink">ربط السجلين الموجودين</button><p>الربط يتطلب نفس العميل. لا ينشئ أي قبض أو مطالبة ولا يجمع أرصدة النسختين.</p>';
  host.querySelector('#confirmLink').onclick=async()=>{try{await flush();if(pending||blocked||inflight)throw Error('أكمل حفظ الحسابات أولًا');const r=await api('unified/link',{baseRevision:revision,projectId:host.querySelector('#erpProject').value,financeCode:host.querySelector('#financeProject').value});revision=r.revision;host.textContent='تم ربط المشروعين ✓';}catch(e){status(e.message);}};
 };
 const countConflicts=value=>{if(Array.isArray(value))return value.length;if(value&&typeof value==='object')return Number.isFinite(Number(value.count))?Number(value.count):Object.values(value).reduce((n,x)=>n+countConflicts(x),0);return Number(value)||0;};
 const summaryValue=value=>E(JSON.stringify(value??{},null,2));
 const summaryBox=(title,value)=>'<div><b>'+E(title)+'</b><pre style="margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left">'+summaryValue(value)+'</pre></div>';
 const conflictBox=(value,total)=>{
  if(!Array.isArray(value))return summaryBox('التعارضات · conflicts',value);
  if(!value.length)return '<div><b>التعارضات</b><p style="margin:8px 0 0;color:#087c69">لا توجد تعارضات.</p></div>';
  const shown=value.slice(0,100);
  return '<div style="grid-column:1/-1"><b>التعارضات ('+E(total)+')</b><div style="overflow:auto;margin-top:8px"><table style="width:100%;table-layout:fixed"><thead><tr><th style="width:52px">#</th><th>المجموعة</th><th>المفتاح</th><th>السبب</th></tr></thead><tbody>'+shown.map((item,index)=>'<tr><td>'+E(index+1)+'</td><td style="overflow-wrap:anywhere">'+E(item?.collection||'—')+'</td><td style="overflow-wrap:anywhere">'+E(item?.key||'—')+'</td><td style="overflow-wrap:anywhere">'+E(item?.reason||'—')+'</td></tr>').join('')+'</tbody></table></div>'+(total>shown.length?'<p>يعرض أول '+E(shown.length)+' من '+E(total)+' تعارضًا.</p>':'')+'</div>';
 };
 const ensureImportRequest=value=>{if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_IMPORT_BYTES)throw Error('حجم نسخة الدمج بعد تجهيزها للإرسال يتجاوز 8 MB');return value;};
 async function previewImport(file){
  if(!file)return;if(file.size>MAX_IMPORT_BYTES)throw Error('ملف الدمج أكبر من 8 MB');
  if(!/\.json$/i.test(file.name)&&file.type!=='application/json')throw Error('اختر نسخة V20 بصيغة JSON');
  let backup;try{backup=JSON.parse(await file.text())}catch(_){throw Error('ملف JSON غير صالح')}
  await flush();if(pending||blocked||inflight)throw Error('أكمل حفظ تعديلات الحسابات الحالية أو نزّل نسخة منها قبل الدمج');
  // A successful finance save advances the app revision as well as the finance
  // revision. Refresh here so the read-only preview is based on that saved
  // state instead of an older catalog revision retained by the page.
  if(!await refresh())throw Error('تغيرت الحسابات أثناء التحديث؛ أعد اختيار الملف بعد اكتمال الحفظ');
  if(!Number.isInteger(catalog?.baseRevision))throw Error('تعذر تحديد إصدار البيانات الحالي؛ أعد التحديث قبل الدمج');
  status('جارٍ فحص نسخة V20 دون كتابة…');
  const report=await api('unified/finance-import-preview',ensureImportRequest({backup,baseRevision:catalog.baseRevision})),conflicts=countConflicts(report.conflicts),added=Number(report.totals?.records?.add??countConflicts(report.add)),host=bar.querySelector('#sharedDetails');
  importPreview={backup,report,baseRevision:report.baseRevision??catalog?.baseRevision,financeRevision:report.financeRevision??revision};
  let commitSizeError='';if(!conflicts)try{ensureImportRequest({backup,baseRevision:importPreview.baseRevision,financeRevision:importPreview.financeRevision,importHash:report.importHash,previewHash:report.previewHash,confirm:true})}catch(e){commitSizeError=e.message}
  host.innerHTML='<section style="width:100%;margin-top:10px;padding:12px;border:1px solid #d7e1ec;border-radius:10px;background:#fff"><h3 style="margin:0 0 8px">معاينة دمج V20 — لا كتابة حتى الآن</h3><p><b>الملف:</b> '+E(file.name)+'</p><p>الفحص لم يكتب شيئًا. عند التأكيد ستُضاف السجلات الجديدة فقط، ولن يُحذف أو يُستبدل أي سجل حالي.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'+summaryBox('الأعداد · counts',report.counts)+summaryBox('سيُضاف · add',report.add)+summaryBox('المتطابق · identical',report.identical)+summaryBox('الإجماليات · totals',report.totals)+conflictBox(report.conflicts,conflicts)+'</div><p><b>بصمة الاستيراد:</b> <code style="overflow-wrap:anywhere">'+E(report.importHash||'—')+'</code></p>'+(conflicts?'<p style="color:#a12635;font-weight:700">الدمج ممنوع: عالج '+E(conflicts)+' تعارضًا أولًا. لم تتغير البيانات.</p>':commitSizeError?'<p role="alert" style="color:#a12635;font-weight:700">'+E(commitSizeError)+'. لم تتغير البيانات.</p>':added?'<button class="btn primary" id="confirmFinanceImport">تأكيد دمج السجلات الجديدة فقط ('+E(added)+')</button>':'<p style="color:#087c69;font-weight:700">هذه النسخة موجودة بالكامل؛ لا توجد سجلات جديدة للدمج.</p>')+'</section>';
  if(!conflicts&&!commitSizeError&&added)host.querySelector('#confirmFinanceImport').onclick=async()=>{
   const button=host.querySelector('#confirmFinanceImport');button.disabled=true;
   try{const p=importPreview;if(!p||pending||blocked||inflight||revision!==p.financeRevision){importPreview=null;throw Error('تغيرت الحسابات بعد المعاينة؛ اختر الملف وأعد المعاينة قبل الدمج')}importing=true;bar.setAttribute('aria-busy','true');const r=p.report,result=await api('unified/finance-import-commit',ensureImportRequest({backup:p.backup,baseRevision:p.baseRevision,financeRevision:p.financeRevision,importHash:r.importHash,previewHash:r.previewHash,confirm:true}));revision=result.financeRevision??result.revision??revision;importPreview=null;await refresh(true);host.textContent='تم دمج السجلات الجديدة بعد إعادة الفحص ✓';status('تم الدمج الآمن والمزامنة ✓');}
   catch(e){status(e.message);if(e.status===409||!importPreview){importPreview=null;button.remove();host.querySelector('section')?.insertAdjacentHTML('beforeend','<p role="alert" style="color:#a12635;font-weight:700">'+E(e.message)+' — اختر الملف وأعد المعاينة.</p>')}else button.disabled=false;}
   finally{importing=false;bar.removeAttribute('aria-busy');}
  };
  status(conflicts?'المعاينة اكتملت — الدمج ممنوع لوجود تعارضات':commitSizeError?commitSizeError:added?'المعاينة اكتملت — راجع ثم أكد الدمج':'المعاينة اكتملت — لا توجد سجلات جديدة');
 }
 async function selectImport(input){const file=input.files?.[0];input.value='';if(!file)return;try{await previewImport(file)}catch(e){importPreview=null;status(e.message);bar.querySelector('#sharedDetails').innerHTML='<p role="alert" style="color:#a12635">تعذر الدمج دون تغيير البيانات: '+E(e.message)+'</p>';}}
 bar.querySelector('#sharedMigration').onclick=()=>bar.querySelector('#sharedFile').click();
 bar.querySelector('#sharedFile').onchange=e=>selectImport(e.target);
 const sharedRestore=input=>selectImport(input);
 window.restoreData=sharedRestore;try{restoreData=sharedRestore}catch(_){}
 const legacyRestore=document.getElementById('restore'),legacyRestoreButton=legacyRestore?.previousElementSibling;
 if(legacyRestore){legacyRestore.accept='.json,application/json';if(legacyRestoreButton?.tagName==='BUTTON')legacyRestoreButton.textContent='↑ دمج JSON آمن';}
 window.addEventListener('beforeunload',e=>{if(pending||inflight||blocked||importing){e.preventDefault();e.returnValue='';}});
 try{
  session=await api('session');R20Cloud.state.user={id:session.user.id,email:session.user.role==='Owner'?'3amertarrab@gmail.com':''};
  await refresh();document.body.classList.remove('r20-locked');
  if(new URLSearchParams(location.search).get('page')==='claims')go('claims');
  if(session.user.role!=='Owner')bar.querySelector('#sharedMigration').hidden=true;
  setInterval(async()=>{if(pending||inflight||blocked||document.hidden||document.querySelector('#overlay.open'))return;try{const latest=await api('unified/finance');if(latest.revision!==revision)await refresh();}catch(e){status('تعذر التحديث: '+e.message);}},10000);
 }catch(e){status(e.message);const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=e.message;document.body.prepend(error);document.querySelectorAll('.nav').forEach(b=>b.disabled=true);}
 window.RonixSharedFinance={flush,refresh,revision:()=>revision,dirty:()=>!!pending||inflight||blocked||importing};
})();
