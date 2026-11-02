/* R397 engineer desk. Presentation only; existing server actions remain authoritative.
   One project and assignment per view. No money, time entry, or invented progress. */
(function (root) {
  'use strict';
  const number = value => value === null || value === undefined || value === '' ? null :
    Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : null;
  const round = value => Math.round(value * 100) / 100;
  function calculate(parts, key = 'progress') {
    const group = rows => {
      const weight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
      const complete = rows.length > 0 && weight > 0 && rows.every(row => number(row[key]) !== null);
      // Keep the multiplication / summation / division order identical to the server.
      // Rounding individual contributions before summing can drift at half-cent values.
      const weighted = rows.reduce((sum, row) => sum + Number(row.weight || 0) * (number(row[key]) ?? 0), 0);
      const known = weighted / 100;
      return { weight, complete, percent: complete ? round(weighted / weight) : null,
        contribution: complete ? round(known) : null, knownContribution: round(known) };
    };
    return { total: group(parts), modeling: group(parts.filter(row => row.group === 'modeling')),
      fabrication: group(parts.filter(row => row.group === 'fabrication')) };
  }
  function display(v) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', {maximumFractionDigits: 2}); }
  const ICONS = {
    photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8" cy="10" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
    save: '<path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    send: '<path d="m21 3-7 18-4-7-7-4zM10 14 11-11"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l4 2"/>'
  };
  const icon = type => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[type] || ICONS.grid}</svg>`;

  function render(ctx) {
    const {T, E, name, p, t, projects, tasks, mode, user, timestamp, photoAction, priorityText} = ctx;
    const esc = E;
    const opts = (rows, id, label) => rows.map(row => `<option value="${esc(row.id)}" ${row.id === id ? 'selected' : ''}>${esc(label(row))}</option>`).join('');
    const toolbar = `<div class="eng397-context">
      <label>${T('المشروع المكلّف به','Assigned project')}<select data-desk-project397 aria-label="${T('اختر مشروع العمل','Select work project')}">${opts(projects,p?.id,row=>row.id+' — '+row.name)}</select></label>
      <label>${T('التكليف / نطاق العمل','Assignment / work scope')}<select data-desk-task397 aria-label="${T('اختر التكليف','Select assignment')}">${opts(tasks,t?.id,row=>row.name)}</select></label>
      <div class="eng397-mode" role="group" aria-label="${T('عرض العمل أو السجل','Work or history')}"><button type="button" data-desk-mode397="active" aria-pressed="${mode==='active'}">${T('العمل الجاري','Current work')}</button><button type="button" data-desk-mode397="history" aria-pressed="${mode==='history'}">${T('السجل / الأرشيف','History / archive')}</button></div>
    </div>`;
    let html = `<div class="eng397" data-engineer-desk397><div class="page-head eng397-heading"><div><p class="eyebrow">ENGINEERING WORKSPACE · RONIX</p><h1>${T('لوحة تنفيذ المهندس','Engineer workbench')}</h1><p>${T('حدّث إنجاز كل جزء، وراجع الرد، ثم أرسل ما جهز للمراجعة.','Update each part, read the response, then submit the work ready for review.')}</p></div><div class="actions"><button data-refresh>${T('تحديث','Refresh')}</button></div></div>${toolbar}`;
    if (!p || !t) return html + `<section class="eng397-empty"><span>${icon('grid')}</span><h2>${T(mode==='history'?'لا توجد تكليفات محفوظة في هذا السجل':'لا توجد تكليفات جارية مسندة إليك',mode==='history'?'No assignments in this history':'No current assignments assigned to you')}</h2><p>${T('الواجهة لا تنشئ مهمة تلقائيًا. يوزع مدير المشروع العمل من النطاق المعتمد، وتظهر هنا أجزاؤه.','The screen does not invent assignments. Your PM assigns approved scope, and its work appears here.')}</p><button data-route-inline="projects">${T('عرض المشاريع','View projects')}</button></section></div>`;
    const historic = mode==='history' || p.operationalClosed || p.summary?.historical || p.summary?.progressQuality==='legacy_unverified';
    const b = t.execution;
    const activeParts = b?.enabled ? b.parts.filter(row=>row.canEdit) : [];
    const lastAt = b?.enabled ? b.parts.map(row=>row.updatedAt).filter(Boolean).sort().at(-1) : t.updatedAt;
    const phase = historic ? T('سجل محفوظ — قراءة فقط','Saved history — read only') : p.finalTechnicalApproved ? T('معتمد فنيًا — قراءة فقط','Technically approved — read only') : b?.enabled && b.parts.some(row=>row.status==='returned') ? T('ملاحظات تحتاج معالجة','Review comments to resolve') : b?.enabled && b.parts.some(row=>row.status==='submitted') ? T('أجزاء بانتظار المراجعة','Parts awaiting review') : T('متابعة التنفيذ','Execution in progress');
    const imageURL = '/api/project-image/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.imageRevision||'');
    html += `<section class="eng397-hero"><div class="eng397-project-info"><div class="eng397-id-line"><span class="eng397-code">${esc(p.id)}</span><span class="eng397-phase">${phase}</span></div><h2>${esc(p.name)}</h2><p class="eng397-scope">${esc(t.name)}</p><div class="eng397-meta"><span><small>${T('الأولوية','Priority')}</small><b class="eng397-priority">${esc(priorityText(t.priority||p.priority))}</b></span><span><small>${T('بداية التكليف','Assignment start')}</small><b dir="ltr">${esc(t.startDate||'—')}</b></span><span><small>${T('تسليم التكليف','Assignment due')}</small><b dir="ltr">${esc((t.due||'—')+(t.dueTime?' · '+t.dueTime:''))}</b></span><span><small>${T('مدير المشروع','Project manager')}</small><b>${esc(name(p.pm))}</b></span><span><small>${T('المراجع','Checker')}</small><b>${esc(name(t.checker||p.checker))}</b></span></div></div><div class="eng397-photo"><div class="eng397-photo-frame">${p.imageAvailable?`<img src="${esc(imageURL)}" alt="${esc(T('صورة المشروع ','Project image ')+p.name)}" onload="this.nextElementSibling.hidden=true;" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><span hidden>${T('تعذر تحميل الصورة؛ حدّث العرض','Image could not be loaded; refresh the view')}</span>`:`<span>${icon('photo')}<b>${T('لم تُرفع صورة بعد','No project photo yet')}</b><small>${T('صورة واحدة مرتبطة بالمشروع الصحيح','One image linked to this project')}</small></span>`}</div>${photoAction(p)}</div></section>`;
    if(ctx.deliveryPanel)html+=ctx.deliveryPanel(p,t);
    if (b?.enabled) html += board(ctx, historic);
    else if (b?.eligible) html += `<section class="eng397-callout"><h2>${T('لوحة نسب الأجزاء 65/35','65/35 part progress board')}</h2><p>${T('هذا التكليف محفوظ بنسبة إجمالية. لن نوزعها على الأجزاء بالتخمين. افتح المتابعة التفصيلية مع حفظ السجل السابق.','This assignment has a saved aggregate percentage. It will not be guessed across parts. Enable detailed tracking while keeping the old record.')}</p><p>${T('نسبة المهندس السابقة','Previous engineer %')}: <b>${display(t.progress)}%</b> · ${T('آخر تقييم للمراجع','Last checker assessment')}: <b>${display(t.approvedProgress)}%</b></p>${b.canEnable?`<button class="primary" data-enable-board395="${esc(p.id)}|${esc(t.id)}">${T('فتح لوحة نسب الأجزاء 65/35','Open the 65/35 part board')}</button>`:`<div class="notice">${T('التقديم الحالي مقفول للمراجعة أو معتمد. يرجى من المراجع حسمه أو إعادة فتحه موثقًا أولًا.','The current submission is under review or approved. The assigned checker must complete its review or reopen it with a reason first.')}</div>`}<button data-history="${esc(p.id)}|${esc(t.id)}">${T('عرض السجل السابق','View existing history')}</button></section>`;
    else html += single(ctx, historic);
    html += `<details class="eng397-assignment"><summary>${T('تعليمات التكليف وسجل المشروع','Assignment brief and project history')}</summary><div><h3>${T('تعليمات مدير المشروع','PM assignment brief')}</h3><p>${esc(t.assignmentNotes||T('لا توجد تعليمات إضافية مسجلة.','No additional instructions recorded.'))}</p>${t.updateRequestNote?`<p class="notice warn">${T('طلب تحديث','Update request')}: ${esc(t.updateRequestNote)}</p>`:''}<p>${T('آخر تعديل محفوظ','Last saved update')}: ${esc(lastAt?timestamp(lastAt):'—')}</p><button data-history="${esc(p.id)}|${esc(t.id)}">${icon('history')}${T('سجل التقديمات والمراجعات','Submission and review history')}</button></div></details><p class="eng397-footnote">${icon('clock')}${T('الساعات تُسجّل من قسم «ساعات العمل» فقط. اعتماد الوقت مستقل عن الاعتماد الفني.','Record time only in Timesheets. Time approval is separate from technical approval.')}</p></div>`;
    return html;
  }

  function metrics(ctx, parts) {
    const {T}=ctx, own=calculate(parts), checked=calculate(parts,'approvedProgress');
    return `<div class="eng397-metrics">${['total','modeling','fabrication'].map(group=>{
      const x=own[group],c=checked[group],label=group==='total'?T('إجمالي إنجاز التكليف','Assignment progress'):group==='modeling'?'Modeling':'Fabrication Drawings';
      return `<section class="eng397-metric ${group}"><div><span>${label}</span><small>${group==='total'?T('محسوب من الأجزاء دون تكرار','Calculated once from the parts'):T('الوزن في التكليف ','Assignment weight ')+x.weight+'%'}</small></div><strong ${group==='total'?'data-board-total395':`data-group-report395="${group}"`}>${display(x.percent)}${x.percent===null?'':'%'}</strong><div class="eng397-meter" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" ${x.percent===null?'':`aria-valuenow="${x.percent}"`}><i data-desk-meter397="${group}" style="width:${x.percent??0}%"></i></div><p data-desk-contribution397="${group}">${group==='total'?T('آخر إجمالي معتمد: ','Last approved total: ')+display(c.percent)+(c.percent===null?'':'%'):T('المساهمة في الإجمالي: ','Contribution to total: ')+display(x.contribution)+' '+T('نقطة مئوية','pp')}</p>${group==='total'&&!c.complete?`<small>${T('المراجعة غير مكتملة؛ المعتمد المعروف: ','Review incomplete; verified known contribution: ')}${display(c.knownContribution)} ${T('نقطة','pp')}</small>`:''}</section>`;
    }).join('')}</div>`;
  }

  function board(ctx, historic) {
    const {T,E,name,p,t,timestamp}=ctx, b=t.execution;
    const editable=b.parts.some(row=>row.canEdit)&&!historic;
    const state = r => historic ? T('أرشيف','Archived') : ({todo:T('لم يبدأ','Not started'),in_progress:T('قيد التنفيذ','In progress'),submitted:T('بانتظار المراجعة','Awaiting review'),reviewed:T('تم تقييم النسبة','Progress assessed'),returned:T('مرتجع للتعديل','Returned'),confirmed:T('معتمد','Approved')})[r.status] || r.status;
    return `<section class="eng397-work r395-parts-board" data-board395="${E(t.id)}" data-project="${E(p.id)}" data-taskid="${E(t.id)}">${metrics(ctx,b.parts)}
      ${b.baseline?`<div class="notice warn eng397-baseline">${T('السجل الإجمالي السابق محفوظ ولم يُوزّع بالتخمين:','Previous aggregate history retained, not guessed:')} ${T('المهندس','Engineer')} ${display(b.baseline.progress)}% / ${T('المراجع','Checker')} ${display(b.baseline.approvedProgress)}%. ${T('تُحسب النسبة التفصيلية بعد استكمال الأجزاء.','Detailed totals require complete part inputs.')}</div>`:''}
      <div class="eng397-section-head"><div><h2>${T('تفاصيل التقدم الهندسي','Engineering progress details')}</h2><p>${T('اكتب إنجاز الجزء من 0 إلى 100%. الوزن ثابت ولا يتغير مع الساعات.','Enter 0–100% for each part. Weights are fixed and independent of time.')}</p></div>${editable?`<label class="eng397-select-all"><input type="checkbox" data-select-all397>${T('تحديد المتاح للإرسال','Select available parts')}</label>`:''}</div>
      <div class="table-wrap eng397-table-wrap"><table class="eng397-table"><caption class="eng397-sr">${T('نسب أجزاء التكليف وتقييم المراجع','Assignment part progress and checker assessment')}</caption><thead><tr><th>${T('جزء العمل / القسم','Work part / group')}</th><th>${T('الوزن','Weight')}</th><th>${T('إنجازي','My progress')}</th><th>${T('المساهمة','Contribution')}</th><th>${T('آخر تقييم للمراجع','Last checker assessment')}</th><th>${T('الحالة','Status')}</th><th>${T('تفاصيل وإرسال','Details & submission')}</th></tr></thead><tbody>
      ${b.parts.map(r=>{
        const canEdit=r.canEdit&&!historic, sub=r.submissions?.at(-1),last=r.assessments?.at(-1),detailId='partdetail397-'+r.id;
        const reason = r.status==='returned' ? r.lastReturnReason||last?.reason : last?.reason;
        const label=T('تفاصيل ','Details ')+r.label;
        return `<tr data-part395="${E(r.id)}" data-weight="${r.weight}" class="eng397-row ${r.group}"><td><span class="eng397-group-label">${r.group==='modeling'?'Modeling':'Fabrication Drawings'}</span><b dir="auto">${E(r.label)}</b><small>${E(name(r.assignee||t.assignee))}</small></td><td><b>${r.weight}%</b></td><td>${canEdit?`<label class="eng397-percent"><input type="number" name="partPercent" min="0" max="100" step="0.01" value="${r.progress===null?'':r.progress}" placeholder="0–100" aria-label="${E(r.label)} progress"><span>%</span></label>`:`<strong class="eng397-read-percent">${display(r.progress)}${r.progress===null?'':'%'}</strong>`}</td><td><b data-contribution395>${r.progress===null?'—':display(r.progress*r.weight/100)}</b><small>${T('نقطة مئوية','percentage points')}</small></td><td><strong class="eng397-reviewed">${r.approvedProgress===null?T('لم يُراجع بعد','Not reviewed yet'):display(r.approvedProgress)+'%'}</strong>${last?`<small>${E(timestamp(last.at))}</small>`:''}${reason?`<span class="eng397-reason-preview" title="${E(reason)}">${E(reason)}</span>`:''}</td><td><span class="eng397-status ${r.status}">${state(r)}</span>${sub?`<small>${T('تقديم','Submission')} ${sub.revision}</small>`:''}</td><td><button type="button" class="eng397-detail-button" data-detail-toggle397="${E(detailId)}" aria-expanded="false" aria-controls="${E(detailId)}" aria-label="${E(label)}">${T('تفاصيل الجزء','Part details')} <span aria-hidden="true">⌄</span></button>${canEdit?`<label class="eng397-select-part"><input type="checkbox" name="partSelect" aria-label="${E(T('إرسال ','Submit ')+r.label)}">${T('إرسال هذا الجزء','Submit this part')}</label>`:`<small class="eng397-lock-hint">${r.status==='submitted'?T('استكمل الأجزاء الأخرى حتى يصل الرد.','Continue other parts while awaiting review.'):r.status==='confirmed'?T('التعديل يحتاج إعادة فتح موثقة.','Changes require a documented reopen.'):''}</small>`}</td></tr>
        <tr id="${E(detailId)}" data-notes397="${E(r.id)}" class="eng397-details-row" hidden><td colspan="7"><div class="eng397-details-head"><b>${E(r.label)} — ${T('تفاصيل العمل','Work details')}</b><button type="button" data-part-history395="${E(p.id)}|${E(t.id)}|${E(r.id)}">${icon('history')}${T('سجل الجزء','Part history')}</button></div>${reason?`<div class="notice warn"><b>${T('ملاحظة المراجع','Checker comment')}:</b> ${E(reason)}</div>`:''}<div class="eng397-notes-grid"><label>${T('ما أنجزته / أخرجته','Completed work / output')}<textarea name="partCompleted" rows="2" ${canEdit?'':'readonly'}>${E(r.completedNote||'')}</textarea></label><label>${T('ما تبقى','Remaining work')}<textarea name="partRemaining" rows="2" ${canEdit?'':'readonly'}>${E(r.remainingNote||'')}</textarea></label><label>${T('عائق أو ملاحظة','Blocker / note')}<textarea name="partProgressNote" rows="2" ${canEdit?'':'readonly'}>${E(r.progressNote||'')}</textarea></label><label>${T('الانتهاء المتوقع — اختياري','Expected finish — optional')}<input type="date" name="partEta" value="${E(r.eta||'')}" ${canEdit?'':'readonly'}></label></div><small>${T('المراجع المعيّن','Assigned checker')}: ${E(name(r.checker||t.checker||p.checker))} · ${T('آخر حفظ','Last saved')}: ${E(timestamp(r.updatedAt))}</small></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="eng397-savebar"><p class="r395-board-status" role="status">${editable?T('القيم المعروضة محفوظة. الحفظ لا يعني إرسالًا أو اعتمادًا.','Displayed values are saved. Saving is not submission or approval.'):T('هذه الأجزاء مقفلة أو محفوظة للقراءة. لا تُعدّل الموافقات السابقة مباشرةً.','These parts are locked or read-only. Previous approvals cannot be overwritten.')}</p><div class="eng397-save-actions">${editable?`<button type="button" data-parts-save395="${E(t.id)}">${icon('save')}${T('حفظ النسب','Save progress')}</button><button type="button" class="primary" data-parts-submit395="${E(t.id)}" disabled>${icon('send')}${T('إرسال المحدد للتشيكر','Send selected to checker')} <span data-selected-count397>0</span></button>`:''}</div></div></section>`;
  }

  function single(ctx, historic) {
    const {T,E,p,t}=ctx;
    const canEdit=!historic&&!p.finalTechnicalApproved&&!t.isSummary&&t.assignee===ctx.user.id&&!['submitted','confirmed'].includes(t.status);
    const reviewed=!!t.assessments?.length||t.approved===true||t.status==='confirmed';
    return `<section class="eng397-work eng397-single" data-single397="${E(t.id)}" data-project="${E(p.id)}"><div class="eng397-section-head"><div><h2>${T('تحديث إنجاز التكليف','Update assignment progress')}</h2><p>${T('يعرض نطاق هذا التكليف فقط؛ لا نضيف أجزاء أو أوزانًا غير متعاقد عليها.','Only the assigned scope is shown; no unrelated parts or weights are added.')}</p></div></div><div class="eng397-single-progress"><label>${T('نسبة إنجازي','My progress')}<span class="eng397-percent"><input name="singlePercent397" type="number" value="${t.progress}" min="0" max="100" step="0.01" ${canEdit?'':'readonly'}><span>%</span></span></label><div><small>${T('آخر تقييم للمراجع','Last checker assessment')}</small><strong>${reviewed?display(t.approvedProgress)+'%':T('لم يُراجع بعد','Not reviewed yet')}</strong></div></div>${t.lastReturnReason?`<div class="notice warn">${E(t.lastReturnReason)}</div>`:''}<div class="eng397-notes-grid"><label>${T('ما أنجزته / أخرجته','Completed work / output')}<textarea name="singleCompleted397" ${canEdit?'':'readonly'}>${E(t.completedNote||'')}</textarea></label><label>${T('ما تبقى','Remaining work')}<textarea name="singleRemaining397" ${canEdit?'':'readonly'}>${E(t.remainingNote||'')}</textarea></label><label>${T('عائق أو ملاحظة','Blocker / note')}<textarea name="singleNote397" ${canEdit?'':'readonly'}>${E(t.progressNote||'')}</textarea></label><label>${T('الانتهاء المتوقع','Expected finish')}<input type="date" name="singleEta397" value="${E(t.eta||'')}" ${canEdit?'':'readonly'}></label></div><div class="eng397-savebar"><p class="r395-board-status" role="status">${canEdit?T('حفظ التحديث لا يرسله للمراجع.','Saving does not submit work for review.'):T('عرض فقط؛ العمل مرسل أو معتمد أو تاريخي. راجع السجل أو قرار المراجع.','Read-only: submitted, approved or historical. Check the history or review decision.')}</p><div class="eng397-save-actions">${canEdit?`<button data-single-save397>${icon('save')}${T('حفظ التحديث','Save update')}</button><button class="primary" data-single-submit397>${icon('send')}${T('إرسال للتشيكر','Send to checker')}</button>`:''}</div></div></section>`;
  }

  function readRow(section, r) {
    const row=Array.from(section.querySelectorAll('[data-part395]')).find(el=>el.dataset.part395===r.id);
    const notes=Array.from(section.querySelectorAll('[data-notes397]')).find(el=>el.dataset.notes397===r.id)||row;
    const value=(name, fallback='')=>notes?.querySelector(`[name="${name}"]`)?.value ?? fallback;
    const inp=row?.querySelector('[name="partPercent"]');
    return {r,row,inp,selected:!!row?.querySelector('[name="partSelect"]')?.checked,percent:inp?.value??r.progress,
      completedNote:value('partCompleted',r.completedNote||''),remainingNote:value('partRemaining',r.remainingNote||''),
      progressNote:value('partProgressNote',r.progressNote||''),eta:value('partEta',r.eta||'')};
  }
  function changed(x) { const r=x.r; return (number(x.percent)!==number(r.progress))||['completedNote','remainingNote','progressNote','eta'].some(key=>x[key]!==String(r[key]||'')); }
  function preview(section, parts, T) {
    const rows=parts.map(r=>readRow(section,r));
    const own=calculate(rows.map(x=>({...x.r,progress:x.percent}))), checked=calculate(parts,'approvedProgress');
    for(const group of ['total','modeling','fabrication']){
      const x=own[group];const counter=section.querySelector(group==='total'?'[data-board-total395]':`[data-group-report395="${group}"]`);
      if(counter)counter.textContent=display(x.percent)+(x.percent===null?'':'%');
      const bar=section.querySelector(`[data-desk-meter397="${group}"]`);
      if(bar){bar.style.width=(x.percent??0)+'%';if(x.percent===null)bar.parentNode.removeAttribute('aria-valuenow');else bar.parentNode.setAttribute('aria-valuenow',x.percent);}
      const contribution=section.querySelector(`[data-desk-contribution397="${group}"]`);
      if(contribution&&group!=='total')contribution.textContent=T('المساهمة في الإجمالي: ','Contribution to total: ')+display(x.contribution)+' '+T('نقطة مئوية','pp');
    }
    for(const x of rows){const cell=x.row?.querySelector('[data-contribution395]');if(cell)cell.textContent=number(x.percent)===null?'—':display(Number(x.percent)*x.r.weight/100);}
    const selection=rows.filter(x=>x.inp&&x.selected).length;
    const button=section.querySelector('[data-parts-submit395]'),count=section.querySelector('[data-selected-count397]');
    if(button)button.disabled=selection===0;
    if(count)count.textContent=String(selection);
    const all=section.querySelector('[data-select-all397]'),available=rows.filter(x=>x.inp).length;
    if(all){all.checked=selection>0&&selection===available;all.indeterminate=selection>0&&selection<available;}
    return rows.some(x=>x.inp&&changed(x));
  }
  const exports={render,calculate,number,display,readRow,changed,preview};
  if(typeof module==='object'&&module.exports)module.exports=exports;
  else root.RonixEngineerDesk=Object.freeze(exports);
})(typeof window==='undefined'?globalThis:window);
