from pathlib import Path

import frappe


PROFESSIONAL_CONTRACT_FORMAT = "RONIX Professional Contract"


def ensure_print_formats():
    """Install or refresh RONIX-owned print formats during every migration."""
    template_path = Path(
        frappe.get_app_path(
            "ronix_erp",
            "templates",
            "print_formats",
            "ronix_professional_contract.html",
        )
    )
    html = template_path.read_text(encoding="utf-8")
    values = {
        "doc_type": "RONIX Contract",
        "module": "RONIX ERP",
        "custom_format": 1,
        "print_format_type": "Jinja",
        "print_format_builder": 0,
        "raw_printing": 0,
        "disabled": 0,
        "html": html,
    }

    if frappe.db.exists("Print Format", PROFESSIONAL_CONTRACT_FORMAT):
        print_format = frappe.get_doc("Print Format", PROFESSIONAL_CONTRACT_FORMAT)
        print_format.update(values)
        print_format.flags.ignore_permissions = True
        print_format.save()
    else:
        print_format = frappe.get_doc(
            {
                "doctype": "Print Format",
                "name": PROFESSIONAL_CONTRACT_FORMAT,
                **values,
            }
        )
        print_format.flags.ignore_permissions = True
        print_format.insert()

