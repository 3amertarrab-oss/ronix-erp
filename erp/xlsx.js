'use strict';
// Offline OOXML export. Only formulas declared by this module are executable; user values are inline strings.
// Tables, calculated columns and cached results keep the workbook useful without a network connection.
const esc=x=>String(x??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,32760).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const col=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s};
const xml=s=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s;
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relns='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const n=x=>typeof x==='number'&&Number.isFinite(x)?x:0;
const round=x=>Math.round((x+Number.EPSILON)*1)/1;
const halfup=(h,r)=>Math.floor((Math.round(h*4)*r+2)/4);
function style(kind,calc=false){return calc?kind==='money'?9:kind==='decimal'?10:8:kind==='money'?2:kind==='decimal'?3:kind==='number'?11:0;}
function cell(ref,value,kind='text',s){
 const st=s??style(kind,!!value?.formula);
 if(value===null||value===undefined||value==='')return `<c r="${ref}" s="${st}"/>`;
 if(value&&typeof value==='object'&&typeof value.formula==='string'){
  const cache=value.cached;const number=typeof cache==='number'&&Number.isFinite(cache);
  return `<c r="${ref}" s="${st}"${number?'':' t="str"'}><f>${esc(value.formula.replace(/^=/,''))}</f><v>${number?cache:esc(cache??'')}</v></c>`;
 }
 if(kind==='date'&&/^\d{4}-\d{2}-\d{2}/.test(String(value))&&!isNaN(Date.parse(value)))return `<c r="${ref}" s="4"><v>${(Date.parse(value)-Date.UTC(1899,11,30))/86400000}</v></c>`;
 if(['decimal','money','number'].includes(kind)&&typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${st}"><v>${value}</v></c>`;
 return `<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${esc(typeof value==='boolean'?(value?'نعم / Yes':'لا / No'):value)}</t></is></c>`;
}
function prepare(report,mode='dynamic',tableName='RNX_DATA'){
 const r={...report,columns:report.columns.map(c=>({...c})),rows:report.rows.map(x=>({...x})),notes:[...(report.notes||[])],tableName,mode};
 if(mode!=='dynamic')return r;
 const has=k=>r.columns.some(c=>c.key===k),title=k=>r.columns.find(c=>c.key===k).title;
 const ref=k=>'[@['+title(k)+']]';
 const add=(key,title,type='decimal',sum=false)=>{if(!has(key))r.columns.push({key,title,type,width:22,sum})};
 const formula=(key,expr,calc)=>{const c=r.columns.find(c=>c.key===key);if(!c)return;c.formula=expr;for(const row of r.rows)row[key]={formula:expr,cached:calc(row)};};
 const val=(row,k)=>typeof row[k]==='object'&&row[k]!==null&&'cached'in row[k]?row[k].cached:row[k];
 const nv=(row,k)=>n(val(row,k));
 if(r.kind==='projects'&&has('value')){
  formula('claimRemaining',`MAX(0,${ref('claimed')}-${ref('received')})`,x=>Math.max(0,nv(x,'claimed')-nv(x,'received')));
  formula('uncollected',`MAX(0,${ref('value')}-${ref('received')})`,x=>Math.max(0,nv(x,'value')-nv(x,'received')));
  add('customerCredit','مقبوض زائد عن المطالبات','money',true);
  formula('customerCredit',`MAX(0,${ref('received')}-${ref('claimed')})`,x=>Math.max(0,nv(x,'received')-nv(x,'claimed')));
  r.notes.push('غير المحصل من التعاقد لا يعني أنه مستحق اليوم. فرق المقبوض عن المطالبات ليس تخصيصًا محاسبيًا تلقائيًا.');
 }
 if(r.kind==='supplier_cost'){
  formula('remaining',`IF(AND(ISNUMBER(${ref('knownLaborCost')}),${ref('calculable')}="نعم / Yes"),${ref('contractValue')}-${ref('knownLaborCost')}-${ref('vendorPayments')},"")`,x=>val(x,'calculable')===true&&typeof val(x,'knownLaborCost')==='number'?nv(x,'contractValue')-nv(x,'knownLaborCost')-nv(x,'vendorPayments'):'');
  r.notes.push('المعادلة قابلة للتحليل داخل Excel فقط. الاستحقاقات غير المدفوعة تظهر مستقلة ولا تخصم من نفس المؤشر.');
 }
 if(r.kind==='tasks'){
  add('remainingPercent','متبقي الإنجاز %');add('reviewDifference','فرق الإنجاز عن المراجعة %');
  formula('remainingPercent',`MAX(0,100-${ref('progress')})`,x=>Math.max(0,100-nv(x,'progress')));
  formula('reviewDifference',`${ref('progress')}-${ref('approved')}`,x=>nv(x,'progress')-nv(x,'approved'));
 }
 if(r.kind==='execution_parts'){
  formula('contribution',`IF(ISNUMBER(${ref('progress')}),${ref('progress')}*${ref('weight')}/100,"")`,x=>typeof val(x,'progress')==='number'?nv(x,'progress')*nv(x,'weight')/100:'');
  formula('approvedContribution',`IF(ISNUMBER(${ref('approved')}),${ref('approved')}*${ref('weight')}/100,"")`,x=>typeof val(x,'approved')==='number'?nv(x,'approved')*nv(x,'weight')/100:'');
 }
 if(r.kind==='timesheets'){
  if(has('cost'))formula('cost',`IF(AND(${ref('status')}="approved",ISNUMBER(${ref('rate')})),ROUND(${ref('approvedHours')}*${ref('rate')},0),"")`,x=>val(x,'status')==='approved'&&typeof val(x,'rate')==='number'?halfup(nv(x,'approvedHours'),nv(x,'rate')):'');
  add('pendingHours','ساعات بانتظار الاعتماد','decimal',true);
  formula('pendingHours',`IF(${ref('status')}="pending",${ref('hours')},0)`,x=>val(x,'status')==='pending'?nv(x,'hours'):0);
  if(has('rate')){add('unpricedHours','معتمد غير مسعر','decimal',true);formula('unpricedHours',`IF(AND(${ref('status')}="approved",NOT(ISNUMBER(${ref('rate')}))),${ref('approvedHours')},0)`,x=>val(x,'status')==='approved'&&typeof val(x,'rate')!=='number'?nv(x,'approvedHours'):0);}
  r.notes.push('تغيير حالة الوقت أو السعر داخل Excel لغرض التحليل فقط؛ لا يعتمد ساعات داخل RONIX ولا يعيد تسعير المصدر. التكلفة فارغة عند غياب السعر، لا صفر.');
 }
 if(['quote_lines','contract_lines'].includes(r.kind)){
  formula('net',`IF(${ref('included')}="yes",${ref('qty')}*${ref('price')}*(1-${ref('discount')}/100),0)`,x=>val(x,'included')==='yes'?nv(x,'qty')*nv(x,'price')*(1-nv(x,'discount')/100):0);
  r.notes.push('صافي البنود قبل الضريبة. الكسور الحسابية محفوظة ويُقرّب إجمالي المستند بحسب سياسة النظام؛ لا يُجمع عرض وعقد ومراجعاته كإيرادات.');
 }
 if(r.kind==='award_lines'){add('lineValue','قيمة بند الإسناد','money');formula('lineValue',`IF(ISNUMBER(${ref('rate')}),ROUND(${ref('qty')}*${ref('rate')},0),"")`,x=>typeof val(x,'rate')==='number'?(typeof val(x,'lineValue')==='number'?val(x,'lineValue'):Math.round(nv(x,'qty')*nv(x,'rate'))):'');}
 if(r.kind==='vendor_bills'){
  add('remaining','متبقي الفاتورة','money',true);formula('remaining',`IF(OR(${ref('status')}="cancelled",${ref('status')}="void"),0,MAX(0,${ref('amount')}-${ref('paid')}))`,x=>['cancelled','void'].includes(val(x,'status'))?0:Math.max(0,nv(x,'amount')-nv(x,'paid')));
 }
 if(r.kind==='receipts'){
  add('effectiveAmount','فعال شامل الرصيد الافتتاحي','money',true);
  add('cashMovement','قبض فعلي دون رصيد افتتاحي','money',true);
  formula('cashMovement',`IF(AND(${ref('status')}="posted",${ref('opening')}<>"نعم / Yes"),${ref('amount')},0)`,x=>val(x,'status')==='posted'&&!val(x,'opening')?nv(x,'amount'):0);
  formula('effectiveAmount',`IF(${ref('status')}="posted",${ref('amount')},0)`,x=>val(x,'status')==='posted'?nv(x,'amount'):0);
  r.notes.push('المبلغ الفعال يستبعد المعكوس/الملغي؛ الأرصدة الافتتاحية تبقى أرصدة وليست تحصيلًا جديدًا في يوم التصدير. لا تجمع المقبوض وتوزيعاته.');
 }
 if(r.kind==='allocations'){
  add('allocatedTotal','مجموع التوزيع — ليس قبضًا إضافيًا','money');
  formula('allocatedTotal',`IF(AND(ISNUMBER(${ref('arApplied')}),ISNUMBER(${ref('advanceApplied')})),${ref('arApplied')}+${ref('advanceApplied')},"")`,x=>typeof val(x,'arApplied')==='number'&&typeof val(x,'advanceApplied')==='number'?nv(x,'arApplied')+nv(x,'advanceApplied'):'');
 }
 if(r.kind==='reviews'){
  add('difference','فرق النسبة %');formula('difference',`${ref('engineerProgress')}-${ref('approved')}`,x=>nv(x,'engineerProgress')-nv(x,'approved'));
 }
 r.notes.push('الأرقام الزرقاء بيانات مصدرة قابلة للتحليل، والخضراء نتائج معادلات. ملف عمل مستقل غير متصل بالخادم. داخل Excel استخدم Tab من آخر خلية في الجدول لإضافة صف؛ لا تكتب فوق عناوين الأعمدة.');
 return r;
}
const qualified=(formula,r)=>formula.replace(/\[@\[([^\]]+)\]\]/g,(_,header)=>r.tableName+'[[#This Row],['+header+']]');
function tableXML(r,id){
 const end=4+Math.max(1,r.rows.length),last=col(r.columns.length-1);
 return xml(`<table xmlns="${ns}" id="${id}" name="${r.tableName}" displayName="${r.tableName}" ref="A4:${last}${end}" totalsRowShown="0"><autoFilter ref="A4:${last}${end}"/><tableColumns count="${r.columns.length}">${r.columns.map((c,i)=>`<tableColumn id="${i+1}" name="${esc(c.title)}">${c.formula?`<calculatedColumnFormula>${esc(qualified(c.formula,r))}</calculatedColumnFormula>`:''}</tableColumn>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`);
}
function sheet(r,tableId){
 const last=col(r.columns.length-1),bodyRows=r.rows.length?r.rows:[{}],end=4+bodyRows.length;
 let rows=`<row r="1" ht="32" customHeight="1">${cell('A1',r.title,'text',5)}</row><row r="2" ht="38" customHeight="1">${cell('A2',r.subtitle||('RONIX STEEL · '+r.rows.length+' سجل · '+(r.mode==='dynamic'?'دفتر عمل بمعادلات — التعديل لا يغير البرنامج':'تقرير مرجعي ثابت')),'text',6)}</row>`;
 rows+=`<row r="3" ht="28" customHeight="1">${cell('A3','مجموع المرئي','text',7)}${r.columns.map((c,i)=>{if(i===0||!c.sum)return '';const total=r.rows.reduce((s,x)=>s+n(x[c.key]?.formula?x[c.key].cached:x[c.key]),0);const f=tableId?`SUBTOTAL(109,${r.tableName}[${c.title}])`:`SUBTOTAL(109,${col(i)}5:${col(i)}${end})`;return cell(col(i)+'3',{formula:f,cached:total},c.type,c.type==='decimal'?10:9)}).join('')}</row>`;
 rows+=`<row r="4" ht="42" customHeight="1">${r.columns.map((c,i)=>cell(col(i)+'4',c.title,'text',1)).join('')}</row>`;
 bodyRows.forEach((row,j)=>{const lines=Math.max(1,...r.columns.map(c=>String(row[c.key]?.formula?'':row[c.key]??'').split(/\n/).reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/Math.max(10,(c.width||22)-2))),0)));rows+=`<row r="${j+5}" ht="${Math.min(240,Math.max(30,lines*15))}" customHeight="1">${r.columns.map((c,i)=>{const value=row[c.key]??(c.formula?{formula:c.formula,cached:''}:'');return cell(col(i)+(j+5),value?.formula?{...value,formula:qualified(value.formula,r)}:value,c.type)}).join('')}</row>`});
 const validations=[];
 if(tableId&&r.mode==='dynamic')for(let i=0;i<r.columns.length;i++){const c=r.columns[i],letter=col(i);let values=null;if(c.key==='status'&&r.kind==='timesheets')values=['pending','approved','returned','rejected','superseded'];if(c.key==='included')values=['yes','no'];if(c.key==='priority')values=['Normal','High','Urgent','Low'];if(values)validations.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="قيمة غير صالحة" error="اختر من القائمة" sqref="${letter}5:${letter}1048576"><formula1>${esc('"'+values.join(',')+'"')}</formula1></dataValidation>`);}
 return xml(`<worksheet xmlns="${ns}" xmlns:r="${relns}"><dimension ref="A1:${last}${end}"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="26"/><cols>${r.columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(42,c.width||22)}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${tableId?'':`<autoFilter ref="A4:${last}${end}"/>`}<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>${validations.length?`<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>`:''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>${tableId?`<tableParts count="1"><tablePart r:id="rIdTable"/></tableParts>`:''}</worksheet>`);
}
function styles(){
 const format=(num,font=0,fill=0)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`;
 return xml(`<styleSheet xmlns="${ns}"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);-"/><numFmt numFmtId="165" formatCode="0.00"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Arial"/><color rgb="FF15263C"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF15263C"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF1554A3"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF09654D"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF15263C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFAF3E2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE1E6EE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${[format(0),format(0,1,2),format(164,3),format(165,3),format(166,3),format(0,2),format(0,0,3),format(0,4,3),format(0,4),format(164,4),format(165,4),format(0,3)].join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);
}
function information(report,meta){return {title:'دليل ومصدر التصدير / Export guide',columns:[{key:'key',title:'البيان',width:32},{key:'value',title:'القيمة / Value',width:42}],rows:[{key:'الإصدار',value:meta.build},{key:'مراجعة البيانات',value:meta.revision},{key:'وقت التصدير UTC',value:meta.at},{key:'المستخدم / الدور',value:meta.user+' / '+meta.role},{key:'نوع الملف',value:meta.mode==='snapshot'?'تقرير مرجعي':'دفتر عمل بمعادلات وجداول'},{key:'التصفية',value:JSON.stringify(report.filters||{})},{key:'الربط',value:'غير متصل بالخادم. تعديل الملف لا يحدث RONIX ولا يغيّر موافقة أو رصيدًا.'},{key:'الأرشيف',value:'حالات الأرشيف والسلة لا تلغي الحقوق المالية أو التاريخ.'},{key:'السرية',value:'بيانات مصرح بها فقط؛ لا كلمات مرور ولا أعمدة مالية مخفية للأدوار الفنية.'},{key:'مصدر المدخلات',value:'قاعدة بيانات RONIX المحفوظة عند مراجعة البيانات أعلاه. ملفات التشخيص ليست مصدر المعادلات.'},...(report.notes||[]).map(value=>({key:'ملاحظة',value}))],mode:'snapshot',totals:{}};}
function packageSheets(sheets,meta,zip){
 const files={};let table=0;
 const withTables=sheets.map((s,i)=>({...s,id:i+1,tableId:s.mode==='dynamic'?++table:0}));
 files['[Content_Types].xml']=xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${withTables.map(s=>`<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${s.tableId?`<Override PartName="/xl/tables/table${s.tableId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`:''}`).join('')}</Types>`);
 files['_rels/.rels']=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
 files['xl/workbook.xml']=xml(`<workbook xmlns="${ns}" xmlns:r="${relns}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${withTables.map(s=>`<sheet name="${esc(s.sheetName||'البيانات')}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('')}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
 files['xl/_rels/workbook.xml.rels']=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${withTables.map(s=>`<Relationship Id="rId${s.id}" Type="${relns}/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')}<Relationship Id="rIdStyle" Type="${relns}/styles" Target="styles.xml"/></Relationships>`);
 files['xl/styles.xml']=styles();
 for(const s of withTables){files[`xl/worksheets/sheet${s.id}.xml`]=sheet(s,s.tableId);if(s.tableId){files[`xl/tables/table${s.tableId}.xml`]=tableXML(s,s.tableId);files[`xl/worksheets/_rels/sheet${s.id}.xml.rels`]=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTable" Type="${relns}/table" Target="../tables/table${s.tableId}.xml"/></Relationships>`);}}
 return zip(files);
}
function make(report,meta,zip){
 const mode=meta.mode||'dynamic',r=prepare(report,mode);r.sheetName='البيانات';const info=information(r,{...meta,mode});info.sheetName='معلومات التصدير';
 return packageSheets([r,info],meta,zip);
}
module.exports={make,prepare,packageSheets,information,col};
