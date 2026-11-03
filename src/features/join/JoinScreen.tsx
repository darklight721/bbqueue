import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useLocation } from "wouter";
import { BackendError, type Backend, type JoinLinkInfo } from "../../backend/backend.ts";
import { getBackend } from "../../backend/index.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { CourtCard } from "../../components/CourtCard.tsx";
import { CopyIcon } from "../../components/icons.tsx";
import { Modal } from "../../components/Modal.tsx";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { Screen } from "../../components/Screen.tsx";
import { isJoinToken } from "../../domain/joinLink.ts";
import { normalizeName, validateName } from "../../domain/validation.ts";
import { requestPersistentStorage } from "../../storage/persistentStorage.ts";
import { getAccount, getClubs, setAccount, setWelcomeDone, useClubs } from "../../storage/store.ts";
import { useInstallHintKind } from "../account/installHint.ts";
import { OfflineNotice } from "../account/OfflineNotice.tsx";
import { clubPath } from "../club-edit/clubPaths.ts";
import {
  afterClaimError,
  firstStep,
  stepAfterLookup,
  stepAfterNameGone,
  type JoinStep,
  type LookupFrom,
} from "./joinFlow.ts";
import { joinLinkUrl } from "./joinPaths.ts";

const codeOf = (error: unknown) => (error instanceof BackendError ? error.code : "failed");

/**
 * A call that failed for want of a connection the device thinks it has is tried again after 2 s,
 * doubling each time up to 30 s (until the connection comes back, or Try again).
 */
const retryDelay = (retries: number) => Math.min(2_000 * 2 ** retries, 30_000);

/** After a Claim, how long to wait for the Club to reach the device before opening its page. */
const CLUB_WAIT_MS = 10_000;

/** Steps that talk to the server: offline, the page says to connect instead. */
const NEEDS_CONNECTION = new Set<JoinStep["type"]>([
  "loading",
  "failed",
  "your-name",
  "name-in-club",
  "confirm",
]);

/**
 * `/join/:token`: the Join page (spec: Join link). Opens without Welcome, even on a device that
 * has never opened the app, and its only way out is Home. Finds the link's Club, then the
 * person's Club player by name (never showing the roster), asks "You're Alex in <Club>?" and
 * Claims it. Without an Account here, one is made with the first name typed, but only once a
 * Claim is about to happen.
 */
export function JoinScreen({ token }: { token: string }) {
  const backend = getBackend();
  // No Backend, nothing to Claim with; a token of the wrong shape isn't worth asking about.
  if (!backend || !isJoinToken(token)) {
    return (
      <JoinFrame>
        <DeadEnd />
      </JoinFrame>
    );
  }
  return <JoinFlow key={token} backend={backend} token={token} />;
}

/** No Back into the app, only Home. */
function JoinFrame({ children }: { children: ReactNode }) {
  return (
    <Screen title="Join link" backTo="/" backLabel="Home">
      {children}
    </Screen>
  );
}

function JoinFlow({ backend, token }: { backend: Backend; token: string }) {
  const [, navigate] = useLocation();
  const online = useOnline(backend);
  const clubs = useClubs();
  const [club, setClub] = useState<JoinLinkInfo | null>(null);
  const [step, setStep] = useState<JoinStep>({ type: "loading" });
  const [attempt, setAttempt] = useState(0);
  /** A call failed for want of a connection that the device still thought it had. */
  const [lostConnection, setLostConnection] = useState(false);
  /** How often a lost connection was tried again since the connection last came back. */
  const [retries, setRetries] = useState(0);
  /** Claimed (or on the Club already): waiting for the Club to reach the device. */
  const [claimed, setClaimed] = useState(false);
  /** No Account: the name from Your name, which the Account will be created with. */
  const [accountName, setAccountName] = useState<string | null>(null);
  const [yourName, setYourName] = useState("");
  const [nameInClub, setNameInClub] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupFailure, setLookupFailure] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimFailure, setClaimFailure] = useState<string | null>(null);
  const nameInClubRef = useRef<HTMLInputElement>(null);

  const offline = !online || lostConnection;
  const onClub = !!club && clubs.some((candidate) => candidate.id === club.clubId);

  // Back online: start afresh (the effect below opens the link again).
  useEffect(
    () =>
      backend.observeOnline((now) => {
        if (!now) return;
        setLostConnection(false);
        setRetries(0);
      }),
    [backend],
  );

  // Lost the connection while the device says it has one: nothing will say it's back, so try
  // again after a while (back to the step's form, or opening the link again).
  useEffect(() => {
    if (!online || !lostConnection) return;
    const timer = setTimeout(() => {
      setRetries((count) => count + 1);
      setLostConnection(false);
      setAttempt((count) => count + 1);
    }, retryDelay(retries));
    return () => clearTimeout(timer);
  }, [online, lostConnection, retries]);

  // On the Club already, or just Claimed it (the server's listener brings the Club a moment
  // later): its page opens in place of this one, so Back doesn't come back here.
  useEffect(() => {
    if (club && onClub) navigate(clubPath(club.clubId), { replace: true });
  }, [club, onClub, navigate]);

  // Claimed, but the Club hasn't come: its page opens anyway (and sends you on to Clubs while
  // the Club isn't on the device), rather than Linking… for ever.
  useEffect(() => {
    if (!claimed || !club) return;
    const timer = setTimeout(
      () => navigate(clubPath(club.clubId), { replace: true }),
      CLUB_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [claimed, club, navigate]);

  // Find the Club, then (with an Account) the Account's Name in it. Again when back online.
  useEffect(() => {
    if (step.type !== "loading" || !online) return;
    let live = true;
    void (async () => {
      try {
        const found = await backend.getJoinLinkInfo(token);
        if (!live) return;
        if (!found) {
          setStep({ type: "dead" });
          return;
        }
        setClub(found);
        const next = firstStep({
          accountName: getAccount()?.name ?? null,
          onClub: getClubs().some((candidate) => candidate.id === found.clubId),
        });
        // On the Club: the effect above opens its page.
        if (next.type === "to-club") return;
        if (next.type === "step") {
          setStep(next.step);
          return;
        }
        const match = await backend.findJoinLinkName(token, next.name);
        if (live) setStep(stepAfterLookup("account", next.name, match));
      } catch (error) {
        if (!live) return;
        if (codeOf(error) === "offline") {
          setLostConnection(true);
        } else {
          console.error("Failed to open the Join link", error);
          setStep({ type: "failed" });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [step.type, online, attempt, backend, token]);

  /** Continue (Your name) or Find me (Your name in <Club>). */
  async function lookUp(from: Exclude<LookupFrom, "account">, typed: string) {
    if (looking) return;
    const name = normalizeName(typed);
    setLooking(true);
    setLookupFailure(null);
    try {
      const found = await backend.findJoinLinkName(token, name);
      if (from === "your-name") setAccountName(name);
      setClaimFailure(null);
      setStep(stepAfterLookup(from, name, found));
    } catch (error) {
      if (codeOf(error) === "offline") {
        setLostConnection(true);
      } else {
        console.error("Failed to look the name up", error);
        setLookupFailure("Couldn't check that name. Try again.");
      }
    } finally {
      setLooking(false);
    }
  }

  /** Try again on the offline notice: back to the step's form, or opening the link again. */
  function retry() {
    setLostConnection(false);
    setAttempt((count) => count + 1);
  }

  /** Try another name, I go by another name, or closing Confirm: an empty Your name in <Club>. */
  function askNameInClub() {
    // Synchronously, so the field is there to focus inside the tap and iOS opens the keyboard.
    flushSync(() => {
      setNameInClub("");
      setLookupFailure(null);
      setStep({ type: "name-in-club" });
    });
    nameInClubRef.current?.focus();
  }

  async function claim(name: string) {
    if (claiming) return;
    setClaiming(true);
    setClaimFailure(null);
    let creating = false;
    try {
      if (!getAccount()) {
        creating = true;
        setAccount(await backend.createAccount(accountName ?? name));
        setWelcomeDone();
        void requestPersistentStorage();
        creating = false;
      }
      await backend.claimClubPlayer(token, name);
      // Still busy: the Club page opens once the Club reaches the device.
      setClaimed(true);
    } catch (error) {
      const code = codeOf(error);
      const outcome = afterClaimError(code, name);
      if (outcome.type === "to-club") {
        setClaimed(true);
        return;
      }
      if (outcome.type === "check-link") {
        await afterNameGone(name);
        return;
      }
      setClaiming(false);
      if (outcome.type === "step") {
        setStep(outcome.step);
      } else if (outcome.offline) {
        setLostConnection(true);
      } else {
        console.error(creating ? "Failed to create Account" : "Failed to Claim", error);
        setClaimFailure(
          creating ? "Couldn't create your Account. Try again." : "Couldn't link you. Try again.",
        );
      }
    }
  }

  /** A Claim of `name` was refused `not-found`: the link stopped working, or the row is gone. */
  async function afterNameGone(name: string) {
    try {
      const found = await backend.getJoinLinkInfo(token);
      if (found) setClub(found);
      setStep(stepAfterNameGone(found !== null, name));
    } catch (error) {
      if (codeOf(error) === "offline") {
        setLostConnection(true);
      } else {
        console.error("Failed to check the Join link", error);
        setClaimFailure("Couldn't link you. Try again.");
      }
    } finally {
      setClaiming(false);
    }
  }

  if (step.type === "dead") {
    return (
      <JoinFrame>
        <DeadEnd />
      </JoinFrame>
    );
  }

  const clubName = club?.clubName ?? "";
  const confirming = step.type === "confirm" ? step : null;
  /** What the page shows under the card for this step (the form under Confirm, too). */
  const shown: JoinStep["type"] | LookupFrom = confirming ? confirming.from : step.type;

  let body: ReactNode = null;
  if (offline && NEEDS_CONNECTION.has(step.type)) {
    body = (
      <div className="flex flex-col gap-4">
        <OfflineNotice>Connect to the internet to join this club.</OfflineNotice>
        {/* The device says it's online, so nothing may say when the connection is back. */}
        {online ? (
          <button
            type="button"
            className="btn btn-lg w-full border-base-300 btn-outline"
            onClick={retry}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (step.type === "loading") {
    body = (
      <p role="status" className="flex justify-center py-8">
        <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
        <span className="sr-only">Opening the Join link…</span>
      </p>
    );
  } else if (step.type === "failed") {
    body = (
      <Message
        text="Couldn't open this Join link. Try again."
        action="Try again"
        onAction={() => {
          setStep({ type: "loading" });
          setAttempt((count) => count + 1);
        }}
      />
    );
  } else if (shown === "your-name") {
    body = (
      <NameStep
        label="Your name"
        submitLabel="Continue"
        value={yourName}
        busy={looking}
        failure={lookupFailure}
        onChange={(value) => {
          setYourName(value);
          setLookupFailure(null);
        }}
        onSubmit={() => void lookUp("your-name", yourName)}
      />
    );
  } else if (shown === "name-in-club") {
    body = (
      <NameStep
        inputRef={nameInClubRef}
        label={`Your name in ${clubName}`}
        submitLabel="Find me"
        value={nameInClub}
        busy={looking}
        failure={lookupFailure}
        onChange={(value) => {
          setNameInClub(value);
          setLookupFailure(null);
        }}
        onSubmit={() => void lookUp("name-in-club", nameInClub)}
      />
    );
  } else if (step.type === "no-match") {
    body = (
      <Message
        text={`No one called ${step.name} in ${clubName}. Ask an Organizer to add you, then open this link again.`}
        action="Try another name"
        onAction={askNameInClub}
      />
    );
  } else if (step.type === "already-linked") {
    body = (
      <Message
        text={`${step.name} is already linked to an Account. If that's not you, ask an Organizer to unlink it.`}
        action="Try another name"
        onAction={askNameInClub}
      />
    );
  } else if (step.type === "just-claimed") {
    body = (
      <Message
        text={`${step.name} was just linked to another Account.`}
        action="Try another name"
        onAction={askNameInClub}
      />
    );
  }

  return (
    <JoinFrame>
      {club ? <JoinCard clubName={clubName} /> : null}
      {club ? <HomeScreenCopyLine token={token} /> : null}
      {body}

      <Modal
        open={!!confirming && !offline}
        title={confirming ? `You're ${confirming.name} in ${clubName}?` : ""}
        description="You'll be linked as a Player and see the club and its sessions."
        closeLabel="Close"
        onClose={() => {
          // The sheet stays put while claiming.
          if (!claiming) askNameInClub();
        }}
      >
        <div className="flex flex-col gap-3 pb-2">
          {/* Always mounted, so screen readers announce a failure when its text appears. */}
          <p role="alert" className="text-sm font-semibold text-error empty:hidden">
            {claimFailure}
          </p>
          <button
            type="button"
            className={`btn btn-lg btn-primary w-full ${claiming ? "btn-disabled" : ""}`}
            // aria-disabled rather than disabled: keeps focus on the button while busy.
            aria-disabled={claiming || undefined}
            aria-busy={claiming || undefined}
            onClick={() => {
              if (confirming) void claim(confirming.name);
            }}
          >
            {claiming ? (
              <>
                <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                Linking…
              </>
            ) : (
              "Yes, that's me"
            )}
          </button>
          <button
            type="button"
            className="btn btn-lg w-full border-base-300 btn-outline"
            disabled={claiming}
            onClick={askNameInClub}
          >
            I go by another name
          </button>
        </div>
      </Modal>
    </JoinFrame>
  );
}

/** The court-green card, as on the Club page: what this is, and the Club's name. No roster. */
function JoinCard({ clubName }: { clubName: string }) {
  const nameId = useId();
  return (
    <CourtCard labelledBy={nameId}>
      <p className="mb-3 inline-flex items-center gap-2 self-start rounded-full bg-black/20 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase">
        <span className="size-2 rounded-full bg-volt" aria-hidden="true" />
        Join club
      </p>
      <h2
        id={nameId}
        className="min-w-0 font-display text-4xl leading-none font-bold break-words uppercase"
      >
        {clubName}
      </h2>
    </CourtCard>
  );
}

/**
 * In an iOS browser (not the installed app): a link tapped in another app always opens here, and
 * the installed app has its own storage. Offers the link to paste into the installed app.
 */
function HomeScreenCopyLine({ token }: { token: string }) {
  const ios = useInstallHintKind() === "ios";
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  if (!ios) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinLinkUrl(token));
      setCopied("copied");
    } catch (error) {
      console.warn("Couldn't copy the Join link", error);
      setCopied("failed");
    }
  }

  return (
    <div className="-mt-3 flex flex-col gap-1 px-1">
      <p className="text-sm text-base-content/70">
        Using BBQueue from your Home Screen? Copy this link and paste it there.
      </p>
      <div className="flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          className="btn btn-sm -ml-3 btn-ghost text-primary"
          onClick={() => void copy()}
        >
          <CopyIcon className="size-4" />
          Copy link
        </button>
        <p role="status" className="text-sm font-semibold text-base-content/80">
          {copied === "copied"
            ? "Link copied"
            : copied === "failed"
              ? "Couldn't copy the link."
              : ""}
        </p>
      </div>
    </div>
  );
}

/** A name field and its button: Your name / Continue, or Your name in <Club> / Find me. */
function NameStep({
  inputRef,
  label,
  submitLabel,
  value,
  busy,
  failure,
  onChange,
  onSubmit,
}: {
  /** The field, for focusing it from outside; without one, a ref of its own. */
  inputRef?: RefObject<HTMLInputElement | null>;
  label: string;
  submitLabel: string;
  value: string;
  busy: boolean;
  /** Why checking the name failed (the server), announced when it appears. */
  failure: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [attempted, setAttempted] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? ownRef;
  const nameId = useId();
  const messageId = useId();
  const nameError = validateName(value, []);
  const shownError = attempted ? nameError : null;

  return (
    <form
      noValidate
      aria-busy={busy || undefined}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (nameError) {
          setAttempted(true);
          // Straight back to the field (keeps the keyboard up on Enter, opens it on the button).
          fieldRef.current?.focus();
          return;
        }
        // Valid: put the keyboard away so the busy state and the result are in view.
        fieldRef.current?.blur();
        onSubmit();
      }}
    >
      <label htmlFor={nameId} className="font-display text-2xl leading-tight font-bold uppercase">
        {label}
      </label>
      <input
        ref={fieldRef}
        id={nameId}
        type="text"
        className={`input input-lg mt-3 w-full font-semibold ${shownError ? "input-error" : ""}`}
        value={value}
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="go"
        readOnly={busy}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? messageId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {/* One reserved line for any message, so an error doesn't push the button down. */}
      <div className="flex min-h-7 items-end pl-1 text-sm leading-tight font-semibold text-error">
        {shownError ? <p id={messageId}>{NAME_ERROR_MESSAGE[shownError]}</p> : null}
        {/* Always mounted, so screen readers announce a failure when its text appears. */}
        <p role="alert">{shownError ? null : failure}</p>
      </div>
      <button
        type="submit"
        className={`btn btn-lg btn-primary mt-3 w-full ${busy ? "btn-disabled" : ""}`}
        // aria-disabled rather than disabled: keeps focus on the button while busy.
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
      >
        {busy ? (
          <>
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            Checking…
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}

/** A message the person can't get past here, and the one way on. */
function Message({
  text,
  action,
  onAction,
}: {
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-lg leading-snug font-semibold">
        {text}
      </p>
      <button
        type="button"
        className="btn btn-lg w-full border-base-300 btn-outline"
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  );
}

/** The link was reset, is unknown, or its Club is gone (or there's no Backend to ask). */
function DeadEnd() {
  const [, navigate] = useLocation();
  return (
    <Message
      text="This Join link doesn't work any more. Ask an Organizer for a new one."
      action="Go to Home"
      onAction={() => navigate("/", { replace: true })}
    />
  );
}
