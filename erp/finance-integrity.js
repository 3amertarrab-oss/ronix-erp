'use strict';
// Transactional guards. Historical amounts are preserved, never reconciled silently.
function validate(d, updates, D) {
 const {assert,hash}=D, n=x=>Number(x)||0;
 function ids(rows,label){assert(Array.isArray(rows),'INVALID_COLLECTION','بيانات غير صالحة: '+label);const seen=new Set();for(const r of rows){assert(r&&typeof r.id==='string'&&r.id.trim()&&!seen.has(r.id),'DUPLICATE_ID','كود مفقود أو مكرر في '+label,409);seen.add(r.id);}}
 for(const key of ['awards','vendorPayments','customerReceipts','journalEntries','projectCostCenters'])if(updates[key])ids(updates[key],key);
 if(updates.masters)for(const key of ['customers','vendors','vendorBills','expenses'])ids(updates.masters[key],key);
 const bills=updates.masters?.vendorBills||d.masters.vendorBills, awards=updates.awards||d.awards, vendors=updates.masters?.vendors||d.masters.vendors;
 for(const b of bills){const old=d.masters.vendorBills.find(x=>x.id===b.id);if(old&&hash(old)===hash(b))continue;
  assert(d.data.some(x=>x.id===b.projectId)&&vendors.some(x=>x.id===b.vendorId),'INVALID_VENDOR_BILL_LINK','حدد مشروعًا وموردًا موجودين لفاتورة المورد',409);
  if(b.awardId){const a=awards.find(x=>x.id===b.awardId);assert(a&&a.projectId===b.projectId&&a.vendorId===b.vendorId,'INVALID_AWARD_BILL_LINK','إسناد المورد يجب أن يخص نفس المشروع ونفس المورد في الفاتورة',409);}
  assert(Number.isSafeInteger(Number(b.amount))&&Number(b.amount)>0&&Number.isSafeInteger(Number(b.paid))&&n(b.paid)>=0&&n(b.paid)<=n(b.amount),'INVALID_BILL_AMOUNT','قيمة الفاتورة والمدفوع يجب أن تكون أعدادًا صحيحة؛ المدفوع لا يتجاوز الفاتورة',409);
  assert(hash(b.corrections||[])===hash(old?.corrections||[]),'BILL_HISTORY_IMMUTABLE','سجل تصحيح الفاتورة محفوظ؛ استخدم زر التصحيح الموثق',409);
  if(old&&(n(old.paid)>0||d.vendorPayments.some(x=>x.billId===old.id))){
   for(const k of ['amount','projectId','vendorId','awardId','date'])assert(hash(b[k]??null)===hash(old[k]??null),'PAID_BILL_LOCKED','الفاتورة لها دفعات؛ غيّر قيمتها من التصحيح الموثق في كشف المشروع، ولا تغيّر مراجعها',409);
   assert(!['void','cancelled'].includes(b.status)||b.status===old.status,'PAID_BILL_LOCKED','لا تلغَ فاتورة لها دفعات دون تسوية موثقة',409);
  }
 }
 for(const a of awards){const old=d.awards.find(x=>x.id===a.id);if(!old||hash(a)===hash(old))continue;for(const b of bills.filter(x=>x.awardId===a.id))assert(b.projectId===a.projectId&&b.vendorId===a.vendorId,'AWARD_HAS_BILLS','الإسناد مرتبط بفواتير؛ لا تغير المشروع أو المورد',409);}
 for(const p of updates.vendorPayments||[]){if(d.vendorPayments.some(x=>x.id===p.id))continue;const b=bills.find(x=>x.id===p.billId);assert(!p.awardId||p.awardId===b?.awardId,'INVALID_VENDOR_PAYMENT_LINK','إسناد الدفعة لا يطابق إسناد الفاتورة',409);assert(/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')&&Number.isFinite(Date.parse(p.date+'T00:00:00Z'))&&new Date(p.date+'T00:00:00Z').toISOString().slice(0,10)===p.date,'INVALID_DATE','تاريخ دفعة المورد غير صحيح');}
 if(!updates.commercial)return;
 for(const kind of ['quotes','contracts']){
  ids(updates.commercial[kind],kind);
  for(const doc of updates.commercial[kind]){
   const old=d.commercial[kind].find(x=>x.id===doc.id);if(old&&hash(old)===hash(doc))continue;
   const field=kind==='quotes'?'paymentSchedule':'schedule', rows=doc[field]||[], before=old?.[field]||[], type=kind==='quotes'?'quote':'contract';ids(rows,'جدول الدفعات');
   const beforeAmounts=old?D.W.milestoneAmounts({type,doc:old}):[], nextAmounts=D.W.milestoneAmounts({type,doc});
   for(const r of before){const used=n(r.claimed)>0||n(r.paid)>0||r.claimId||d.ops.claims.some(x=>x.sourceId===old.id&&x.milestoneId===r.id);if(!used)continue;
    const next=rows.find(x=>x.id===r.id);assert(next,'CLAIM_MILESTONE_LOCKED','لا يمكن حذف دفعة صدرت لها مطالبة أو تخصيص قبض؛ تاريخها ومرجعها محفوظان',409);
    for(const k of ['projectId','customerId'])assert(hash(doc[k]??null)===hash(old[k]??null),'CLAIM_SOURCE_LOCKED','لا تغير مشروع أو عميل مرجع له مطالبة',409);
    assert(nextAmounts.find(x=>x.id===r.id)?.amount===beforeAmounts.find(x=>x.id===r.id)?.amount,'CLAIM_MILESTONE_LOCKED','لا تغير قيمة دفعة صدرت لها مطالبة؛ راجع المستندات المالية أولًا',409);
   }
   for(const r of rows){const prior=before.find(x=>x.id===r.id);for(const k of ['claimed','paid','claimId','claimedAt','claimedBy'])assert(hash(r[k]??null)===hash(prior?.[k]??null)||!prior&&['claimed','paid'].includes(k)&&n(r[k])===0,'CLAIM_LEDGER_IMMUTABLE','إصدار المطالبة وتخصيص القبض من شاشة المطالبات والتحصيل فقط',409);}
  }
 }
}
function correctBill(d,u,p,b,D){
 D.assert(D.FINANCE.has(u.role),'FORBIDDEN','تصحيح الفاتورة للمحاسب أو المالك فقط',403);
 const bill=d.masters.vendorBills.find(x=>x.id===b.billId&&x.projectId===p.id);D.assert(bill,'NOT_FOUND','فاتورة المورد غير موجودة في هذا المشروع',404);
 D.assert(!bill.supplierFlowVersion,'SUPPLIER_CERTIFICATE_LOCKED','هذا مستخلص استلام مورد؛ لا يغير مستقلًا عن سجل الاستلام.',409);
 D.assert(!p.financialClosed,'FINANCIALLY_CLOSED','أعد فتح المتابعة المالية قبل التصحيح',409);
 D.assert(D.hash(bill)===b.expectedHash,'BILL_CONFLICT','تغيرت الفاتورة؛ أعد فتح كشف المشروع',409);
 const amount=Number(b.amount),reason=D.text(b.reason),reference=D.text(b.reference);
 D.assert(Number.isSafeInteger(amount)&&amount>0&&amount>=Number(bill.paid||0),'INVALID_BILL_AMOUNT','قيمة التصحيح لا تقل عن المدفوع وتكون بالجنيه الصحيح');
 D.assert(reason&&reference,'CORRECTION_REASON_REQUIRED','أدخل سبب التصحيح ومرجع المستند المؤيد');
 D.assert(amount!==Number(bill.amount),'NO_CHANGE','لم تتغير قيمة الفاتورة');
 const rec={id:D.uid('BILL-CORRECTION'),at:D.now(),by:u.id,reason,reference,before:{amount:bill.amount,paid:bill.paid,status:bill.status},after:{amount,paid:bill.paid}};
 bill.amount=amount;bill.status=Number(bill.paid)===amount?'paid':Number(bill.paid)>0?'partial':'open';rec.after.status=bill.status;(bill.corrections??=[]).push(rec);
 return {billId:bill.id,correctionId:rec.id,remaining:amount-Number(bill.paid||0)};
}
module.exports={validate,correctBill};
