import { useId, type Ref } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal.tsx";

/**
 * A name edited in a bottom sheet: the field, one reserved line for a message, Save and the ×.
 * The title takes focus on open, so the iOS keyboard (which would cover the sheet) waits for a tap
 * on the field. ×, Escape and the backdrop close
 * it without saving, except while saving. The caller checks the name and does the saving.
 */
export function NameSheet({
  open,
  title,
  inputRef,
  label,
  value,
  autoComplete = "off",
  saving,
  error,
  failure,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  inputRef: Ref<HTMLInputElement>;
  label: string;
  value: string;
  autoComplete?: string;
  saving: boolean;
  /** The name's own problem, shown under the field and tied to it. */
  error: string | null;
  /** Why saving failed (the server, the connection), announced when it appears. */
  failure: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  // On the body, out of the court card that opens it: the sheet would take the card's off-white
  // text otherwise.
  return createPortal(
    <Modal
      open={open}
      title={title}
      focusTitle
      closeLabel="Close"
      onClose={() => {
        // The sheet stays put while the name is being saved.
        if (!saving) onClose();
      }}
    >
      <NameForm
        inputRef={inputRef}
        label={label}
        value={value}
        autoComplete={autoComplete}
        saving={saving}
        error={error}
        failure={failure}
        onChange={onChange}
        onSave={onSave}
      />
    </Modal>,
    document.body,
  );
}

function NameForm({
  inputRef,
  label,
  value,
  autoComplete,
  saving,
  error,
  failure,
  onChange,
  onSave,
}: {
  inputRef: Ref<HTMLInputElement>;
  label: string;
  value: string;
  autoComplete: string;
  saving: boolean;
  error: string | null;
  failure: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const inputId = useId();
  const messageId = useId();

  return (
    <form
      noValidate
      aria-busy={saving || undefined}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label htmlFor={inputId} className="text-sm font-semibold text-base-content/80">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className={`input input-lg mt-1 w-full font-semibold ${error ? "input-error" : ""}`}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize="words"
        enterKeyHint="done"
        readOnly={saving}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {/* One reserved line for any message, so an error doesn't push the button down. */}
      <div className="flex min-h-7 items-end pl-1 text-sm leading-tight font-semibold text-error">
        {error ? <p id={messageId}>{error}</p> : null}
        {/* Always mounted, so screen readers announce a failure when its text appears. */}
        <p role="alert">{error ? null : failure}</p>
      </div>

      <button
        type="submit"
        className={`btn btn-lg btn-primary mt-3 w-full ${saving ? "btn-disabled" : ""}`}
        // aria-disabled rather than disabled: keeps focus on the button while busy.
        aria-disabled={saving || undefined}
        aria-busy={saving || undefined}
      >
        {saving ? (
          <>
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            Saving…
          </>
        ) : (
          "Save"
        )}
      </button>
    </form>
  );
}
