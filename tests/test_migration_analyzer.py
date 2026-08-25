import json
import unittest

from ronix_erp.migration.analyzer import analyze_snapshot, canonical_snapshot_hash
from ronix_erp.migration.extractor import extract_initial_snapshot


def valid_snapshot():
    return {
        "meta": {"version": "5.5.21"},
        "customers": [{"id": "C1", "code": "CL-1", "name": "Acme Steel"}],
        "employees": [{"id": "E1", "code": "EMP-1", "name": "Engineer One"}],
        "projects": [
            {"id": "P1", "code": "PRJ-1", "name": "Warehouse", "customerId": "C1"}
        ],
        "quotes": [
            {
                "id": "Q1",
                "number": "Q-1",
                "customerId": "C1",
                "projectId": "P1",
                "lines": [{"qty": 2, "unitPrice": 100, "discountPct": 10, "taxRate": 14}],
            }
        ],
        "contracts": [
            {
                "id": "K1",
                "number": "CON-1",
                "customerId": "C1",
                "projectId": "P1",
                "quoteId": "Q1",
                "lines": [{"qty": 1, "unitPrice": 205.2}],
            }
        ],
        "invoices": [
            {
                "id": "I1",
                "number": "INV-1",
                "customerId": "C1",
                "projectId": "P1",
                "contractId": "K1",
                "lines": [{"qty": 1, "unitPrice": 205.2}],
            }
        ],
        "receipts": [
            {
                "id": "R1",
                "number": "RCPT-1",
                "customerId": "C1",
                "projectId": "P1",
                "amount": 100,
                "allocations": [{"invoiceId": "I1", "amount": 100}],
            }
        ],
        "expenses": [
            {
                "id": "X1",
                "number": "EXP-1",
                "projectId": "P1",
                "employeeId": "E1",
                "amount": 25,
            }
        ],
    }


class MigrationAnalyzerTest(unittest.TestCase):
    def test_valid_snapshot_and_control_totals(self):
        report = analyze_snapshot(valid_snapshot())
        self.assertTrue(report["valid"])
        self.assertEqual(report["counts"]["projects"], 1)
        self.assertEqual(report["totals"]["quotation_value"], 205.2)
        self.assertEqual(report["totals"]["receipt_value"], 100.0)

    def test_duplicate_and_broken_reference_are_blocking(self):
        snapshot = valid_snapshot()
        snapshot["customers"].append(
            {"id": "C1", "code": "CL-2", "name": "Duplicate Customer"}
        )
        snapshot["projects"][0]["customerId"] = "MISSING"
        report = analyze_snapshot(snapshot)
        codes = {issue["code"] for issue in report["errors"]}
        self.assertFalse(report["valid"])
        self.assertIn("DUPLICATE_ID", codes)
        self.assertIn("BROKEN_REFERENCE", codes)

    def test_over_allocated_receipt_is_blocking(self):
        snapshot = valid_snapshot()
        snapshot["receipts"][0]["allocations"][0]["amount"] = 101
        report = analyze_snapshot(snapshot)
        self.assertIn("OVER_ALLOCATED_RECEIPT", {item["code"] for item in report["errors"]})

    def test_hash_is_stable_for_key_order(self):
        snapshot = valid_snapshot()
        reordered = json.loads(json.dumps(snapshot, sort_keys=True))
        self.assertEqual(canonical_snapshot_hash(snapshot), canonical_snapshot_hash(reordered))

    def test_extracts_initial_db_without_executing_html(self):
        snapshot = valid_snapshot()
        html = f"<script>window.INITIAL_DB={json.dumps(snapshot)};alert('ignored')</script>"
        self.assertEqual(extract_initial_snapshot(html), snapshot)


if __name__ == "__main__":
    unittest.main()

