'use strict';
// Explicit, additive scope corrections within the existing agreed price.
// Read models contain no prices; the server checks value preservation itself.
const W=require('./workflow');
const C=require('./controls');
const Commercial=require('./commercial-link');
const crypto=require('node:crypto');
const copy=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const label=l=>(l.serviceCode==='SRV-ST-DETL'?'Full Detailing — ':l.serviceCode==='SRV-ST-DSGN'?'Full Design — ':'')+String(l.description||l.serviceCode||'');
function stamp(s){return s?hash({type:s.type,id:s.doc.id,status:s.doc.status,lines:s.doc.lines,history:s.doc.scopeAmendments||[]}):'';}
function permitted(d,u,p,s){return !!(s&&Commercial.can(u,p)&&!p.operationalClosed&&!p.finalTechnicalApproved&&['active','approved'].includes(s.doc.status)&&!s.doc.documentArchived&&d.ops.orders.some(o=>o.projectId===p.id&&o.status==='issued'));}
function entries(s){
 if(!s)return [];
 return (s.doc.lines||[]).map((line,index)=>{
  const id=[s.type,s.doc.id,'line',line.id||index].join(':');
  return {id,lineId:line.id||'',label:label(line),serviceCode:line.serviceCode||'',included:line.included!==false,
   children:(line.scopeItems||[]).map((x,j)=>({id:id+':scope:'+(x.id||j),itemId:x.id||'',label:[x.ar||x.description||'',x.en||''].filter(Boolean).join(' — ')||x.id||'',included:line.included!==false&&x.included!==false,selected:x.included!==false}))};
 });
}
function view(d,u,p){
 const s=W.source(d,p);if(!s)return {sourceId:'',rows:[],history:[],canCorrect:false};
 const canCorrect=permitted(d,u,p,s),ts=C.leaf(p.tasks).filter(t=>t.required!==false),opts=W.scopeOptions(s);
 const assignment=id=>ts.filter(t=>t.scopeItemId===id).map(t=>({id:t.id,name:t.name,assignee:t.assignee,checker:t.checker||p.checker}));
 const rows=entries(s).map(root=>{
  const direct=assignment(root.id),children=root.children.map(child=>({...child,tasks:[...direct,...assignment(child.id)],covered:direct.length>0||assignment(child.id).length>0,canInclude:canCorrect&&root.included&&!child.selected&&!!child.itemId&&!!root.lineId&&!direct.length}));
  const needed=children.filter(c=>c.included),covered=direct.length>0||(needed.length>0&&needed.every(c=>c.covered));
  const raw=s.doc.lines.find(l=>l.id===root.lineId),sameValue=raw&&Number(raw.qty||0)*Number(raw.unitPrice??raw.rate??0)*(1-Number(raw.discount||0)/100)===0;
  return {...root,tasks:direct,children,covered:root.included&&covered,
   canInclude:canCorrect&&!root.included&&!!root.lineId&&!!sameValue&&Number(raw.qty)>0,
   includeBlocked:!root.included&&!sameValue?'إضافة هذا البند تغير قيمة التعاقد؛ يلزم تعديل تجاري مسعّر، ولا يضاف من تصحيح النطاق.':''};
 });
 return {sourceId:s.doc.id,sourceType:s.type,sourceNumber:s.doc.number,hash:stamp(s),canCorrect,
  rows,history:(s.doc.scopeAmendments||[]).map(r=>({id:r.id,at:r.at,by:r.by,label:r.label,reason:r.reason,reference:r.reference})),
  assigned:opts.filter(x=>!x.parentId).filter(x=>rows.find(r=>r.id===x.id)?.covered).length,
  included:rows.filter(r=>r.included).length};
}
function include(d,u,p,b,D,notify){
 const s=W.source(d,p);D.assert(permitted(d,u,p,s),'SCOPE_CORRECTION_FORBIDDEN','تصحيح النطاق للمالك والمحاسب ومهندس المشروعات المعيّن، قبل الاعتماد النهائي فقط',403);
 D.assert(b.expectedScopeHash===stamp(s),'STALE_SCOPE','تغير نطاق المرجع؛ حدث الشاشة وراجع التعديل',409);
 D.assert(b.confirmWithinAgreedPrice===true,'SCOPE_PRICE_CONFIRMATION','أكد أن البند مشمول بالفعل ضمن السعر المتفق عليه');
 const reason=D.text(b.reason,1000),reference=D.text(b.reference,300);D.assert(reason&&reference,'SCOPE_EVIDENCE_REQUIRED','اكتب سبب التصحيح ومرجع موافقة العميل أو الاتفاق');
 const line=s.doc.lines.find(x=>x.id===b.lineId),item=b.itemId&&(line?.scopeItems||[]).find(x=>x.id===b.itemId);D.assert(line&&(b.itemId?line.included!==false&&item?.included===false:line.included===false),'SCOPE_ALREADY_INCLUDED','البند غير موجود أو مشمول بالفعل',409);
 if(item){D.assert((line.scopeItems||[]).every(x=>x.id)&&new Set(line.scopeItems.map(x=>x.id)).size===line.scopeItems.length,'SCOPE_STABLE_IDS_REQUIRED','يلزم مطابقة معرفات التفاصيل');const rootId=[s.type,s.doc.id,'line',line.id].join(':');D.assert(!C.leaf(p.tasks).some(t=>t.scopeItemId===rootId),'SCOPE_PACKAGE_ASSIGNED','الحزمة موزعة بالكامل؛ يلزم مراجعة تكليفها قبل توسيع تفاصيلها',409);}
 D.assert(s.doc.lines.every(x=>x.id)&&new Set(s.doc.lines.map(x=>x.id)).size===s.doc.lines.length,'SCOPE_STABLE_IDS_REQUIRED','يلزم مطابقة معرفات بنود المرجع قبل التصحيح');
 D.assert(Number(line.qty)>0,'INVALID_QUANTITY','راجع كمية البند في المرجع');
 const before=copy(line),candidate=copy(s.doc),next=candidate.lines.find(x=>x.id===line.id);if(item)next.scopeItems.find(x=>x.id===item.id).included=true;else next.included=true;
 D.assert(W.total(candidate,s.type)===W.total(s.doc,s.type)&&(!!item||Number(line.qty)*Number(line.unitPrice??line.rate??0)*(1-Number(line.discount||0)/100)===0),'SCOPE_PRICE_CHANGE','هذا التصحيح لا يغير السعر. إضافة أعمال بقيمة جديدة تحتاج تعديلًا تجاريًا مسعّرًا',409);
 const record={id:D.uid('SCA'),by:u.id,at:D.now(),sourceType:s.type,sourceId:s.doc.id,projectId:p.id,lineId:line.id,itemId:item?.id||'',label:item?[item.ar||'',item.en||''].filter(Boolean).join(' — '):label(line),reason,reference,before,after:copy(next),withinAgreedPrice:true,previousHash:stamp(s)};
 if(item)item.included=true;else line.included=true;(s.doc.scopeAmendments??=[]).push(record);
 for(const order of d.ops.orders.filter(o=>o.projectId===p.id&&o.status==='issued'))(order.scopeAmendments??=[]).push({id:record.id,at:record.at,by:u.id,sourceId:s.doc.id,lineId:line.id});
 notify(d,[p.pm,p.checker,...d.teamUsers.filter(x=>['Owner','Accountant'].includes(x.role)).map(x=>x.id)],'scope_corrected',p.id,'تم توثيق إدراج '+record.label+' ضمن السعر المتفق عليه؛ يلزم توزيع العمل واستكماله قبل الاعتماد النهائي.');
 D.event(d,u,'scope_correction_record',p.id,{amendmentId:record.id,sourceId:s.doc.id,lineId:line.id,reason,reference});
 return {amendmentId:record.id,sourceId:s.doc.id,projectId:p.id};
}
module.exports={view,include,stamp};
