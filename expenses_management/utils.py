import frappe
import os
import subprocess


def after_app_install():
	"""Run after app installation to set up Node.js dependencies"""
	try:
		app_path = frappe.get_app_path("expenses_management")
		app_dir = os.path.dirname(app_path)

		frappe.msgprint("Installing Node.js dependencies for Expenses Management...")

		# Check if package.json exists
		package_json = os.path.join(app_dir, "package.json")
		if os.path.exists(package_json):
			# Run npm install
			result = subprocess.run(
				["npm", "install"],
				cwd=app_dir,
				capture_output=True,
				text=True
			)

			if result.returncode == 0:
				frappe.msgprint("Node.js dependencies installed successfully")

				# Run npm build
				frappe.msgprint("Building React dashboard...")
				build_result = subprocess.run(
					["npm", "run", "build"],
					cwd=app_dir,
					capture_output=True,
					text=True
				)

				if build_result.returncode == 0:
					frappe.msgprint("React dashboard built successfully")
				else:
					frappe.msgprint(f"Build failed: {build_result.stderr}", raise_exception=False)
			else:
				frappe.msgprint(f"npm install failed: {result.stderr}", raise_exception=False)
		else:
			frappe.msgprint("package.json not found. Skipping Node.js setup.", raise_exception=False)

	except Exception as e:
		frappe.log_error(f"Error in post-install: {str(e)}", "Expenses Management Installation")
		frappe.msgprint(
			"Note: You may need to manually run 'npm install' and 'npm run build' "
			"in the expenses_management app directory to set up the React dashboard.",
			indicator="orange"
		)
