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

        frm.add_custom_button(
            __("Prepare Cost Center & Warehouses"),
            () => frappe.call({
                method: "ronix_erp.api.prepare_project_operations",
                args: { source_name: frm.doc.name },
                freeze: true,
                freeze_message: __("Preparing the project operations structure..."),
                callback: () => frm.reload_doc(),
            }),
            __("RONIX")
        );

        frm.add_custom_button(
            __("Material Request"),
            () => frappe.model.open_mapped_doc({
                method: "ronix_erp.api.make_material_request_from_project",
                frm,
            }),
            __("Create")
        );

        frm.add_custom_button(
            __("Work Order"),
            () => frappe.new_doc("Work Order", {
                company: frm.doc.company,
                project: frm.doc.name,
                ronix_contract: frm.doc.ronix_contract,
                source_warehouse: frm.doc.ronix_raw_materials_warehouse,
                wip_warehouse: frm.doc.ronix_wip_warehouse,
                fg_warehouse: frm.doc.ronix_finished_goods_warehouse,
            }),
            __("Create")
        );

        frm.add_custom_button(
            __("Stock Entry"),
            () => frappe.new_doc("Stock Entry", {
                company: frm.doc.company,
                project: frm.doc.name,
                ronix_contract: frm.doc.ronix_contract,
                from_warehouse: frm.doc.ronix_raw_materials_warehouse,
                to_warehouse: frm.doc.ronix_wip_warehouse,
            }),
            __("Create")
        );
    },
});
