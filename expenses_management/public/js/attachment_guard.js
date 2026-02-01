/**
 * Attachment Guard
 * Blocks attaching and removing files on submitted documents (docstatus=1).
 * Applies globally to all submittable doctypes.
 *
 * Rules:
 *  - .xsl and .xml files are always exempt (can be attached/removed anytime).
 *  - Sales Invoice gets a 2-minute grace window after submit for all file types.
 *  - After the grace window (or immediately for other doctypes), only exempt files allowed.
 */
(function () {
	if (!frappe.ui.form.Attachments) return;

	const Attachments = frappe.ui.form.Attachments;

	const EXEMPT_EXTENSIONS = [".xsl", ".xml", ".png"];
	const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
	const GRACE_DOCTYPES = ["Sales Invoice"];

	function has_exempt_extension(filename) {
		if (!filename) return false;
		var lower = filename.toLowerCase();
		return EXEMPT_EXTENSIONS.some(function (ext) {
			return lower.endsWith(ext);
		});
	}

	function is_within_grace_period(frm) {
		if (!GRACE_DOCTYPES.includes(frm.doctype)) return false;
		if (!frm.doc.modified) return false;
		var submitted_at = new Date(frm.doc.modified).getTime();
		var now = Date.now();
		return (now - submitted_at) < GRACE_PERIOD_MS;
	}

	function is_attachment_locked(frm) {
		if (!frm || !frm.meta.is_submittable) return false;
		if (cint(frm.doc.docstatus) !== 1) return false;
		if (is_within_grace_period(frm)) return false;
		return true;
	}

	// --- Override: refresh ---
	const _original_refresh = Attachments.prototype.refresh;
	Attachments.prototype.refresh = function () {
		_original_refresh.apply(this, arguments);

		if (!this.frm || !this.frm.meta.is_submittable) return;

		var is_submitted = cint(this.frm.doc.docstatus) === 1;
		if (!is_submitted) {
			this.parent.find(".attachment-locked-msg").remove();
			return;
		}

		var locked = is_attachment_locked(this.frm);

		if (locked) {
			// Hide delete buttons on non-exempt attachments
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
			// Within grace period — all controls visible
			this.parent.find(".attachment-locked-msg").remove();

			// Schedule a re-check when the grace period expires
			var frm = this.frm;
			var submitted_at = new Date(frm.doc.modified).getTime();
			var remaining = GRACE_PERIOD_MS - (Date.now() - submitted_at);
			if (remaining > 0 && !this._grace_timer) {
				this._grace_timer = setTimeout(() => {
					this._grace_timer = null;
					if (this.frm && cint(this.frm.doc.docstatus) === 1) {
						this.refresh();
					}
				}, remaining + 500);
			}
		}
	};

	// --- Override: new_attachment ---
	const _original_new_attachment = Attachments.prototype.new_attachment;
	Attachments.prototype.new_attachment = function (fieldname) {
		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1
		) {
			if (is_within_grace_period(this.frm)) {
				// Grace period — allow all file types
				return _original_new_attachment.apply(this, arguments);
			}

			// After grace period — restrict to exempt file types only
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
	const _original_remove_attachment = Attachments.prototype.remove_attachment;
	Attachments.prototype.remove_attachment = function (fileid, callback) {
		if (
			this.frm &&
			this.frm.meta.is_submittable &&
			cint(this.frm.doc.docstatus) === 1
		) {
			if (is_within_grace_period(this.frm)) {
				// Grace period — allow removing any file
				return _original_remove_attachment.apply(this, arguments);
			}

			// After grace period — only allow exempt file types
			var attachment = (this.frm.attachments
				? this.frm.attachments.get_attachments()
				: []
			).find(function (a) { return a.name === fileid; });
			var filename = attachment ? attachment.file_name || attachment.file_url : "";

			if (!has_exempt_extension(filename)) {
				frappe.msgprint({
					title: __("Action Not Allowed"),
					message: __("Cannot remove files from a submitted document."),
					indicator: "red",
				});
				return;
			}
		}
		return _original_remove_attachment.apply(this, arguments);
	};
})();
