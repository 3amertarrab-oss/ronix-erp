'use strict';
(()=>{
 const loadStarted=performance.now();
 const initial=window.RONIX_LEGACY_INITIAL,mem=window.RONIX_LEGACY_STORE;
 const keys=Object.keys(initial.state).filter(k=>k!=='ronixLegacyArchiveV1');let before={},serverBaseline={...initial.state},revision=initial.revision,ready=false,dirty=false,saving=false,timer=null;
 const allowed=new Set(['commercial','customers','vendors','awards','vendorBillsPage','vendorPaymentsPage','fin','rates']);const requested=new URLSearchParams(location.search).get('section');let current=requested;if(!allowed.has(current))throw Error('الصفحة المطلوبة غير معروفة');
 const projectFields=['id','value','revisedContractValue','invoice','paid','retention','billingPriority','customerId','client','sourceQuoteId','sourceQuoteNumber','sourceContractId','sourceContractNumber','commercialSourceType','costCenterId','followUp','health','healthMode'];
 function comparable(k,value){try{let x=JSON.parse(value||'null');if(k==='ronixv2')x=x.map(p=>Object.fromEntries(projectFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));return JSON.stringify(x)}catch(_){return value}}
 function snapshot(){try{mem.ronixCommercialV3=JSON.stringify(commercial);mem.ronixMastersV31=JSON.stringify(masters);mem.ronixv2=JSON.stringify(data);mem.ronixTimesheets=JSON.stringify(timesheets);if(window.r10Awards)mem.ronixAwardsV1=JSON.stringify(window.r10Awards);if(window.r11VendorPayments)mem.ronixVendorPaymentsV1=JSON.stringify(window.r11VendorPayments);if(window.RONIX_R35){mem.ronixCustomerReceiptsV1=JSON.stringify(window.RONIX_R35.receipts());mem.ronixProjectCostCentersV1=JSON.stringify(window.RONIX_R35.centers());mem.ronixJournalEntriesV1=JSON.stringify(window.RONIX_R35.journals())}}catch(_){}return Object.fromEntries(keys.map(k=>[k,comparable(k,mem[k])]))}
 function tell(message,error=false){if(parent===window)return;parent.postMessage({type:'ronix-legacy-status',message,error,dirty,revision},location.origin)}
 // Keep server-original fields when a legacy renderer merely initializes defaults.
 // Only user-changed fields/records relative to the loaded screen are propagated.
 function userDelta(original,baseline,current){
  if(JSON.stringify(current)===JSON.stringify(baseline))return original;
  if(current===null||typeof current!=='object')return current;
  if(Array.isArray(current)){
   if(current.every(x=>x&&typeof x==='object'&&x.id)&&Array.isArray(baseline)&&Array.isArray(original))return current.map(row=>{const was=baseline.find(x=>x.id===row.id),orig=original.find(x=>x.id===row.id);return was&&orig?userDelta(orig,was,row):row});
   return current;
  }
  if(!baseline||typeof baseline!=='object'||!original||typeof original!=='object')return current;
  const out={...original};for(const key of new Set([...Object.keys(baseline),...Object.keys(current)])){
   if(!(key in current)){if(key in baseline)delete out[key];continue}
   const value=userDelta(original[key],baseline[key],current[key]);if(value===undefined)delete out[key];else out[key]=value;
  }return out;
 }
 function changes(){const next=snapshot(),out={};for(const k of keys){if(['ronixTimesheets','ronixTeamUsersV1','ronixProjectImagesV1','ronixRates'].includes(k))continue;if(window.RONIX_COMMERCIAL_SCOPE&&k!=='ronixCommercialV3')continue;if(next[k]!==before[k]){try{out[k]=JSON.stringify(userDelta(JSON.parse(serverBaseline[k]||'null'),JSON.parse(before[k]||'null'),JSON.parse(next[k]||'null')))}catch(_){out[k]=next[k]}}}return {next,out}}
 function mark(){if(!ready)return;const c=changes();dirty=Object.keys(c.out).length>0;if(dirty)tell('تغييرات غير محفوظة — اضغط «حفظ على الخادم» قبل مغادرة الشاشة.');}
 window.RONIX_LEGACY_CHANGED=()=>{if(ready){clearTimeout(timer);timer=setTimeout(mark,300)}};
 async function flush(){if(!ready||saving)return false;clearTimeout(timer);mark();const c=changes();if(!Object.keys(c.out).length){dirty=false;tell('لا توجد تغييرات جديدة.');return true}saving=true;tell('جارٍ الحفظ على الخادم…');try{const r=await fetch(window.RONIX_COMMERCIAL_SCOPE?'/api/commercial-state':'/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Ronix-CSRF':window.RONIX_SESSION.csrf},body:JSON.stringify({state:c.out,baseRevision:revision})});const j=await r.json();if(!r.ok)throw Error(j.message||'Save failed');revision=j.revision;before=c.next;Object.assign(serverBaseline,c.out);dirty=false;tell('تم حفظ التغييرات على الخادم ✓');return true;}catch(e){dirty=true;tell('لم يحفظ الخادم: '+e.message,true);if(typeof toast==='function')toast(e.message);return false;}finally{saving=false}}
 function route(n){if(allowed.has(n)){current=n;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===n));return}if(ready){parent.postMessage({type:'ronix-navigate',page:n==='log'?'activity':n==='qa'?'diagnostics':n==='eng'?'review':n==='timesheet'?'timesheets':n==='team'?'team':n,projectId:typeof sel==='string'?sel:''},location.origin)}}
 // A single host navigation is visible. No CSS accordion state participates in authorization.
 function finish(){window.page=route;route(current);document.title='RONIX ERP — '+initial.release;window.RONIX_RELEASE=initial.release;const m=document.querySelector('meta[name="ronix-release"]');if(m)m.content=initial.release;document.body.classList.add('legacy-ready');before=snapshot();ready=true;parent.postMessage({type:'ronix-legacy-timing',section:current,ms:performance.now()-loadStarted},location.origin);tell('الشاشة الحالية جاهزة. استخدم أزرارها ثم «حفظ على الخادم».');}
 setTimeout(finish,250);
 // Stop navigation/reset/role-simulation controls from touching live server data.
 document.addEventListener('click',async e=>{
  const start=e.target.closest('[data-start-source]');if(start){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'ronix-start-source',sourceType:start.dataset.startSource,sourceId:start.dataset.sourceId},location.origin);return}
  const link=e.target.closest('[data-link-contract]');if(link){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'ronix-link-contract',contractId:link.dataset.linkContract,projectId:link.dataset.projectId},location.origin);return}
  const removePicture=e.target.closest('[data-r17-remove-image]');if(removePicture){e.preventDefault();e.stopImmediatePropagation();tell('إدارة الصورة من المشاريع والتشغيل؛ لا يحذف هذا العرض صور البيانات',true);return}

  const bad=e.target.closest('#reset,#r31Load,#newP,#newP2,#createP,#exportBackup,#importBackup,#exportSupport,[data-r31-load]');if(bad){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'ronix-navigate',page:bad.id==='newP'||bad.id==='newP2'?'orders':'diagnostics'},location.origin);return}
  if(ready)setTimeout(mark,100);
 },true);
 window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='ronix-save')flush()});
 window.addEventListener('error',e=>tell('خطأ في الشاشة التجارية: '+e.message,true));
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 function acceptCustomer(customer,newRevision){masters.customers.push(customer);revision=newRevision;const next=snapshot();before.ronixMastersV31=next.ronixMastersV31;serverBaseline.ronixMastersV31=next.ronixMastersV31;dirty=Object.keys(changes().out).length>0;tell(dirty?'تم حفظ العميل؛ توجد تعديلات أخرى غير محفوظة.':'تم حفظ العميل على الخادم ✓');if(typeof renderCustomers==='function')renderCustomers();}
 window.RONIX_LEGACY_BRIDGE={flush,changes,ready:()=>ready,revision:()=>revision,acceptCustomer};
})();
