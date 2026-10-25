import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Record(types.SimpleNamespace):
    pass


class FakeDB:
    def __init__(self):
        self.cost_centers = {
            "Main - RS": Record(
                name="Main - RS",
                parent_cost_center="RONIX STEEL - RS",
                company="RONIX STEEL",
                is_group=0,
                disabled=0,
            ),
            "RONIX STEEL - RS": Record(
                name="RONIX STEEL - RS",
                parent_cost_center=None,
                company="RONIX STEEL",
                is_group=1,
                disabled=0,
            ),
        }

    def get_value(
        self,
        doctype,
        name_or_filters,
        fieldname,
        as_dict=False,
        order_by=None,
    ):
        self.assert_cost_center_doctype(doctype)
        if isinstance(name_or_filters, str):
            return self.cost_centers.get(name_or_filters)
        if name_or_filters.get("cost_center_name") == "RONIX Projects":
            return None
        if name_or_filters.get("is_group") == 1:
            return "RONIX STEEL - RS"
        return None

    @staticmethod
    def assert_cost_center_doctype(doctype):
        if doctype != "Cost Center":
            raise AssertionError(f"Unexpected doctype: {doctype}")


class FakeCostCenter:
    def __init__(self, values):
        self.values = values
        self.name = "RONIX Projects - RS"
        self.inserted = False

    def insert(self, ignore_permissions=False):
        self.inserted = ignore_permissions


class ProjectCostCenterTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.created = []

        frappe = types.ModuleType("frappe")
        frappe.db = self.db
        frappe._ = lambda value: value
        frappe.get_cached_value = lambda doctype, name, fieldname: "Main - RS"
        frappe.throw = lambda message: (_ for _ in ()).throw(ValueError(message))

        def get_doc(values):
            doc = FakeCostCenter(values)
            self.created.append(doc)
            return doc

        frappe.get_doc = get_doc
        self.original_frappe = sys.modules.get("frappe")
        sys.modules["frappe"] = frappe

        spec = importlib.util.spec_from_file_location(
            "project_events_under_test",
            ROOT / "ronix_erp" / "events" / "project.py",
        )
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def tearDown(self):
        sys.modules.pop("project_events_under_test", None)
        if self.original_frappe is None:
            sys.modules.pop("frappe", None)
        else:
            sys.modules["frappe"] = self.original_frappe

    def test_leaf_company_default_uses_parent_group(self):
        group_name = self.module.ensure_project_cost_center_group("RONIX STEEL")

        self.assertEqual(group_name, "RONIX Projects - RS")
        self.assertEqual(len(self.created), 1)
        self.assertEqual(
            self.created[0].values["parent_cost_center"],
            "RONIX STEEL - RS",
        )
        self.assertEqual(self.created[0].values["is_group"], 1)
        self.assertTrue(self.created[0].inserted)


if __name__ == "__main__":
    unittest.main()
