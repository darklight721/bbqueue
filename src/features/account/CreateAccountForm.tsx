import { useId, useRef, useState, type ReactNode } from "react";
import { BackendError, type Backend, type BackendErrorCode } from "../../backend/backend.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { validateName } from "../../domain/validation.ts";
import { requestPersistentStorage } from "../../storage/persistentStorage.ts";
import { setAccount } from "../../storage/store.ts";

/** What went wrong creating the Account, in words. `invalid-name` shows on the field instead. */
const CREATE_ERROR_MESSAGE: Partial<Record<BackendErrorCode, string>> & {
  offline: string;
  failed: string;
} = {
  offline: "You're offline. Connect and try again.",
  "id-unavailable": "Couldn't find a free Account ID. Try again.",
  "account-exists": "This device already has an Account.",
  "no-account": "Couldn't create your Account. Try again.",
  "not-found": "Couldn't create your Account. Try again.",
  failed: "Couldn't create your Account. Try again.",
};

export interface CreateAccountFormProps {
  backend: Backend;
  /** The primary button, e.g. "Continue". */
  submitLabel: string;
  /** What to say when the connection drops while creating. */
  offlineMessage?: string;
  /** Called once the Account exists and is stored on the device. */
  onCreated?: () => void;
  /** Extra actions under the primary button; told whether creating is under way. */
  children?: (creating: boolean) => ReactNode;
}

/**
 * Name field + primary button that creates this device's Account. Used by the Welcome screen and
 * Account settings. A real `<form>`, so Return / Go submits. After creating, it asks the browser
 * to keep the app's data, so the Account isn't cleared away with it.
 */
export function CreateAccountForm({
  backend,
  submitLabel,
  offlineMessage = CREATE_ERROR_MESSAGE.offline,
  onCreated,
  children,
}: CreateAccountFormProps) {
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const whyId = useId();
  const messageId = useId();

  const nameError = validateName(name, []);
  const shownNameError = attempted ? nameError : null;

  async function create() {
    if (creating) return;
    if (nameError) {
      setAttempted(true);
      // Straight back to the field (keeps the keyboard up on Enter, opens it on the button).
      inputRef.current?.focus();
      return;
    }
    // Valid: put the keyboard away so the busy state and the result are in view.
    inputRef.current?.blur();
    setCreating(true);
    setFailure(null);
    try {
      setAccount(await backend.createAccount(name));
      void requestPersistentStorage();
      onCreated?.();
    } catch (error) {
      console.error("Failed to create Account", error);
      const code = error instanceof BackendError ? error.code : "failed";
      setCreating(false);
      if (code === "invalid-name") {
        setAttempted(true);
        inputRef.current?.focus();
      } else {
        setFailure(
          code === "offline"
            ? offlineMessage
            : (CREATE_ERROR_MESSAGE[code] ?? CREATE_ERROR_MESSAGE.failed),
        );
      }
    }
  }

  return (
    <form
      noValidate
      aria-busy={creating || undefined}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label htmlFor={nameId} className="font-display text-2xl leading-tight font-bold uppercase">
        Your name
      </label>
      <p id={whyId} className="mt-1 mb-3 leading-snug text-base-content/70">
        Creates your Account, so your Club can add you by your Account ID and you'll see Sessions
        live.
      </p>
      <input
        ref={inputRef}
        id={nameId}
        type="text"
        className={`input input-lg w-full font-semibold ${shownNameError ? "input-error" : ""}`}
        value={name}
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="go"
        readOnly={creating}
        aria-invalid={shownNameError ? true : undefined}
        aria-describedby={shownNameError ? `${messageId} ${whyId}` : whyId}
        onChange={(event) => {
          setName(event.target.value);
          setFailure(null);
        }}
      />
      {/* One reserved line for any message, so an error doesn't push the buttons down. */}
      <div className="flex min-h-7 items-end pl-1 text-sm leading-tight font-semibold text-error">
        {shownNameError ? <p id={messageId}>{NAME_ERROR_MESSAGE[shownNameError]}</p> : null}
        {/* Always mounted, so screen readers announce a failure when its text appears. */}
        <p role="alert">{shownNameError ? null : failure}</p>
      </div>

      <button
        type="submit"
        className={`btn btn-lg btn-primary mt-3 w-full ${creating ? "btn-disabled" : ""}`}
        // aria-disabled rather than disabled: keeps focus on the button while busy.
        aria-disabled={creating || undefined}
      >
        {creating ? (
          <>
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            Creating your Account…
          </>
        ) : (
          submitLabel
        )}
      </button>

      {children?.(creating)}
    </form>
  );
}
