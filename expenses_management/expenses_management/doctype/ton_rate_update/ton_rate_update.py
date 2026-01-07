# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, nowdate


class TonRateUpdate(Document):
	def validate(self):
		self.validate_items()
		self.set_status()

	def validate_items(self):
		"""Validate that items have weight defined"""
		if not self.items:
			return

		items_without_weight = []
		for item in self.items:
			if not item.weight_per_unit or flt(item.weight_per_unit) <= 0:
				items_without_weight.append(item.item_code)

		if items_without_weight:
			frappe.msgprint(
				_("The following items have no weight defined and will be skipped: {0}").format(
					", ".join(items_without_weight)
				),
				indicator="orange",
				title=_("Items Without Weight")
			)

	def set_status(self):
		"""Set document status based on docstatus"""
		if self.docstatus == 0:
			self.status = "Draft"
		elif self.docstatus == 1:
			self.status = "Submitted"
		elif self.docstatus == 2:
			self.status = "Cancelled"

	def on_submit(self):
		"""Create or update Item Prices on submit"""
		self.update_item_prices()
		self.set_status()

	def on_cancel(self):
		"""Revert Item Prices to old rates on cancel"""
		self.revert_item_prices()
		self.set_status()

	def update_item_prices(self):
		"""Create or update Item Price records with new rates"""
		updated_count = 0
		created_count = 0
		skipped_count = 0

		for item in self.items:
			if not item.weight_per_unit or flt(item.weight_per_unit) <= 0:
				skipped_count += 1
				continue

			if flt(item.new_rate) <= 0:
				skipped_count += 1
				continue

			# Check if Item Price exists
			existing_price = frappe.db.get_value(
				"Item Price",
				{
					"item_code": item.item_code,
					"price_list": self.price_list,
					"uom": item.stock_uom
				},
				["name", "price_list_rate"],
				as_dict=True
			)

			if existing_price:
				# Update existing Item Price
				frappe.db.set_value(
					"Item Price",
					existing_price.name,
					{
						"price_list_rate": flt(item.new_rate),
						"valid_from": self.posting_date
					}
				)
				# Store the item price name for reference
				item.db_set("item_price_name", existing_price.name)
				item.db_set("updated", 1)
				updated_count += 1
			else:
				# Create new Item Price
				item_price = frappe.new_doc("Item Price")
				item_price.item_code = item.item_code
				item_price.price_list = self.price_list
				item_price.uom = item.stock_uom
				item_price.price_list_rate = flt(item.new_rate)
				item_price.valid_from = self.posting_date
				item_price.selling = frappe.db.get_value("Price List", self.price_list, "selling") or 0
				item_price.buying = frappe.db.get_value("Price List", self.price_list, "buying") or 0
				item_price.currency = self.currency or frappe.db.get_value("Price List", self.price_list, "currency")
				item_price.flags.ignore_permissions = True
				item_price.insert()

				# Store the item price name for reference
				item.db_set("item_price_name", item_price.name)
				item.db_set("updated", 1)
				created_count += 1

		frappe.msgprint(
			_("Item Prices Updated: {0} updated, {1} created, {2} skipped").format(
				updated_count, created_count, skipped_count
			),
			indicator="green",
			title=_("Success")
		)

	def revert_item_prices(self):
		"""Revert Item Prices to old rates on cancel"""
		reverted_count = 0
		deleted_count = 0

		for item in self.items:
			if not item.updated:
				continue

			if not item.item_price_name:
				continue

			# Check if the Item Price still exists
			if not frappe.db.exists("Item Price", item.item_price_name):
				continue

			if item.old_rate and flt(item.old_rate) > 0:
				# Revert to old rate
				frappe.db.set_value(
					"Item Price",
					item.item_price_name,
					"price_list_rate",
					flt(item.old_rate)
				)
				reverted_count += 1
			else:
				# Delete the Item Price if it was newly created (old_rate was 0)
				frappe.delete_doc("Item Price", item.item_price_name, force=True)
				deleted_count += 1

			# Clear the update flag
			item.db_set("updated", 0)
			item.db_set("item_price_name", "")

		frappe.msgprint(
			_("Item Prices Reverted: {0} reverted to old rate, {1} deleted").format(
				reverted_count, deleted_count
			),
			indicator="green",
			title=_("Cancelled")
		)


@frappe.whitelist()
def get_items_by_group(item_group, price_list, company=None):
	"""
	Get all non-group items under the specified item group with their weights and current prices.

	Args:
		item_group: The parent item group
		price_list: The price list to get current prices from
		company: Optional company filter

	Returns:
		List of items with their details
	"""
	# Get all item groups under the selected group (including the group itself)
	item_groups = get_descendant_groups(item_group)
	item_groups.append(item_group)

	# Build the query to get items
	conditions = [
		"i.disabled = 0",
		"i.item_group IN %(item_groups)s"
	]

	if company:
		# Filter by company if custom_company field exists
		conditions.append("(i.custom_company IS NULL OR i.custom_company = '' OR i.custom_company = %(company)s)")

	items = frappe.db.sql("""
		SELECT
			i.name as item_code,
			i.item_name,
			i.stock_uom,
			i.weight_per_unit,
			i.weight_uom,
			ip.price_list_rate as old_rate,
			ip.name as item_price_name
		FROM `tabItem` i
		LEFT JOIN `tabItem Price` ip ON (
			ip.item_code = i.name
			AND ip.price_list = %(price_list)s
			AND (ip.uom = i.stock_uom OR ip.uom IS NULL)
		)
		WHERE {conditions}
		ORDER BY i.item_name
	""".format(conditions=" AND ".join(conditions)), {
		"item_groups": item_groups,
		"price_list": price_list,
		"company": company
	}, as_dict=True)

	return items


def get_descendant_groups(item_group):
	"""Get all descendant item groups (non-recursive, uses lft/rgt)"""
	lft, rgt = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"])

	if not lft or not rgt:
		return []

	descendants = frappe.db.sql_list("""
		SELECT name FROM `tabItem Group`
		WHERE lft > %s AND rgt < %s AND is_group = 0
	""", (lft, rgt))

	return descendants


@frappe.whitelist()
def calculate_item_rates(items, ton_rate, weight_uom="Kg"):
	"""
	Calculate new rates for items based on ton rate and item weight.

	Formula: new_rate = (ton_rate / 1000) * weight_per_unit

	Args:
		items: List of items (JSON string)
		ton_rate: Rate per ton (1000 kg)
		weight_uom: Weight unit of measure (default Kg)

	Returns:
		List of items with calculated new rates
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	ton_rate = flt(ton_rate)

	# Rate per kg (ton = 1000 kg)
	rate_per_kg = ton_rate / 1000

	for item in items:
		weight = flt(item.get("weight_per_unit", 0))
		item_weight_uom = item.get("weight_uom", "Kg")

		if weight <= 0:
			item["new_rate"] = 0
			item["rate_difference"] = 0
			continue

		# Convert weight to kg if necessary
		weight_in_kg = convert_to_kg(weight, item_weight_uom)

		# Calculate new rate
		new_rate = flt(rate_per_kg * weight_in_kg, 2)
		old_rate = flt(item.get("old_rate", 0))

		item["new_rate"] = new_rate
		item["rate_difference"] = flt(new_rate - old_rate, 2)

	return items


def convert_to_kg(weight, from_uom):
	"""Convert weight to kilograms"""
	if not from_uom or from_uom.lower() in ["kg", "kilogram", "kilograms"]:
		return weight

	# Get conversion factor
	conversion = frappe.db.get_value(
		"UOM Conversion Factor",
		{"from_uom": from_uom, "to_uom": "Kg"},
		"value"
	)

	if conversion:
		return flt(weight) * flt(conversion)

	# Try reverse conversion
	conversion = frappe.db.get_value(
		"UOM Conversion Factor",
		{"from_uom": "Kg", "to_uom": from_uom},
		"value"
	)

	if conversion and flt(conversion) > 0:
		return flt(weight) / flt(conversion)

	# Common conversions if not found in UOM Conversion Factor
	common_conversions = {
		"gram": 0.001,
		"grams": 0.001,
		"g": 0.001,
		"ton": 1000,
		"tons": 1000,
		"tonne": 1000,
		"tonnes": 1000,
		"pound": 0.453592,
		"pounds": 0.453592,
		"lb": 0.453592,
		"lbs": 0.453592,
		"ounce": 0.0283495,
		"ounces": 0.0283495,
		"oz": 0.0283495
	}

	from_uom_lower = from_uom.lower()
	if from_uom_lower in common_conversions:
		return flt(weight) * common_conversions[from_uom_lower]

	# Default: assume it's already in kg
	return weight
