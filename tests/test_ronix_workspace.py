import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TestRonixWorkspace(unittest.TestCase):
    def test_v16_apps_screen_hook_points_to_operational_hub(self):
        hooks = (ROOT / "ronix_erp" / "hooks.py").read_text(encoding="utf-8")
        self.assertIn("add_to_apps_screen", hooks)
        self.assertIn('"route": "/desk/ronix-erp-dashboard"', hooks)
        self.assertIn('"logo": "/assets/ronix_erp/images/ronix-logo.png"', hooks)

    def test_page_definition_and_assets_exist(self):
        page_dir = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "page"
            / "ronix_erp_dashboard"
        )
        page = json.loads((page_dir / "ronix_erp_dashboard.json").read_text())
        self.assertEqual(page["doctype"], "Page")
        self.assertEqual(page["module"], "RONIX ERP")
        self.assertEqual(page["page_name"], "ronix-erp-dashboard")
        self.assertTrue((page_dir / "ronix_erp_dashboard.js").is_file())
        self.assertTrue((ROOT / "ronix_erp" / "public" / "images" / "ronix-logo.png").is_file())

    def test_workspace_contains_operational_routes(self):
        source = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "page"
            / "ronix_erp_dashboard"
            / "ronix_erp_dashboard.js"
        ).read_text(encoding="utf-8")
        for required in (
            "Project",
            "Quotation",
            "RONIX Contract",
            "RONIX Claim",
            "Sales Invoice",
            "Payment Entry",
            "Purchase Order",
            "Stock Entry",
            "Work Order",
            "RONIX Project Profitability",
        ):
            self.assertIn(required, source)

    def test_workspace_uses_professional_html_shell_and_live_data(self):
        source = (
            ROOT
            / "ronix_erp"
            / "ronix_erp"
            / "page"
            / "ronix_erp_dashboard"
            / "ronix_erp_dashboard.js"
        ).read_text(encoding="utf-8")
        api = (ROOT / "ronix_erp" / "api.py").read_text(encoding="utf-8")

        for required in (
            "V1.0.0",
            "ملخص اليوم",
            "محفظة المشروعات والربحية",
            "إضافة سريعة",
            "ronix-logo.png",
            "@media(max-width:900px)",
        ):
            self.assertIn(required, source)
        self.assertIn('event.preventDefault();', source)
        self.assertIn("get_dashboard_data", api)
        self.assertIn("RONIX Project Profitability", source)
