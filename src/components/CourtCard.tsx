import type { CSSProperties, ReactNode, Ref } from "react";
import { CourtLines } from "./CourtLines.tsx";
import { PencilIcon, WarningIcon } from "./icons.tsx";

/** The glow and court lines: from the top left across the card (Account), or off its right edge. */
const LAYOUT = {
  across: {
    glow: "radial-gradient(110% 80% at 0% 0%, rgb(255 255 255 / 0.2), transparent 55%), linear-gradient(160deg, transparent 35%, var(--color-court-deep) 100%)",
    lines:
      "absolute top-1/2 left-[62%] -z-10 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] text-line/20",
  },
  right: {
    glow: "radial-gradient(120% 120% at 100% 0%, rgb(255 255 255 / 0.18), transparent 55%), linear-gradient(200deg, transparent 40%, var(--color-court-deep) 100%)",
    lines:
      "absolute top-1/2 right-[-34%] -z-10 w-[85%] max-w-none -translate-y-1/2 rotate-[12deg] text-line/20",
  },
} as const;

/**
 * Court-green panel in the Home hero's style: glow, faint court lines, off-white text. The card at
 * the top of the Account page, Stats and the Club page.
 */
export function CourtCard({
  label,
  labelledBy,
  pill,
  layout = "right",
  animate = true,
  style,
  children,
}: {
  label?: string;
  labelledBy?: string;
  /** Small all-caps pill at the top ("Stats", "Club"). */
  pill?: string;
  layout?: keyof typeof LAYOUT;
  /** Rise in when it appears. Off when the page around it only changes mode. */
  animate?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`${animate ? "animate-rise" : ""} relative isolate overflow-hidden rounded-box bg-court text-line shadow-lg`}
      style={style}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ background: LAYOUT[layout].glow }}
      />
      <CourtLines className={LAYOUT[layout].lines} />
      <div className="flex flex-col p-5">
        {pill ? (
          <p className="mb-4 inline-flex items-center gap-2 self-start rounded-full bg-black/20 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase">
            <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
            {pill}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** Small all-caps caption above a value on the card. */
export function CourtCardCaption({
  id,
  htmlFor,
  children,
}: {
  id?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const className = "text-xs font-bold tracking-[0.14em] text-line/70 uppercase";
  return htmlFor ? (
    <label id={id} htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p id={id} className={className}>
      {children}
    </p>
  );
}

/** An error on the green card: a red pill, so it reads as an error on any background. */
export function CourtCardError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      className="inline-flex items-center gap-1.5 rounded-full bg-error px-2.5 py-0.5 text-sm font-semibold text-error-content"
    >
      <WarningIcon className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/** The pencil "Edit" pill in the card's top-right corner. */
export function CourtCardEditButton({
  buttonRef,
  label,
  describedBy,
  disabled = false,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  /** Accessible name, e.g. "Edit name". */
  label: string;
  describedBy?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="btn h-10 min-h-10 shrink-0 gap-1.5 rounded-full border-line/35 bg-line/10 px-4 text-line shadow-none hover:border-line/60 hover:bg-line/20 disabled:border-line/15 disabled:bg-transparent disabled:text-line/45"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
    >
      <PencilIcon className="size-4" />
      Edit
    </button>
  );
}

/**
 * A name edited in place on the card: the field, one reserved line for a message, Save and
 * Cancel. Escape cancels. The caller checks the name and does the saving.
 */
export function CourtCardNameForm({
  inputRef,
  inputId,
  label,
  value,
  autoComplete = "off",
  saving,
  /** The name's own problem, shown under the field and tied to it. */
  error,
  errorId,
  /** Why saving failed (the server, the connection), announced when it appears. */
  failure,
  onChange,
  onSave,
  onCancel,
}: {
  inputRef: Ref<HTMLInputElement>;
  inputId: string;
  label: string;
  value: string;
  autoComplete?: string;
  saving: boolean;
  error: string | null;
  errorId: string;
  failure: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      noValidate
      aria-busy={saving || undefined}
      className="mt-4 flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <CourtCardCaption htmlFor={inputId}>{label}</CourtCardCaption>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className="input input-lg mt-1.5 w-full border-0 bg-line font-display text-2xl font-bold text-[#14201a] shadow-inner [--input-color:var(--color-volt)]"
        value={value}
        autoComplete={autoComplete}
        autoCapitalize="words"
        enterKeyHint="done"
        readOnly={saving}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {/* One reserved line for any message, so an error doesn't push the buttons down. */}
      <div className="flex min-h-9 items-center">
        {error ? <CourtCardError id={errorId}>{error}</CourtCardError> : null}
        {/* Always mounted, so screen readers announce a failure when its text appears. */}
        <div role="alert">
          {!error && failure ? <CourtCardError>{failure}</CourtCardError> : null}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className={`btn flex-1 border-0 bg-volt text-[#14201a] shadow-md hover:bg-volt/90 ${saving ? "btn-disabled" : ""}`}
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
        <button
          type="button"
          className="btn flex-1 border-line/35 bg-transparent text-line shadow-none hover:border-line/60 hover:bg-line/10"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
