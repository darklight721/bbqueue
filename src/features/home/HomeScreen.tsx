import { useEffect, useId, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { getBackend } from "../../backend/index.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  HistoryIcon,
  PlayIcon,
  PlusIcon,
  UsersIcon,
} from "../../components/icons.tsx";
import { displayClubName } from "../../domain/clubName.ts";
import { isSessionHost } from "../../domain/permissions.ts";
import { setFlash, useFlash } from "../../storage/flash.ts";
import { useAccount, useActiveSessions, useClubs, useEndedSessions } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { CourtLines } from "./CourtLines.tsx";

/**
 * Start screen: every Active session this person can see (the device's own Session, and one per
 * Shared club they are on), start a new one, manage Clubs or look back.
 */
export function HomeScreen() {
  const entries = useActiveSessions();
  const account = useAccount();
  const clubs = useClubs();
  const endedCount = useEndedSessions().length;

  // The device's own Session (Local club or no Club): what New session would replace.
  const session = entries.find((entry) => !entry.shared)?.session ?? null;
  // Sessions this person runs come first and look like today's Resume card; ones somebody else
  // hosts are quieter cards under them.
  const hosted = entries.filter(
    (entry) => entry.shared && isSessionHost(entry.shared, account?.accountId),
  );
  const watched = entries.filter(
    (entry) => entry.shared && !isSessionHost(entry.shared, account?.accountId),
  );
  const clubCount = clubs.length;
  const step = 2 + entries.length;
  const clubOf = ({ clubId, clubName }: { clubId: string | null; clubName: string | null }) =>
    displayClubName(clubId, clubName, clubs);

  return (
    <div className="flex min-h-dvh flex-col">
      <Hero />

      <main className="px-safe relative z-10 mx-auto -mt-8 flex w-full max-w-2xl flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <FlashNotice />

        <nav aria-label="Main" className="flex flex-col gap-3">
          {session ? (
            <ResumeLink
              sessionId={session.id}
              name={session.name}
              meta={session.clubId ? clubOf(session) : null}
              delay={1}
            />
          ) : null}

          {hosted.map((entry, index) => (
            <ResumeLink
              key={entry.session.id}
              sessionId={entry.session.id}
              name={entry.session.name}
              meta={`${clubOf(entry.session)} · You're the host`}
              delay={(session ? 2 : 1) + index}
            />
          ))}

          {watched.map((entry, index) => (
            <WatchLink
              key={entry.session.id}
              sessionId={entry.session.id}
              name={entry.session.name}
              meta={`${clubOf(entry.session)} · Host: ${entry.shared!.hostName}`}
              delay={(session ? 2 : 1) + hosted.length + index}
            />
          ))}

          <ActionLink
            href="/sessions/new"
            tone={entries.length > 0 ? "plain" : "primary"}
            icon={<PlusIcon className="size-7" />}
            label="New session"
            detail={session ? "Replaces the current session" : "Pick players and courts"}
            delay={1 + entries.length}
          />

          <ActionLink
            href="/clubs"
            tone="plain"
            icon={<UsersIcon className="size-7" />}
            label="Clubs"
            detail={
              clubCount === 0
                ? "Save the people you play with"
                : `${clubCount} ${clubCount === 1 ? "club" : "clubs"}`
            }
            delay={step}
          />

          {endedCount > 0 ? (
            <ActionLink
              href="/sessions"
              tone="plain"
              icon={<HistoryIcon className="size-7" />}
              label="Past sessions"
              detail={countLabel(endedCount, "session", "sessions")}
              delay={step + 1}
            />
          ) : null}
        </nav>

        <p className="pt-6 text-center text-sm text-base-content/55">
          {account
            ? "Works offline. Shared clubs sync when you're online."
            : "Works offline. Everything stays on this device."}
        </p>
      </main>
    </div>
  );
}

function Hero() {
  // No Backend means no Accounts: no avatar, and Home looks exactly as it did before them.
  const hasBackend = getBackend() !== null;
  return (
    <header className="relative isolate flex flex-1 flex-col overflow-hidden bg-court text-line">
      {/* Hall-light glow + court lines bleeding off the edges. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 15% -10%, rgb(255 255 255 / 0.22), transparent 55%), linear-gradient(160deg, transparent 40%, var(--color-court-deep) 100%)",
        }}
      />
      <CourtLines className="absolute top-1/2 left-1/2 -z-10 w-[165%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-[58deg] sm:w-[120%] sm:-rotate-[20deg] text-line/30" />

      <div className="px-safe pt-safe mx-auto flex w-full max-w-2xl flex-1 flex-col">
        {hasBackend ? (
          <div className="flex justify-end pt-3">
            <AccountLink />
          </div>
        ) : null}
        <div
          className={`flex min-h-[17rem] flex-1 flex-col justify-end pb-16 ${hasBackend ? "pt-0" : "pt-10"}`}
        >
          <BrandMark
            className="animate-rise mb-4 size-18 drop-shadow-[0_6px_14px_rgb(0_0_0/0.18)] sm:mb-5 sm:size-24"
            style={{ animationDelay: "0ms" }}
          />
          <h1
            className="animate-rise font-display text-[clamp(4.5rem,25vw,10rem)] leading-[0.8] font-extrabold tracking-[-0.02em]"
            style={{ animationDelay: "60ms" }}
          >
            <Wordmark />
          </h1>
          <p
            className="animate-rise mt-3 text-lg font-medium text-line sm:text-xl"
            style={{ animationDelay: "140ms" }}
          >
            Balanced Badminton Queue.
          </p>
        </div>
      </div>
    </header>
  );
}

/** Top-right avatar: the Account's initials (or a person icon), opening Account settings. */
function AccountLink() {
  const account = useAccount();
  return (
    <Link
      href="/account"
      aria-label={account ? `Account settings, ${account.name}` : "Account settings, no Account"}
      className="animate-rise -mr-1 rounded-full p-1 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt active:scale-95"
      style={{ animationDelay: "100ms" }}
    >
      <Avatar name={account?.name ?? null} />
    </Link>
  );
}

/**
 * "Resume session": an Active session this device runs (its own, or a Shared club's it hosts).
 * The dark card with the volt play button, the strongest thing on Home.
 */
function ResumeLink({
  sessionId,
  name,
  meta,
  delay,
}: {
  sessionId: string;
  name: string;
  /** Second line: the Club and, for a Shared club, "You're the host". */
  meta: string | null;
  delay: number;
}) {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={`/sessions/${encodeURIComponent(sessionId)}`}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="animate-rise group flex min-h-24 items-center gap-4 rounded-box bg-neutral p-4 pr-3 text-neutral-content shadow-lg ring-1 ring-black/5 transition-transform active:scale-[0.98]"
      style={delayStyle(delay)}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-volt text-[#14201a]">
        <PlayIcon className="size-7 translate-x-0.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          Resume session
        </span>
        <SessionLines
          id={detailId}
          name={name}
          meta={meta}
          nameClass="text-base text-neutral-content/85"
          metaClass="text-sm text-neutral-content/60"
        />
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * "View session": a Shared club's Active session somebody else hosts. Quieter than Resume (a
 * light card, smaller title), with a live dot on the eye so it still reads as happening now.
 */
function WatchLink({
  sessionId,
  name,
  meta,
  delay,
}: {
  sessionId: string;
  name: string;
  meta: string;
  delay: number;
}) {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={`/sessions/${encodeURIComponent(sessionId)}`}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="animate-rise group flex min-h-20 items-center gap-4 rounded-box border-[1.5px] border-primary/30 bg-base-100 p-4 pr-3 text-base-content shadow-sm transition-transform active:scale-[0.98]"
      style={delayStyle(delay)}
    >
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <EyeIcon className="size-6" />
        <span aria-hidden="true" className="absolute top-0.5 right-0.5 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50 motion-reduce:hidden" />
          <span className="relative inline-flex size-3 rounded-full border-2 border-base-100 bg-primary" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          id={labelId}
          className="font-display text-xl leading-tight font-bold text-primary uppercase"
        >
          View session
        </span>
        <SessionLines
          id={detailId}
          name={name}
          meta={meta}
          nameClass="text-base font-semibold"
          metaClass="text-sm text-base-content/65"
        />
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * The Session's name, then the Club and host on a smaller line. The link's description is the
 * same as one line ("Thursday · Riverside · Host: Ana") from a hidden copy, so it reads well
 * aloud; the two visible lines are hidden from screen readers instead.
 */
function SessionLines({
  id,
  name,
  meta,
  nameClass,
  metaClass,
}: {
  id: string;
  name: string;
  meta: string | null;
  nameClass: string;
  metaClass: string;
}) {
  return (
    <>
      <span id={id} hidden>
        {meta ? `${name} · ${meta}` : name}
      </span>
      <span aria-hidden="true" className="flex min-w-0 flex-col">
        <span className={`truncate leading-snug ${nameClass}`}>{name}</span>
        {meta ? <span className={`truncate leading-snug ${metaClass}`}>{meta}</span> : null}
      </span>
    </>
  );
}

/**
 * A one-time message from another screen (a Session you had open ended). Outside the list so the
 * empty live region doesn't add a gap above the first card.
 */
function FlashNotice() {
  const message = useFlash();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <div role="status" aria-live="polite">
      {message ? (
        <div className="animate-rise mb-3 flex items-center gap-3 rounded-box border-[1.5px] border-base-300 bg-base-100 py-2 pr-2 pl-3 shadow-lg">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-base-200 text-base-content/70"
          >
            <CheckIcon className="size-5" />
          </span>
          <p className="min-w-0 flex-1 font-semibold">{message}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setFlash(null)}>
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ActionLinkProps {
  href: string;
  tone: "primary" | "plain";
  icon: ReactNode;
  label: string;
  detail: string;
  delay: number;
}

function ActionLink({ href, tone, icon, label, detail, delay }: ActionLinkProps) {
  const labelId = useId();
  const detailId = useId();
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className={`animate-rise group flex min-h-20 items-center gap-4 rounded-box p-4 pr-3 transition-transform active:scale-[0.98] ${
        primary
          ? "bg-primary text-primary-content shadow-lg"
          : "border-[1.5px] border-base-300 bg-base-100 text-base-content shadow-sm"
      }`}
      style={delayStyle(delay)}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-full ${
          primary ? "bg-black/15" : "bg-base-200 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          {label}
        </span>
        <span
          id={detailId}
          className={`truncate text-sm ${primary ? "text-primary-content/80" : "text-base-content/65"}`}
        >
          {detail}
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function delayStyle(step: number): CSSProperties {
  return { animationDelay: `${120 + step * 70}ms` };
}
