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
        self.assertIn('__version__ = "0.2.1"', package_init)
        self.assertIn('app_version = "0.2.1"', hooks)

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


if __name__ == "__main__":
    unittest.main()
