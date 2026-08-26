import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ReleaseSafetyTest(unittest.TestCase):
    def test_sales_manager_cannot_submit_contract(self):
        path = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_contract"
            / "ronix_contract.json"
        )
        data = json.loads(path.read_text(encoding="utf-8"))
        permission = next(row for row in data["permissions"] if row["role"] == "Sales Manager")
        self.assertNotEqual(permission.get("submit"), 1)

    def test_release_versions_match(self):
        package_init = (ROOT / "ronix_erp" / "__init__.py").read_text(encoding="utf-8")
        hooks = (ROOT / "ronix_erp" / "hooks.py").read_text(encoding="utf-8")
        self.assertIn('__version__ = "0.2.5"', package_init)
        self.assertIn('app_version = "0.2.5"', hooks)

    def test_submitted_contract_can_capture_required_signatories(self):
        path = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_contract"
            / "ronix_contract.json"
        )
        data = json.loads(path.read_text(encoding="utf-8"))
        fields = {row["fieldname"]: row for row in data["fields"]}
        self.assertEqual(fields["contract_status"].get("allow_on_submit"), 1)
        self.assertEqual(fields["signed_by_customer"].get("allow_on_submit"), 1)
        self.assertEqual(fields["signed_by_company"].get("allow_on_submit"), 1)

    def test_contract_item_mapping_has_description_fallback(self):
        api = (ROOT / "ronix_erp" / "api.py").read_text(encoding="utf-8")
        self.assertIn("def set_contract_item_values", api)
        self.assertIn(
            "source.description or source.item_name or source.item_code",
            api,
        )

    def test_dependency_and_cumulative_guards_are_present(self):
        contract = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_contract"
            / "ronix_contract.py"
        ).read_text(encoding="utf-8")
        claim = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_claim"
            / "ronix_claim.py"
        ).read_text(encoding="utf-8")
        self.assertIn("def before_cancel", contract)
        self.assertIn("def before_cancel", claim)
        self.assertIn("validate_contract_items_and_cumulative_quantity", claim)

    def test_claim_to_invoice_mapping_and_guards_are_present(self):
        api = (ROOT / "ronix_erp" / "api.py").read_text(encoding="utf-8")
        claim_js = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_claim"
            / "ronix_claim.js"
        ).read_text(encoding="utf-8")
        invoice_events = (
            ROOT / "ronix_erp" / "events" / "sales_invoice.py"
        ).read_text(encoding="utf-8")

        self.assertIn("def make_sales_invoice_from_claim", api)
        self.assertIn('"item_code": contract_item.item_code', api)
        self.assertIn('"ronix_claim_item": row.name', api)
        self.assertIn("invoice.due_date = claim.due_date or claim.posting_date", api)
        self.assertIn("make_sales_invoice_from_claim", claim_js)
        self.assertIn("if not doc.items", invoice_events)
        self.assertIn("invoice_gross", invoice_events)
        self.assertIn("expected_by_name", invoice_events)
        self.assertIn("seen != set(expected_by_name)", invoice_events)
        self.assertIn("def on_submit_sales_invoice", invoice_events)
        self.assertIn("def on_cancel_sales_invoice", invoice_events)


if __name__ == "__main__":
    unittest.main()
