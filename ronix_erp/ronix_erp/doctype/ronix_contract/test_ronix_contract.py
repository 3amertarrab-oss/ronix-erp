from frappe.tests.utils import FrappeTestCase
from frappe.model.document import Document

from ronix_erp.ronix_erp.doctype.ronix_contract.ronix_contract import RONIXContract


class TestRONIXContract(FrappeTestCase):
    def test_contract_controller_is_registered(self):
        self.assertTrue(issubclass(RONIXContract, Document))
