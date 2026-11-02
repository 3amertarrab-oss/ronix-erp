'use strict';
const W=require('./workflow'),C=require('./controls'),B=require('./execution-board');
function view(d,p){
 const scope=W.scopeOptions(W.source(d,p)),tasks=C.leaf(p.tasks).filter(t=>t.required!==false),roots=scope.filter(x=>!x.parentId);
 function value(t,key){if(!t)return 0;if(B.has(t)){if(t.executionBoard.parts.some(x=>x.status==='returned'&&x[key]==null))return null;return B.summary(t.executionBoard)[key==='progress'?'engineerPercent':'checkerPercent']??0;}return t[key]==null&&t.status==='returned'?null:Math.max(0,Math.min(100,Number(t[key])||0));}
 function group(rows,key){if(!rows.length)return 0;if(rows.some(x=>value(x,key)==null))return null;const w=t=>Number(t.weight)>0?Number(t.weight):1;return rows.reduce((s,t)=>s+w(t)*value(t,key),0)/rows.reduce((s,t)=>s+w(t),0);}
 const lines=roots.map(root=>{
  const children=scope.filter(x=>x.parentId===root.id),direct=tasks.filter(t=>t.scopeItemId===root.id),units=children.length?children:[root];
  const rows=units.map(unit=>{const selected=direct.length?direct:tasks.filter(t=>t.scopeItemId===unit.id);const external=require('./supplier-scope').work(d,p.id).find(x=>x.scopeItemId===root.id||x.scopeItemId===unit.id);if(external&&!selected.length)return {id:unit.id,name:unit.label,assigned:true,engineer:external.accepted?100:0,checker:external.accepted?100:0,external:true,vendorId:external.vendorId,acceptance:'project_engineer'};return {id:unit.id,name:unit.label,assigned:!!selected.length,engineer:group(selected,'progress'),checker:group(selected,'approvedProgress')};});
  const avg=key=>rows.some(x=>x[key]==null)?null:rows.reduce((s,x)=>s+x[key],0)/rows.length;
  return {id:root.id,name:root.label,weight:Number(p.scopeWeights?.[root.id])>0?Number(p.scopeWeights[root.id]):1,engineer:avg('engineer'),checker:avg('checker'),units:rows};
 });
 const den=lines.reduce((s,x)=>s+x.weight,0),pct=key=>!den||lines.some(x=>x[key]==null)?null:Math.round(lines.reduce((s,x)=>s+x.weight*x[key],0)/den*100)/100;
 const units=lines.flatMap(x=>x.units),covered=units.filter(x=>x.assigned).length;
 return {engineerPercent:pct('engineer'),checkerPercent:pct('checker'),covered,total:units.length,coveragePercent:units.length?Math.round(covered/units.length*10000)/100:null,missing:units.filter(x=>!x.assigned).map(x=>x.name),lines,weightBasis:p.scopeWeights?'explicit':'equal_contract_lines',finalApproved:!!p.finalTechnicalApproved};
}
function setWeights(d,u,p,b,D){
 D.assert(u.role==='Owner'||u.role==='Project Manager'&&p.pm===u.id,'FORBIDDEN','أوزان نطاق المشروع للمالك أو مديره',403);D.assert(!p.finalTechnicalApproved&&!p.operationalClosed,'PROJECT_CLOSED','أعد فتح المشروع قبل تغيير أوزان نطاقه',409);
 const lines=view(d,p).lines,weights=b.weights||{},reason=D.text(b.reason);
 D.assert(reason,'REASON_REQUIRED','اكتب سبب اعتماد أو تعديل أوزان النطاق');D.assert(lines.length&&Object.keys(weights).length===lines.length&&lines.every(x=>Number.isFinite(weights[x.id])&&weights[x.id]>0&&weights[x.id]<=10000),'INVALID_SCOPE_WEIGHTS','حدد وزنًا موجبًا لكل بند تعاقد');
 const record={id:D.uid('SCOPE-WEIGHTS'),at:D.now(),by:u.id,reason,before:D.clone(p.scopeWeights||null),after:D.clone(weights)};(p.scopeWeightHistory??=[]).push(record);p.scopeWeights=D.clone(weights);return {weightRecordId:record.id};
}
module.exports={view,setWeights};
