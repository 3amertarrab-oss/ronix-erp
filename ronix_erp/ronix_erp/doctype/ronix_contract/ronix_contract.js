frappe.ui.form.on("RONIX Contract", {
  setup(frm) {
    frm.set_query("quotation", () => {
      const filters = { docstatus: 1, quotation_to: "Customer" };
      if (frm.doc.customer) filters.party_name = frm.doc.customer;
      if (frm.doc.company) filters.company = frm.doc.company;
      return { filters };
    });
  },

  refresh(frm) {
    render_professional_preview(frm);

    frm.add_custom_button(__("Professional Print / PDF"), () => {
      if (frm.is_new()) {
        frappe.msgprint(__("Save the Contract before opening the professional print preview."));
        return;
      }
      frappe.utils.print(
        frm.doctype,
        frm.doc.name,
        "RONIX Professional Contract",
        frm.doc.letter_head,
        frm.doc.contract_language === "Arabic" ? "ar" : "en"
      );
    }, __("Print"));

    if (frm.doc.docstatus === 0) {
      frm.add_custom_button(__("Load Professional Template"), () => load_contract_template(frm), __("Contract"));
    }

    if (frm.doc.docstatus === 1 && ["Signed", "Active"].includes(frm.doc.contract_status) && !frm.doc.project) {
      frm.add_custom_button(__("Create Project"), () => {
        frappe.model.open_mapped_doc({
          method: "ronix_erp.api.make_project_from_contract",
          frm,
        });
      }, __("Create"));
    }
    if (frm.doc.docstatus === 1 && ["Signed", "Active"].includes(frm.doc.contract_status)) {
      frm.add_custom_button(__("RONIX Claim"), () => {
        frappe.model.open_mapped_doc({
          method: "ronix_erp.api.make_claim_from_contract",
          frm,
        });
      }, __("Create"));
      if (frm.doc.project) {
        frm.add_custom_button(__("Material Request"), () => {
          frappe.model.open_mapped_doc({
            method: "ronix_erp.api.make_material_request_from_contract",
            frm,
          });
        }, __("Create"));
      }
    }
  },

  contract_language: render_professional_preview,
  contract_template: render_professional_preview,
  customer: render_professional_preview,
  contract_date: render_professional_preview,
  signature_date: render_professional_preview,
  effective_date: render_professional_preview,
  scope: render_professional_preview,
  signed_by_customer: render_professional_preview,
  signed_by_company: render_professional_preview,
});

frappe.ui.form.on("RONIX Contract Item", {
  qty(frm, cdt, cdn) {
    calculate_row(frm, cdt, cdn);
  },
  rate(frm, cdt, cdn) {
    calculate_row(frm, cdt, cdn);
  },
  items_add(frm) {
    render_professional_preview(frm);
  },
  items_remove(frm) {
    render_professional_preview(frm);
  },
});

frappe.ui.form.on("RONIX Contract Clause", {
  clause_type(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    const titles = {
      General: "أحكام عامة / General",
      Scope: "نطاق العمل / Scope",
      Commercial: "الأحكام التجارية / Commercial",
      Payment: "شروط السداد / Payment",
      Time: "المدة والبرنامج / Time",
      Quality: "الجودة / Quality",
      Variation: "الأوامر التغييرية / Change Orders",
      Retention: "الاستبقاء / Retention",
      Warranty: "الضمان / Warranty",
      Termination: "الإنهاء / Termination",
      Dispute: "تسوية النزاعات / Disputes",
      "Force Majeure": "القوة القاهرة / Force Majeure",
      Custom: "بند مخصص / Custom Clause",
    };
    if (!row.clause_title && titles[row.clause_type]) {
      frappe.model.set_value(cdt, cdn, "clause_title", titles[row.clause_type]);
    }
    render_professional_preview(frm);
  },
  clause_title: render_professional_preview,
  clause_text: render_professional_preview,
  clauses_add: render_professional_preview,
  clauses_remove: render_professional_preview,
});

function calculate_row(frm, cdt, cdn) {
  const row = locals[cdt][cdn];
  frappe.model.set_value(cdt, cdn, "amount", flt(row.qty) * flt(row.rate));
  frm.refresh_field("items");
  render_professional_preview(frm);
}

function load_contract_template(frm) {
  const apply_template = () => {
    frappe.call({
      method: "ronix_erp.ronix_erp.doctype.ronix_contract.ronix_contract.get_contract_template",
      args: {
        template_name: frm.doc.contract_template || "Engineering Services",
        language: frm.doc.contract_language || "Bilingual",
      },
      freeze: true,
      freeze_message: __("Loading professional contract clauses..."),
      callback(r) {
        frm.clear_table("clauses");
        (r.message || []).forEach((clause) => frm.add_child("clauses", clause));
        frm.refresh_field("clauses");
        frm.dirty();
        render_professional_preview(frm);
      },
    });
  };

  if ((frm.doc.clauses || []).length) {
    frappe.confirm(__("Replace the current clauses with the selected professional template?"), apply_template);
  } else {
    apply_template();
  }
}

function render_professional_preview(frm) {
  const field = frm.get_field("professional_preview");
  if (!field || !field.$wrapper) return;
  const esc = (value) => frappe.utils.escape_html(String(value || "—"));
  const text = (value) => {
    if (frappe.utils.strip_html) return frappe.utils.strip_html(value || "") || "—";
    return $("<div>").html(value || "").text() || "—";
  };
  const money = (value) => `EGP ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(flt(value))}`;
  const items = (frm.doc.items || []).map((row, index) => `
    <tr><td>${index + 1}</td><td>${esc(row.item_name || row.item_code)}</td><td>${esc(row.qty)}</td><td>${money(row.amount)}</td></tr>
  `).join("") || '<tr><td colspan="4">—</td></tr>';
  const clauses = (frm.doc.clauses || []).slice(0, 4).map((row, index) => `
    <section><b>${index + 1}. ${esc(row.clause_title)}</b><p>${esc(text(row.clause_text)).slice(0, 220)}</p></section>
  `).join("") || `<section><p>${__("Load a professional template to preview the clauses.")}</p></section>`;

  field.$wrapper.html(`
    <style>
      .rx-contract-preview{max-width:820px;margin:8px auto;padding:28px;border:1px solid #d8e1e8;border-radius:14px;background:#fff;color:#102f49;box-shadow:0 8px 25px rgba(8,44,73,.07);font-family:Inter,"Noto Sans Arabic",Tahoma,sans-serif}
      .rx-contract-preview header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:3px solid #b8892d}.rx-contract-preview header img{width:72px;height:72px;object-fit:contain}.rx-contract-preview h2{margin:0;font-size:20px}.rx-contract-preview small{color:#718394}.rx-contract-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.rx-contract-meta div{padding:9px;border:1px solid #e1e8ed;border-radius:8px;background:#f8fafc}.rx-contract-meta span,.rx-contract-meta b{display:block}.rx-contract-meta span{font-size:9px;color:#718394}.rx-contract-meta b{margin-top:3px;font-size:11px}.rx-contract-preview table{width:100%;border-collapse:collapse;margin:14px 0;font-size:10px}.rx-contract-preview th,.rx-contract-preview td{padding:7px;border:1px solid #dfe7ed;text-align:start}.rx-contract-preview th{background:#0b3657;color:#fff}.rx-contract-preview section{margin:10px 0;padding:10px;border-inline-start:3px solid #b8892d;background:#fbfcfd}.rx-contract-preview section p{margin:5px 0 0;color:#425d72;font-size:10px;line-height:1.7}.rx-contract-signatures{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:25px;padding-top:16px;border-top:1px solid #cdd9e2}.rx-contract-signatures div{min-height:65px;border-bottom:1px solid #73899a}.rx-contract-signatures b,.rx-contract-signatures span{display:block}.rx-contract-signatures span{margin-top:8px;font-size:10px}@media(max-width:700px){.rx-contract-meta{grid-template-columns:1fr}.rx-contract-preview{padding:16px}.rx-contract-signatures{grid-template-columns:1fr}}
    </style>
    <article class="rx-contract-preview" dir="${frm.doc.contract_language === "English" ? "ltr" : "rtl"}">
      <header><div><small>RONIX STEEL · PROFESSIONAL CONTRACT</small><h2>${esc(frm.doc.title || __("New Contract"))}</h2><b>${esc(frm.doc.name)}</b></div><img src="/assets/ronix_erp/images/ronix-logo.png" alt="RONIX STEEL"></header>
      <div class="rx-contract-meta">
        <div><span>${__("Customer")}</span><b>${esc(frm.doc.customer)}</b></div>
        <div><span>${__("Contract Date")}</span><b>${esc(frm.doc.contract_date)}</b></div>
        <div><span>${__("Contract Value")}</span><b>${money(frm.doc.contract_value)}</b></div>
        <div><span>${__("Template")}</span><b>${esc(frm.doc.contract_template)}</b></div>
        <div><span>${__("Signature Date")}</span><b>${esc(frm.doc.signature_date)}</b></div>
        <div><span>${__("Effective Date")}</span><b>${esc(frm.doc.effective_date)}</b></div>
      </div>
      <section><b>${__("Scope of Work")}</b><p>${esc(text(frm.doc.scope)).slice(0, 450)}</p></section>
      <table><thead><tr><th>#</th><th>${__("Item")}</th><th>${__("Quantity")}</th><th>${__("Amount")}</th></tr></thead><tbody>${items}</tbody></table>
      ${clauses}
      <div class="rx-contract-signatures"><div><b>${__("For the Customer")}</b><span>${esc(frm.doc.signed_by_customer)}</span></div><div><b>${__("For RONIX STEEL")}</b><span>${esc(frm.doc.signed_by_company)}</span></div></div>
    </article>
  `);
}
