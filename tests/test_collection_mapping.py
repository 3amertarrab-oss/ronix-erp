import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Record(types.SimpleNamespace):
    def get(self, fieldname, default=None):
        return getattr(self, fieldname, default)


class FakePayment(Record):
    def __init__(self):
        super().__init__(deductions=[], references=[])
        self.exchange_rate_source = None
        self.amounts_set = False
        self.meta = Record(has_field=lambda fieldname: fieldname == "cost_center")

    def set(self, fieldname, value):
        setattr(self, fieldname, value)

    def append(self, fieldname, values):
        row = Record(**values)
        getattr(self, fieldname).append(row)
        return row

    def set_exchange_rate(self, source):
        self.exchange_rate_source = source

    def set_amounts(self):
        self.amounts_set = True


class FakeDB:
    def sql(self, query, values):
        return []

    def exists(self, doctype, filters):
        return None

    def get_value(self, doctype, name, fieldname):
        if doctype == "Account":
            return "EGP"
        if doctype == "Project":
            return "Main - RS"
        return None


class CollectionMappingTest(unittest.TestCase):
    def setUp(self):
        self.invoice = Record(
            name="ACC-SINV-TEST",
            docstatus=1,
            ronix_claim="CLM-TEST",
            company="RONIX STEEL",
            currency="EGP",
            outstanding_amount=40000,
        )
        self.invoice.check_permission = lambda permission: None
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
        self.payment = FakePayment()

        frappe = types.ModuleType("frappe")
        frappe.db = FakeDB()
        frappe._ = lambda value: value
        frappe.whitelist = lambda: (lambda function: function)
        frappe.throw = lambda message: (_ for _ in ()).throw(ValueError(message))
        frappe.has_permission = lambda doctype, ptype=None: True
        frappe.get_doc = lambda doctype, name: (
            self.invoice if doctype == "Sales Invoice" else self.claim
        )
        frappe.get_cached_value = lambda doctype, name, fieldname: (
            "EGP" if fieldname == "default_currency" else "Main - RS"
        )

        mapper = types.ModuleType("frappe.model.mapper")
        mapper.get_mapped_doc = object()
        model = types.ModuleType("frappe.model")
        utils = types.ModuleType("frappe.utils")
        utils.flt = lambda value: float(value or 0)

        accounting = types.ModuleType("ronix_erp.accounting")
        accounting.get_accounting_settings = lambda company, claim: Record(
            default_collection_account="Cash - RS",
            retention_receivable_account="Retention Receivable - RS",
        )
        accounting.get_claim_adjustments = lambda claim, settings: [
            {
                "account": "Retention Receivable - RS",
                "amount": 2000,
                "description": "Retention",
            }
        ]

        payment_entry_module = types.ModuleType(
            "erpnext.accounts.doctype.payment_entry.payment_entry"
        )
        payment_entry_module.get_payment_entry = lambda *args, **kwargs: self.payment

        module_names = (
            "frappe",
            "frappe.model",
            "frappe.model.mapper",
            "frappe.utils",
            "ronix_erp.accounting",
            "erpnext",
            "erpnext.accounts",
            "erpnext.accounts.doctype",
            "erpnext.accounts.doctype.payment_entry",
            "erpnext.accounts.doctype.payment_entry.payment_entry",
        )
        self.original_modules = {name: sys.modules.get(name) for name in module_names}
        sys.modules.update(
            {
                "frappe": frappe,
                "frappe.model": model,
                "frappe.model.mapper": mapper,
                "frappe.utils": utils,
                "ronix_erp.accounting": accounting,
                "erpnext": types.ModuleType("erpnext"),
                "erpnext.accounts": types.ModuleType("erpnext.accounts"),
                "erpnext.accounts.doctype": types.ModuleType("erpnext.accounts.doctype"),
                "erpnext.accounts.doctype.payment_entry": types.ModuleType(
                    "erpnext.accounts.doctype.payment_entry"
                ),
                "erpnext.accounts.doctype.payment_entry.payment_entry": payment_entry_module,
            }
        )
        spec = importlib.util.spec_from_file_location(
            "collection_api_under_test", ROOT / "ronix_erp" / "api.py"
        )
        self.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.api)

    def tearDown(self):
        sys.modules.pop("collection_api_under_test", None)
        for name, module in self.original_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module

    def test_maps_gross_invoice_to_net_cash_and_retention(self):
        payment = self.api.make_payment_entry_from_invoice("ACC-SINV-TEST")

        self.assertEqual(payment.ronix_claim, "CLM-TEST")
        self.assertEqual(payment.ronix_sales_invoice, "ACC-SINV-TEST")
        self.assertEqual(payment.paid_amount, 38000)
        self.assertEqual(payment.received_amount, 38000)
        self.assertEqual(len(payment.deductions), 1)
        self.assertEqual(payment.deductions[0].account, "Retention Receivable - RS")
        self.assertEqual(payment.deductions[0].amount, 2000)
        self.assertEqual(payment.deductions[0].cost_center, "Main - RS")
        self.assertIs(payment.exchange_rate_source, self.invoice)
        self.assertTrue(payment.amounts_set)


if __name__ == "__main__":
    unittest.main()
