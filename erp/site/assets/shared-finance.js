'use strict';
// Storage adapter only. The approved V20 arithmetic and document templates remain intact.
const R20Cloud={state:{user:null}};
(async()=>{
 let session,revision=0,pending=null,inflight=false,blocked=false,timer,catalog;
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bar=document.createElement('section');bar.className='panel';bar.style.cssText='position:sticky;top:0;z-index:30;border:2px solid #b58a48';
 bar.innerHTML='<button class="btn" id="sharedMenu">☰ الأقسام</button><b>حسابات RONIX المشتركة</b> <span id="sharedStatus" role="status">جارٍ التحميل…</span><div class="actions"><button class="btn" id="sharedReload">تحديث</button><button class="btn" id="sharedExport">نسخة من بيانات هذه الشاشة</button><button class="btn" id="sharedLink">ربط مشروع البرنامج</button><button class="btn" id="sharedMigration">فحص نسخة بيانات</button></div><input type="file" accept=".json,application/json" id="sharedFile" hidden><div id="sharedDetails"></div>';
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
  if(inflight)return;
  if((pending||blocked)&&!force)return;
  const result=await api('unified/finance');catalog=result;
  data=result.payload?R19.sync(R18Clients.sync(result.payload)):r14Empty();revision=result.revision;r14Saved=JSON.stringify(data);pending=null;blocked=false;render();status('متصل — النسخة '+revision);
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
 bar.querySelector('#sharedMigration').onclick=()=>bar.querySelector('#sharedFile').click();
 bar.querySelector('#sharedFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const report=await api('unified/migration-preview',{backup:JSON.parse(await file.text())});bar.querySelector('#sharedDetails').innerHTML='<pre style="white-space:pre-wrap;max-height:320px;overflow:auto">'+E(JSON.stringify(report,null,2))+'</pre>';}catch(e){status(e.message);}};
 window.addEventListener('beforeunload',e=>{if(pending||inflight||blocked){e.preventDefault();e.returnValue='';}});
 try{
  session=await api('session');R20Cloud.state.user={id:session.user.id,email:session.user.role==='Owner'?'3amertarrab@gmail.com':''};
  await refresh();document.body.classList.remove('r20-locked');
  if(new URLSearchParams(location.search).get('page')==='claims')go('claims');
  if(session.user.role!=='Owner')bar.querySelector('#sharedMigration').hidden=true;
  setInterval(async()=>{if(pending||inflight||blocked||document.hidden||document.querySelector('#overlay.open'))return;try{const latest=await api('unified/finance');if(latest.revision!==revision)await refresh();}catch(e){status('تعذر التحديث: '+e.message);}},10000);
 }catch(e){status(e.message);const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=e.message;document.body.prepend(error);document.querySelectorAll('.nav').forEach(b=>b.disabled=true);}
 window.RonixSharedFinance={flush,refresh,revision:()=>revision,dirty:()=>!!pending||inflight||blocked};
})();
