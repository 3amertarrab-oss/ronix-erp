import unittest

from ronix_erp.profitability import enrich_project_rows


class ProjectProfitabilityTest(unittest.TestCase):
    def test_calculates_profit_margin_and_commercial_balances(self):
        [row] = enrich_project_rows(
            [
                {
                    "project": "PROJ-TEST",
                    "contract_value": 100000,
                    "invoiced_amount": 40000,
                    "collected_amount": 38000,
                    "retention_amount": 2000,
                    "withholding_amount": 0,
                    "outstanding_amount": 0,
                    "actual_revenue": 40000,
                    "actual_cost": 25000,
                }
            ]
        )

        self.assertEqual(row["net_profit"], 15000)
        self.assertEqual(row["margin_percent"], 37.5)
        self.assertEqual(row["unbilled_contract"], 60000)
        self.assertEqual(row["uncollected_invoiced"], 0)

    def test_zero_revenue_has_safe_zero_margin(self):
        [row] = enrich_project_rows([{"actual_cost": 1000}])

        self.assertEqual(row["net_profit"], -1000)
        self.assertEqual(row["margin_percent"], 0)

    def test_report_uses_only_posted_accounting_documents(self):
        from pathlib import Path

        report = (
            Path(__file__).resolve().parents[1]
            / "ronix_erp"
            / "ronix_erp"
            / "report"
            / "ronix_project_profitability"
            / "ronix_project_profitability.py"
        ).read_text(encoding="utf-8")

        self.assertIn("gle.is_cancelled = 0", report)
        self.assertGreaterEqual(report.count("docstatus = 1"), 3)
        self.assertIn("frappe.get_list", report)


if __name__ == "__main__":
    unittest.main()
