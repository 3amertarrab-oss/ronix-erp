'use strict';
// Cross-sheet analysis built from the SAME role-filtered report projections used by individual exports.
const X=require('./xlsx'),R=require('./reports'),C=require('./controls');
const column=(key,title,type='text',sum=false)=>({key,title,type,width:type==='text'?26:22,sum});
function make(d,u,f,meta,zip,D){
 C.check(C.fin(u),'EXPORT_FORBIDDEN','دفتر الحسابات المتكامل للمالك والحسابات فقط',403);
 const common={projectId:f.projectId||''},date={from:f.from||'',to:f.to||''};
 // Validate all filter names first through the normal export contract.
 R.build(d,u,'projects',{...f,userId:'',from:'',to:''},D);
 const projectFilters={...common,state:f.state||'',search:f.search||''};
 const projects=R.build(d,u,'projects',projectFilters,D),ids=new Set(projects.rows.map(p=>p.projectId));
 const time=R.build(d,u,'timesheets',{...common,...date,userId:f.userId||''},D),receipts=R.build(d,u,'receipts',{...common,...date},D),tasks=R.build(d,u,'tasks',{...common,userId:f.userId||''},D);
 time.rows=time.rows.filter(r=>ids.has(r.projectId));receipts.rows=receipts.rows.filter(r=>ids.has(r.projectId));tasks.rows=tasks.rows.filter(r=>ids.has(r.projectId));
 const ps=X.prepare(projects,'dynamic','RNX_PROJECTS'),ts=X.prepare(time,'dynamic','RNX_TIME'),rs=X.prepare(receipts,'dynamic','RNX_RECEIPTS'),ks=X.prepare(tasks,'dynamic','RNX_TASKS');
 ps.sheetName='المشاريع';ts.sheetName='الساعات';rs.sheetName='القبض';ks.sheetName='المهام';
 const tableRef=(s,k)=>s.tableName+'['+s.columns.find(c=>c.key===k).title+']';
 const title=(s,k)=>s.columns.find(c=>c.key===k).title;
 const val=(x,k)=>x[k]?.formula?x[k].cached:x[k];
 const sum=(rows,key)=>rows.reduce((s,x)=>s+(typeof val(x,key)==='number'?val(x,key):0),0);
 const summary={kind:'working_summary',sheetName:'لوحة التحليل',title:'لوحة تحليل العمل — المصدر محفوظ والملف مستقل',subtitle:'أرقام التعاقد تراكمية عند التصدير؛ الساعات والقبض التفصيلي حسب فترة التقرير. لا تُجرى تسويات تلقائية.',columns:[column('projectId','كود المشروع'),column('projectName','المشروع'),column('sourceReceived','مقبوض تراكمي حسب المشروع','money',true),column('receiptDetail','قبض تفصيلي فعال في الفترة','money',true),column('hours','ساعات مسجلة في الفترة','decimal',true),column('approved','ساعات معتمدة في الفترة','decimal',true),column('pending','ساعات معلقة في الفترة','decimal',true),column('cost','تكلفة وقت معتمدة مسعرة','money',true),column('unpriced','ساعات معتمدة غير مسعرة','decimal',true)],rows:[],tableName:'RNX_SUMMARY',mode:'dynamic',filters:f,notes:[]};
 const key='[@[كود المشروع]]',sumIf=(s,k)=>`SUMIFS(${tableRef(s,k)},${tableRef(s,'projectId')},${key})`;
 const rules={sourceReceived:sumIf(ps,'received'),receiptDetail:sumIf(rs,'cashMovement'),hours:`SUMIFS(${tableRef(ts,'hours')},${tableRef(ts,'projectId')},${key},${tableRef(ts,'status')},"<>rejected",${tableRef(ts,'status')},"<>superseded",${tableRef(ts,'status')},"<>void")`,approved:`SUMIFS(${tableRef(ts,'approvedHours')},${tableRef(ts,'projectId')},${key},${tableRef(ts,'status')},"approved")`,pending:sumIf(ts,'pendingHours'),cost:sumIf(ts,'cost'),unpriced:sumIf(ts,'unpricedHours')};
 for(const c of summary.columns)if(rules[c.key])c.formula=rules[c.key];
 for(const p of ps.rows){const tr=ts.rows.filter(x=>x.projectId===p.projectId),rr=rs.rows.filter(x=>x.projectId===p.projectId);const cache={sourceReceived:val(p,'received'),receiptDetail:sum(rr,'cashMovement'),hours:sum(tr.filter(x=>!['rejected','superseded','void'].includes(x.status)),'hours'),approved:sum(tr.filter(x=>x.status==='approved'),'approvedHours'),pending:sum(tr,'pendingHours'),cost:sum(tr,'cost'),unpriced:sum(tr,'unpricedHours')};summary.rows.push({projectId:p.projectId,projectName:p.projectName,...Object.fromEntries(Object.entries(rules).map(([k,formula])=>[k,{formula,cached:cache[k]}]))});}
 const scenario={kind:'cost_scenario',title:'سيناريو تكلفة مستقل — لا يغيّر اعتماد الوقت أو السعر في RONIX',subtitle:'الساعات والسعر الأزرق مدخلات تحليل؛ النتائج الخضراء معادلات. السعر الفارغ ليس صفرًا.',sheetName:'سيناريو التكلفة',tableName:'RNX_SCENARIO',mode:'dynamic',columns:[column('id','سجل المصدر'),column('projectId','كود المشروع'),column('employee','الموظف'),column('status','حالة الساعات في المصدر'),column('hours','ساعات السيناريو','decimal',true),column('rate','سعر السيناريو','money'),column('cost','تكلفة السيناريو','money',true)],rows:time.rows.map(t=>({id:t.id,projectId:t.projectId,employee:t.employee,status:t.status,hours:t.hours,rate:typeof t.rate==='number'?t.rate:'',cost:{formula:'IF(AND(ISNUMBER([@[سعر السيناريو]]),ISNUMBER([@[ساعات السيناريو]])),ROUND([@[ساعات السيناريو]]*[@[سعر السيناريو]],0),"")',cached:typeof t.rate==='number'?Math.round(t.hours*t.rate):''}}))};
 scenario.columns.find(c=>c.key==='cost').formula=scenario.rows[0]?.cost.formula||'IF(AND(ISNUMBER([@[سعر السيناريو]]),ISNUMBER([@[ساعات السيناريو]])),ROUND([@[ساعات السيناريو]]*[@[سعر السيناريو]],0),"")';
 const notes=[...new Set([...ps.notes,...ts.notes,...rs.notes,...ks.notes])];notes.push('لوحة التحليل تجمع كل السطور المصدرة عبر مراجع الجداول؛ صف الإجمالي أعلى كل ورقة يطابق الصفوف المرئية بتصفية Excel.','قيمة المقبوض التراكمية من ملف المشروع مستقلة عن مجموع سندات الفترة؛ الفروق التاريخية لا تُسوّى بالتخمين.','الحالات تصفي المشاريع. الفترة تصفي الوقت والقبض فقط. الموظف يصفي المهام والساعات، وليس كامل الحسابات.','لا توجد روابط خارجية أو وحدات ماكرو. Excel ليس نسخة احتياطية ولا يستورد تعديلاته تلقائيًا.');
 const info=X.information({kind:'working_pack',filters:f,notes},{...meta,mode:'dynamic'});info.sheetName='الدليل والمصدر';
 return X.packageSheets([summary,ps,ks,ts,rs,scenario,info],meta,zip);
}
module.exports={make};
