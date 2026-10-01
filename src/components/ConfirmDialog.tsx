import { useEffect, useId, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive and focuses Cancel first. */
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog built on the native <dialog> (daisyUI modal).
 * Shows as a bottom sheet on phones (thumb reach), centred on wider screens.
 * Escape, the backdrop and Cancel all call `onCancel`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <OpenDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function OpenDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onCancel,
}: Required<Omit<ConfirmDialogProps, "open" | "message">> & { message?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const danger = tone === "danger";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    (danger ? cancelRef : confirmRef).current?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      previous?.focus();
    };
  }, [danger]);

  return (
    <dialog
      ref={ref}
      className="modal modal-bottom sm:modal-middle"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      onCancel={(event) => {
        // Escape key: keep React in control of open/close.
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="modal-box pb-safe px-6 pt-6">
        <h2 id={titleId} className="font-display text-2xl uppercase">
          {title}
        </h2>
        {message ? (
          <p id={messageId} className="mt-2 text-base text-base-content/80">
            {message}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3 pb-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-lg btn-outline border-base-300"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn btn-lg ${danger ? "btn-error" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <div className="modal-backdrop">
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
