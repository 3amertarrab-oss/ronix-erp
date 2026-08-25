frappe.ui.form.on("Quotation", {
  refresh(frm) {
    if (
      frm.doc.docstatus === 1 &&
      frm.doc.quotation_to === "Customer" &&
      !frm.doc.ronix_contract
    ) {
      frm.add_custom_button(__("RONIX Contract"), () => {
        frappe.model.open_mapped_doc({
          method: "ronix_erp.api.make_contract_from_quotation",
          frm,
        });
      }, __("Create"));
    }
  },
});
