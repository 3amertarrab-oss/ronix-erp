import unittest

from ronix_erp.commercial_math import (
    calculate_contract_balance_snapshot,
    get_milestone_status,
)


class CommercialBalancesTest(unittest.TestCase):
    def test_contract_snapshot_matches_staging_reconciliation(self):
        snapshot = calculate_contract_balance_snapshot(
            contract_value=100000,
            claimed_amount=40000,
            invoiced_amount=40000,
            collected_amount=38000,
            retention_held=2000,
            outstanding_amount=0,
        )

        self.assertEqual(snapshot["claimed_amount"], 40000)
        self.assertEqual(snapshot["collected_amount"], 38000)
        self.assertEqual(snapshot["retention_held"], 2000)
        self.assertEqual(snapshot["remaining_contract_value"], 60000)

    def test_remaining_contract_value_never_becomes_negative(self):
        snapshot = calculate_contract_balance_snapshot(100000, claimed_amount=100000.004)
        self.assertEqual(snapshot["remaining_contract_value"], 0)

    def test_partial_milestone_is_not_left_planned(self):
        status = get_milestone_status(
            amount=100000,
            invoiced_amount=40000,
            collected_amount=38000,
            retention_amount=2000,
        )
        self.assertEqual(status, "Partially Collected")

    def test_fully_settled_retention_is_explicit(self):
        status = get_milestone_status(
            amount=40000,
            invoiced_amount=40000,
            collected_amount=38000,
            retention_amount=2000,
        )
        self.assertEqual(status, "Collected with Retention")

    def test_overdue_uninvoiced_milestone_is_due(self):
        status = get_milestone_status(
            amount=100000,
            due_date="2026-08-01",
            today="2026-08-28",
        )
        self.assertEqual(status, "Due")


if __name__ == "__main__":
    unittest.main()
