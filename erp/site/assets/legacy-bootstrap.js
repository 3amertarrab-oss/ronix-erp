'use strict';
(()=>{
 const x=new XMLHttpRequest();x.open('GET','/api/session',false);x.send();if(x.status!==200)throw Error('انتهت الجلسة؛ أعد تسجيل الدخول من الصفحة الرئيسية')
 window.RONIX_SESSION=JSON.parse(x.responseText);window.RONIX_COMMERCIAL_SCOPE=new URLSearchParams(location.search).get('section')==='commercial';if(!['Owner','Accountant','Project Manager'].includes(window.RONIX_SESSION.user.role))throw Error('هذه الشاشة غير متاحة لهذا الدور')
 const r=new XMLHttpRequest();r.open('GET',window.RONIX_COMMERCIAL_SCOPE?'/api/commercial-state':'/api/state',false);r.send();if(r.status!==200)throw Error('Financial data unavailable');const payload=JSON.parse(r.responseText);
 // Financial data stays in this iframe's memory; never write it to persistent browser storage.
 const mem={...payload.state,ronixUser:window.RONIX_SESSION.user.id,ronixR4236Migration:JSON.stringify({done:true}),ronixLang:'ar',ronixUILang:'ar'};
 const storage={getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?String(mem[k]):null,setItem:(k,v)=>{mem[k]=String(v);window.RONIX_LEGACY_CHANGED?.(k)},removeItem:k=>{delete mem[k];window.RONIX_LEGACY_CHANGED?.(k)},clear:()=>{throw Error('Reset is disabled in the production workbench')},key:i=>Object.keys(mem)[i]||null,get length(){return Object.keys(mem).length}};
 Object.defineProperty(window,'localStorage',{value:storage,configurable:false});
 window.RONIX_LEGACY_STORE=mem;window.RONIX_LEGACY_INITIAL=payload;window.RONIX_FINANCE_WORKBENCH=true;window.RONIX_NETWORK={active:true,server:true,revision:payload.revision};
})();
