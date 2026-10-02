import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  /** Short text under the title; also the dialog's accessible description. */
  description?: ReactNode;
  /** Escape, the backdrop and any Cancel button should call this. */
  onClose: () => void;
  /** Element to focus when the dialog opens (defaults to the first focusable element). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Focus the title on open instead of the first field, so a phone keyboard stays
   * closed until the user taps a field (an auto-opened iOS keyboard covers the sheet).
   */
  focusTitle?: boolean;
  children?: ReactNode;
}

/**
 * Generic bottom sheet / centred dialog on the native <dialog> (daisyUI modal).
 * Renders nothing while closed. Use for forms and pickers; for yes/no use ConfirmDialog.
 */
export function Modal(props: ModalProps) {
  if (!props.open) return null;
  return <OpenModal {...props} />;
}

function OpenModal({
  title,
  description,
  onClose,
  initialFocusRef,
  focusTitle = false,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // showModal() focuses the dialog's autofocus element itself; mark the title so it
    // never moves focus to a field first (which would flash the keyboard open).
    if (focusTitle) titleRef.current?.setAttribute("autofocus", "");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    const target =
      (focusTitle ? titleRef.current : initialFocusRef?.current) ??
      dialog.querySelector<HTMLElement>("input, select, textarea, button:not([tabindex='-1'])");
    target?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      previous?.focus();
    };
    // Focus once on open only.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal modal-bottom sm:modal-middle"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-box pb-safe px-6 pt-6">
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={focusTitle ? -1 : undefined}
          className="font-display text-2xl uppercase focus:outline-none"
        >
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-base text-base-content/75">
            {description}
          </p>
        ) : null}
        <div className="mt-5">{children}</div>
      </div>
      <div className="modal-backdrop">
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
