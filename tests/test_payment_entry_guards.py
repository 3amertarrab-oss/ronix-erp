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
    def __init__(self):
        self.duplicate = None

    def exists(self, doctype, filters):
        return self.duplicate


class PaymentEntryGuardTest(unittest.TestCase):
    def setUp(self):
        self.claim = Record(
            name="CLM-TEST",
            docstatus=1,
            claim_status="Invoiced",
            sales_invoice="ACC-SINV-TEST",
            company="RONIX STEEL",
            customer="TEST CUSTOMER",
            project="PROJ-TEST",
            retention_amount=2000,
            withholding_amount=0,
        )
        self.invoice = Record(
            name="ACC-SINV-TEST",
            docstatus=1,
            outstanding_amount=40000,
        )
        self.db = FakeDB()

        frappe = types.ModuleType("frappe")
        frappe.db = self.db
        frappe._ = lambda value: value
        frappe.throw = lambda message: (_ for _ in ()).throw(ValueError(message))
        frappe.get_doc = lambda doctype, name: (
            self.claim if doctype == "RONIX Claim" else self.invoice
        )

        utils = types.ModuleType("frappe.utils")
        utils.flt = lambda value: float(value or 0)

        accounting = types.ModuleType("ronix_erp.accounting")
        accounting.get_accounting_settings = lambda company, claim: Record(
            retention_receivable_account="Retention Receivable - RS"
        )
        accounting.get_claim_adjustments = lambda claim, settings: [
            {
                "account": "Retention Receivable - RS",
                "amount": 2000,
                "description": "Retention",
            }
        ]

        self.original_modules = {
            name: sys.modules.get(name)
            for name in ("frappe", "frappe.utils", "ronix_erp.accounting")
        }
        sys.modules.update(
            {
                "frappe": frappe,
                "frappe.utils": utils,
                "ronix_erp.accounting": accounting,
            }
        )
        spec = importlib.util.spec_from_file_location(
            "payment_entry_events_under_test",
            ROOT / "ronix_erp" / "events" / "payment_entry.py",
        )
        self.events = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.events)

    def tearDown(self):
        sys.modules.pop("payment_entry_events_under_test", None)
        for name, module in self.original_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def make_payment(self):
        return Record(
            name="new-payment-entry-test",
            ronix_claim="CLM-TEST",
            ronix_sales_invoice="ACC-SINV-TEST",
            company="RONIX STEEL",
            party="TEST CUSTOMER",
            party_type="Customer",
            payment_type="Receive",
            paid_amount=38000,
            received_amount=38000,
            references=[
                Record(
                    reference_doctype="Sales Invoice",
                    reference_name="ACC-SINV-TEST",
                    allocated_amount=40000,
                )
            ],
            deductions=[
                Record(
                    account="Retention Receivable - RS",
                    amount=2000,
                    is_exchange_gain_loss=0,
                )
            ],
        )

    def test_valid_collection_passes(self):
        self.events.validate_payment_entry(self.make_payment())

    def test_wrong_cash_amount_is_blocked(self):
        payment = self.make_payment()
        payment.received_amount = 40000
        with self.assertRaisesRegex(ValueError, "net collection amount"):
            self.events.validate_payment_entry(payment)

    def test_wrong_retention_account_is_blocked(self):
        payment = self.make_payment()
        payment.deductions[0].account = "Sales - RS"
        with self.assertRaisesRegex(ValueError, "adjustments are incorrect"):
            self.events.validate_payment_entry(payment)

    def test_duplicate_payment_entry_is_blocked(self):
        self.db.duplicate = "ACC-PAY-2026-00001"
        with self.assertRaisesRegex(ValueError, "already linked"):
            self.events.validate_payment_entry(self.make_payment())


if __name__ == "__main__":
    unittest.main()
