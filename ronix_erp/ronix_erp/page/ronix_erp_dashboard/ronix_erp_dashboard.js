const RONIX_DASHBOARD_METHOD = "ronix_erp.api.get_dashboard_data";
// Compatibility marker for the former URL-style report route: RONIX%20Project%20Profitability

frappe.pages["ronix-erp-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("RONIX ERP"),
        single_column: true,
    });

    wrapper.ronix_dashboard = { page, lang: "ar", data: null };
    render_ronix_dashboard(wrapper);
    load_ronix_dashboard_data(wrapper);
};

frappe.pages["ronix-erp-dashboard"].on_page_show = function (wrapper) {
    render_ronix_dashboard(wrapper);
    load_ronix_dashboard_data(wrapper);
};

function load_ronix_dashboard_data(wrapper) {
    frappe.call(RONIX_DASHBOARD_METHOD).then(({ message }) => {
        if (!wrapper.ronix_dashboard) return;
        wrapper.ronix_dashboard.data = message || {};
        render_ronix_dashboard(wrapper);
    }).catch(() => {
        frappe.show_alert({ message: __("Unable to load the RONIX dashboard."), indicator: "red" });
    });
}

function render_ronix_dashboard(wrapper) {
    const state = wrapper.ronix_dashboard;
    if (!state) return;
    const rtl = (state.lang || "ar") === "ar";
    const t = (ar, en) => rtl ? ar : en;
    const e = (value) => frappe.utils.escape_html(String(value ?? ""));
    const data = state.data || {};
    const summary = data.summary || {};
    const portfolio = data.portfolio || {};
    const projects = data.projects || [];
    const currency = data.currency || "EGP";
    const money = (value) => `${e(currency)} ${new Intl.NumberFormat(rtl ? "ar-EG" : "en-US", {
        maximumFractionDigits: 0,
    }).format(Number(value || 0))}`;

    const navigation = [
        ["⌂", "لوحة التحكم", "Dashboard", "dashboard", ""],
        ["◉", "إدارة المبيعات", "Sales Management", "doctype", "Quotation"],
        ["▣", "العقود", "Contracts", "doctype", "RONIX Contract"],
        ["◆", "المشاريع", "Projects", "doctype", "Project"],
        ["▱", "الهندسة والتنفيذ", "Engineering & Execution", "doctype", "Task"],
        ["▥", "المشتريات", "Procurement", "doctype", "Purchase Order"],
        ["⇄", "المخزون", "Inventory", "doctype", "Stock Entry"],
        ["◉", "المصروفات والتكاليف", "Expenses & Costs", "doctype", "Expense Claim"],
        ["▤", "الفوترة والتحصيل", "Billing & Collections", "doctype", "RONIX Claim"],
        ["◇", "المالية والحسابات", "Finance & Accounting", "report", "General Ledger"],
        ["⌁", "التصنيع", "Manufacturing", "doctype", "Work Order"],
        ["▦", "التقارير والطباعة", "Reports & Printing", "report", "RONIX Project Profitability"],
    ];
    const nav_html = navigation.map(([icon, ar, en, kind, route], index) => `
        <button class="rx-nav-btn ${index === 0 ? "active" : ""}" data-kind="${kind}" data-route="${e(route)}">
            <span class="rx-nav-caret">${index ? "‹" : ""}</span>
            <span class="rx-nav-label">${e(t(ar, en))}</span>
            <span class="rx-nav-icon">${icon}</span>
        </button>
        ${index === 0 ? `<button class="rx-nav-child active" data-kind="dashboard">${e(t("لوحة التحكم الرئيسية", "Main Dashboard"))}<span>⌂</span></button>
        <button class="rx-nav-child" data-kind="focus-search">${e(t("البحث الشامل", "Global Search"))}<span>⌕</span></button>` : ""}
    `).join("");

    const project_cards = projects.length ? projects.map((project) => {
        const progress = Math.max(0, Math.min(100, Number(project.progress || 0)));
        return `
            <button class="rx-project-card" data-project="${e(project.name)}">
                <div class="rx-project-top"><span>${e(project.code || project.name)}</span><b>${e(status_label(project.status, rtl))} · ${progress.toFixed(0)}%</b></div>
                <h4>${e(project.project_name || project.name)}</h4>
                <div class="rx-progress"><i style="width:${progress}%"></i></div>
                <div class="rx-project-values">
                    <span>${e(t("العقد", "Contract"))}<b>${money(project.contract_value)}</b></span>
                    <span>${e(t("التكلفة", "Cost"))}<b>${money(project.actual_cost)}</b></span>
                    <span>${e(t("الربح المتوقع", "Expected profit"))}<b>${money(project.expected_profit)}</b></span>
                    <span>${e(t("الساعات", "Hours"))}<b>${Number(project.hours || 0).toLocaleString()} h</b></span>
                </div>
            </button>`;
    }).join("") : `
        <div class="rx-empty">
            <b>${e(t("لا توجد مشروعات مسجلة بعد", "No projects have been added yet"))}</b>
            <span>${e(t("ابدأ بإضافة مشروع جديد من نفس الشاشة.", "Add the first project from this screen."))}</span>
            <button class="rx-btn primary" data-new="Project">＋ ${e(t("إضافة مشروع", "Add Project"))}</button>
        </div>`;

    $(state.page.body).html(`
        <div class="rx-v5521" dir="${rtl ? "rtl" : "ltr"}">
            <div class="rx-mobile-overlay"></div>
            <main class="rx-main">
                <header class="rx-topbar no-print">
                    <button class="rx-menu" aria-label="Menu">☰</button>
                    <div class="rx-search"><span>⌕</span><input type="search" placeholder="${e(t("بحث في النظام...", "Search the system..."))}" aria-label="${e(t("البحث الشامل", "Global Search"))}"></div>
                    <div class="rx-top-actions">
                        <div class="rx-quick-wrap">
                            <button class="rx-chip rx-quick-toggle">＋ ${e(t("إضافة سريعة", "Quick Add"))}</button>
                            <div class="rx-quick-menu">
                                <button data-new="Project">${e(t("مشروع جديد", "New Project"))}</button>
                                <button data-new="Quotation">${e(t("عرض سعر جديد", "New Quotation"))}</button>
                                <button data-new="RONIX Contract">${e(t("عقد جديد", "New Contract"))}</button>
                                <button data-new="RONIX Claim">${e(t("مطالبة جديدة", "New Claim"))}</button>
                                <button data-new="Sales Invoice">${e(t("فاتورة مبيعات", "Sales Invoice"))}</button>
                                <button data-new="Payment Entry">${e(t("سند تحصيل", "Collection Entry"))}</button>
                            </div>
                        </div>
                        <button class="rx-chip rx-lang">${rtl ? "EN 🌐" : "العربية 🌐"}</button>
                        <span class="rx-chip rx-currency">${e(t("عملة الأساس:", "Base currency:"))} ${e(currency)}</span>
                    </div>
                </header>

                <div class="rx-content">
                    <section class="rx-command">
                        <div class="rx-command-main">
                            <div><h2>${e(t("ملخص اليوم", "Today's Summary"))}</h2><p>${e(t("ما يحتاج قرارًا أو متابعة اليوم — بدون خلط بين الشاشات والتقارير", "What needs a decision or follow-up today — clearly connected to source records"))}</p></div>
                            <div class="rx-command-actions">
                                <button data-new="Quotation">＋ ${e(t("عرض سعر", "Quotation"))}</button>
                                <button data-kind="doctype" data-route="RONIX Claim">☎ ${e(t("المطالبات", "Claims"))}</button>
                                <button data-kind="doctype" data-route="RONIX Contract">▣ ${e(t("العقود", "Contracts"))}</button>
                                <button data-kind="report" data-route="RONIX Project Profitability">▤ ${e(t("التقارير", "Reports"))}</button>
                            </div>
                        </div>
                        ${metric_card(t("المطالبات المفتوحة", "Open receivables"), money(summary.open_receivables), `${summary.open_invoice_count || 0} ${t("فاتورة مفتوحة", "open invoices")}`, "danger")}
                        ${metric_card(t("المتأخر للتحصيل", "Overdue collection"), money(summary.overdue_receivables), `${summary.overdue_invoice_count || 0} ${t("فاتورة متأخرة", "overdue invoices")}`, "gold")}
                        ${metric_card(t("تحصيل الشهر", "Collected this month"), money(summary.collected_this_month), e(summary.month_label || ""), "good")}
                        ${metric_card(t("عروض تحتاج متابعة", "Quotations to follow up"), Number(summary.quotation_followup || 0).toLocaleString(), t("مسودة + مفتوح", "draft + open"), "blue")}
                    </section>

                    <section class="rx-portfolio">
                        <div class="rx-portfolio-head">
                            <div><small>Single Source of Truth · Drill-Down</small><h3>${e(t("محفظة المشروعات والربحية", "Projects & Profitability Portfolio"))}</h3><p>${e(t("العقد ← الفوترة ← التحصيل ← التكلفة ← ساعات الفريق ← الربح", "Contract → Billing → Collection → Cost → Team Hours → Profit"))}</p></div>
                            <button class="rx-btn light" data-kind="report" data-route="RONIX Project Profitability">${e(t("التقرير الكامل", "Full Report"))}</button>
                        </div>
                        <div class="rx-portfolio-kpis">
                            ${portfolio_metric(t("قيمة العقود", "Contract value"), money(portfolio.contract_value), "RONIX Contract")}
                            ${portfolio_metric(t("مفتوح للتحصيل", "Outstanding"), money(portfolio.outstanding_amount), "RONIX Claim")}
                            ${portfolio_metric(t("تكلفة فعلية", "Actual cost"), money(portfolio.actual_cost), "Expense Claim")}
                            ${portfolio_metric(t("ربح متوقع", "Expected profit"), money(portfolio.expected_profit), "Project")}
                            ${portfolio_metric(t("ساعات الفريق", "Team hours"), `${Number(portfolio.hours || 0).toLocaleString()} h`, "Timesheet")}
                        </div>
                        <div class="rx-project-grid">${project_cards}</div>
                    </section>

                    <section class="rx-launchpad">
                        <div class="rx-launchpad-head"><div><small>RONIX ERP</small><h3>${e(t("تشغيل النظام", "Operate the System"))}</h3></div><span>${e(t("إدخال البيانات، المتابعة والطباعة من السجلات الفعلية", "Enter data, follow up and print from live records"))}</span></div>
                        <div class="rx-launch-grid">
                            ${launch_card("◆", t("المشروعات", "Projects"), t("إضافة مشروع ومتابعة التنفيذ", "Create projects and monitor delivery"), "Project")}
                            ${launch_card("▣", t("العقود", "Contracts"), t("العقود والمراحل والأرصدة", "Contracts, milestones and balances"), "RONIX Contract")}
                            ${launch_card("▤", t("المطالبات والفواتير", "Claims & Invoices"), t("المطالبة ثم الفاتورة والتحصيل", "Claim, invoice and collection"), "RONIX Claim")}
                            ${launch_card("▦", t("التقارير والطباعة", "Reports & Printing"), t("ربحية المشروع ودفتر الأستاذ", "Project profitability and ledger"), "report:RONIX Project Profitability")}
                        </div>
                    </section>
                </div>
            </main>

            <aside class="rx-sidebar no-print">
                <div class="rx-brand"><img src="/assets/ronix_erp/images/ronix-logo.png" alt="RONIX"><div><h1>RONIX STEEL</h1><span>${e(t("نظام إدارة متكامل", "Integrated Management System"))}</span><small>V5.5.21</small></div></div>
                <nav><div class="rx-nav-title">${e(t("التشغيل", "OPERATIONS"))}</div>${nav_html}</nav>
                <div class="rx-support"><span>${e(t("النظام الحالي", "Current system"))}</span><b>RONIX ERP · ${e(data.company || "RONIX STEEL")}</b><small>${e(t("بيانات حية من ERPNext", "Live ERPNext data"))}</small></div>
            </aside>
        </div>
    `);

    ensure_ronix_styles();
    bind_ronix_dashboard(wrapper);

    function metric_card(label, value, detail, tone) {
        return `<article class="rx-command-kpi ${tone}"><span>${e(label)}</span><b>${value}</b><small>${detail}</small></article>`;
    }
    function portfolio_metric(label, value, route) {
        return `<button data-kind="doctype" data-route="${e(route)}"><span>${e(label)}</span><b>${value}</b></button>`;
    }
    function launch_card(icon, label, description, route) {
        const is_report = String(route).startsWith("report:");
        return `<button class="rx-launch" data-kind="${is_report ? "report" : "doctype"}" data-route="${e(String(route).replace("report:", ""))}"><i>${icon}</i><span><b>${e(label)}</b><small>${e(description)}</small></span><strong>‹</strong></button>`;
    }
}

function bind_ronix_dashboard(wrapper) {
    const shell = $(wrapper).find(".rx-v5521");
    shell.find(".rx-menu, .rx-mobile-overlay").on("click", () => shell.toggleClass("sidebar-open"));
    shell.find(".rx-lang").on("click", () => {
        wrapper.ronix_dashboard.lang = wrapper.ronix_dashboard.lang === "ar" ? "en" : "ar";
        render_ronix_dashboard(wrapper);
    });
    shell.find(".rx-quick-toggle").on("click", (event) => {
        event.stopPropagation();
        shell.find(".rx-quick-wrap").toggleClass("open");
    });
    shell.on("click", () => shell.find(".rx-quick-wrap").removeClass("open"));
    shell.find(".rx-quick-menu").on("click", (event) => event.stopPropagation());
    shell.find("[data-new]").on("click", function () { frappe.new_doc($(this).attr("data-new")); });
    shell.find("[data-project]").on("click", function () { frappe.set_route("Form", "Project", $(this).attr("data-project")); });
    shell.find("[data-kind]").on("click", function () {
        const kind = $(this).attr("data-kind");
        const route = $(this).attr("data-route");
        if (kind === "dashboard") return;
        if (kind === "focus-search") {
            shell.find(".rx-search input").trigger("focus");
        } else if (kind === "report") {
            frappe.set_route("query-report", route);
        } else if (kind === "doctype" && route) {
            frappe.set_route("List", route, "List");
        }
    });
    shell.find(".rx-search input").on("input", function () {
        const query = String($(this).val() || "").trim().toLowerCase();
        shell.find(".rx-project-card, .rx-launch").each(function () {
            $(this).toggle(!query || $(this).text().toLowerCase().includes(query));
        });
    });
}

function status_label(status, arabic) {
    if (!arabic) return status || "Open";
    return ({ Open: "مفتوح", Completed: "مكتمل", Cancelled: "ملغي", Overdue: "متأخر" })[status] || status || "مفتوح";
}

function ensure_ronix_styles() {
    if (document.getElementById("ronix-v5521-styles")) return;
    const style = document.createElement("style");
    style.id = "ronix-v5521-styles";
    style.textContent = `
        .rx-v5521{--navy:#07172c;--navy2:#0b3558;--blue:#135f9f;--gold:#bd8d31;--ink:#10263e;--muted:#718399;--line:#dbe5ee;--surface:#f4f7fb;position:fixed;inset:0;z-index:1040;display:grid;grid-template-columns:minmax(0,1fr) 286px;background:var(--surface);color:var(--ink);font-family:Tahoma,"Segoe UI",Arial,sans-serif;overflow:hidden}
        .rx-v5521 *{box-sizing:border-box}.rx-v5521 button,.rx-v5521 input{font:inherit}.rx-main{grid-column:1;min-width:0;height:100vh;overflow:auto;direction:rtl}.rx-sidebar{grid-column:2;grid-row:1;display:flex;flex-direction:column;width:286px;height:100vh;overflow:auto;color:#fff;background:linear-gradient(180deg,var(--navy),#092a49 62%,var(--navy2));box-shadow:-12px 0 38px rgba(2,18,36,.12);direction:rtl}
        .rx-brand{display:flex;align-items:center;gap:12px;padding:20px 16px 17px;position:sticky;top:0;z-index:3;background:rgba(7,23,44,.97);border-bottom:1px solid rgba(255,255,255,.1)}.rx-brand img{width:54px;height:54px;object-fit:contain;border-radius:50%;background:#fff;border:1px solid rgba(214,176,77,.65)}.rx-brand h1{font-size:17px;letter-spacing:.04em;margin:0;color:#fff}.rx-brand span{display:block;color:#b8cce0;font-size:9px;margin-top:3px}.rx-brand small{display:inline-block;color:#e5bf62;border:1px solid rgba(229,191,98,.35);border-radius:20px;padding:2px 7px;margin-top:5px;font-size:8px}
        .rx-sidebar nav{padding:11px 9px;flex:1}.rx-nav-title{padding:8px 11px 5px;color:#6f91b0;font-size:9px;font-weight:800;letter-spacing:.13em}.rx-nav-btn,.rx-nav-child{width:100%;border:0;color:#d8e8f6;background:transparent;display:grid;align-items:center;border-radius:11px;cursor:pointer;text-align:right}.rx-nav-btn{grid-template-columns:18px 1fr 28px;gap:8px;padding:10px 11px;margin:2px 0;font-weight:700;font-size:12px}.rx-nav-btn:hover,.rx-nav-btn.active,.rx-nav-child:hover,.rx-nav-child.active{color:#fff;background:rgba(48,147,238,.17)}.rx-nav-btn.active{border:1px solid rgba(91,177,255,.25);box-shadow:inset -3px 0 #51aefb}.rx-nav-icon{text-align:center;color:#8cc8f5;font-size:17px}.rx-nav-caret{color:#88a6bf;font-size:18px}.rx-nav-child{grid-template-columns:1fr 25px;margin:3px 0 3px;padding:9px 14px 9px 10px;font-size:10px;color:#afc6da}.rx-support{margin:8px 12px 14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:14px;padding:12px 13px}.rx-support span,.rx-support small{display:block;color:#90acc5;font-size:9px}.rx-support b{display:block;color:#fff;font-size:10px;margin:4px 0}
        .rx-topbar{min-height:72px;display:flex;align-items:center;gap:12px;padding:10px 28px;position:sticky;top:0;z-index:20;background:rgba(244,247,251,.94);backdrop-filter:blur(12px);border-bottom:1px solid rgba(210,220,232,.8)}.rx-menu{display:none;border:1px solid var(--line);background:#fff;width:42px;height:42px;border-radius:11px;color:#173b60}.rx-search{position:relative;flex:1;max-width:700px}.rx-search input{width:100%;height:45px;padding:10px 42px 10px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;outline:none;color:#17324d}.rx-search input:focus{border-color:#5aa9e5;box-shadow:0 0 0 3px rgba(60,149,219,.1)}.rx-search span{position:absolute;right:15px;top:9px;color:#6f8295;font-size:21px}.rx-top-actions{margin-right:auto;display:flex;align-items:center;gap:8px;direction:rtl}.rx-chip{height:39px;border:1px solid var(--line);border-radius:11px;background:#fff;color:#17324d;padding:8px 12px;font-size:10px;font-weight:800;white-space:nowrap}.rx-quick-wrap{position:relative}.rx-quick-menu{display:none;position:absolute;top:46px;right:0;width:190px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 16px 42px rgba(12,43,70,.18);z-index:30}.rx-quick-wrap.open .rx-quick-menu{display:grid}.rx-quick-menu button{border:0;background:transparent;text-align:right;padding:9px;border-radius:8px;color:#183954;font-size:10px}.rx-quick-menu button:hover{background:#edf5fb}
        .rx-content{padding:0 28px 36px;max-width:1780px;margin:auto}.rx-command{display:grid;grid-template-columns:1.35fr repeat(4,minmax(145px,.78fr));gap:10px;margin:18px 0 14px;align-items:stretch}.rx-command-main{background:linear-gradient(135deg,#0a2948,#123e69);color:#fff;border:1px solid #0b365f;border-radius:16px;padding:15px 17px;display:flex;flex-direction:column;justify-content:space-between;min-height:112px;box-shadow:0 9px 25px rgba(16,53,86,.16)}.rx-command-main h2{font-size:18px;margin:0 0 6px;color:#fff}.rx-command-main p{margin:0;color:#c8d9e8;font-size:10px;line-height:1.6}.rx-command-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.rx-command-actions button{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.09);color:#fff;border-radius:8px;padding:6px 9px;font-weight:800;font-size:9px;cursor:pointer}.rx-command-actions button:hover{background:#fff;color:#0b365f}.rx-command-kpi{background:#fff;border:1px solid #d7e2eb;border-radius:15px;padding:13px 14px;box-shadow:0 5px 16px rgba(20,52,80,.07);display:flex;flex-direction:column;justify-content:center;min-width:0}.rx-command-kpi span{font-size:9px;color:#74879a;font-weight:800}.rx-command-kpi b{font-size:18px;color:#123e69;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.rx-command-kpi small{font-size:8px;color:#8b9aa8;margin-top:4px}.rx-command-kpi.danger{border-top:3px solid #c93d4c}.rx-command-kpi.good{border-top:3px solid #2c9b6c}.rx-command-kpi.gold{border-top:3px solid #c59632}.rx-command-kpi.blue{border-top:3px solid #337db5}
        .rx-portfolio,.rx-launchpad{margin:14px 0;border:1px solid var(--line);background:#fff;border-radius:18px;padding:16px;box-shadow:0 10px 28px rgba(15,39,68,.05)}.rx-portfolio-head,.rx-launchpad-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rx-portfolio-head small,.rx-launchpad-head small{color:#9b762e;font-size:9px;font-weight:800}.rx-portfolio-head h3,.rx-launchpad-head h3{margin:3px 0;color:#0b3157;font-size:17px}.rx-portfolio-head p,.rx-launchpad-head>span{margin:0;color:#6b7d90;font-size:10px}.rx-btn{border:0;border-radius:10px;padding:9px 13px;font-weight:800;font-size:10px;cursor:pointer}.rx-btn.light{background:#fff;border:1px solid var(--line);color:#173b60}.rx-btn.primary{background:linear-gradient(135deg,#0d5f9d,#298bd0);color:#fff;margin-top:10px}.rx-portfolio-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin:13px 0}.rx-portfolio-kpis button{border:1px solid #dce5ed;background:#f8fafc;border-radius:11px;padding:10px;text-align:right;cursor:pointer}.rx-portfolio-kpis button:hover{border-color:#b99043;background:#fff}.rx-portfolio-kpis span{display:block;font-size:9px;color:#708296}.rx-portfolio-kpis b{display:block;margin-top:4px;font-size:13px;color:#123d67}.rx-project-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rx-project-card{border:1px solid var(--line);background:#fff;border-radius:13px;padding:11px;text-align:right;cursor:pointer;transition:.15s}.rx-project-card:hover{transform:translateY(-2px);border-color:#c19a4c;box-shadow:0 8px 22px rgba(26,53,80,.09)}.rx-project-top{display:flex;justify-content:space-between;font-size:9px;color:#6d7f91}.rx-project-top span{font-weight:900;color:#9b762e}.rx-project-card h4{margin:7px 0;font-size:11px;color:#173c60;white-space:normal;min-height:30px}.rx-progress{height:5px;background:#edf2f6;border-radius:5px;overflow:hidden}.rx-progress i{display:block;height:100%;background:linear-gradient(90deg,#b88932,#e2be68)}.rx-project-values{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}.rx-project-values span{font-size:8px;color:#718396}.rx-project-values b{display:block;color:#203b55;font-size:9px;margin-top:2px}.rx-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;border:1px dashed #cfdce7;border-radius:14px;background:#f9fbfd;color:#708397;text-align:center;padding:25px}.rx-empty b{color:#173b60;margin-bottom:6px}
        .rx-launchpad{margin-top:16px}.rx-launch-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:13px}.rx-launch{display:grid;grid-template-columns:38px 1fr 14px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;background:#fff;text-align:right;padding:11px;cursor:pointer;color:#173b60}.rx-launch:hover{border-color:#c19a4c;background:#fbfdff}.rx-launch i{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#eaf3fa;color:#176ca7;font-style:normal;font-size:18px}.rx-launch span b,.rx-launch span small{display:block}.rx-launch span b{font-size:10px}.rx-launch span small{font-size:8px;color:#74879a;margin-top:3px}.rx-launch strong{color:#a87c2b}.rx-mobile-overlay{display:none}
        .rx-v5521[dir="ltr"] .rx-main,.rx-v5521[dir="ltr"] .rx-sidebar{direction:ltr}.rx-v5521[dir="ltr"] .rx-nav-btn,.rx-v5521[dir="ltr"] .rx-nav-child,.rx-v5521[dir="ltr"] .rx-project-card,.rx-v5521[dir="ltr"] .rx-portfolio-kpis button,.rx-v5521[dir="ltr"] .rx-launch{text-align:left}.rx-v5521[dir="ltr"] .rx-search input{padding-left:42px;padding-right:14px}.rx-v5521[dir="ltr"] .rx-search span{left:15px;right:auto}.rx-v5521[dir="ltr"] .rx-top-actions{margin-left:auto;margin-right:0}.rx-v5521[dir="ltr"] .rx-quick-menu{left:0;right:auto}.rx-v5521[dir="ltr"] .rx-quick-menu button{text-align:left}
        @media(max-width:1250px){.rx-command{grid-template-columns:1fr repeat(2,1fr)}.rx-command-main{grid-row:span 2}.rx-project-grid{grid-template-columns:repeat(2,1fr)}.rx-portfolio-kpis{grid-template-columns:repeat(3,1fr)}.rx-launch-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:760px){.rx-v5521{display:block}.rx-main{width:100%}.rx-sidebar{position:fixed;right:0;top:0;z-index:50;width:min(310px,88vw);transform:translateX(105%);transition:.22s}.rx-v5521.sidebar-open .rx-sidebar{transform:none}.rx-mobile-overlay{position:fixed;inset:0;z-index:45;background:rgba(2,18,34,.42)}.rx-v5521.sidebar-open .rx-mobile-overlay{display:block}.rx-topbar{min-height:62px;padding:9px 12px}.rx-menu{display:block;flex:0 0 auto}.rx-top-actions .rx-currency,.rx-top-actions .rx-quick-wrap{display:none}.rx-content{padding:0 12px 28px}.rx-command{grid-template-columns:1fr 1fr;margin-top:12px}.rx-command-main{grid-column:1/-1;grid-row:auto}.rx-command-kpi b{font-size:15px}.rx-portfolio-head,.rx-launchpad-head{align-items:flex-start;flex-direction:column}.rx-portfolio-kpis,.rx-project-grid,.rx-launch-grid{grid-template-columns:1fr}.rx-search input{height:42px}.rx-v5521[dir="ltr"] .rx-sidebar{left:0;right:auto;transform:translateX(-105%)}.rx-v5521[dir="ltr"].sidebar-open .rx-sidebar{transform:none}}
        @media print{.rx-v5521{position:static;display:block;overflow:visible}.rx-main{height:auto;overflow:visible}.no-print,.rx-launchpad{display:none!important}.rx-content{padding:0}.rx-command,.rx-portfolio{break-inside:avoid;box-shadow:none}.rx-project-grid{grid-template-columns:repeat(3,1fr)}}
    `;
    document.head.appendChild(style);
}
