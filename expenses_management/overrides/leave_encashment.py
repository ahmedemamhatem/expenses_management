import frappe
from frappe.utils import flt

from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment


class CustomLeaveEncashment(LeaveEncashment):
    """
    Custom Leave Encashment that calculates encashment amount from Salary Structure Assignment
    Gross = Base + Housing Allowance (custom_ha) + Transport Allowance (custom_ta) + Other Allowances + Max Benefits
    Per Day = Gross / 30
    """

    def set_encashment_amount(self):
        if not hasattr(self, "_salary_structure"):
            self.set_salary_structure()

        # Get per day amount from Salary Structure Assignment
        per_day_encashment = self.get_per_day_amount_from_ssa()

        if not per_day_encashment or per_day_encashment <= 0:
            # Fallback to Salary Structure leave_encashment_amount_per_day
            per_day_encashment = frappe.db.get_value(
                "Salary Structure", self._salary_structure, "leave_encashment_amount_per_day"
            )

        self.encashment_amount = self.encashment_days * per_day_encashment if per_day_encashment > 0 else 0

    def get_per_day_amount_from_ssa(self):
        """
        Calculate per day encashment amount from Salary Structure Assignment
        Gross = Base + Housing Allowance + Transport Allowance + Other Allowances + Max Benefits
        Per Day = Gross / 30
        """
        ssa = frappe.db.get_value(
            "Salary Structure Assignment",
            {
                "employee": self.employee,
                "salary_structure": self._salary_structure,
                "docstatus": 1,
                "from_date": ("<=", self.encashment_date)
            },
            ["base", "custom_ha", "custom_ta", "custom_other_allowances", "max_benefits"],
            as_dict=True,
            order_by="from_date desc"
        )

        if not ssa:
            return 0

        # Calculate gross from SSA components
        gross = (
            flt(ssa.get("base", 0)) +
            flt(ssa.get("custom_ha", 0)) +
            flt(ssa.get("custom_ta", 0)) +
            flt(ssa.get("custom_other_allowances", 0)) +
            flt(ssa.get("max_benefits", 0))
        )

        # Per day amount (assuming 30 days per month)
        per_day_amount = gross / 30

        return per_day_amount
