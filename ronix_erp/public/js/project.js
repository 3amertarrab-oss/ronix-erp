frappe.ui.form.on("Project", {
    refresh(frm) {
        if (frm.is_new() || !frm.doc.ronix_contract) {
            return;
        }

        frm.add_custom_button(
            __("RONIX Profitability"),
            () => {
                frappe.route_options = {
                    company: frm.doc.company,
                    project: frm.doc.name,
                };
                frappe.set_route(
                    "query-report",
                    "RONIX Project Profitability"
                );
            },
            __("View")
        );
    },
});
