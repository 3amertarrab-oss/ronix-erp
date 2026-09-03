frappe.ui.form.on("Quotation", {
  refresh(frm) {
    frm.dashboard.add_transactions({
      label: __("RONIX ERP"),
      items: ["RONIX Contract", "Project"],
    });

    if (frm.doc.ronix_contract) {
      frm.dashboard.add_indicator(
        __("RONIX: {0}", [frm.doc.ronix_commercial_status || "Contracted"]),
        "green"
      );
      frm.add_custom_button(
        __("Open RONIX Contract"),
        () => frappe.set_route("Form", "RONIX Contract", frm.doc.ronix_contract),
        __("View")
      );
    }

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
