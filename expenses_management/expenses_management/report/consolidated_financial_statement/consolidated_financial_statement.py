# Copyright (c) 2013, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt


from collections import defaultdict

import frappe
from frappe import _
from frappe.query_builder import Criterion
from frappe.utils import flt, getdate

import erpnext
from erpnext.accounts.report.balance_sheet.balance_sheet import (
	get_chart_data,
	get_provisional_profit_loss,
)
from erpnext.accounts.report.balance_sheet.balance_sheet import (
	get_report_summary as get_bs_summary,
)
from erpnext.accounts.report.cash_flow.cash_flow import (
	add_total_row_account,
	get_account_type_based_gl_data,
	get_cash_flow_accounts,
)
from erpnext.accounts.report.cash_flow.cash_flow import get_report_summary as get_cash_flow_summary
from erpnext.accounts.report.financial_statements import (
	filter_out_zero_value_rows,
	get_fiscal_year_data,
	sort_accounts,
)
from erpnext.accounts.report.profit_and_loss_statement.profit_and_loss_statement import (
	get_chart_data as get_pl_chart_data,
)
from erpnext.accounts.report.profit_and_loss_statement.profit_and_loss_statement import (
	get_net_profit_loss,
)
from erpnext.accounts.report.profit_and_loss_statement.profit_and_loss_statement import (
	get_report_summary as get_pl_summary,
)
from erpnext.accounts.report.utils import convert, convert_to_presentation_currency
from erpnext.accounts.utils import get_zero_cutoff

value_fields = (
	"opening_debit",
	"opening_credit",
	"debit",
	"credit",
	"closing_debit",
	"closing_credit",
)


def execute(filters=None):
	columns, data, message, chart = [], [], [], []

	if not filters.get("company"):
		return columns, data, message, chart

	fiscal_year = get_fiscal_year_data(filters.get("from_fiscal_year"), filters.get("to_fiscal_year"))
	companies_column, companies = get_companies(filters)
	columns = get_columns(companies_column, filters)

	if filters.get("report") == "Balance Sheet":
		data, message, chart, report_summary = get_balance_sheet_data(
			fiscal_year, companies, columns, filters
		)
	elif filters.get("report") == "Profit and Loss Statement":
		data, message, chart, report_summary = get_profit_loss_data(fiscal_year, companies, columns, filters)
	elif filters.get("report") == "Trial Balance":
		columns, data, report_summary = get_trial_balance_data(fiscal_year, companies, filters)
		message, chart = None, None
	else:
		data, report_summary = get_cash_flow_data(fiscal_year, companies, filters)

	return columns, data, message, chart, report_summary


def get_balance_sheet_data(fiscal_year, companies, columns, filters):
	asset = get_data(companies, "Asset", "Debit", fiscal_year, filters=filters)

	liability = get_data(companies, "Liability", "Credit", fiscal_year, filters=filters)

	equity = get_data(companies, "Equity", "Credit", fiscal_year, filters=filters)

	data = []
	data.extend(asset or [])
	data.extend(liability or [])
	data.extend(equity or [])

	company_currency = get_company_currency(filters)
	provisional_profit_loss, total_credit = get_provisional_profit_loss(
		asset, liability, equity, companies, filters.get("company"), company_currency, True
	)

	message, opening_balance = prepare_companywise_opening_balance(asset, liability, equity, companies)

	if opening_balance:
		unclosed = {
			"account_name": "'" + _("Unclosed Fiscal Years Profit / Loss (Credit)") + "'",
			"account": "'" + _("Unclosed Fiscal Years Profit / Loss (Credit)") + "'",
			"warn_if_negative": True,
			"currency": company_currency,
		}

		for company in companies:
			unclosed[company] = opening_balance.get(company)
			if provisional_profit_loss and provisional_profit_loss.get(company):
				provisional_profit_loss[company] = flt(provisional_profit_loss[company]) - flt(
					opening_balance.get(company)
				)

		unclosed["total"] = opening_balance.get(company)
		data.append(unclosed)

	if provisional_profit_loss:
		data.append(provisional_profit_loss)
	if total_credit:
		data.append(total_credit)

	report_summary, primitive_summary = get_bs_summary(
		companies,
		asset,
		liability,
		equity,
		provisional_profit_loss,
		company_currency,
		filters,
		True,
	)

	chart = get_chart_data(filters, columns, asset, liability, equity, company_currency)

	return data, message, chart, report_summary


def prepare_companywise_opening_balance(asset_data, liability_data, equity_data, companies):
	opening_balance = {}
	for company in companies:
		opening_value = 0

		# opening_value = Aseet - liability - equity
		for data in [asset_data, liability_data, equity_data]:
			if data:
				account_name = get_root_account_name(data[0].root_type, company)
				if account_name:
					opening_value += get_opening_balance(account_name, data, company) or 0.0

		opening_balance[company] = opening_value

	if opening_balance:
		return _("Previous Financial Year is not closed"), opening_balance

	return "", {}


def get_opening_balance(account_name, data, company):
	for row in data:
		if row.get("account_name") == account_name:
			return row.get("company_wise_opening_bal", {}).get(company, 0.0)


def get_root_account_name(root_type, company):
	root_account = frappe.get_all(
		"Account",
		fields=["account_name"],
		filters={
			"root_type": root_type,
			"is_group": 1,
			"company": company,
			"parent_account": ("is", "not set"),
		},
		as_list=1,
	)

	if root_account:
		return root_account[0][0]


def get_profit_loss_data(fiscal_year, companies, columns, filters):
	income, expense, net_profit_loss = get_income_expense_data(companies, fiscal_year, filters)
	company_currency = get_company_currency(filters)

	data = []
	data.extend(income or [])
	data.extend(expense or [])
	if net_profit_loss:
		data.append(net_profit_loss)

	chart = get_pl_chart_data(filters, columns, income, expense, net_profit_loss, company_currency)

	report_summary, primitive_summary = get_pl_summary(
		companies, "", income, expense, net_profit_loss, company_currency, filters, True
	)

	return data, None, chart, report_summary


def get_income_expense_data(companies, fiscal_year, filters):
	company_currency = get_company_currency(filters)
	income = get_data(companies, "Income", "Credit", fiscal_year, filters, True)

	expense = get_data(companies, "Expense", "Debit", fiscal_year, filters, True)

	net_profit_loss = get_net_profit_loss(income, expense, companies, filters.company, company_currency, True)

	return income, expense, net_profit_loss


def get_cash_flow_data(fiscal_year, companies, filters):
	cash_flow_accounts = get_cash_flow_accounts()

	income, expense, net_profit_loss = get_income_expense_data(companies, fiscal_year, filters)

	data = []
	summary_data = {}
	company_currency = get_company_currency(filters)

	for cash_flow_account in cash_flow_accounts:
		section_data = []
		data.append(
			{
				"account_name": cash_flow_account["section_header"],
				"parent_account": None,
				"indent": 0.0,
				"account": cash_flow_account["section_header"],
			}
		)

		if len(data) == 1:
			# add first net income in operations section
			if net_profit_loss:
				net_profit_loss.update(
					{"indent": 1, "parent_account": cash_flow_accounts[0]["section_header"]}
				)
				data.append(net_profit_loss)
				section_data.append(net_profit_loss)

		for account in cash_flow_account["account_types"]:
			account_data = get_account_type_based_data(
				account["account_type"], companies, fiscal_year, filters
			)
			account_data.update(
				{
					"account_name": account["label"],
					"account": account["label"],
					"indent": 1,
					"parent_account": cash_flow_account["section_header"],
					"currency": company_currency,
				}
			)
			data.append(account_data)
			section_data.append(account_data)

		add_total_row_account(
			data,
			section_data,
			cash_flow_account["section_footer"],
			companies,
			company_currency,
			summary_data,
			filters,
			True,
		)

	add_total_row_account(
		data, data, _("Net Change in Cash"), companies, company_currency, summary_data, filters, True
	)

	report_summary = get_cash_flow_summary(summary_data, company_currency)

	return data, report_summary


def get_trial_balance_data(fiscal_year, companies, filters):
	"""Get Trial Balance data with company-wise columns like other consolidated reports."""
	company_currency = get_company_currency(filters)
	companies_list = list(companies.keys()) if isinstance(companies, dict) else companies

	if filters.filter_based_on == "Fiscal Year":
		start_date = fiscal_year.year_start_date
		end_date = fiscal_year.year_end_date
	else:
		start_date = filters.period_start_date
		end_date = filters.period_end_date

	filters.start_date = start_date
	filters.end_date = end_date

	# Get all accounts for all companies (same pattern as get_accounts)
	all_accounts = []
	for company in companies_list:
		all_accounts.extend(
			frappe.get_all(
				"Account",
				fields=[
					"name",
					"is_group",
					"company",
					"parent_account",
					"lft",
					"rgt",
					"root_type",
					"report_type",
					"account_name",
					"account_number",
				],
				filters={"company": company},
				order_by="lft",
			)
		)

	if not all_accounts:
		return get_trial_balance_columns(companies_list, filters), [], None

	# Use the same pattern as other reports
	all_accounts = update_parent_account_names(all_accounts)
	accounts, accounts_by_name, parent_children_map = filter_accounts(all_accounts)

	gl_entries_by_account = {}

	# Get GL entries for all root types
	for root in frappe.db.sql(
		"""select lft, rgt, root_type from tabAccount
			where ifnull(parent_account, '') = ''""",
		as_dict=1,
	):
		set_gl_entries_by_account(
			None,  # from_date=None to get all entries for opening balance calculation
			end_date,
			root.lft,
			root.rgt,
			filters,
			gl_entries_by_account,
			accounts_by_name,
			accounts,
			ignore_closing_entries=True,
			root_type=root.root_type,
		)

	calculate_trial_balance_values(accounts_by_name, gl_entries_by_account, companies_list, companies, filters, start_date)
	accumulate_trial_balance_values_into_parents(accounts, accounts_by_name, companies_list)

	data = prepare_trial_balance_data(accounts, filters, parent_children_map, companies_list, company_currency)
	data = filter_out_zero_value_rows(
		data, parent_children_map, show_zero_values=filters.get("show_zero_values")
	)

	total_row = calculate_trial_balance_total_row(accounts, companies_list, company_currency)
	data.extend([{}, total_row])

	columns = get_trial_balance_columns(companies_list, filters)

	return columns, data, None


def get_trial_balance_columns(companies, filters):
	columns = [
		{
			"fieldname": "account",
			"label": _("Account"),
			"fieldtype": "Link",
			"options": "Account",
			"width": 300,
		},
		{
			"fieldname": "currency",
			"label": _("Currency"),
			"fieldtype": "Link",
			"options": "Currency",
			"hidden": 1,
		},
	]

	for company in companies:
		apply_currency_formatter = 1 if not filters.presentation_currency else 0
		currency = filters.presentation_currency or erpnext.get_company_currency(company)
		columns.extend([
			{
				"fieldname": company + "_opening_debit",
				"label": f"{company} " + _("Opening (Dr)"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
			{
				"fieldname": company + "_opening_credit",
				"label": f"{company} " + _("Opening (Cr)"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
			{
				"fieldname": company + "_debit",
				"label": f"{company} " + _("Debit"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
			{
				"fieldname": company + "_credit",
				"label": f"{company} " + _("Credit"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
			{
				"fieldname": company + "_closing_debit",
				"label": f"{company} " + _("Closing (Dr)"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
			{
				"fieldname": company + "_closing_credit",
				"label": f"{company} " + _("Closing (Cr)"),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
				"apply_currency_formatter": apply_currency_formatter,
			},
		])

	return columns


def calculate_trial_balance_values(accounts_by_name, gl_entries_by_account, companies_list, companies, filters, start_date):
	"""Calculate opening, period, and closing debit/credit values per company."""
	for key, account in accounts_by_name.items():
		# Initialize company-wise values
		for company in companies_list:
			account[company + "_opening_debit"] = 0.0
			account[company + "_opening_credit"] = 0.0
			account[company + "_debit"] = 0.0
			account[company + "_credit"] = 0.0
			account[company + "_closing_debit"] = 0.0
			account[company + "_closing_credit"] = 0.0

		for entry in gl_entries_by_account.get(key, []):
			entry_company = entry.company

			# Check if entry belongs to this company or its subsidiaries (same logic as calculate_values)
			for company in companies_list:
				if (
					entry_company == company
					or (filters.get("accumulated_in_group_company") and entry_company in companies.get(company, []))
				):
					debit, credit = flt(entry.debit), flt(entry.credit)

					# Handle currency conversion for subsidiaries (same as calculate_values)
					if (
						not filters.get("presentation_currency")
						and entry_company != company
						and filters.get("accumulated_in_group_company")
					):
						parent_company_currency = erpnext.get_company_currency(account.company)
						child_company_currency = erpnext.get_company_currency(entry_company)
						if parent_company_currency != child_company_currency:
							debit = convert(debit, parent_company_currency, child_company_currency, filters.end_date)
							credit = convert(credit, parent_company_currency, child_company_currency, filters.end_date)

					if entry.posting_date < getdate(start_date):
						account[company + "_opening_debit"] += debit
						account[company + "_opening_credit"] += credit
					else:
						account[company + "_debit"] += debit
						account[company + "_credit"] += credit

		# Calculate net opening and closing balances per company
		for company in companies_list:
			# Net opening: if Dr > Cr put net in Dr, else in Cr
			opening_net = account[company + "_opening_debit"] - account[company + "_opening_credit"]
			if opening_net > 0:
				account[company + "_opening_debit"] = opening_net
				account[company + "_opening_credit"] = 0.0
			else:
				account[company + "_opening_debit"] = 0.0
				account[company + "_opening_credit"] = abs(opening_net)

			# Closing = opening + period
			closing_debit = account[company + "_opening_debit"] + account[company + "_debit"]
			closing_credit = account[company + "_opening_credit"] + account[company + "_credit"]
			closing_net = closing_debit - closing_credit
			if closing_net > 0:
				account[company + "_closing_debit"] = closing_net
				account[company + "_closing_credit"] = 0.0
			else:
				account[company + "_closing_debit"] = 0.0
				account[company + "_closing_credit"] = abs(closing_net)


def accumulate_trial_balance_values_into_parents(accounts, accounts_by_name, companies):
	"""Accumulate children's values in parent accounts (same pattern as accumulate_values_into_parents)."""
	for d in reversed(accounts):
		if d.parent_account_name and d.parent_account_name in accounts_by_name:
			parent = accounts_by_name[d.parent_account_name]
			for company in companies:
				for field in value_fields:
					company_field = company + "_" + field
					parent[company_field] = parent.get(company_field, 0.0) + d.get(company_field, 0.0)

	# After accumulation, recalculate net opening/closing for parent accounts
	for d in accounts:
		if d.account_key in accounts_by_name and accounts_by_name.get(d.account_key):
			account = accounts_by_name[d.account_key]
			for company in companies:
				# Net opening
				opening_net = account.get(company + "_opening_debit", 0.0) - account.get(company + "_opening_credit", 0.0)
				if opening_net > 0:
					account[company + "_opening_debit"] = opening_net
					account[company + "_opening_credit"] = 0.0
				else:
					account[company + "_opening_debit"] = 0.0
					account[company + "_opening_credit"] = abs(opening_net)

				# Net closing
				closing_debit = account.get(company + "_opening_debit", 0.0) + account.get(company + "_debit", 0.0)
				closing_credit = account.get(company + "_opening_credit", 0.0) + account.get(company + "_credit", 0.0)
				closing_net = closing_debit - closing_credit
				if closing_net > 0:
					account[company + "_closing_debit"] = closing_net
					account[company + "_closing_credit"] = 0.0
				else:
					account[company + "_closing_debit"] = 0.0
					account[company + "_closing_credit"] = abs(closing_net)


def prepare_trial_balance_data(accounts, filters, parent_children_map, companies, company_currency):
	"""Prepare data rows (same pattern as prepare_data)."""
	data = []

	for d in accounts:
		has_value = False
		row = frappe._dict({
			"account_name": (
				f"{_(d.account_number)} - {_(d.account_name)}" if d.account_number else _(d.account_name)
			),
			"account": _(d.name),
			"parent_account": _(d.parent_account) if d.parent_account else None,
			"indent": flt(d.indent),
			"currency": company_currency,
		})

		for company in companies:
			for field in value_fields:
				company_field = company + "_" + field
				row[company_field] = flt(d.get(company_field, 0.0), 3)
				if abs(row[company_field]) >= get_zero_cutoff(company_currency):
					has_value = True

		row["has_value"] = has_value
		data.append(row)

	return data


def calculate_trial_balance_total_row(accounts, companies, company_currency):
	"""Calculate total row (same pattern as add_total_row)."""
	total_row = {
		"account_name": "'" + _("Total") + "'",
		"account": "'" + _("Total") + "'",
		"warn_if_negative": True,
		"parent_account": None,
		"indent": 0,
		"has_value": True,
		"currency": company_currency,
	}

	for company in companies:
		for field in value_fields:
			total_row[company + "_" + field] = 0.0

	for d in accounts:
		if not d.parent_account:
			for company in companies:
				for field in value_fields:
					company_field = company + "_" + field
					total_row[company_field] += d.get(company_field, 0.0)

	# Apply net logic on totals
	for company in companies:
		opening_net = total_row[company + "_opening_debit"] - total_row[company + "_opening_credit"]
		if opening_net > 0:
			total_row[company + "_opening_debit"] = opening_net
			total_row[company + "_opening_credit"] = 0.0
		else:
			total_row[company + "_opening_debit"] = 0.0
			total_row[company + "_opening_credit"] = abs(opening_net)

		closing_debit = total_row[company + "_opening_debit"] + total_row[company + "_debit"]
		closing_credit = total_row[company + "_opening_credit"] + total_row[company + "_credit"]
		closing_net = closing_debit - closing_credit
		if closing_net > 0:
			total_row[company + "_closing_debit"] = closing_net
			total_row[company + "_closing_credit"] = 0.0
		else:
			total_row[company + "_closing_debit"] = 0.0
			total_row[company + "_closing_credit"] = abs(closing_net)

	return total_row


def get_account_type_based_data(account_type, companies, fiscal_year, filters):
	data = {}
	total = 0
	filters.account_type = account_type
	filters.start_date = fiscal_year.year_start_date
	filters.end_date = fiscal_year.year_end_date

	for company in companies:
		amount = get_account_type_based_gl_data(company, filters)

		if amount and account_type == "Depreciation":
			amount *= -1

		total += amount
		data.setdefault(company, amount)

	data["total"] = total
	return data


def get_columns(companies, filters):
	columns = [
		{
			"fieldname": "account",
			"label": _("Account"),
			"fieldtype": "Link",
			"options": "Account",
			"width": 300,
		},
		{
			"fieldname": "currency",
			"label": _("Currency"),
			"fieldtype": "Link",
			"options": "Currency",
			"hidden": 1,
		},
	]

	for company in companies:
		apply_currency_formatter = 1 if not filters.presentation_currency else 0
		currency = filters.presentation_currency
		if not currency:
			currency = erpnext.get_company_currency(company)

		columns.append(
			{
				"fieldname": company,
				"label": f"{company} ({currency})",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 150,
				"apply_currency_formatter": apply_currency_formatter,
				"company_name": company,
			}
		)

	return columns


def get_data(companies, root_type, balance_must_be, fiscal_year, filters=None, ignore_closing_entries=False):
	accounts, accounts_by_name, parent_children_map = get_account_heads(root_type, companies, filters)

	if not accounts:
		return []

	company_currency = get_company_currency(filters)

	if filters.filter_based_on == "Fiscal Year":
		start_date = fiscal_year.year_start_date if filters.report != "Balance Sheet" else None
		end_date = fiscal_year.year_end_date
	else:
		start_date = filters.period_start_date if filters.report != "Balance Sheet" else None
		end_date = filters.period_end_date

	filters.end_date = end_date

	gl_entries_by_account = {}
	for root in frappe.db.sql(
		"""select lft, rgt from tabAccount
			where root_type=%s and ifnull(parent_account, '') = ''""",
		root_type,
		as_dict=1,
	):
		set_gl_entries_by_account(
			start_date,
			end_date,
			root.lft,
			root.rgt,
			filters,
			gl_entries_by_account,
			accounts_by_name,
			accounts,
			ignore_closing_entries=ignore_closing_entries,
			root_type=root_type,
		)

	calculate_values(accounts_by_name, gl_entries_by_account, companies, filters, fiscal_year)
	accumulate_values_into_parents(accounts, accounts_by_name, companies)

	out = prepare_data(accounts, start_date, end_date, balance_must_be, companies, company_currency, filters)

	out = filter_out_zero_value_rows(
		out, parent_children_map, show_zero_values=filters.get("show_zero_values")
	)

	if out:
		add_total_row(out, root_type, balance_must_be, companies, company_currency)

	return out


def get_company_currency(filters=None):
	return filters.get("presentation_currency") or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)


def calculate_values(accounts_by_name, gl_entries_by_account, companies, filters, fiscal_year):
	start_date = (
		fiscal_year.year_start_date if filters.filter_based_on == "Fiscal Year" else filters.period_start_date
	)

	for entries in gl_entries_by_account.values():
		for entry in entries:
			if entry.account_number:
				account_name = entry.account_number + " - " + entry.account_name
			else:
				account_name = entry.account_name

			d = accounts_by_name.get(account_name)

			if d:
				debit, credit = 0, 0
				for company in companies:
					# check if posting date is within the period
					if (
						entry.company == company
						or (filters.get("accumulated_in_group_company"))
						and entry.company in companies.get(company)
					):
						parent_company_currency = erpnext.get_company_currency(d.company)
						child_company_currency = erpnext.get_company_currency(entry.company)

						debit, credit = flt(entry.debit), flt(entry.credit)

						if (
							not filters.get("presentation_currency")
							and entry.company != company
							and parent_company_currency != child_company_currency
							and filters.get("accumulated_in_group_company")
						):
							debit = convert(
								debit, parent_company_currency, child_company_currency, filters.end_date
							)
							credit = convert(
								credit, parent_company_currency, child_company_currency, filters.end_date
							)

						d[company] = d.get(company, 0.0) + flt(debit) - flt(credit)

						if entry.posting_date < getdate(start_date):
							d["company_wise_opening_bal"][company] += flt(debit) - flt(credit)

				if entry.posting_date < getdate(start_date):
					d["opening_balance"] = d.get("opening_balance", 0.0) + flt(debit) - flt(credit)


def accumulate_values_into_parents(accounts, accounts_by_name, companies):
	"""accumulate children's values in parent accounts"""
	for d in reversed(accounts):
		if d.parent_account:
			account = d.parent_account_name

			for company in companies:
				accounts_by_name[account][company] = accounts_by_name[account].get(company, 0.0) + d.get(
					company, 0.0
				)

				accounts_by_name[account]["company_wise_opening_bal"][company] += d.get(
					"company_wise_opening_bal", {}
				).get(company, 0.0)

			accounts_by_name[account]["opening_balance"] = accounts_by_name[account].get(
				"opening_balance", 0.0
			) + d.get("opening_balance", 0.0)


def get_account_heads(root_type, companies, filters):
	accounts = get_accounts(root_type, companies)

	if not accounts:
		return None, None, None

	accounts = update_parent_account_names(accounts)

	accounts, accounts_by_name, parent_children_map = filter_accounts(accounts)

	return accounts, accounts_by_name, parent_children_map


def update_parent_account_names(accounts):
	"""Update parent_account_name in accounts list.

	parent_name is `name` of parent account which could have other prefix
	of account_number and suffix of company abbr. This function adds key called
	`parent_account_name` which does not have such prefix/suffix.
	"""
	name_to_account_map = {}

	for d in accounts:
		if d.account_number:
			account_key = d.account_number + " - " + d.account_name
		else:
			account_key = d.account_name

		d.account_key = account_key

		name_to_account_map[d.name] = account_key

	for account in accounts:
		if account.parent_account:
			account["parent_account_name"] = name_to_account_map.get(account.parent_account)

	return accounts


def get_companies(filters):
	companies = {}
	all_companies = get_subsidiary_companies(filters.get("company"))
	companies.setdefault(filters.get("company"), all_companies)

	for d in all_companies:
		if d not in companies:
			subsidiary_companies = get_subsidiary_companies(d)
			companies.setdefault(d, subsidiary_companies)

	return all_companies, companies


def get_subsidiary_companies(company):
	lft, rgt = frappe.get_cached_value("Company", company, ["lft", "rgt"])

	return frappe.db.sql_list(
		f"""select name from `tabCompany`
		where lft >= {lft} and rgt <= {rgt} order by lft, rgt"""
	)


def get_accounts(root_type, companies):
	accounts = []

	for company in companies:
		accounts.extend(
			frappe.get_all(
				"Account",
				fields=[
					"name",
					"is_group",
					"company",
					"parent_account",
					"lft",
					"rgt",
					"root_type",
					"report_type",
					"account_name",
					"account_number",
				],
				filters={"company": company, "root_type": root_type},
			)
		)

	return accounts


def prepare_data(accounts, start_date, end_date, balance_must_be, companies, company_currency, filters):
	data = []

	for d in accounts:
		# add to output
		has_value = False
		total = 0
		row = frappe._dict(
			{
				"account_name": (
					f"{_(d.account_number)} - {_(d.account_name)}" if d.account_number else _(d.account_name)
				),
				"account": _(d.name),
				"parent_account": _(d.parent_account),
				"indent": flt(d.indent),
				"year_start_date": start_date,
				"root_type": d.root_type,
				"year_end_date": end_date,
				"currency": filters.presentation_currency,
				"company_wise_opening_bal": d.company_wise_opening_bal,
				"opening_balance": d.get("opening_balance", 0.0) * (1 if balance_must_be == "Debit" else -1),
			}
		)

		for company in companies:
			if d.get(company) and balance_must_be == "Credit":
				# change sign based on Debit or Credit, since calculation is done using (debit - credit)
				d[company] *= -1

			row[company] = flt(d.get(company, 0.0), 3)

			if abs(row[company]) >= get_zero_cutoff(filters.presentation_currency):
				# ignore zero values
				has_value = True
				total += flt(row[company])

		row["has_value"] = has_value
		row["total"] = total

		data.append(row)

	return data


def set_gl_entries_by_account(
	from_date,
	to_date,
	root_lft,
	root_rgt,
	filters,
	gl_entries_by_account,
	accounts_by_name,
	accounts,
	ignore_closing_entries=False,
	root_type=None,
):
	"""Returns a dict like { "account": [gl entries], ... }"""

	company_lft, company_rgt = frappe.get_cached_value("Company", filters.get("company"), ["lft", "rgt"])

	companies = frappe.db.sql(
		""" select name, default_currency from `tabCompany`
		where lft >= %(company_lft)s and rgt <= %(company_rgt)s""",
		{
			"company_lft": company_lft,
			"company_rgt": company_rgt,
		},
		as_dict=1,
	)

	currency_info = frappe._dict(
		{"report_date": to_date, "presentation_currency": filters.get("presentation_currency")}
	)

	for d in companies:
		gle = frappe.qb.DocType("GL Entry")
		account = frappe.qb.DocType("Account")
		query = (
			frappe.qb.from_(gle)
			.inner_join(account)
			.on(account.name == gle.account)
			.select(
				gle.posting_date,
				gle.account,
				gle.debit,
				gle.credit,
				gle.is_opening,
				gle.company,
				gle.fiscal_year,
				gle.debit_in_account_currency,
				gle.credit_in_account_currency,
				gle.account_currency,
				account.account_name,
				account.account_number,
			)
			.where(
				(gle.company == d.name)
				& (gle.is_cancelled == 0)
				& (gle.posting_date <= to_date)
				& (account.lft >= root_lft)
				& (account.rgt <= root_rgt)
			)
			.orderby(gle.account, gle.posting_date)
		)

		if root_type:
			query = query.where(account.root_type == root_type)
		additional_conditions = get_additional_conditions(from_date, ignore_closing_entries, filters, d)
		if additional_conditions:
			query = query.where(Criterion.all(additional_conditions))
		gl_entries = query.run(as_dict=True)

		if filters and filters.get("presentation_currency") != d.default_currency:
			currency_info["company"] = d.name
			currency_info["company_currency"] = d.default_currency
			convert_to_presentation_currency(gl_entries, currency_info)

		for entry in gl_entries:
			if entry.account_number:
				account_name = entry.account_number + " - " + entry.account_name
			else:
				account_name = entry.account_name

			validate_entries(account_name, entry, accounts_by_name, accounts)
			gl_entries_by_account.setdefault(account_name, []).append(entry)

	return gl_entries_by_account


def get_account_details(account):
	return frappe.get_cached_value(
		"Account",
		account,
		[
			"name",
			"report_type",
			"root_type",
			"company",
			"is_group",
			"account_name",
			"account_number",
			"parent_account",
			"lft",
			"rgt",
		],
		as_dict=1,
	)


def validate_entries(key, entry, accounts_by_name, accounts):
	# If an account present in the child company and not in the parent company
	if key not in accounts_by_name:
		args = get_account_details(entry.account)

		if args.parent_account:
			parent_args = get_account_details(args.parent_account)

			args.update(
				{
					"lft": parent_args.lft + 1,
					"rgt": parent_args.rgt - 1,
					"indent": 3,
					"root_type": parent_args.root_type,
					"report_type": parent_args.report_type,
					"parent_account_name": parent_args.account_name,
					"company_wise_opening_bal": defaultdict(float),
				}
			)

		accounts_by_name.setdefault(key, args)

		idx = len(accounts)
		# To identify parent account index
		for index, row in enumerate(accounts):
			if row.parent_account_name == args.parent_account_name:
				idx = index
				break

		accounts.insert(idx + 1, args)


def get_additional_conditions(from_date, ignore_closing_entries, filters, d):
	gle = frappe.qb.DocType("GL Entry")
	additional_conditions = []

	if ignore_closing_entries:
		additional_conditions.append(gle.voucher_type != "Period Closing Voucher")

	if from_date:
		additional_conditions.append(gle.posting_date >= from_date)

	finance_books = []
	finance_books.append("")
	if filter_fb := filters.get("finance_book"):
		finance_books.append(filter_fb)

	if filters.get("include_default_book_entries"):
		if company_fb := frappe.get_cached_value("Company", d.name, "default_finance_book"):
			finance_books.append(company_fb)

		additional_conditions.append((gle.finance_book.isin(finance_books)) | gle.finance_book.isnull())
	else:
		additional_conditions.append((gle.finance_book.isin(finance_books)) | gle.finance_book.isnull())

	return additional_conditions


def add_total_row(out, root_type, balance_must_be, companies, company_currency):
	total_row = {
		"account_name": "'" + _("Total {0} ({1})").format(_(root_type), _(balance_must_be)) + "'",
		"account": "'" + _("Total {0} ({1})").format(_(root_type), _(balance_must_be)) + "'",
		"currency": company_currency,
	}

	for row in out:
		if not row.get("parent_account"):
			for company in companies:
				total_row.setdefault(company, 0.0)
				total_row[company] += row.get(company, 0.0)

			total_row.setdefault("total", 0.0)
			total_row["total"] += flt(row["total"])
			row["total"] = ""

	if "total" in total_row:
		out.append(total_row)

		# blank row after Total
		out.append({})


def filter_accounts(accounts, depth=10):
	parent_children_map = {}
	accounts_by_name = {}
	added_accounts = []

	for d in accounts:
		if d.account_key in added_accounts:
			continue

		added_accounts.append(d.account_key)
		d["company_wise_opening_bal"] = defaultdict(float)
		accounts_by_name[d.account_key] = d

		parent_children_map.setdefault(d.parent_account_name or None, []).append(d)

	filtered_accounts = []

	def add_to_list(parent, level):
		if level < depth:
			children = parent_children_map.get(parent) or []
			sort_accounts(children, is_root=True if parent is None else False)

			for child in children:
				child.indent = level
				filtered_accounts.append(child)
				add_to_list(child.account_key, level + 1)

	add_to_list(None, 0)

	return filtered_accounts, accounts_by_name, parent_children_map
