import { useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BackendError, type Backend, type BackendErrorCode } from "../../backend/backend.ts";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import { OfflineIcon } from "../../components/icons.tsx";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { validateName } from "../../domain/validation.ts";
import { setAccount, setWelcomeDone } from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";

/** What went wrong creating the Account, in words. `invalid-name` shows on the field instead. */
const CREATE_ERROR_MESSAGE: Record<Exclude<BackendErrorCode, "invalid-name">, string> = {
  offline: "You're offline. Connect and try again, or skip for now.",
  "id-unavailable": "Couldn't find a free Account ID. Try again.",
  "account-exists": "This device already has an Account.",
  failed: "Couldn't create your Account. Try again.",
};

/**
 * First launch: create an Account by entering a name, or skip. Either way the Welcome screen
 * is done and never comes back. Offline, an Account can't be created, but the person can still
 * continue without one.
 *
 * Same court-green hero as Home, so finishing here flows straight into Home. The form sits on a
 * sheet at the bottom, within thumb reach; it is a real `<form>`, so Return / Go submits.
 */
export function WelcomeScreen({ backend }: { backend: Backend }) {
  const online = useSyncExternalStore(
    (listener) => backend.observeOnline(listener),
    () => backend.isOnline(),
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <Hero />
      <main className="px-safe relative z-10 -mt-6 rounded-t-[1.75rem] bg-base-100 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.35)]">
        <div className="animate-rise mx-auto w-full max-w-md" style={delayStyle(3)}>
          {online ? <CreateAccountForm backend={backend} /> : <OfflineNotice />}
        </div>
      </main>
    </div>
  );
}

function Hero() {
  return (
    <header className="relative isolate flex flex-1 flex-col overflow-hidden bg-court text-line">
      {/* Hall-light glow + court lines bleeding off the edges (as on Home). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 15% -10%, rgb(255 255 255 / 0.22), transparent 55%), linear-gradient(160deg, transparent 40%, var(--color-court-deep) 100%)",
        }}
      />
      <CourtLines className="absolute top-1/2 left-1/2 -z-10 w-[165%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[58deg] text-line/30 sm:w-[120%] sm:-rotate-[20deg]" />

      <div className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col justify-end pt-[max(2rem,env(safe-area-inset-top))] pb-12">
        <BrandMark
          className="animate-rise mb-3 size-14 drop-shadow-[0_6px_14px_rgb(0_0_0/0.18)] sm:size-20"
          style={delayStyle(0)}
        />
        <h1 className="animate-rise font-display" style={delayStyle(1)}>
          <span className="block text-2xl font-bold tracking-wide text-line/85 uppercase">
            Welcome to
          </span>{" "}
          <span className="block text-[clamp(3.5rem,18vw,7rem)] leading-[0.82] font-extrabold tracking-[-0.02em]">
            <Wordmark />
          </span>
        </h1>
        <p
          className="animate-rise mt-3 max-w-[22rem] text-lg leading-snug font-medium text-line"
          style={delayStyle(2)}
        >
          Fair turns and balanced doubles for your badminton club night.
        </p>
      </div>
    </header>
  );
}

function CreateAccountForm({ backend }: { backend: Backend }) {
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const whyId = useId();
  const messageId = useId();
  const skipNoteId = useId();

  const nameError = validateName(name, []);
  const shownNameError = attempted ? nameError : null;

  async function create() {
    if (creating) return;
    if (nameError) {
      setAttempted(true);
      // Straight back to the field (keeps the keyboard up on Enter, opens it on Continue).
      inputRef.current?.focus();
      return;
    }
    // Valid: put the keyboard away so the busy state and the result are in view.
    inputRef.current?.blur();
    setCreating(true);
    setFailure(null);
    try {
      setAccount(await backend.createAccount(name));
      setWelcomeDone();
    } catch (error) {
      console.error("Failed to create Account", error);
      const code = error instanceof BackendError ? error.code : "failed";
      setCreating(false);
      if (code === "invalid-name") {
        setAttempted(true);
        inputRef.current?.focus();
      } else {
        setFailure(CREATE_ERROR_MESSAGE[code]);
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
          "Continue"
        )}
      </button>

      <button
        type="button"
        className="btn btn-ghost mt-2 w-full text-base font-semibold text-base-content/75"
        disabled={creating}
        aria-describedby={skipNoteId}
        onClick={setWelcomeDone}
      >
        Skip for now
      </button>
      <p id={skipNoteId} className="text-center text-sm text-base-content/60">
        No Account needed. You can add your name later.
      </p>
    </form>
  );
}

function OfflineNotice() {
  return (
    <div className="flex flex-col gap-5">
      <div role="status" className="flex gap-3 rounded-box bg-base-200 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-base-100 text-base-content/70">
          <OfflineIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-xl leading-tight font-bold uppercase">You're offline</p>
          <p className="text-base-content/75">
            An Account needs a connection. You can continue without one and add your name later.
          </p>
        </div>
      </div>
      <button type="button" className="btn btn-lg btn-primary w-full" onClick={setWelcomeDone}>
        Continue without an Account
      </button>
    </div>
  );
}

function delayStyle(step: number): CSSProperties {
  return { animationDelay: `${step * 70}ms` };
}
