'use strict';
(()=>{
 if(!window.RONIX_COMMERCIAL_SCOPE)return;
 const $=id=>document.getElementById(id),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const initial=window.RONIX_LEGACY_INITIAL,projects=initial.commercialProjects||[],params=new URLSearchParams(location.search);
 let projectContext=params.get('project')||'',documentKind=params.get('kind')||'quote';
 function nextNumber(type){const list=commercial[type==='quote'?'quotes':'contracts'],letter=type==='quote'?'Q':'C';let n=Number((initial.nextNumbers[type].match(new RegExp(letter+'-(\\d+)'))||[])[1])||101;while(list.some(x=>x.number===`RNX-${letter}-${n}/${new Date().getFullYear()}`))n++;return `RNX-${letter}-${n}/${new Date().getFullYear()}`;}
 function openDocument(type,id){const doc=commercial[type==='quote'?'quotes':'contracts'].find(x=>x.id===id);if(!doc)return;studio={type,id,projectId:doc.projectId||''};$('commercialStudio').classList.add('show');renderStudio();}
 function inlineCustomer(sel,doc){if(!sel||sel.disabled||sel.parentElement.querySelector('[data-customer-inline32]'))return;const panel=document.createElement('details');panel.dataset.customerInline32='1';panel.innerHTML='<summary>+ إضافة عميل هنا</summary><label>اسم العميل<input data-name32></label><label>الهاتف<input data-phone32></label><button type="button" class="btn" data-save32>حفظ واختيار العميل</button><p role="status"></p>';sel.after(panel);let requestId=crypto.randomUUID();panel.querySelector('button').onclick=async()=>{const button=panel.querySelector('button'),name=panel.querySelector('[data-name32]').value.trim(),status=panel.querySelector('p');if(!name){status.textContent='اكتب اسم العميل';return;}button.disabled=true;try{const r=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json','X-Ronix-CSRF':window.RONIX_SESSION.csrf},body:JSON.stringify({name,phone:panel.querySelector('[data-phone32]').value,requestId,baseRevision:window.RONIX_LEGACY_BRIDGE.revision()})}),j=await r.json();if(!r.ok)throw Error(j.message);window.RONIX_LEGACY_BRIDGE.acceptCustomer(j.customer,j.revision);sel.add(new Option(j.customer.name,j.customer.id));sel.value=j.customer.id;if(doc){doc.customerId=j.customer.id;doc.client=j.customer.name;renderStudioPreview();}panel.open=false;requestId=crypto.randomUUID();status.textContent='تم الحفظ والاختيار';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};}

 function picker(type='quote',pid=projectContext){
  $('projectLinkPicker3921')?.remove();documentKind=type;
  const div=document.createElement('div');div.className='modal show';div.id='projectLinkPicker3921';div.style.zIndex=4000;
  div.innerHTML=`<div class="box"><h3>${type==='contract'?'إنشاء عقد':'إنشاء عرض سعر'} للمشروع الموجود</h3><p>اختر ملف المشروع الذي جهزته. سيبقى الكود والصورة والتاريخ كما هي.</p><div class="field"><label for="projectSearch3921">بحث باسم المشروع أو الكود</label><input id="projectSearch3921" placeholder="مثال: جمالون الرياض أو PRJ-208"></div><div class="field"><label for="existingProject3921">المشروع الموجود</label><select id="existingProject3921"><option value="">اختر المشروع</option>${projects.map(p=>`<option value="${E(p.id)}">${E(p.id+' — '+p.name+(p.draft?' — مسودة':''))}</option>`).join('')}</select></div><div class="field"><label for="customer3921">العميل</label><select id="customer3921"><option value="">يحدد لاحقًا قبل التفعيل</option>${masters.customers.filter(c=>c.active!==false).map(c=>`<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}</select></div><p id="existingDocs3921"></p><div class="actions"><button id="openEditor3921" class="btn primary">فتح محرر المستند</button><button id="cancelPicker3921" class="btn">إلغاء</button><button id="newProject3921" class="btn">مشروع جديد مستقل</button></div></div>`;
  document.body.append(div);$('existingProject3921').value=pid;
  function changed(){const p=projects.find(x=>x.id===$('existingProject3921').value);$('customer3921').value=p?.customerId||'';$('customer3921').disabled=!!p?.customerId;const docs=commercial[type==='quote'?'quotes':'contracts'].filter(d=>d.projectId===p?.id&&!d.removedAt&&!d.documentArchived&&!d.parentContractId&&!d.changeOrderDraft&&d.status!=='cancelled');$('existingDocs3921').textContent=docs.length?'يوجد مستند لهذا المشروع؛ سيتم فتحه لاستكماله.':'';}
  $('existingProject3921').onchange=()=>{changed();inlineCustomer($('customer3921'));};changed();inlineCustomer($('customer3921'));
  $('projectSearch3921').oninput=()=>{const q=$('projectSearch3921').value.trim().toLowerCase();for(const o of $('existingProject3921').options)o.hidden=!!o.value&&!o.text.toLowerCase().includes(q);};
  $('cancelPicker3921').onclick=()=>div.remove();$('newProject3921').hidden=window.RONIX_SESSION.user.role==='Accountant';$('newProject3921').onclick=()=>{div.remove();parent.postMessage({type:'ronix-create-project',kind:type},location.origin)};
  $('openEditor3921').onclick=()=>{
   const p=projects.find(x=>x.id===$('existingProject3921').value);if(!p)return toast('اختر المشروع الموجود');
   const old=commercial[type==='quote'?'quotes':'contracts'].find(d=>d.projectId===p.id&&!d.removedAt&&!d.documentArchived&&!d.parentContractId&&!d.changeOrderDraft&&d.status!=='cancelled');
   if(old){div.remove();openDocument(type,old.id);return;}
   const customer=masters.customers.find(c=>c.id===$('customer3921').value),q=newQuote(p.id,true);q.id='Q-'+crypto.randomUUID();q.number=nextNumber('quote');q.projectId=p.id;q.projectName=p.name;q.customerId=customer?.id||'';q.client=customer?.name||'';q.status='draft';q.terms=q.terms.replaceAll('\\n','\n');
   let doc=q;if(type==='contract'){const source=commercial.quotes.find(x=>x.projectId===p.id&&x.status==='approved'&&!x.removedAt&&!x.documentArchived);doc=newContractFromQuote(source||q);doc.id='C-'+crypto.randomUUID();doc.number=nextNumber('contract');doc.projectId=p.id;doc.projectName=p.name;if(!source){doc.quoteId='';doc.quoteRef='';doc.contractSource='direct';}}
   commercial[type==='quote'?'quotes':'contracts'].push(doc);div.remove();save();openDocument(type,doc.id);
  };
 }
 const previousRender=window.renderCommercial;
 window.renderCommercial=function(){const x=previousRender.apply(this,arguments);if($('newPipelineQuote')){$('newPipelineQuote').classList.remove('ownerOnly');$('newPipelineQuote').style.display='';}if(!$('newDirectContract3921')){$('newPipelineQuote')?.insertAdjacentHTML('afterend','<button id="newDirectContract3921" class="btn">+ عقد للمشروع الموجود</button>');}return x;};
 const previousWire=window.wireStudio;
 window.wireStudio=function(){const x=previousWire.apply(this,arguments);const type=studio.type,doc=commercial[type==='quote'?'quotes':'contracts'].find(d=>d.id===studio.id);if(!doc)return x;
  if(doc.projectId){for(const el of document.querySelectorAll('[data-q="projectName"],[data-c="projectName"]')){el.readOnly=true;el.title='اسم المشروع من ملف المشروع المرتبط';}}
  if($('r7_quote')){for(const opt of $('r7_quote').options){const q=commercial.quotes.find(x=>x.id===opt.value);if(q&&q.projectId!==doc.projectId)opt.remove();}}
  if(type==='quote'){const input=$('commercialStudio').querySelector('.studioGrid input[disabled]');if(input){const p=projects.find(p=>p.id===doc.projectId);input.outerHTML=`<select id="quoteCustomer3921" ${p?.customerId?'disabled':''}><option value="">يحدد قبل التفعيل</option>${masters.customers.filter(c=>c.active!==false||c.id===doc.customerId).map(c=>`<option value="${E(c.id)}" ${c.id===doc.customerId?'selected':''}>${E(c.name)}</option>`).join('')}</select>`;$('quoteCustomer3921').onchange=()=>{const c=masters.customers.find(c=>c.id===$('quoteCustomer3921').value);doc.customerId=c?.id||'';doc.client=c?.name||'';renderStudioPreview();};}}
  inlineCustomer($('quoteCustomer3921'),doc);
  if($('studioApprove'))$('studioApprove').onclick=()=>window.approveStudio();
  if($('studioSave'))$('studioSave').onclick=async()=>{save();if(await window.RONIX_LEGACY_BRIDGE?.flush())toast('تم حفظ المستند على نفس المشروع ✓');};
  return x;
 };
 const previousApprove=window.approveStudio;
 window.approveStudio=async function(){previousApprove.apply(this,arguments);await window.RONIX_LEGACY_BRIDGE?.flush();};
 const previousConvert=window.newContractFromQuote;
 window.newContractFromQuote=function(q){const c=previousConvert(q);c.projectId=q.projectId||'';c.projectName=projects.find(p=>p.id===q.projectId)?.name||q.projectName;c.number=nextNumber('contract');return c;};
 document.addEventListener('click',e=>{const el=e.target.closest('#newPipelineQuote,#newDirectContract3921');if(!el)return;e.preventDefault();e.stopImmediatePropagation();picker(el.id==='newDirectContract3921'?'contract':'quote');},true);
 setTimeout(()=>{renderCommercial();const id=params.get('document');if(id)openDocument(documentKind,id);else if(params.get('create')==='1')picker(documentKind,projectContext);},450);
})();

/* R3927: live project image in the commercial editor chrome, never alters issued document contents. */
(()=>{
 if(!window.RONIX_COMMERCIAL_SCOPE)return;
 const before=window.renderStudio;
 window.renderStudio=function(){const result=before.apply(this,arguments),host=document.querySelector('#commercialStudio .studioShell');if(!host)return result;
  document.getElementById('studioProjectIdentity3927')?.remove();const doc=commercial[studio.type==='quote'?'quotes':'contracts'].find(d=>d.id===studio.id),p=data.find(p=>p.id===(doc?.projectId||doc?.sourceProjectId||studio.projectId));
  if(p&&window.RONIX_PROJECT_IMAGES){const strip=document.createElement('section');strip.id='studioProjectIdentity3927';strip.className='r27-studio-project';strip.innerHTML=window.RONIX_PROJECT_IMAGES.projectCell(p)+`<small>صورة المشروع الحالية مرتبطة بملفه. لا تغيّر قيمة أو شروط المستند.</small>`;const body=host.querySelector('.studioBody');body?host.insertBefore(strip,body):host.append(strip);}
  return result;
 };
})();
/* Image-only refresh: no full commercial reload and no edits to document fields. */
(()=>{
 if(!window.RONIX_COMMERCIAL_SCOPE)return;
 let loading=false;
 async function refreshProjectPhotos3927(){
  if(loading||document.hidden)return;
  loading=true;
  try{const response=await fetch('/api/project-images/meta',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const payload=await response.json(),registry=window.RONIX_PROJECT_IMAGES;
   if(!registry)return;
   for(const m of payload.projects||[]){const p=data.find(p=>p.id===m.id);if(!p)continue;const old=registry.images[m.id];
    if(m.imageAvailable&&old?.updatedAt===m.imageRevision&&old?.src)continue;
    if(!m.imageAvailable&&!old)continue;
    if(m.imageAvailable)registry.images[m.id]={...(old||{}),src:'/api/project-image/'+encodeURIComponent(m.id)+'?v='+encodeURIComponent(m.imageRevision),name:m.name,updatedAt:m.imageRevision};else delete registry.images[m.id];
    document.querySelectorAll('.r17-thumb').forEach(el=>{if((el.dataset.r17ViewImage||el.dataset.r17OpenProject)!==m.id)return;el.outerHTML=registry.thumb(m.id,el.classList.contains('r17-mini'));});
    const full=document.querySelector('#r17FullImage');if(full&&document.querySelector('#r17FullModal.show')&&document.querySelector('#r17FullTitle')?.textContent.startsWith(m.id+' —'))full.src=registry.src(m.id)||'';
   }
  }catch(_){/* The standard host connection status handles connectivity; do not erase the last visible image. */}
  finally{loading=false;}
 }
 window.RONIX_REFRESH_PROJECT_PHOTOS3927=refreshProjectPhotos3927;
 setInterval(refreshProjectPhotos3927,15000);
 window.addEventListener('focus',refreshProjectPhotos3927);
})();

/* The commercial editor receives intentionally zeroed financial project fields.
 * Do not present those transport placeholders as actual balances. Live balances
 * remain in the authorized collections view, not duplicated in this editor. */
(()=>{if(!window.RONIX_COMMERCIAL_SCOPE)return;
 const before=window.renderCommercial;window.renderCommercial=function(){const result=before.apply(this,arguments),host=document.getElementById('commercialKpis');if(host){[...host.children].slice(3).forEach(x=>x.remove());host.classList.add('r27-commercial-counts');if(!document.getElementById('commercialFinanceLink3927')){const note=document.createElement('div');note.id='commercialFinanceLink3927';note.className='r27-commercial-note';note.innerHTML='<span>هذه الشاشة للعروض والعقود. أرصدة المشاريع والقبض تُراجع من كشف الحساب الفعلي.</span><button type="button" class="btn small">فتح المطالبات والتحصيل</button>';note.querySelector('button').onclick=()=>parent.postMessage({type:'ronix-navigate',page:'collections'},location.origin);host.after(note);}}return result;};})();
