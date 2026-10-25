from frappe.tests.utils import FrappeTestCase
from frappe.model.document import Document

from ronix_erp.ronix_erp.doctype.ronix_claim.ronix_claim import RONIXClaim


class TestRONIXClaim(FrappeTestCase):
    def test_claim_controller_is_registered(self):
        self.assertTrue(issubclass(RONIXClaim, Document))
