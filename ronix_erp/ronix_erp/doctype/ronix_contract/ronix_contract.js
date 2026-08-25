frappe.ui.form.on("RONIX Contract", {
  refresh(frm) {
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
    }
  },
});

frappe.ui.form.on("RONIX Contract Item", {
  qty(frm, cdt, cdn) {
    calculate_row(frm, cdt, cdn);
  },
  rate(frm, cdt, cdn) {
    calculate_row(frm, cdt, cdn);
  },
});

function calculate_row(frm, cdt, cdn) {
  const row = locals[cdt][cdn];
  frappe.model.set_value(cdt, cdn, "amount", flt(row.qty) * flt(row.rate));
  frm.refresh_field("items");
}
