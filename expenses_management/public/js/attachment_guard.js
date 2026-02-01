/**
 * Attachment Guard
 * Blocks attaching and removing files on submitted documents (docstatus=1).
 * Applies globally to all submittable doctypes.
 * System Manager and Administrator users are exempt.
 */
(function () {
	if (!frappe.ui.form.Attachments) return;

	const Attachments = frappe.ui.form.Attachments;

	const EXEMPT_EXTENSIONS = [".xsl", ".xml"];

	function is_privileged_user() {
		return (
			frappe.session.user === "Administrator" ||
			frappe.user_roles.includes("System Manager")
		);
	}

	function has_exempt_extension(filename) {
		if (!filename) return false;
		var lower = filename.toLowerCase();
		return EXEMPT_EXTENSIONS.some(function (ext) {
			return lower.endsWith(ext);
		});
	}

	// --- Override: refresh ---
	// After rendering attachments, hide UI controls on submitted documents.
	const _original_refresh = Attachments.prototype.refresh;
	Attachments.prototype.refresh = function () {
		_original_refresh.apply(this, arguments);

		if (!this.frm || !this.frm.meta.is_submittable) return;

		const is_submitted = cint(this.frm.doc.docstatus) === 1;
		const is_locked = is_submitted && !is_privileged_user();

		// Always show "Attach File" button — exempt file types (.xsl, .xml) can still be attached

		// Hide delete (x) buttons on each attachment pill (except exempt file types)
		if (is_locked) {
			this.parent.find(".attachment-row").each(function () {
				var $row = $(this);
				var filename = $row.find("a").attr("href") || $row.find("a").text() || "";
				if (has_exempt_extension(filename)) return;
				$row.find(".remove-btn").hide();
				$row.find(".data-pill-close").hide();
			});

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
	// On submitted documents, restrict non-privileged users to exempt file types only.
	const _original_new_attachment = Attachments.prototype.new_attachment;
	Attachments.prototype.new_attachment = function (fieldname) {
		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1 &&
			!is_privileged_user()
		) {
			// Allow uploader but restrict to exempt file types only
			if (this.dialog) {
				this.dialog.$wrapper.remove();
			}

			var restrictions = { allowed_file_types: EXEMPT_EXTENSIONS.slice() };
			if (this.frm.meta.max_attachments) {
				restrictions.max_number_of_files =
					this.frm.meta.max_attachments -
					this.frm.attachments.get_attachments().length;
			}

			new frappe.ui.FileUploader({
				doctype: this.frm.doctype,
				docname: this.frm.docname,
				frm: this.frm,
				folder: "Home/Attachments",
				on_success: (file_doc) => {
					this.attachment_uploaded(file_doc);
				},
				restrictions: restrictions,
				make_attachments_public: this.frm.meta.make_attachments_public,
			});
			return;
		}
		return _original_new_attachment.apply(this, arguments);
	};

	// --- Override: remove_attachment ---
	// Block removing attachments on submitted documents.
	const _original_remove_attachment = Attachments.prototype.remove_attachment;
	Attachments.prototype.remove_attachment = function (fileid, callback) {
		var attachment = (this.frm && this.frm.attachments
			? this.frm.attachments.get_attachments()
			: []
		).find(function (a) { return a.name === fileid; });
		var filename = attachment ? attachment.file_name || attachment.file_url : "";

		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1 &&
			!is_privileged_user() &&
			!has_exempt_extension(filename)
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
