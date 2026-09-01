import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProfessionalContractTest(unittest.TestCase):
    def test_contract_has_professional_control_and_clause_fields(self):
        path = ROOT / "ronix_erp" / "ronix_erp" / "doctype" / "ronix_contract" / "ronix_contract.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        fields = {row["fieldname"]: row for row in data["fields"]}
        for fieldname in (
            "contract_language",
            "contract_template",
            "signature_date",
            "effective_date",
            "commencement_trigger",
            "clauses",
            "professional_preview",
        ):
            self.assertIn(fieldname, fields)
        self.assertEqual(fields["clauses"]["options"], "RONIX Contract Clause")
        self.assertNotEqual(fields["scope"].get("allow_on_submit"), 1)

    def test_clause_child_table_is_editable_and_supports_page_breaks(self):
        path = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "doctype"
            / "ronix_contract_clause"
            / "ronix_contract_clause.json"
        )
        data = json.loads(path.read_text(encoding="utf-8"))
        fields = {row["fieldname"]: row for row in data["fields"]}
        self.assertEqual(data["istable"], 1)
        self.assertEqual(fields["clause_text"]["fieldtype"], "Text Editor")
        self.assertIn("page_break_before", fields)

    def test_professional_print_format_is_a4_bilingual_and_branded(self):
        path = (
            ROOT
            / "ronix_erp"
            / "templates"
            / "print_formats"
            / "ronix_professional_contract.html"
        )
        source = path.read_text(encoding="utf-8")
        for required in (
            "@page { size: A4",
            "ronix-logo.png",
            "PROFESSIONAL CONTRACT",
            "عقد احترافي",
            "page-break-before: always",
            "table-header-group",
            "For RONIX STEEL",
        ):
            self.assertIn(required, source)
        self.assertIn('"{:,.0f}".format', source)

    def test_customer_and_supplier_centers_are_first_class_modules(self):
        dashboard = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "page"
            / "ronix_erp_dashboard"
            / "ronix_erp_dashboard.js"
        ).read_text(encoding="utf-8")
        api = (ROOT / "ronix_erp" / "api.py").read_text(encoding="utf-8")
        self.assertIn('customers: {', dashboard)
        self.assertIn('suppliers: {', dashboard)
        self.assertIn('module: "customers"', dashboard)
        self.assertIn('module: "suppliers"', dashboard)
        self.assertIn('"customers": _customers_module', api)
        self.assertIn('"suppliers": _suppliers_module', api)


if __name__ == "__main__":
    unittest.main()
