frappe.pages["ronix-erp-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("RONIX ERP"),
        single_column: true,
    });

    const state = { lang: "ar", data: null, loading: false };
    const esc = (value) => frappe.utils.escape_html(String(value ?? ""));

    const labels = {
        ar: {
            version: "V5.5.25",
            product: "نظام إدارة متكامل",
            core: "التجاري والتحصيل · CORE",
            dashboard: "لوحة التحكم",
            main_dashboard: "لوحة التحكم الرئيسية",
            search: "ابحث في المشروعات...",
            quick_add: "إضافة سريعة",
            today: "ملخص اليوم",
            today_note: "ما يحتاج قرارًا أو متابعة اليوم — بدون خلط بين القيود والتقارير",
            title: "لوحة التحكم الرئيسية",
            subtitle: "بيانات الإنتاج منفصلة عن QA · مصدر واحد للحقيقة",
            manufacturing: "التصنيع والجمالونات",
            qa: "إدخال QA مؤقتًا في المؤشرات",
            overdue: "المطالبات المستحقة",
            outstanding: "المبالغ للتحصيل",
            collected: "تحصيل الشهر",
            quotations_follow: "عروض تحتاج متابعة",
            overdue_count: "فاتورة متأخرة",
            from_approved: "من السجلات المعتمدة فقط",
            current_month: "الشهر الحالي",
            live_data: "مباشر من ERPNext",
            portfolio: "محفظة المشروعات والربحية",
            portfolio_note: "العقد ← الفوترة ← التحصيل ← التكلفة ← ساعات الفريق ← الربح",
            source: "Single Source of Truth · Drill-Down",
            plan: "QA / اختيار المخططة",
            contract_value: "قيمة العقود",
            collected_total: "متحصل التحصيل",
            actual_cost: "تكلفة فعلية",
            net_profit: "ربح متوقع",
            projects: "المشروعات",
            contract: "العقد",
            invoiced: "الفوترة",
            project_collected: "المتحصل",
            cost: "التكلفة",
            profit: "الربح",
            outstanding_project: "المتبقي",
            margin: "الهامش",
            no_projects: "لا توجد مشروعات مرتبطة بعقود RONIX حتى الآن.",
            refresh: "تحديث البيانات",
            refreshed: "تم تحديث بيانات لوحة التحكم",
            loading: "جاري تحميل البيانات الحقيقية...",
            load_error: "تعذر تحميل بيانات لوحة التحكم. أعد المحاولة.",
            quotation: "عرض سعر",
            contracts: "العقود",
            claims: "المطالبات",
            reports: "التقارير",
            quotations: "عروض الأسعار",
            collections: "التحصيلات / سندات القبض",
            collection_center: "مركز المطالبات والتحصيل",
            comprehensive_search: "البحث الشامل",
            sales: "إدارة المبيعات",
            projects_group: "المشاريع",
            engineering: "الهندسة والتنفيذ",
            purchasing: "المشتريات",
            inventory: "المخزون",
            manufacturing_group: "التصنيع",
            expenses: "المصروفات والتكاليف",
            accounting: "الحسابات والتقارير",
            customers: "العملاء",
            sales_invoices: "فواتير المبيعات",
            suppliers: "الموردون",
            purchase_orders: "أوامر الشراء",
            purchase_invoices: "فواتير المشتريات",
            items: "الأصناف",
            warehouses: "المخازن",
            stock_entries: "حركات المخزون",
            work_orders: "أوامر التشغيل",
            boms: "قوائم المواد BOM",
            tasks: "المهام",
            timesheets: "ساعات العمل",
            profitability: "ربحية المشروعات",
            general_ledger: "دفتر الأستاذ",
            receivables: "حسابات العملاء",
            trial_balance: "ميزان المراجعة",
            company: "الشركة",
            open: "فتح",
            status: "الحالة",
            unnamed: "مشروع بدون اسم",
        },
        en: {
            version: "V5.5.25",
            product: "Integrated Management System",
            core: "Commercial & Collections · CORE",
            dashboard: "Dashboard",
            main_dashboard: "Main Dashboard",
            search: "Search projects...",
            quick_add: "Quick Add",
            today: "Today Summary",
            today_note: "Decisions and follow-ups due today, separated from accounting reports",
            title: "Executive Dashboard",
            subtitle: "Production data separated from QA · Single source of truth",
            manufacturing: "Manufacturing & Trusses",
            qa: "Include QA temporarily",
            overdue: "Overdue Receivables",
            outstanding: "Outstanding Amount",
            collected: "Collected This Month",
            quotations_follow: "Quotations to Follow",
            overdue_count: "overdue invoice(s)",
            from_approved: "Approved records only",
            current_month: "Current month",
            live_data: "Live from ERPNext",
            portfolio: "Projects & Profitability Portfolio",
            portfolio_note: "Contract ← invoicing ← collection ← cost ← team hours ← profit",
            source: "Single Source of Truth · Drill-Down",
            plan: "QA / Planned Selection",
            contract_value: "Contract Value",
            collected_total: "Cash Collected",
            actual_cost: "Actual Cost",
            net_profit: "Net Profit",
            projects: "Projects",
            contract: "Contract",
            invoiced: "Invoiced",
            project_collected: "Collected",
            cost: "Cost",
            profit: "Profit",
            outstanding_project: "Outstanding",
            margin: "Margin",
            no_projects: "No projects linked to RONIX contracts yet.",
            refresh: "Refresh Data",
            refreshed: "Dashboard data refreshed",
            loading: "Loading live ERP data...",
            load_error: "Dashboard data could not be loaded. Please retry.",
            quotation: "Quotation",
            contracts: "Contracts",
            claims: "Claims",
            reports: "Reports",
            quotations: "Quotations",
            collections: "Collections / Receipts",
            collection_center: "Claims & Collection Center",
            comprehensive_search: "Global Search",
            sales: "Sales Management",
            projects_group: "Projects",
            engineering: "Engineering & Execution",
            purchasing: "Purchasing",
            inventory: "Inventory",
            manufacturing_group: "Manufacturing",
            expenses: "Expenses & Costs",
            accounting: "Accounting & Reports",
            customers: "Customers",
            sales_invoices: "Sales Invoices",
            suppliers: "Suppliers",
            purchase_orders: "Purchase Orders",
            purchase_invoices: "Purchase Invoices",
            items: "Items",
            warehouses: "Warehouses",
            stock_entries: "Stock Entries",
            work_orders: "Work Orders",
            boms: "Bills of Materials",
            tasks: "Tasks",
            timesheets: "Timesheets",
            profitability: "Project Profitability",
            general_ledger: "General Ledger",
            receivables: "Accounts Receivable",
            trial_balance: "Trial Balance",
            company: "Company",
            open: "Open",
            status: "Status",
            unnamed: "Unnamed Project",
        },
    };

    const navGroups = [
        {
            key: "dashboard",
            icon: "home",
            open: true,
            items: [
                { key: "main_dashboard", icon: "home", action: "dashboard" },
                { key: "comprehensive_search", icon: "search", action: "focus-search" },
            ],
        },
        {
            key: "sales",
            icon: "users",
            items: [
                { key: "customers", icon: "users", doctype: "Customer" },
                { key: "quotations", icon: "file-text", doctype: "Quotation" },
                { key: "sales_invoices", icon: "invoice", doctype: "Sales Invoice" },
            ],
        },
        {
            key: "contracts",
            icon: "file-contract",
            items: [
                { key: "contracts", icon: "file-contract", doctype: "RONIX Contract" },
                { key: "claims", icon: "request", doctype: "RONIX Claim" },
                { key: "collections", icon: "payment", doctype: "Payment Entry" },
            ],
        },
        {
            key: "projects_group",
            icon: "folder-normal",
            items: [
                { key: "projects", icon: "folder-normal", doctype: "Project" },
                { key: "tasks", icon: "task", doctype: "Task" },
                { key: "timesheets", icon: "timer", doctype: "Timesheet" },
                { key: "profitability", icon: "chart", report: "RONIX Project Profitability" },
            ],
        },
        {
            key: "engineering",
            icon: "organization",
            items: [
                { key: "tasks", icon: "task", doctype: "Task" },
                { key: "timesheets", icon: "timer", doctype: "Timesheet" },
            ],
        },
        {
            key: "purchasing",
            icon: "shopping-cart",
            items: [
                { key: "suppliers", icon: "users", doctype: "Supplier" },
                { key: "purchase_orders", icon: "shopping-cart", doctype: "Purchase Order" },
                { key: "purchase_invoices", icon: "invoice", doctype: "Purchase Invoice" },
            ],
        },
        {
            key: "inventory",
            icon: "stock",
            items: [
                { key: "items", icon: "tag", doctype: "Item" },
                { key: "warehouses", icon: "stock", doctype: "Warehouse" },
                { key: "stock_entries", icon: "stock", doctype: "Stock Entry" },
            ],
        },
        {
            key: "manufacturing_group",
            icon: "organization",
            items: [
                { key: "work_orders", icon: "organization", doctype: "Work Order" },
                { key: "boms", icon: "file-text", doctype: "BOM" },
            ],
        },
        {
            key: "accounting",
            icon: "accounting",
            items: [
                { key: "general_ledger", icon: "accounting", report: "General Ledger" },
                { key: "receivables", icon: "payment", report: "Accounts Receivable" },
                { key: "trial_balance", icon: "chart", report: "Trial Balance" },
            ],
        },
    ];

    function icon(name, size = "sm") {
        try {
            return frappe.utils.icon(name, size);
        } catch (error) {
            return frappe.utils.icon("right", size);
        }
    }

    function t(key) {
        return labels[state.lang][key] || labels.ar[key] || key;
    }

    function formatNumber(value) {
        if (value === null || value === undefined) return "—";
        return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
    }

    function formatMoney(value) {
        const currency = state.data?.currency || "EGP";
        return `${currency} ${formatNumber(value)}`;
    }

    function countValue(key) {
        const value = state.data?.counts?.[key];
        return value === null || value === undefined ? "—" : formatNumber(value);
    }

    function navMarkup() {
        return navGroups
            .map(
                (group) => `
                    <details class="ronix-nav-group" ${group.open ? "open" : ""}>
                        <summary>
                            <span class="ronix-nav-icon">${icon(group.icon)}</span>
                            <span data-i18n="${group.key}">${esc(t(group.key))}</span>
                            <span class="ronix-chevron">‹</span>
                        </summary>
                        <div class="ronix-nav-items">
                            ${group.items
                                .map(
                                    (item) => `
                                        <button class="ronix-nav-item ${item.action === "dashboard" ? "active" : ""}"
                                            data-action="${esc(item.action || "open")}" data-doctype="${esc(item.doctype || "")}" data-report="${esc(item.report || "")}">
                                            <span>${icon(item.icon)}</span>
                                            <span data-i18n="${item.key}">${esc(t(item.key))}</span>
                                        </button>
                                    `
                                )
                                .join("")}
                        </div>
                    </details>
                `
            )
            .join("");
    }

    function renderShell() {
        $(page.body).html(`
            <div class="ronix-erp" dir="rtl">
                <aside class="ronix-sidebar">
                    <div class="ronix-brand">
                        <img src="/assets/ronix_erp/images/ronix-logo.png" alt="RONIX STEEL">
                        <div><strong>RONIX STEEL</strong><small data-i18n="product">${esc(t("product"))}</small></div>
                    </div>
                    <div class="ronix-version">${esc(t("version"))}</div>
                    <section class="ronix-core-card">
                        <header><span>${esc(t("version"))}</span><strong data-i18n="core">${esc(t("core"))}</strong></header>
                        <button data-doctype="Quotation"><b data-count="quotations">—</b><span data-i18n="quotations">${esc(t("quotations"))}</span>${icon("file-text")}</button>
                        <button data-doctype="RONIX Contract"><b data-count="contracts">—</b><span data-i18n="contracts">${esc(t("contracts"))}</span>${icon("file-contract")}</button>
                        <button data-doctype="RONIX Claim"><b data-count="claims">—</b><span data-i18n="claims">${esc(t("claims"))}</span>${icon("request")}</button>
                        <button data-doctype="Payment Entry"><b data-count="collections">—</b><span data-i18n="collections">${esc(t("collections"))}</span>${icon("payment")}</button>
                        <button data-doctype="RONIX Claim"><b>•</b><span data-i18n="collection_center">${esc(t("collection_center"))}</span>${icon("payment")}</button>
                    </section>
                    <nav class="ronix-nav">${navMarkup()}</nav>
                </aside>

                <main class="ronix-main">
                    <header class="ronix-toolbar">
                        <div class="ronix-toolbar-actions">
                            <button class="ronix-currency"><span data-i18n="company">${esc(t("company"))}</span>: <b data-company>—</b></button>
                            <details class="ronix-quick-add">
                                <summary><span>＋</span><span data-i18n="quick_add">${esc(t("quick_add"))}</span></summary>
                                <div>
                                    <button data-new="Quotation" data-i18n="quotation">${esc(t("quotation"))}</button>
                                    <button data-new="RONIX Contract" data-i18n="contracts">${esc(t("contracts"))}</button>
                                    <button data-new="Project" data-i18n="projects">${esc(t("projects"))}</button>
                                    <button data-new="RONIX Claim" data-i18n="claims">${esc(t("claims"))}</button>
                                </div>
                            </details>
                            <button class="ronix-language" data-language>EN ◉</button>
                        </div>
                        <div class="ronix-search-wrap">
                            ${icon("search")}
                            <input type="search" data-project-search placeholder="${esc(t("search"))}">
                        </div>
                        <button class="ronix-refresh" title="${esc(t("refresh"))}" data-refresh>${icon("refresh")}</button>
                    </header>

                    <section class="ronix-title-panel">
                        <div>
                            <span class="ronix-eyebrow">${esc(t("version"))} Project 360 · Commercial Core · Integrated ERP</span>
                            <h1 data-i18n="title">${esc(t("title"))}</h1>
                            <p data-i18n="subtitle">${esc(t("subtitle"))}</p>
                        </div>
                        <div class="ronix-title-actions">
                            <button data-route-report="RONIX Project Profitability" data-i18n="manufacturing">${esc(t("manufacturing"))}</button>
                            <button class="secondary" data-i18n="qa">${esc(t("qa"))}</button>
                        </div>
                    </section>

                    <section class="ronix-kpi-grid">
                        <article class="ronix-today-card">
                            <h2 data-i18n="today">${esc(t("today"))}</h2>
                            <p data-i18n="today_note">${esc(t("today_note"))}</p>
                            <div>
                                <button data-new="Quotation">＋ <span data-i18n="quotation">${esc(t("quotation"))}</span></button>
                                <button data-doctype="RONIX Claim"><span data-i18n="claims">${esc(t("claims"))}</span> <b data-count="claims">—</b></button>
                                <button data-doctype="RONIX Contract"><span data-i18n="contracts">${esc(t("contracts"))}</span> <b data-count="contracts">—</b></button>
                                <button data-route-report="RONIX Project Profitability"><span data-i18n="reports">${esc(t("reports"))}</span></button>
                            </div>
                        </article>
                        <article class="ronix-kpi red">
                            <span data-i18n="overdue">${esc(t("overdue"))}</span>
                            <strong data-money="overdue_amount">—</strong>
                            <small><b data-count="overdue_invoices">—</b> <span data-i18n="overdue_count">${esc(t("overdue_count"))}</span></small>
                        </article>
                        <article class="ronix-kpi gold">
                            <span data-i18n="outstanding">${esc(t("outstanding"))}</span>
                            <strong data-money="outstanding_amount">—</strong>
                            <small data-i18n="from_approved">${esc(t("from_approved"))}</small>
                        </article>
                        <article class="ronix-kpi green">
                            <span data-i18n="collected">${esc(t("collected"))}</span>
                            <strong data-money="collected_this_month">—</strong>
                            <small data-i18n="current_month">${esc(t("current_month"))}</small>
                        </article>
                        <article class="ronix-kpi blue">
                            <span data-i18n="quotations_follow">${esc(t("quotations_follow"))}</span>
                            <strong data-kpi="pending_quotations">—</strong>
                            <small data-i18n="live_data">${esc(t("live_data"))}</small>
                        </article>
                    </section>

                    <section class="ronix-portfolio">
                        <header class="ronix-portfolio-head">
                            <div><span data-i18n="source">${esc(t("source"))}</span><h2 data-i18n="portfolio">${esc(t("portfolio"))}</h2><p data-i18n="portfolio_note">${esc(t("portfolio_note"))}</p></div>
                            <button data-route-report="RONIX Project Profitability">${icon("chart")} <span data-i18n="plan">${esc(t("plan"))}</span></button>
                        </header>
                        <div class="ronix-portfolio-totals">
                            <article><span data-i18n="contract_value">${esc(t("contract_value"))}</span><strong data-total="contract_value">—</strong></article>
                            <article><span data-i18n="collected_total">${esc(t("collected_total"))}</span><strong data-total="collected_amount">—</strong></article>
                            <article><span data-i18n="actual_cost">${esc(t("actual_cost"))}</span><strong data-total="actual_cost">—</strong></article>
                            <article><span data-i18n="net_profit">${esc(t("net_profit"))}</span><strong data-total="net_profit">—</strong></article>
                        </div>
                        <div class="ronix-project-state" data-loading-state>${icon("refresh")} <span data-i18n="loading">${esc(t("loading"))}</span></div>
                        <div class="ronix-project-grid" data-project-grid hidden></div>
                    </section>
                </main>
            </div>
        `);
    }

    function statusLabel(status) {
        const map = {
            Open: state.lang === "ar" ? "نشط" : "Open",
            Completed: state.lang === "ar" ? "مكتمل" : "Completed",
            Cancelled: state.lang === "ar" ? "ملغي" : "Cancelled",
            Overdue: state.lang === "ar" ? "متأخر" : "Overdue",
        };
        return map[status] || status || (state.lang === "ar" ? "نشط" : "Active");
    }

    function renderProjects(filter = "") {
        const grid = $(page.body).find("[data-project-grid]");
        const needle = filter.trim().toLowerCase();
        const projects = (state.data?.projects || []).filter((project) => {
            const haystack = [project.name, project.project_name, project.customer, project.contract]
                .join(" ")
                .toLowerCase();
            return !needle || haystack.includes(needle);
        });

        if (!projects.length) {
            grid.html(`<div class="ronix-empty">${icon("folder-normal", "md")}<p>${esc(t("no_projects"))}</p></div>`);
            return;
        }

        grid.html(
            projects
                .map((project) => {
                    const progress = Math.max(0, Math.min(100, Number(project.percent_complete) || 0));
                    const profitClass = Number(project.net_profit) < 0 ? "negative" : "positive";
                    return `
                        <button class="ronix-project-card" data-project="${esc(project.name)}">
                            <header>
                                <div><span>${esc(project.contract || project.name)}</span><h3>${esc(project.project_name || t("unnamed"))}</h3><small>${esc(project.customer || "—")}</small></div>
                                <div class="ronix-status"><span>${esc(statusLabel(project.status))}</span><b>${formatNumber(progress)}%</b></div>
                            </header>
                            <div class="ronix-progress"><i style="width:${progress}%"></i></div>
                            <div class="ronix-project-metrics">
                                <span><small>${esc(t("contract"))}</small><b>${formatMoney(project.contract_value)}</b></span>
                                <span><small>${esc(t("invoiced"))}</small><b>${formatMoney(project.invoiced_amount)}</b></span>
                                <span><small>${esc(t("project_collected"))}</small><b>${formatMoney(project.collected_amount)}</b></span>
                                <span><small>${esc(t("outstanding_project"))}</small><b>${formatMoney(project.outstanding_amount)}</b></span>
                                <span><small>${esc(t("cost"))}</small><b>${formatMoney(project.actual_cost)}</b></span>
                                <span class="${profitClass}"><small>${esc(t("profit"))}</small><b>${formatMoney(project.net_profit)}</b></span>
                            </div>
                            <footer><span>${esc(t("margin"))}: <b>${formatNumber(project.margin_percent)}%</b></span><span>${esc(t("open"))} ${icon(state.lang === "ar" ? "left" : "right")}</span></footer>
                        </button>
                    `;
                })
                .join("")
        );
    }

    function applyData(data) {
        state.data = data || {};
        const root = $(page.body);
        root.find("[data-company]").text(state.data.company || "—");
        Object.keys(state.data.counts || {}).forEach((key) => {
            root.find(`[data-count="${key}"]`).text(countValue(key));
        });
        Object.keys(state.data.kpis || {}).forEach((key) => {
            root.find(`[data-money="${key}"]`).text(formatMoney(state.data.kpis[key]));
            root.find(`[data-kpi="${key}"]`).text(formatNumber(state.data.kpis[key]));
        });
        Object.keys(state.data.totals || {}).forEach((key) => {
            root.find(`[data-total="${key}"]`).text(formatMoney(state.data.totals[key]));
        });
        root.find("[data-loading-state]").hide();
        root.find("[data-project-grid]").prop("hidden", false);
        renderProjects(root.find("[data-project-search]").val() || "");
    }

    function translate() {
        const root = $(page.body);
        root.find(".ronix-erp").attr("dir", state.lang === "ar" ? "rtl" : "ltr");
        root.find("[data-i18n]").each(function () {
            const key = $(this).data("i18n");
            $(this).text(t(key));
        });
        root.find("[data-language]").text(state.lang === "ar" ? "EN ◉" : "عربي ◉");
        root.find("[data-project-search]").attr("placeholder", t("search"));
        renderProjects(root.find("[data-project-search]").val() || "");
    }

    function openList(doctype) {
        if (doctype) frappe.set_route("List", doctype, "List");
    }

    function openReport(report) {
        if (report) frappe.set_route("query-report", report);
    }

    function bindEvents() {
        const root = $(page.body);
        root.on("click", "[data-doctype]", function () {
            openList($(this).data("doctype"));
        });
        root.on("click", "[data-new]", function () {
            frappe.new_doc($(this).data("new"));
        });
        root.on("click", "[data-route-report]", function () {
            openReport($(this).data("route-report"));
        });
        root.on("click", ".ronix-nav-item", function () {
            const action = $(this).data("action");
            if (action === "focus-search") {
                root.find("[data-project-search]").trigger("focus");
                return;
            }
            if (action === "dashboard") {
                root.find(".ronix-main")[0]?.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }
            if ($(this).data("doctype")) openList($(this).data("doctype"));
            if ($(this).data("report")) openReport($(this).data("report"));
        });
        root.on("click", "[data-language]", function () {
            state.lang = state.lang === "ar" ? "en" : "ar";
            translate();
        });
        root.on("input", "[data-project-search]", function () {
            renderProjects($(this).val());
        });
        root.on("click", "[data-project]", function () {
            frappe.set_route("Form", "Project", $(this).data("project"));
        });
        root.on("click", "[data-refresh]", () => loadData(true));
    }

    function loadData(showMessage = false) {
        if (state.loading) return;
        state.loading = true;
        const root = $(page.body);
        root.find("[data-refresh]").addClass("is-loading");
        frappe
            .call("ronix_erp.api.get_executive_dashboard")
            .then(({ message }) => {
                applyData(message || {});
                if (showMessage) frappe.show_alert({ message: t("refreshed"), indicator: "green" });
            })
            .catch(() => {
                root.find("[data-loading-state]").show().addClass("error").html(`${icon("error")} <span>${esc(t("load_error"))}</span>`);
            })
            .always(() => {
                state.loading = false;
                root.find("[data-refresh]").removeClass("is-loading");
            });
    }

    injectStyles();
    renderShell();
    bindEvents();
    wrapper.ronix_dashboard = { loadData, state };
    loadData();
};

frappe.pages["ronix-erp-dashboard"].on_page_show = function (wrapper) {
    document.body.classList.add("ronix-dashboard-active");
    wrapper.ronix_dashboard?.loadData();
};

frappe.pages["ronix-erp-dashboard"].on_page_hide = function () {
    document.body.classList.remove("ronix-dashboard-active");
};

function injectStyles() {
    if (document.getElementById("ronix-executive-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "ronix-executive-dashboard-style";
    style.textContent = `
        body.ronix-dashboard-active .page-head{display:none!important}
        body.ronix-dashboard-active .body-sidebar-container,body.ronix-dashboard-active .body-sidebar-placeholder{display:none!important}
        body.ronix-dashboard-active .layout-main-section-wrapper{margin:0!important}
        body.ronix-dashboard-active .layout-main-section{padding:0!important}
        body.ronix-dashboard-active .page-body{max-width:none!important;padding:0!important}
        body.ronix-dashboard-active .container.page-body{width:100%!important}
        .ronix-erp{--navy:#061d32;--navy2:#0c3858;--blue:#1779bd;--gold:#c38b25;--green:#169561;--red:#e0354f;--ink:#0a3153;--muted:#6d7f93;--line:#dce6ef;display:grid;grid-template-columns:minmax(0,1fr) 270px;grid-template-areas:"main sidebar";height:calc(100vh - 48px);min-height:720px;background:#eef3f8;color:var(--ink);font-family:Inter,"Noto Sans Arabic",Tahoma,Arial,sans-serif;overflow:hidden}
        .ronix-erp[dir="ltr"]{grid-template-columns:270px minmax(0,1fr);grid-template-areas:"sidebar main"}
        .ronix-sidebar{grid-area:sidebar;display:flex;flex-direction:column;min-width:0;background:linear-gradient(180deg,#061a2d 0%,#082a45 100%);color:#fff;overflow:auto;scrollbar-width:thin;scrollbar-color:#2a5b7d transparent}
        .ronix-brand{display:flex;align-items:center;gap:10px;padding:18px 18px 9px}.ronix-brand img{width:45px;height:45px;object-fit:contain;border-radius:50%;background:#fff}.ronix-brand strong,.ronix-brand small{display:block}.ronix-brand strong{font-size:16px;letter-spacing:.02em}.ronix-brand small{margin-top:2px;font-size:9px;color:#d6e0e8}.ronix-version{align-self:center;padding:3px 9px;border-radius:999px;background:#183a52;color:#fff;font-size:9px;font-weight:800}
        .ronix-core-card{margin:16px 14px 10px;padding:10px;border:1px solid rgba(201,151,55,.38);border-radius:16px;background:rgba(255,255,255,.035)}.ronix-core-card header{display:flex;justify-content:space-between;gap:7px;padding:0 2px 8px;color:#e5bc62;font-size:9px}.ronix-core-card button{display:grid;grid-template-columns:24px 1fr 18px;align-items:center;gap:7px;width:100%;margin-top:6px;padding:9px 10px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.035);color:#f3f7fa;text-align:start;font-size:11px;font-weight:700;cursor:pointer}.ronix-core-card button:hover{background:rgba(41,132,194,.18);border-color:#2d82bb}.ronix-core-card button b{display:grid;place-items:center;min-width:22px;padding:2px 4px;border-radius:999px;background:rgba(255,255,255,.13);font-size:9px}.ronix-core-card button svg{color:#dfaa43;width:15px;height:15px}
        .ronix-nav{padding:0 10px 28px}.ronix-nav-group{margin-top:7px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.025);overflow:hidden}.ronix-nav-group summary{display:grid;grid-template-columns:23px 1fr 16px;align-items:center;gap:8px;padding:12px 13px;list-style:none;color:#f2f6f9;font-size:12px;font-weight:750;cursor:pointer}.ronix-nav-group summary::-webkit-details-marker{display:none}.ronix-nav-group[open] summary{background:rgba(18,92,140,.42)}.ronix-nav-icon svg{width:15px;height:15px;color:#9ec9e8}.ronix-chevron{font-size:19px;transition:.15s}.ronix-nav-group[open] .ronix-chevron{transform:rotate(-90deg)}.ronix-nav-items{padding:6px}.ronix-nav-item{display:grid;grid-template-columns:20px 1fr;align-items:center;gap:8px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:#dbe8f1;text-align:start;font-size:10px;cursor:pointer}.ronix-nav-item:hover,.ronix-nav-item.active{background:#124e78;color:#fff;box-shadow:inset 3px 0 #36a2e8}.ronix-nav-item svg{width:14px;height:14px}
        .ronix-main{grid-area:main;min-width:0;overflow:auto;padding:12px 18px 26px;scrollbar-width:thin;scrollbar-color:#a3b8c8 transparent}.ronix-toolbar{display:grid;grid-template-columns:auto minmax(260px,1fr) auto;align-items:center;gap:12px;margin-bottom:12px}.ronix-toolbar-actions{display:flex;align-items:center;gap:7px}.ronix-toolbar button,.ronix-toolbar summary{border:1px solid #cad8e4;border-radius:9px;background:#fff;color:#173b59;font-size:11px;font-weight:700;cursor:pointer}.ronix-currency{padding:9px 11px}.ronix-language{padding:9px 15px}.ronix-refresh{display:grid;place-items:center;width:38px;height:38px}.ronix-refresh svg{width:16px}.ronix-refresh.is-loading svg{animation:ronix-spin .8s linear infinite}.ronix-quick-add{position:relative}.ronix-quick-add summary{display:flex;align-items:center;gap:5px;padding:9px 13px;list-style:none}.ronix-quick-add summary::-webkit-details-marker{display:none}.ronix-quick-add>div{position:absolute;z-index:20;top:43px;inset-inline-start:0;min-width:165px;padding:6px;border:1px solid #d7e1ea;border-radius:11px;background:#fff;box-shadow:0 14px 35px rgba(7,31,53,.17)}.ronix-quick-add>div button{display:block;width:100%;padding:9px;border:0;text-align:start}.ronix-search-wrap{display:flex;align-items:center;gap:8px;padding:0 13px;border:1px solid #d2dee8;border-radius:11px;background:#fff}.ronix-search-wrap svg{width:15px;color:#6d8193}.ronix-search-wrap input{width:100%;height:38px;border:0!important;box-shadow:none!important;outline:0;background:transparent;font-size:12px}
        .ronix-title-panel{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px;border:1px solid #d5e1eb;border-radius:17px;background:#fff;box-shadow:0 6px 20px rgba(12,49,85,.035)}.ronix-eyebrow{display:inline-block;margin-bottom:5px;padding:3px 8px;border-radius:6px;background:#0c3c61;color:#fff;font-size:8px;font-weight:800}.ronix-title-panel h1{margin:0;color:#082f50;font-size:22px;font-weight:800}.ronix-title-panel p{margin:3px 0 0;color:#6d8194;font-size:9px}.ronix-title-actions{display:flex;gap:8px}.ronix-title-actions button{padding:10px 14px;border:0;border-radius:8px;background:#147bbe;color:#fff;font-size:11px;font-weight:800;cursor:pointer}.ronix-title-actions button.secondary{border:1px solid #c7d8e6;background:#fff;color:#163b58}
        .ronix-kpi-grid{display:grid;grid-template-columns:1.35fr repeat(4,minmax(145px,1fr));gap:10px;margin:12px 0}.ronix-kpi-grid article{min-height:101px;border:1px solid #d7e3ec;border-radius:14px;background:#fff}.ronix-today-card{padding:17px 18px;background:linear-gradient(135deg,#0b3455,#0d4169)!important;color:#fff}.ronix-today-card h2{margin:0 0 4px;color:#fff;font-size:16px}.ronix-today-card p{margin:0 0 13px;color:#cfe0ec;font-size:8px}.ronix-today-card div{display:flex;gap:6px;flex-wrap:wrap}.ronix-today-card button{padding:6px 9px;border:1px solid rgba(255,255,255,.3);border-radius:7px;background:rgba(255,255,255,.06);color:#fff;font-size:9px;font-weight:700;cursor:pointer}.ronix-kpi{position:relative;padding:18px 16px;border-top:3px solid var(--accent)!important}.ronix-kpi.red{--accent:var(--red)}.ronix-kpi.gold{--accent:var(--gold)}.ronix-kpi.green{--accent:var(--green)}.ronix-kpi.blue{--accent:var(--blue)}.ronix-kpi span,.ronix-kpi small,.ronix-kpi strong{display:block}.ronix-kpi span{color:#526b80;font-size:9px;font-weight:700}.ronix-kpi strong{margin:11px 0 6px;color:#07375d;font-size:17px;font-weight:850;white-space:nowrap}.ronix-kpi small{color:#8092a2;font-size:8px}.ronix-kpi small b{display:inline}
        .ronix-portfolio{padding:15px;border:1px solid #d4e1eb;border-radius:18px;background:#fff}.ronix-portfolio-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px}.ronix-portfolio-head span{color:#b27c18;font-size:10px;font-weight:800}.ronix-portfolio-head h2{margin:2px 0;color:#0a3153;font-size:19px}.ronix-portfolio-head p{margin:0;color:#728698;font-size:9px}.ronix-portfolio-head button{display:flex;align-items:center;gap:6px;padding:9px 12px;border:1px solid #cadbe8;border-radius:9px;background:#fff;color:#143b5b;font-size:10px;font-weight:750;cursor:pointer}.ronix-portfolio-head button svg{width:14px}.ronix-portfolio-totals{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}.ronix-portfolio-totals article{padding:11px 13px;border:1px solid #dbe6ee;border-radius:10px;background:#f8fbfd;text-align:center}.ronix-portfolio-totals span,.ronix-portfolio-totals strong{display:block}.ronix-portfolio-totals span{color:#74899b;font-size:8px}.ronix-portfolio-totals strong{margin-top:5px;color:#07395f;font-size:13px;white-space:nowrap}.ronix-project-state{display:flex;align-items:center;justify-content:center;gap:8px;min-height:170px;color:#70879a;font-size:12px}.ronix-project-state svg{animation:ronix-spin 1s linear infinite}.ronix-project-state.error{color:#c62f43}.ronix-project-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ronix-project-card{display:flex;flex-direction:column;min-height:190px;padding:13px;border:1px solid #d8e4ec;border-radius:13px;background:#fff;color:#0d3453;text-align:start;cursor:pointer;transition:.16s}.ronix-project-card:hover{transform:translateY(-2px);border-color:#b98a34;box-shadow:0 12px 26px rgba(10,49,83,.09)}.ronix-project-card header{display:flex;justify-content:space-between;gap:10px}.ronix-project-card header>div:first-child{min-width:0}.ronix-project-card header span{color:#b07a1d;font-size:8px;font-weight:800}.ronix-project-card h3{margin:4px 0 2px;overflow:hidden;color:#0c3353;font-size:11px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.ronix-project-card header small{color:#788b9b;font-size:8px}.ronix-status{text-align:end}.ronix-status span{display:block;color:#4d6a7e!important}.ronix-status b{font-size:9px}.ronix-progress{height:4px;margin:10px 0;border-radius:99px;background:#edf2f5;overflow:hidden}.ronix-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#d0a03d,#1478b9)}.ronix-project-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 6px;margin-top:2px}.ronix-project-metrics small,.ronix-project-metrics b{display:block}.ronix-project-metrics small{color:#7c90a1;font-size:7px}.ronix-project-metrics b{margin-top:2px;color:#143a58;font-size:8px;white-space:nowrap}.ronix-project-metrics .positive b{color:#168352}.ronix-project-metrics .negative b{color:#cf3247}.ronix-project-card footer{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;color:#60798c;font-size:8px}.ronix-project-card footer span:last-child{display:flex;align-items:center;gap:4px;color:#176fa9;font-weight:800}.ronix-project-card footer svg{width:12px}.ronix-empty{grid-column:1/-1;display:grid;place-items:center;min-height:190px;color:#7890a1}.ronix-empty svg{width:30px;height:30px}.ronix-empty p{margin:8px 0 0}
        .ronix-erp[dir="ltr"] .ronix-nav-item,.ronix-erp[dir="ltr"] .ronix-core-card button,.ronix-erp[dir="ltr"] .ronix-project-card{text-align:left}.ronix-erp[dir="rtl"] .ronix-nav-item,.ronix-erp[dir="rtl"] .ronix-core-card button,.ronix-erp[dir="rtl"] .ronix-project-card{text-align:right}
        @keyframes ronix-spin{to{transform:rotate(360deg)}}
        @media(max-width:1250px){.ronix-kpi-grid{grid-template-columns:repeat(4,1fr)}.ronix-today-card{grid-column:1/-1}.ronix-project-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:900px){.ronix-erp,.ronix-erp[dir="ltr"]{grid-template-columns:1fr;grid-template-areas:"main";height:auto;min-height:100vh;overflow:visible}.ronix-sidebar{display:none}.ronix-main{overflow:visible;padding:10px}.ronix-toolbar{grid-template-columns:1fr auto}.ronix-search-wrap{grid-column:1/-1;grid-row:2}.ronix-title-panel{align-items:flex-start;flex-direction:column}.ronix-kpi-grid{grid-template-columns:repeat(2,1fr)}.ronix-today-card{grid-column:1/-1}.ronix-portfolio-totals{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:580px){.ronix-toolbar-actions{flex-wrap:wrap}.ronix-currency{display:none}.ronix-title-actions{width:100%;flex-direction:column}.ronix-title-actions button{width:100%}.ronix-kpi-grid{grid-template-columns:1fr}.ronix-kpi-grid article{min-height:auto}.ronix-today-card{grid-column:auto}.ronix-portfolio-head{align-items:flex-start;flex-direction:column}.ronix-project-grid{grid-template-columns:1fr}.ronix-project-metrics{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
}
