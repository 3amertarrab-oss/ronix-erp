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
}

