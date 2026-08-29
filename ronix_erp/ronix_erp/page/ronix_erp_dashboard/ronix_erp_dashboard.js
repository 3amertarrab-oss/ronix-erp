frappe.pages["ronix-erp-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("RONIX ERP"),
        single_column: true,
    });

    page.set_primary_action(__("New Project"), () => frappe.new_doc("Project"), "add");
    page.add_inner_button(__("New Quotation"), () => frappe.new_doc("Quotation"));

    const modules = [
        ["Projects", "Project", "project", "folder-normal", "Projects, tasks and cost centers"],
        ["Customers", "Customer", "customer", "users", "Customer master data and statements"],
        ["Quotations", "Quotation", "quotation", "file-text", "Prepare, approve and print quotations"],
        ["Contracts", "RONIX Contract", "ronix-contract", "file-contract", "Contracts, milestones and live balances"],
        ["Claims", "RONIX Claim", "ronix-claim", "request", "Claims, retention and invoice links"],
        ["Sales Invoices", "Sales Invoice", "sales-invoice", "invoice", "Invoices, due dates and printing"],
        ["Collections", "Payment Entry", "payment-entry", "payment", "Collections, retention and payment entries"],
        ["Purchasing", "Purchase Order", "purchase-order", "shopping-cart", "Suppliers and purchase orders"],
        ["Inventory", "Stock Entry", "stock-entry", "stock", "Materials, warehouses and stock movements"],
        ["Manufacturing", "Work Order", "work-order", "organization", "BOMs, work orders and production"],
        ["Project Profitability", null, "query-report/RONIX%20Project%20Profitability", "chart", "Revenue, cost and profit by project"],
        ["Accounting", "General Ledger", "query-report/General%20Ledger", "accounting", "General Ledger and financial reports"],
    ];

    const moduleCards = modules
        .map(([label, doctype, route, icon, description]) => `
            <button class="ronix-module" data-doctype="${frappe.utils.escape_html(doctype || "")}" data-route="${route}">
                <span class="ronix-module-icon">${frappe.utils.icon(icon, "md")}</span>
                <span class="ronix-module-copy">
                    <strong>${__(label)}</strong>
                    <small>${__(description)}</small>
                </span>
                <span class="ronix-arrow">→</span>
            </button>
        `)
        .join("");

    $(page.body).html(`
        <div class="ronix-hub">
            <section class="ronix-hero">
                <img src="/assets/ronix_erp/images/ronix-logo.png" alt="RONIX" class="ronix-logo">
                <div>
                    <span class="ronix-kicker">STEEL ENGINEERING &amp; CONSTRUCTION</span>
                    <h1>${__("RONIX ERP Operational Hub")}</h1>
                    <p>${__("Projects, commercial workflow, accounting, inventory and manufacturing in one controlled system.")}</p>
                </div>
                <button class="btn btn-light ronix-open-projects">${__("Open Projects")}</button>
            </section>

            <section class="ronix-flow" aria-label="RONIX workflow">
                <span>${__("Quotation")}</span><b>→</b><span>${__("Contract")}</span><b>→</b>
                <span>${__("Project")}</span><b>→</b><span>${__("Claim")}</span><b>→</b>
                <span>${__("Invoice")}</span><b>→</b><span>${__("Collection")}</span>
            </section>

            <section class="ronix-summary">
                <article><small>${__("Projects")}</small><strong data-summary="projects">—</strong></article>
                <article><small>${__("Active Contracts")}</small><strong data-summary="contracts">—</strong></article>
                <article><small>${__("Open Claims")}</small><strong data-summary="claims">—</strong></article>
                <article><small>${__("Submitted Invoices")}</small><strong data-summary="invoices">—</strong></article>
            </section>

            <div class="ronix-section-title">
                <div><span>${__("WORKSPACE")}</span><h2>${__("Work from one screen")}</h2></div>
                <p>${__("Open records to add data, review the workflow and print documents.")}</p>
            </div>
            <section class="ronix-modules">${moduleCards}</section>
        </div>
    `);

    $(wrapper).find(".ronix-open-projects").on("click", () => frappe.set_route("List", "Project", "List"));
    $(wrapper).find(".ronix-module").on("click", function () {
        const doctype = $(this).data("doctype");
        const route = $(this).data("route");
        if (doctype && !route.startsWith("query-report/")) {
            frappe.set_route("List", doctype, "List");
            return;
        }
        window.location.href = `/desk/${route}`;
    });

    frappe.call("ronix_erp.api.get_workspace_summary").then(({ message }) => {
        Object.entries(message || {}).forEach(([key, value]) => {
            const display = value === null || value === undefined ? "—" : value.toLocaleString();
            $(wrapper).find(`[data-summary="${key}"]`).text(display);
        });
    });
};

frappe.pages["ronix-erp-dashboard"].on_page_show = function (wrapper) {
    if (!document.getElementById("ronix-hub-style")) {
        const style = document.createElement("style");
        style.id = "ronix-hub-style";
        style.textContent = `
            .ronix-hub{max-width:1440px;margin:0 auto;padding:24px;color:#16283a}
            .ronix-hero{display:grid;grid-template-columns:auto 1fr auto;gap:22px;align-items:center;padding:30px;border-radius:22px;background:linear-gradient(135deg,#071f35 0%,#0b3859 68%,#a87924 160%);color:#fff;box-shadow:0 18px 46px rgba(7,31,53,.16)}
            .ronix-logo{width:102px;height:102px;object-fit:contain;border-radius:50%;background:#fff;box-shadow:0 0 0 5px rgba(218,177,79,.24)}
            .ronix-kicker{display:block;color:#e6c46d;font-size:11px;font-weight:700;letter-spacing:.18em;margin-bottom:7px}
            .ronix-hero h1{margin:0 0 8px;font-size:30px;font-weight:700;color:#fff}.ronix-hero p{margin:0;max-width:760px;color:#d8e3ec;font-size:14px}
            .ronix-hero .btn{border:0;color:#0b3150;font-weight:600;padding:9px 16px}
            .ronix-flow{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:18px 0;padding:13px 18px;border:1px solid #e5e9ee;border-radius:14px;background:#fff;color:#28445d}
            .ronix-flow span{font-size:12px;font-weight:600}.ronix-flow b{color:#bb8b32}
            .ronix-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0 28px}
            .ronix-summary article{padding:18px 20px;border:1px solid #e6e9ed;border-radius:16px;background:#fff;box-shadow:0 6px 20px rgba(22,40,58,.045)}
            .ronix-summary small{display:block;color:#708295;font-weight:600}.ronix-summary strong{display:block;margin-top:7px;font-size:26px;color:#0b3150}
            .ronix-section-title{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:8px 2px 16px}.ronix-section-title span{font-size:10px;color:#b07f27;font-weight:700;letter-spacing:.16em}.ronix-section-title h2{font-size:21px;margin:3px 0 0}.ronix-section-title p{margin:0;color:#718090;font-size:13px}
            .ronix-modules{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
            .ronix-module{display:grid;grid-template-columns:auto 1fr auto;gap:13px;align-items:center;width:100%;min-height:88px;padding:16px;text-align:left;border:1px solid #e4e8ec;border-radius:16px;background:#fff;color:#17314a;transition:.16s ease;cursor:pointer}
            .ronix-module:hover{transform:translateY(-2px);border-color:#caa34d;box-shadow:0 10px 25px rgba(17,48,75,.08)}
            .ronix-module-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:13px;background:#eef4f8;color:#0c4167}.ronix-module-icon svg{width:22px;height:22px}
            .ronix-module-copy strong,.ronix-module-copy small{display:block}.ronix-module-copy strong{font-size:14px}.ronix-module-copy small{margin-top:4px;color:#778797;font-size:11px;line-height:1.35}.ronix-arrow{color:#b5852e;font-size:18px}
            @media(max-width:900px){.ronix-modules{grid-template-columns:repeat(2,minmax(0,1fr))}.ronix-hero{grid-template-columns:auto 1fr}.ronix-hero .btn{grid-column:1/-1}.ronix-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
            @media(max-width:560px){.ronix-hub{padding:12px}.ronix-hero{grid-template-columns:1fr;padding:22px}.ronix-logo{width:82px;height:82px}.ronix-hero h1{font-size:23px}.ronix-modules{grid-template-columns:1fr}.ronix-summary{gap:9px}.ronix-summary article{padding:14px}.ronix-section-title{display:block}.ronix-section-title p{margin-top:7px}.ronix-flow{justify-content:flex-start;overflow:auto;flex-wrap:nowrap}.ronix-flow span,.ronix-flow b{white-space:nowrap}}
        `;
        document.head.appendChild(style);
    }
};
