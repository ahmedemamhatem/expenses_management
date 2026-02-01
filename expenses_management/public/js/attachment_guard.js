/**
 * Attachment Guard
 * Blocks attaching and removing files on submitted documents (docstatus=1).
 * Applies globally to all submittable doctypes.
 * System Manager and Administrator users are exempt.
 */
(function () {
	if (!frappe.ui.form.Attachments) return;

	const Attachments = frappe.ui.form.Attachments;

	function is_privileged_user() {
		return (
			frappe.session.user === "Administrator" ||
			frappe.user_roles.includes("System Manager")
		);
	}

	// --- Override: refresh ---
	// After rendering attachments, hide UI controls on submitted documents.
	const _original_refresh = Attachments.prototype.refresh;
	Attachments.prototype.refresh = function () {
		_original_refresh.apply(this, arguments);

		if (!this.frm || !this.frm.meta.is_submittable) return;

		const is_submitted = cint(this.frm.doc.docstatus) === 1;
		const is_locked = is_submitted && !is_privileged_user();

		// Hide "Attach File" button
		this.parent.find(".add-attachment-btn").toggle(!is_locked);

		// Hide delete (x) buttons on each attachment pill
		if (is_locked) {
			this.parent.find(".attachment-row .remove-btn").hide();
			this.parent.find(".attachment-row .data-pill-close").hide();

			// Show locked indicator once
			if (!this.parent.find(".attachment-locked-msg").length) {
				this.parent
					.find(".attachments-actions")
					.after(
						'<div class="attachment-locked-msg text-muted small mt-1">' +
							'<span class="indicator-pill yellow">' +
							frappe.utils.icon("es-line-lock", "xs") +
							" " +
							__("Attachments are locked on submitted documents") +
							"</span></div>"
					);
			}
		} else {
			this.parent.find(".attachment-locked-msg").remove();
		}
	};

	// --- Override: new_attachment ---
	// Block opening the file uploader on submitted documents.
	const _original_new_attachment = Attachments.prototype.new_attachment;
	Attachments.prototype.new_attachment = function (fieldname) {
		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1 &&
			!is_privileged_user()
		) {
			frappe.msgprint({
				title: __("Action Not Allowed"),
				message: __("Cannot attach files to a submitted document."),
				indicator: "red",
			});
			return;
		}
		return _original_new_attachment.apply(this, arguments);
	};

	// --- Override: remove_attachment ---
	// Block removing attachments on submitted documents.
	const _original_remove_attachment = Attachments.prototype.remove_attachment;
	Attachments.prototype.remove_attachment = function (fileid, callback) {
		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1 &&
			!is_privileged_user()
		) {
			frappe.msgprint({
				title: __("Action Not Allowed"),
				message: __("Cannot remove files from a submitted document."),
				indicator: "red",
			});
			return;
		}
		return _original_remove_attachment.apply(this, arguments);
	};
})();
