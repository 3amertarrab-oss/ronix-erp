import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class Record(dict):
    def __getattr__(self, fieldname):
        return self.get(fieldname)

    def get(self, fieldname, default=None):
        return super().get(fieldname, default)

    def set(self, fieldname, value):
        self[fieldname] = value


class Meta:
    def __init__(self, fields):
        self.fields = set(fields)

    def has_field(self, fieldname):
        return fieldname in self.fields


class FakeDB:
    def __init__(self):
        self.project = Record(
            name="PRJ-001",
            company="RONIX STEEL",
            ronix_contract="CON-001",
            ronix_cost_center="PRJ-001 - RS",
            ronix_warehouse_group="PRJ-001 - Project - RS",
            ronix_raw_materials_warehouse="PRJ-001 - Raw Materials - RS",
            ronix_wip_warehouse="PRJ-001 - Work In Progress - RS",
            ronix_finished_goods_warehouse="PRJ-001 - Finished Goods - RS",
            ronix_scrap_warehouse="PRJ-001 - Scrap - RS",
        )

    def get_value(self, doctype, name, fields, as_dict=False, **kwargs):
        if doctype == "Project":
            return self.project
        if doctype == "Warehouse":
            return None
        return None


class ProjectOperationsTest(unittest.TestCase):
    def setUp(self):
        self.old_modules = {name: sys.modules.get(name) for name in ("frappe", "frappe.utils")}
        frappe = types.ModuleType("frappe")
        frappe.db = FakeDB()
        frappe._ = lambda value: value
        frappe.throw = lambda message, *args, **kwargs: (_ for _ in ()).throw(ValueError(message))
        frappe.session = types.SimpleNamespace(user="qa@example.com")
        frappe.utils = types.ModuleType("frappe.utils")
        frappe.utils.now_datetime = lambda: "2026-09-03 10:00:00"
        sys.modules["frappe"] = frappe
        sys.modules["frappe.utils"] = frappe.utils

        for module in ("ronix_erp.events.operations", "ronix_erp.audit"):
            sys.modules.pop(module, None)
        from ronix_erp.events import operations

        self.operations = operations

    def tearDown(self):
        for name, module in self.old_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
        sys.modules.pop("ronix_erp.events.operations", None)
        sys.modules.pop("ronix_erp.audit", None)

    def make_doc(self):
        row = Record(project=None, cost_center=None, warehouse="PRJ-001 - Raw Materials - RS")
        row.meta = Meta({"project", "cost_center", "warehouse"})
        doc = Record(
            doctype="Purchase Order",
            company="RONIX STEEL",
            project="PRJ-001",
            ronix_contract=None,
            items=[row],
            supplied_items=[],
            expenses=[],
            accounts=[],
            set_warehouse=None,
        )
        doc.meta = Meta({"project", "ronix_contract", "items", "set_warehouse"})
        return doc, row

    def test_project_context_is_propagated_to_operational_rows(self):
        doc, row = self.make_doc()
        warehouses = {
            "ronix_warehouse_group": "PRJ-001 - Project - RS",
            "ronix_raw_materials_warehouse": "PRJ-001 - Raw Materials - RS",
            "ronix_wip_warehouse": "PRJ-001 - Work In Progress - RS",
            "ronix_finished_goods_warehouse": "PRJ-001 - Finished Goods - RS",
            "ronix_scrap_warehouse": "PRJ-001 - Scrap - RS",
        }
        with patch.object(self.operations, "ensure_project_warehouses", return_value=warehouses):
            self.operations.validate_operational_document(doc)

        self.assertEqual(doc.ronix_contract, "CON-001")
        self.assertEqual(doc.set_warehouse, "PRJ-001 - Raw Materials - RS")
        self.assertEqual(row.project, "PRJ-001")
        self.assertEqual(row.cost_center, "PRJ-001 - RS")

    def test_mixed_projects_are_blocked(self):
        doc, row = self.make_doc()
        row["project"] = "PRJ-002"
        with self.assertRaisesRegex(ValueError, "cannot mix multiple Projects"):
            self.operations.validate_operational_document(doc)

    def test_audit_doctype_is_immutable_and_source_target_scoped(self):
        path = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_audit_event"
            / "ronix_audit_event.json"
        )
        data = json.loads(path.read_text(encoding="utf-8"))
        fields = {row["fieldname"]: row for row in data["fields"]}
        self.assertEqual(fields["event_key"].get("unique"), 1)
        self.assertEqual(fields["source_name"]["fieldtype"], "Dynamic Link")
        self.assertEqual(fields["target_name"]["fieldtype"], "Dynamic Link")
        self.assertTrue(
            all(
                not row.get("write") and not row.get("create")
                for row in data["permissions"]
            )
        )

    def test_install_defines_four_project_warehouses_and_operational_links(self):
        source = (ROOT / "ronix_erp" / "install.py").read_text(encoding="utf-8")
        hooks = (ROOT / "ronix_erp" / "hooks.py").read_text(encoding="utf-8")
        api = (ROOT / "ronix_erp" / "api.py").read_text(encoding="utf-8")
        for fieldname in (
            "ronix_raw_materials_warehouse",
            "ronix_wip_warehouse",
            "ronix_finished_goods_warehouse",
            "ronix_scrap_warehouse",
        ):
            self.assertIn(fieldname, source)
        for doctype in (
            "Material Request",
            "Purchase Order",
            "Purchase Receipt",
            "Purchase Invoice",
            "Work Order",
            "Job Card",
            "Stock Entry",
        ):
            self.assertIn(f'"{doctype}"', hooks)
        self.assertIn("def make_material_request_from_contract", api)
        self.assertIn("def prepare_project_operations", api)
        self.assertIn("_require_permissions(contract, \"Material Request\")", api)


if __name__ == "__main__":
    unittest.main()
