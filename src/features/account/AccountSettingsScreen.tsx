import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Link } from "wouter";
import { BackendError, type Backend, type BackendErrorCode } from "../../backend/backend.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { Avatar } from "../../components/Avatar.tsx";
import {
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  OfflineIcon,
  PencilIcon,
  PlusIcon,
  WarningIcon,
} from "../../components/icons.tsx";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { Screen } from "../../components/Screen.tsx";
import type { Account } from "../../domain/types.ts";
import { normalizeName, validateName } from "../../domain/validation.ts";
import {
  setAccount,
  setInstallHintDismissed,
  useAccount,
  useInstallHintDismissed,
} from "../../storage/store.ts";
import { CourtLines } from "../home/CourtLines.tsx";
import { ACCOUNT_STATS_PATH } from "../play-record/paths.ts";
import { CreateAccountForm } from "./CreateAccountForm.tsx";
import { DeleteAccount } from "./DeleteAccount.tsx";
import { currentBrowser, shouldOfferInstallHint } from "./installHint.ts";
import { OfflineNotice } from "./OfflineNotice.tsx";

/** What went wrong saving a new name, in words. `invalid-name` shows as the field's own error. */
const RENAME_ERROR_MESSAGE: Partial<Record<BackendErrorCode, string>> & { failed: string } = {
  offline: "You're offline. Connect and try again.",
  "no-account": "Couldn't find your Account. Try again later.",
  "not-found": "Couldn't find your Account. Try again later.",
  "account-exists": "Couldn't save your name. Try again.",
  "id-unavailable": "Couldn't save your name. Try again.",
  failed: "Couldn't save your name. Try again.",
};

/** How long "Copied" stays on the copy button. */
const COPIED_FOR_MS = 2500;

/**
 * Account settings (from the avatar on Home): the Account's name, edited in place, and its
 * never-changing Account ID with a copy button. With no Account, "Add your name" creates one.
 * Only reachable when there is a Backend.
 */
export function AccountSettingsScreen({ backend }: { backend: Backend }) {
  const account = useAccount();
  // One polite live region for the whole screen, so confirmations are announced reliably.
  const [announcement, setAnnouncement] = useState("");

  return (
    <Screen backTo="/" title="Account">
      {account ? (
        <AccountDetails backend={backend} account={account} announce={setAnnouncement} />
      ) : (
        <NoAccount backend={backend} announce={setAnnouncement} />
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </Screen>
  );
}

type Announce = (message: string) => void;

function AccountDetails({
  backend,
  account,
  announce,
}: {
  backend: Backend;
  account: Account;
  announce: Announce;
}) {
  const offerInstallHint = useMemo(() => shouldOfferInstallHint(currentBrowser()), []);
  const installHintDismissed = useInstallHintDismissed();

  return (
    <>
      <CourtCard>
        <NameSection backend={backend} account={account} announce={announce} />
        {/* A court line between the two halves of the card. */}
        <hr className="my-5 border-0 border-t-2 border-dashed border-line/30" />
        <AccountIdSection accountId={account.accountId} announce={announce} />
        <hr className="mt-5 mb-2 border-0 border-t-2 border-dashed border-line/30" />
        <StatsRow />
      </CourtCard>

      <p className="animate-rise -mt-2 px-1 leading-snug text-base-content/75" style={delay(1)}>
        Give your Account ID to an Organizer, so they can add you to their Club. It never changes,
        even if you change your name.
      </p>

      {offerInstallHint && !installHintDismissed ? <InstallHint /> : null}

      <DeleteAccount account={account} />
    </>
  );
}

/** Court-green panel in the Home hero's style: glow, faint court lines, off-white text. */
function CourtCard({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Your Account"
      className="animate-rise relative isolate overflow-hidden rounded-box bg-court text-line shadow-lg"
      style={delay(0)}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(110% 80% at 0% 0%, rgb(255 255 255 / 0.2), transparent 55%), linear-gradient(160deg, transparent 35%, var(--color-court-deep) 100%)",
        }}
      />
      <CourtLines className="absolute top-1/2 left-[62%] -z-10 w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] text-line/20" />
      <div className="flex flex-col p-5">{children}</div>
    </section>
  );
}

/** Small all-caps caption above a value on the card. */
function Caption({
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

function NameSection({
  backend,
  account,
  announce,
}: {
  backend: Backend;
  account: Account;
  announce: Announce;
}) {
  const online = useOnline(backend);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.name);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const messageId = useId();
  const offlineId = useId();

  const nameError = validateName(draft, []);
  const shownNameError = attempted ? nameError : null;

  function startEditing() {
    // Synchronously, so focusing happens inside the tap and iOS opens the keyboard.
    flushSync(() => {
      setDraft(account.name);
      setAttempted(false);
      setFailure(null);
      setEditing(true);
    });
    const input = inputRef.current;
    if (input) {
      input.focus();
      // Caret at the end: editing is mostly fixing a typo or adding a surname.
      input.setSelectionRange(input.value.length, input.value.length);
    }
    announce("");
  }

  function stopEditing() {
    flushSync(() => setEditing(false));
    editRef.current?.focus();
  }

  async function save() {
    if (saving) return;
    if (nameError) {
      setAttempted(true);
      inputRef.current?.focus();
      return;
    }
    if (normalizeName(draft) === account.name) {
      stopEditing();
      return;
    }
    // Put the keyboard away so the busy state and the result are in view.
    inputRef.current?.blur();
    setSaving(true);
    setFailure(null);
    try {
      setAccount(await backend.renameAccount(draft));
      setSaving(false);
      stopEditing();
      announce("Name saved");
    } catch (error) {
      console.error("Failed to rename Account", error);
      const code = error instanceof BackendError ? error.code : "failed";
      setSaving(false);
      if (code === "invalid-name") {
        setAttempted(true);
        inputRef.current?.focus();
      } else {
        setFailure(RENAME_ERROR_MESSAGE[code] ?? RENAME_ERROR_MESSAGE.failed);
      }
    }
  }

  // While typing, the avatar previews the new initials.
  const avatarName = editing && normalizeName(draft) !== "" ? draft : account.name;

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <Avatar name={avatarName} size="lg" />
        {editing ? null : (
          <button
            ref={editRef}
            type="button"
            className="btn h-10 min-h-10 gap-1.5 rounded-full border-line/35 bg-line/10 px-4 text-line shadow-none hover:border-line/60 hover:bg-line/20 disabled:border-line/15 disabled:bg-transparent disabled:text-line/45"
            aria-label="Edit name"
            aria-describedby={online ? undefined : offlineId}
            disabled={!online}
            onClick={startEditing}
          >
            <PencilIcon className="size-4" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form
          noValidate
          aria-busy={saving || undefined}
          className="mt-4 flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Caption htmlFor={inputId}>Your name</Caption>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="input input-lg mt-1.5 w-full border-0 bg-line font-display text-2xl font-bold text-[#14201a] shadow-inner [--input-color:var(--color-volt)]"
            value={draft}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
            readOnly={saving}
            aria-invalid={shownNameError ? true : undefined}
            aria-describedby={shownNameError ? messageId : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setFailure(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !saving) {
                event.preventDefault();
                stopEditing();
              }
            }}
          />
          {/* One reserved line for any message, so an error doesn't push the buttons down. */}
          <div className="flex min-h-9 items-center">
            {shownNameError ? (
              <CardError id={messageId}>{NAME_ERROR_MESSAGE[shownNameError]}</CardError>
            ) : null}
            {/* Always mounted, so screen readers announce a failure when its text appears. */}
            <div role="alert">
              {!shownNameError && failure ? <CardError>{failure}</CardError> : null}
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
              onClick={stopEditing}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col">
          <Caption>Name</Caption>
          <p className="font-display text-[2rem] leading-tight font-bold break-words">
            {account.name}
          </p>
          {online ? null : (
            <p id={offlineId} className="mt-1 flex items-center gap-1.5 text-sm text-line/80">
              <OfflineIcon className="size-4 shrink-0" />
              Changing your name needs a connection.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** An error on the green card: a red pill, so it reads as an error on any background. */
function CardError({ id, children }: { id?: string; children: ReactNode }) {
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

function AccountIdSection({ accountId, announce }: { accountId: string; announce: Announce }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(accountId);
      setCopyState("copied");
      announce("Account ID copied");
      timer.current = setTimeout(() => setCopyState("idle"), COPIED_FOR_MS);
    } catch (error) {
      console.warn("Couldn't copy the Account ID", error);
      setCopyState("failed");
    }
  }

  const copied = copyState === "copied";
  return (
    <div className="flex flex-col">
      <Caption>Account ID</Caption>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 font-display text-[2.5rem] leading-none font-extrabold tracking-wide break-all text-volt select-all">
          {accountId}
        </p>
        <button
          type="button"
          className={`btn h-11 min-h-11 min-w-[7.5rem] gap-1.5 rounded-full border-0 shadow-md transition-colors ${
            copied ? "bg-volt text-[#14201a]" : "bg-line text-court hover:bg-line/90"
          }`}
          onClick={() => void copy()}
        >
          {copied ? (
            <>
              <CheckIcon className="size-5" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="size-5" />
              Copy <span className="sr-only">Account ID</span>
            </>
          )}
        </button>
      </div>
      {copyState === "failed" ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-line/90">
          Couldn't copy. Press and hold the ID to copy it.
        </p>
      ) : null}
    </div>
  );
}

/** "Your stats": the last line on the card, opening the Account's Stats. */
function StatsRow() {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={ACCOUNT_STATS_PATH}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="group -mx-2 -mb-2 flex min-h-16 items-center gap-3 rounded-field px-2 py-2 text-line transition-colors hover:bg-line/10 active:bg-line/15"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-line/15 shadow-[inset_0_0_0_1.5px_rgb(247_249_244/0.35)]">
        <ChartIcon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          Your stats
        </span>
        <span id={detailId} className="truncate text-sm text-line/75">
          Wins, Win rate and Partners
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function InstallHint() {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="animate-rise relative flex gap-3 rounded-box border-[1.5px] border-base-300 bg-base-100 p-4 pr-12 shadow-sm"
      style={delay(2)}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-volt text-[#14201a]">
        <PlusIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl leading-tight font-bold uppercase">
          Install the app
        </h2>
        <p className="leading-snug text-base-content/75">
          Get the most out of BBQueue: it opens full screen and keeps your Account safe. In your
          browser's Share or ⋮ menu, choose{" "}
          <span className="font-semibold text-base-content">Add to Home Screen</span>.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-circle btn-ghost btn-sm absolute top-2 right-2 size-10 text-base-content/60"
        aria-label="Dismiss tip"
        onClick={setInstallHintDismissed}
      >
        <CloseIcon className="size-5" />
      </button>
    </section>
  );
}

function NoAccount({ backend, announce }: { backend: Backend; announce: Announce }) {
  const online = useOnline(backend);
  return (
    <>
      <CourtCard>
        <Avatar name={null} size="lg" />
        <h2 className="mt-4 font-display text-[2rem] leading-tight font-bold uppercase">
          No Account yet
        </h2>
        <p className="mt-1 leading-snug text-line/85">
          You're using BBQueue without an Account. Everything stays on this device.
        </p>
      </CourtCard>

      <div className="animate-rise" style={delay(1)}>
        {online ? (
          <CreateAccountForm
            backend={backend}
            submitLabel="Add your name"
            onCreated={() => announce("Account created")}
          />
        ) : (
          <OfflineNotice>An Account needs a connection. Connect to add your name.</OfflineNotice>
        )}
      </div>
    </>
  );
}

function delay(step: number): CSSProperties {
  return { animationDelay: `${step * 70}ms` };
}
