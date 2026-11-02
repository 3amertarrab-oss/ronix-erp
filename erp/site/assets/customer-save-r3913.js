'use strict';
(()=>{
 let pending=false;
 document.addEventListener('click',async e=>{
  const button=e.target.closest('#saveCustomer');if(!button)return;
  e.preventDefault();e.stopImmediatePropagation();if(pending)return;
  const value=id=>document.getElementById(id)?.value.trim()||'';
  const status=document.getElementById('customerSaveStatus3913')||document.createElement('p');
  status.id='customerSaveStatus3913';status.setAttribute('role','status');button.parentElement.before(status);
  pending=true;button.disabled=true;status.textContent='جارٍ حفظ العميل على الخادم…';
  try{
   const data={name:value('mcn'),phone:value('mcp'),email:value('mce'),address:value('mca'),nationalId:value('mcNationalId'),taxNo:value('mcTax'),commercialReg:value('mcCR'),baseRevision:window.RONIX_LEGACY_BRIDGE.revision(),requestId:crypto.randomUUID()};
   const response=await fetch('/api/customers',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Ronix-CSRF':window.RONIX_SESSION.csrf},body:JSON.stringify(data)});
   const result=await response.json();if(!response.ok)throw Error(result.message||'تعذر حفظ العميل');
   window.RONIX_LEGACY_BRIDGE.acceptCustomer(result.customer,result.revision);
   document.getElementById('customerFile').dataset.cid=result.customer.id;
   if(typeof renderCustomers==='function')renderCustomers();
   document.getElementById('customerM').classList.remove('show');
   for(const id of ['mcn','mcp','mce','mca','mcNationalId','mcTax','mcCR']){const input=document.getElementById(id);if(input)input.value=''}
   status.textContent='تم حفظ العميل على الخادم ✓';
  }catch(err){status.textContent='لم يُحفظ العميل: '+err.message;status.style.color='#b42318';}
  finally{pending=false;button.disabled=false}
 },true);
})();
