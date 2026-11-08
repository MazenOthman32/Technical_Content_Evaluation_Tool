"use client";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="panel modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="confirm-title" className="section-title">
            {title}
          </h2>
          <button className="btn secondary btn-sm" type="button" onClick={onClose} disabled={busy}>
            إغلاق
          </button>
        </div>
        <p className="help" style={{ margin: "0.85rem 0 1.1rem", lineHeight: 1.7 }}>
          {message}
        </p>
        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "btn-danger-solid" : ""}`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "جاري التنفيذ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
