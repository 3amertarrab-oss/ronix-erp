import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from ronix_erp.commercial import sync_contract_commercials


class RONIXContract(Document):
    def validate(self):
        self.validate_source()
        self.validate_dates()
        self.validate_exchange_rate()
        self.validate_retention_policy()
        self.populate_default_clauses()
        self.validate_clauses()
        self.set_totals()
        self.validate_payment_schedule()
        self.validate_signatories()
        self.validate_status_transition()

    def before_submit(self):
        missing = []
        if not self.technical_approved:
            missing.append(_("Technical Approval"))
        if not self.finance_approved:
            missing.append(_("Finance Approval"))
        if not self.management_approved:
            missing.append(_("Management Approval"))
        if self.contract_status not in ("Approved", "Signed", "Active"):
            missing.append(_("Approved or Signed contract status"))
        if missing:
            frappe.throw(_("Contract cannot be submitted. Missing: {0}").format(", ".join(missing)))

    def before_cancel(self):
        project = self.project or frappe.db.exists("Project", {"ronix_contract": self.name})
        if project:
            frappe.throw(
                _("Contract cannot be cancelled because it is linked to Project {0}.").format(
                    project
                )
            )

        claim = frappe.db.exists(
            "RONIX Claim", {"contract": self.name, "docstatus": ["<", 2]}
        )
        if claim:
            frappe.throw(
                _("Contract cannot be cancelled because Claim {0} depends on it.").format(claim)
            )

        invoice = frappe.db.exists(
            "Sales Invoice", {"ronix_contract": self.name, "docstatus": ["<", 2]}
        )
        if invoice:
            frappe.throw(
                _("Contract cannot be cancelled because Sales Invoice {0} depends on it.").format(
                    invoice
                )
            )

    def on_submit(self):
        frappe.db.set_value(
            "Quotation",
            self.quotation,
            {
                "ronix_contract": self.name,
                "ronix_approved_for_contract": 1,
                "ronix_commercial_status": "Contracted",
            },
        )
        sync_contract_commercials(self.name)

    def on_update_after_submit(self):
        status = "Closed" if self.contract_status == "Closed" else "Contracted"
        if self.project and self.contract_status in ("Active", "Closed"):
            status = "Closed" if self.contract_status == "Closed" else "Project Active"
        frappe.db.set_value(
            "Quotation",
            self.quotation,
            {"ronix_contract": self.name, "ronix_commercial_status": status},
            update_modified=False,
        )
        sync_contract_commercials(self.name)

    def on_cancel(self):
        linked = frappe.db.get_value("Quotation", self.quotation, "ronix_contract")
        if linked == self.name:
            frappe.db.set_value(
                "Quotation",
                self.quotation,
                {
                    "ronix_contract": None,
                    "ronix_approved_for_contract": 0,
                    "ronix_commercial_status": "Open",
                },
            )
        sync_contract_commercials(self.name)

    def validate_source(self):
        if not self.quotation:
            return
        quotation = frappe.db.get_value(
            "Quotation",
            self.quotation,
            ["party_name", "company", "currency", "docstatus"],
            as_dict=True,
        )
        if not quotation or quotation.docstatus != 1:
            frappe.throw(_("The source Quotation must exist and be submitted."))
        if quotation.party_name != self.customer:
            frappe.throw(_("Contract customer must match the source Quotation customer."))
        if quotation.company != self.company:
            frappe.throw(_("Contract company must match the source Quotation company."))
        if quotation.currency != self.currency:
            frappe.throw(_("Contract currency must match the source Quotation currency."))

        duplicate = frappe.db.exists(
            "RONIX Contract",
            {
                "quotation": self.quotation,
                "name": ["!=", self.name],
                "docstatus": ["<", 2],
            },
        )
        if duplicate:
            frappe.throw(_("Quotation is already linked to active Contract {0}.").format(duplicate))

    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            frappe.throw(_("Contract end date cannot be before the start date."))
        if self.signature_date and self.contract_date and self.signature_date < self.contract_date:
            frappe.throw(_("Signature date cannot be before the Contract date."))
        if self.effective_date and self.contract_date and self.effective_date < self.contract_date:
            frappe.throw(_("Effective date cannot be before the Contract date."))
        if self.commencement_trigger == "Notice to Proceed" and not self.notice_to_proceed_date:
            frappe.throw(_("Notice to Proceed date is required for this commencement trigger."))

    def validate_exchange_rate(self):
        if flt(self.exchange_rate) <= 0:
            frappe.throw(_("Contract exchange rate must be greater than zero."))

    def validate_retention_policy(self):
        retention_percent = flt(self.retention_percent)
        if retention_percent < 0 or retention_percent > 100:
            frappe.throw(_("Contract Retention % must be between 0 and 100."))
        if (
            self.retention_release_date
            and self.contract_date
            and self.retention_release_date < self.contract_date
        ):
            frappe.throw(_("Retention release date cannot be before the Contract date."))
        if retention_percent and not (
            self.retention_release_date or (self.retention_terms or "").strip()
        ):
            frappe.throw(
                _(
                    "A contract with retention requires a Retention Release Date "
                    "or Retention Release Terms."
                )
            )

    def validate_signatories(self):
        if self.contract_status in ("Signed", "Active"):
            if not self.signed_by_customer or not self.signed_by_company:
                frappe.throw(
                    _("Signed or Active contracts require both customer and company signatories.")
                )
            if not self.signature_date:
                self.signature_date = self.contract_date
        if self.contract_status == "Active" and not self.effective_date:
            self.effective_date = self.start_date or self.signature_date or self.contract_date

    def populate_default_clauses(self):
        if self.clauses or self.contract_template == "Custom" or self.docstatus != 0:
            return
        for clause in build_contract_template(
            self.contract_template or "Engineering Services",
            self.contract_language or "Bilingual",
        ):
            self.append("clauses", clause)

    def validate_clauses(self):
        for row in self.clauses or []:
            if not (row.clause_title or "").strip():
                frappe.throw(_("Every contract clause requires a title."))
            if not (row.clause_text or "").strip():
                frappe.throw(_("Contract clause {0} requires text.").format(row.clause_title))

    def validate_status_transition(self):
        previous = self.get_doc_before_save()
        if not previous or previous.docstatus != 1 or self.docstatus != 1:
            return

        allowed = {
            "Approved": {"Approved", "Signed"},
            "Signed": {"Signed", "Active"},
            "Active": {"Active", "Closed"},
            "Closed": {"Closed"},
        }
        if self.contract_status == "Cancelled":
            frappe.throw(_("Use the Cancel action instead of changing Contract Status manually."))
        allowed_next = allowed.get(previous.contract_status, {previous.contract_status})
        if self.contract_status not in allowed_next:
            frappe.throw(
                _("Invalid Contract Status transition from {0} to {1}.").format(
                    previous.contract_status, self.contract_status
                )
            )

    def set_totals(self):
        if not self.items:
            frappe.throw(_("Contract must contain at least one item."))
        total = 0
        for row in self.items:
            if flt(row.qty) <= 0:
                frappe.throw(_("Contract item quantity must be greater than zero."))
            if flt(row.rate) < 0:
                frappe.throw(_("Contract item rate cannot be negative."))
            row.amount = flt(row.qty) * flt(row.rate)
            total += row.amount
        self.contract_value = total

    def validate_payment_schedule(self):
        percent_total = 0
        amount_total = 0
        for row in self.payment_schedule:
            if flt(row.percentage) < 0 or flt(row.amount) < 0:
                frappe.throw(_("Payment milestone percentage and amount cannot be negative."))
            if flt(row.percentage) and not flt(row.amount):
                row.amount = flt(self.contract_value) * flt(row.percentage) / 100
            elif flt(row.percentage) and flt(row.amount):
                expected = flt(self.contract_value) * flt(row.percentage) / 100
                if abs(flt(row.amount) - expected) > 0.01:
                    frappe.throw(
                        _("Payment milestone {0} amount does not match its percentage.").format(
                            row.milestone
                        )
                    )
            percent_total += flt(row.percentage)
            amount_total += flt(row.amount)

        if percent_total > 100.0001:
            frappe.throw(_("Payment schedule percentages cannot exceed 100%."))
        if amount_total > flt(self.contract_value) + 0.01:
            frappe.throw(_("Payment schedule amount cannot exceed the contract value."))

        if self.payment_schedule and self.docstatus == 1:
            complete_by_percent = abs(percent_total - 100) <= 0.0001
            complete_by_amount = abs(amount_total - flt(self.contract_value)) <= 0.01
            if not (complete_by_percent or complete_by_amount):
                frappe.throw(
                    _("Submitted Contract payment schedule must cover the full contract value.")
                )


CONTRACT_TEMPLATES = {
    "Engineering Services": [
        ("Scope", "نطاق الخدمات", "Scope of Services", "يلتزم الطرف الثاني بتنفيذ الخدمات الهندسية الموضحة في نطاق العمل والمرفقات المعتمدة.", "The Contractor shall perform the engineering services described in the approved scope and attachments."),
        ("Time", "المدة والبرنامج", "Time and Programme", "تبدأ المدة وفق محفز البدء المحدد بالعقد، ويلتزم الطرف الثاني بالبرنامج الزمني المعتمد.", "The contract period starts upon the selected commencement trigger and follows the approved programme."),
        ("Payment", "القيمة وشروط السداد", "Price and Payment", "تُستحق الدفعات وفق جدول الدفعات المعتمد، وبعد اعتماد الأعمال أو المرحلة المقابلة.", "Payments become due under the approved payment schedule after certification of the corresponding work or milestone."),
        ("Variation", "الأوامر التغييرية", "Change Orders", "لا يُعتد بأي تغيير في النطاق أو القيمة أو المدة إلا بموجب أمر تغييري مكتوب ومعتمد من الطرفين.", "No change to scope, price, or time is valid without a written Change Order approved by both parties."),
        ("Retention", "الاستبقاء والخصومات", "Retention and Deductions", "تطبق نسبة الاستبقاء وشروط الإفراج عنها كما هو مبين في بيانات العقد، ولا تُجرى خصومات أخرى إلا بمستند نظامي.", "Retention and its release follow the contract data; no other deduction applies without proper supporting documentation."),
        ("Warranty", "الجودة والضمان", "Quality and Warranty", "تُنفذ الخدمات وفق الأصول الفنية والمواصفات المعتمدة، ويلتزم الطرف الثاني بتصحيح أي قصور يقع ضمن مسؤوليته.", "Services shall comply with approved professional standards and specifications, and the Contractor shall remedy defects within its responsibility."),
        ("Termination", "التعليق والإنهاء", "Suspension and Termination", "يجوز التعليق أو الإنهاء بإشعار مكتوب وفق أحكام العقد، مع تسوية الأعمال المنفذة والمستحقات حتى تاريخ الإنهاء.", "Suspension or termination requires written notice under the contract, with settlement of completed work and amounts due up to the termination date."),
        ("Dispute", "القانون وتسوية النزاعات", "Governing Law and Disputes", "يسعى الطرفان لتسوية النزاع وديًا، وإلا يُحال للجهة المختصة وفق القانون الواجب التطبيق.", "The parties shall first seek amicable settlement; unresolved disputes go to the competent forum under applicable law."),
    ],
    "Steel Supply": [
        ("Scope", "نطاق التوريد", "Supply Scope", "يشمل التوريد الأصناف والكميات والمواصفات الواردة في جدول العقد والمرفقات المعتمدة.", "The supply includes the items, quantities, and specifications listed in the contract schedule and approved attachments."),
        ("Time", "التسليم", "Delivery", "يكون التسليم في الموقع والتواريخ المحددة وبمستندات الاستلام المعتمدة.", "Delivery shall occur at the agreed location and dates against approved receiving documents."),
        ("Payment", "السعر والسداد", "Price and Payment", "الأسعار والدفعات وفق جدول العقد، وأي كميات إضافية تتطلب أمرًا تغييريًا.", "Prices and payments follow the contract schedule; additional quantities require an approved Change Order."),
        ("Quality", "الفحص والمطابقة", "Inspection and Compliance", "تخضع المواد للفحص ويجب أن تطابق المواصفات والشهادات المطلوبة.", "Materials are subject to inspection and must comply with the required specifications and certificates."),
        ("Variation", "الأوامر التغييرية", "Change Orders", "لا يُعتمد تعديل الكمية أو المواصفة أو موعد التسليم دون أمر تغييري مكتوب.", "Quantity, specification, or delivery changes require a written approved Change Order."),
        ("Warranty", "الضمان", "Warranty", "يضمن المورد مطابقة المواد ويتحمل استبدال المواد غير المطابقة ضمن المدة المتفق عليها.", "The Supplier warrants compliance and shall replace nonconforming materials within the agreed period."),
    ],
    "Fabrication and Erection": [
        ("Scope", "نطاق التصنيع والتركيب", "Fabrication and Erection Scope", "يشمل العمل الرسومات المعتمدة والتصنيع والتوريد والتركيب والاختبارات الواردة في نطاق العقد.", "The work includes approved drawings, fabrication, supply, erection, and testing stated in the contract scope."),
        ("Time", "البرنامج والتنفيذ", "Programme and Execution", "ينفذ الطرف الثاني الأعمال وفق البرنامج المعتمد ومتطلبات الموقع والسلامة.", "The Contractor shall execute the works under the approved programme and site safety requirements."),
        ("Payment", "المستخلصات والسداد", "Valuation and Payment", "تُقاس الأعمال وتُعتمد المستخلصات وفق نسب الإنجاز وجدول الدفعات.", "Work is measured and certified by progress in accordance with the payment schedule."),
        ("Variation", "الأوامر التغييرية", "Change Orders", "أي تغيير في الرسومات أو الكميات أو طريقة التنفيذ أو المدة يتطلب أمرًا تغييريًا مكتوبًا.", "Changes to drawings, quantities, method, or time require a written Change Order."),
        ("Retention", "الاستبقاء", "Retention", "تُحجز وتُفرج مبالغ الاستبقاء وفق النسبة والتاريخ أو الشروط المحددة بالعقد.", "Retention is held and released under the percentage, date, or conditions stated in the contract."),
        ("Warranty", "الجودة والضمان", "Quality and Warranty", "يضمن الطرف الثاني جودة التصنيع والتركيب وإصلاح العيوب التي تقع ضمن مسؤوليته.", "The Contractor warrants fabrication and erection quality and shall remedy defects within its responsibility."),
        ("Dispute", "التسوية والنزاعات", "Settlement and Disputes", "تُحل الخلافات وديًا أولًا ثم وفق القانون والجهة المختصة المحددة بالعقد.", "Disputes are first addressed amicably, then under the applicable law and competent forum."),
    ],
    "Custom": [],
}


def build_contract_template(template_name, language):
    rows = []
    for clause_type, title_ar, title_en, text_ar, text_en in CONTRACT_TEMPLATES.get(
        template_name, CONTRACT_TEMPLATES["Engineering Services"]
    ):
        if language == "Arabic":
            title = title_ar
            text = f'<div dir="rtl">{text_ar}</div>'
        elif language == "English":
            title = title_en
            text = f'<div dir="ltr">{text_en}</div>'
        else:
            title = f"{title_ar} / {title_en}"
            text = (
                f'<div dir="rtl">{text_ar}</div>'
                f'<div dir="ltr" style="margin-top:8px">{text_en}</div>'
            )
        rows.append(
            {
                "clause_type": clause_type,
                "clause_title": title,
                "clause_text": text,
                "page_break_before": 0,
            }
        )
    return rows


@frappe.whitelist()
def get_contract_template(template_name, language="Bilingual"):
    if not frappe.has_permission("RONIX Contract", ptype="create"):
        frappe.throw(_("You are not permitted to create RONIX Contracts."), frappe.PermissionError)
    return build_contract_template(template_name, language)
