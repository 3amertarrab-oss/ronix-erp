import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AttrDict(dict):
    __getattr__ = dict.__getitem__


class FakeInvoice(AttrDict):
    def __init__(self):
        super().__init__()
        self.items = []
        self.methods_run = []

    def append(self, fieldname, values):
        self.items.append(AttrDict(values))

    def run_method(self, method):
        self.methods_run.append(method)


class FakeDB:
    def __init__(self):
        self.locked = False

    def sql(self, query, values):
        self.locked = "FOR UPDATE" in query

    def exists(self, doctype, filters):
        return None

    def get_value(self, doctype, name, fieldname):
        if doctype == "Project" and fieldname == "ronix_cost_center":
            return "Main - RS"
        if doctype == "Item" and fieldname == "stock_uom":
            return "Job"
        if doctype == "UOM" and fieldname == "must_be_whole_number":
            return 1 if name == "Nos" else 0
        return None


class ClaimInvoiceMappingTest(unittest.TestCase):
    def setUp(self):
        self.invoice = FakeInvoice()
        self.db = FakeDB()
        self.claim = types.SimpleNamespace(
            name="CLM-TEST",
            docstatus=1,
            claim_status="Approved",
            company="RONIX STEEL",
            customer="TEST CUSTOMER",
            posting_date="2026-08-26",
            due_date="2026-09-25",
            currency="EGP",
            project="PROJ-0001",
            contract="CON-TEST",
            payment_milestone="Progress 40%",
            items=[
                types.SimpleNamespace(
                    name="CLAIM-ITEM-1",
                    idx=1,
                    description="Engineering Service",
                    qty=0.4,
                    uom="Nos",
                    rate=100000,
                    amount=40000,
                    contract_item_reference="CONTRACT-ITEM-1",
                )
            ],
        )
        self.claim.check_permission = lambda permission: None
        self.contract = types.SimpleNamespace(
            exchange_rate=1,
            items=[
                types.SimpleNamespace(
                    name="CONTRACT-ITEM-1",
                    item_code="RONIX-TEST-SERVICE",
                    item_name="RONIX Test Engineering Service",
                )
            ],
        )

        frappe = types.ModuleType("frappe")
        frappe.db = self.db
        frappe._ = lambda value: value
        frappe.whitelist = lambda: (lambda function: function)
        frappe.new_doc = lambda doctype: self.invoice
        frappe.get_doc = lambda doctype, name: (
            self.claim if doctype == "RONIX Claim" else self.contract
        )
        frappe.throw = lambda message: (_ for _ in ()).throw(ValueError(message))
        frappe.has_permission = lambda doctype, ptype=None: True

        mapper = types.ModuleType("frappe.model.mapper")
        mapper.get_mapped_doc = object()
        utils = types.ModuleType("frappe.utils")
        utils.flt = lambda value: float(value or 0)
        model = types.ModuleType("frappe.model")

        self.original_modules = {
            name: sys.modules.get(name)
            for name in ("frappe", "frappe.model", "frappe.model.mapper", "frappe.utils")
        }
        sys.modules.update(
            {
                "frappe": frappe,
                "frappe.model": model,
                "frappe.model.mapper": mapper,
                "frappe.utils": utils,
            }
        )
        spec = importlib.util.spec_from_file_location(
            "ronix_api_under_test", ROOT / "ronix_erp" / "api.py"
        )
        self.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.api)

    def tearDown(self):
        sys.modules.pop("ronix_api_under_test", None)
        for name, module in self.original_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def test_maps_claim_item_and_due_date_to_invoice(self):
        invoice = self.api.make_sales_invoice_from_claim("CLM-TEST")

        self.assertTrue(self.db.locked)
        self.assertEqual(invoice.customer, "TEST CUSTOMER")
        self.assertEqual(invoice.due_date, "2026-09-25")
        self.assertEqual(invoice.ronix_claim, "CLM-TEST")
        self.assertEqual(len(invoice.items), 1)
        self.assertEqual(invoice.items[0].item_code, "RONIX-TEST-SERVICE")
        self.assertEqual(invoice.items[0].qty, 0.4)
        self.assertEqual(invoice.items[0].uom, "Job")
        self.assertEqual(invoice.items[0].rate, 100000)
        self.assertEqual(invoice.items[0].cost_center, "Main - RS")
        self.assertEqual(invoice.items[0].ronix_claim_item, "CLAIM-ITEM-1")
        self.assertEqual(
            invoice.methods_run,
            ["set_missing_values", "calculate_taxes_and_totals"],
        )

    def test_integer_quantity_keeps_source_uom(self):
        self.claim.items[0].qty = 1
        invoice = self.api.make_sales_invoice_from_claim("CLM-TEST")
        self.assertEqual(invoice.items[0].uom, "Nos")


if __name__ == "__main__":
    unittest.main()
