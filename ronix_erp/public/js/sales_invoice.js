frappe.ui.form.on("Sales Invoice", {
  refresh(frm) {
    if (
      frm.doc.docstatus === 1 &&
      frm.doc.ronix_claim &&
      flt(frm.doc.outstanding_amount) > 0
    ) {
      frm.add_custom_button(
        __("RONIX Collection"),
        () => {
          frappe.model.open_mapped_doc({
            method: "ronix_erp.api.make_payment_entry_from_invoice",
            frm,
          });
        },
        __("Create")
      );
    }
  },
});
