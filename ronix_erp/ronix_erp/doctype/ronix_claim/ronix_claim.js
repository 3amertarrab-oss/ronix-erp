frappe.ui.form.on("RONIX Claim", {
  refresh(frm) {
    if (
      frm.doc.docstatus === 1 &&
      frm.doc.claim_status === "Approved" &&
      !frm.doc.sales_invoice
    ) {
      frm.add_custom_button(
        __("Sales Invoice"),
        () => {
          frappe.model.open_mapped_doc({
            method: "ronix_erp.api.make_sales_invoice_from_claim",
            frm,
          });
        },
        __("Create")
      );
    }
  },
  retention_percent(frm) {
    calculate_claim_totals(frm);
  },
  withholding_percent(frm) {
    calculate_claim_totals(frm);
  },
  tax_percent(frm) {
    calculate_claim_totals(frm);
  },
});

frappe.ui.form.on("RONIX Claim Item", {
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
  calculate_claim_totals(frm);
}

function calculate_claim_totals(frm) {
  const gross = (frm.doc.items || []).reduce(
    (total, row) => total + flt(row.qty) * flt(row.rate),
    0
  );
  const retention = (gross * flt(frm.doc.retention_percent)) / 100;
  const withholding = (gross * flt(frm.doc.withholding_percent)) / 100;
  const tax = (gross * flt(frm.doc.tax_percent)) / 100;

  frm.set_value("gross_amount", gross);
  frm.set_value("retention_amount", retention);
  frm.set_value("withholding_amount", withholding);
  frm.set_value("tax_amount", tax);
  frm.set_value("net_amount", gross + tax - retention - withholding);
}
