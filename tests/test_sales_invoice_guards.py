import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Record(types.SimpleNamespace):
    def get(self, fieldname, default=None):
        return getattr(self, fieldname, default)


class FakeDB:
    def __init__(self, claim):
        self.claim = claim
        self.duplicate = None

    def sql(self, query, values):
        return []

    def get_value(self, doctype, name, fields, as_dict=False):
        return self.claim

    def exists(self, doctype, filters):
        return self.duplicate


class SalesInvoiceGuardTest(unittest.TestCase):
    def setUp(self):
        self.claim = Record(
            contract="CON-TEST",
            customer="TEST CUSTOMER",
            company="RONIX STEEL",
            project="PROJ-0001",
            currency="EGP",
            docstatus=1,
            claim_status="Approved",
            due_date="2026-09-25",
            gross_amount=40000,
            sales_invoice=None,
        )
        self.db = FakeDB(self.claim)
        self.claim_item = Record(
            name="CLAIM-ITEM-1",
            qty=0.4,
            rate=100000,
            contract_item_reference="CONTRACT-ITEM-1",
        )
        self.contract_item = Record(
            name="CONTRACT-ITEM-1", item_code="RONIX-TEST-SERVICE"
        )

        frappe = types.ModuleType("frappe")
        frappe.db = self.db
        frappe._ = lambda value: value
        frappe.throw = lambda message: (_ for _ in ()).throw(ValueError(message))
        frappe.get_all = lambda doctype, **kwargs: (
            [self.claim_item]
            if doctype == "RONIX Claim Item"
            else [self.contract_item]
        )
        utils = types.ModuleType("frappe.utils")
        utils.flt = lambda value: float(value or 0)

        self.original_modules = {
            name: sys.modules.get(name) for name in ("frappe", "frappe.utils")
        }
        sys.modules.update({"frappe": frappe, "frappe.utils": utils})
        spec = importlib.util.spec_from_file_location(
            "sales_invoice_events_under_test",
            ROOT / "ronix_erp" / "events" / "sales_invoice.py",
        )
        self.events = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.events)

    def tearDown(self):
        sys.modules.pop("sales_invoice_events_under_test", None)
        for name, module in self.original_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def make_invoice(self):
        return Record(
            name="new-sales-invoice-test",
            ronix_claim="CLM-TEST",
            ronix_contract="CON-TEST",
            customer="TEST CUSTOMER",
            company="RONIX STEEL",
            project="PROJ-0001",
            currency="EGP",
            due_date="2026-09-25",
            items=[
                Record(
                    item_code="RONIX-TEST-SERVICE",
                    qty=0.4,
                    rate=100000,
                    ronix_claim_item="CLAIM-ITEM-1",
                )
            ],
        )

    def test_valid_mapped_invoice_passes(self):
        self.events.validate_sales_invoice(self.make_invoice())

    def test_zero_item_invoice_is_blocked(self):
        invoice = self.make_invoice()
        invoice.items = []
        with self.assertRaisesRegex(ValueError, "must contain items"):
            self.events.validate_sales_invoice(invoice)

    def test_due_date_mismatch_is_blocked(self):
        invoice = self.make_invoice()
        invoice.due_date = "2026-08-26"
        with self.assertRaisesRegex(ValueError, "due date must match"):
            self.events.validate_sales_invoice(invoice)

    def test_duplicate_invoice_is_blocked(self):
        self.db.duplicate = "ACC-SINV-2026-00001"
        with self.assertRaisesRegex(ValueError, "already linked"):
            self.events.validate_sales_invoice(self.make_invoice())


if __name__ == "__main__":
    unittest.main()
