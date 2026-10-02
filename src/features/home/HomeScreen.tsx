import { useId, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ChevronRightIcon,
  HistoryIcon,
  PlayIcon,
  PlusIcon,
  UsersIcon,
} from "../../components/icons.tsx";
import { useClubs, useEndedSessions, useSession } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { BrandMark } from "./BrandMark.tsx";
import { CourtLines } from "./CourtLines.tsx";

/** Start screen: resume the current Session, start a new one, manage Clubs or look back. */
export function HomeScreen() {
  const session = useSession();
  const clubs = useClubs();
  const endedCount = useEndedSessions().length;

  const clubCount = clubs.length;
  const step = session ? 3 : 2;

  return (
    <div className="flex min-h-dvh flex-col">
      <Hero />

      <main className="px-safe relative z-10 mx-auto -mt-8 flex w-full max-w-2xl flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <nav aria-label="Main" className="flex flex-col gap-3">
          {session ? <ResumeLink sessionId={session.id} sessionName={session.name} /> : null}

          <ActionLink
            href="/sessions/new"
            tone={session ? "plain" : "primary"}
            icon={<PlusIcon className="size-7" />}
            label="New session"
            detail={session ? "Replaces the current session" : "Pick players and courts"}
            delay={session ? 2 : 1}
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
          Works offline. Everything stays on this device.
        </p>
      </main>
    </div>
  );
}

function Hero() {
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
        <div className="flex min-h-[17rem] flex-1 flex-col justify-end pt-10 pb-16">
          <BrandMark
            className="animate-rise mb-4 size-18 drop-shadow-[0_6px_14px_rgb(0_0_0/0.18)] sm:mb-5 sm:size-24"
            style={{ animationDelay: "0ms" }}
          />
          <h1
            className="animate-rise font-display text-[clamp(4.5rem,25vw,10rem)] leading-[0.8] font-extrabold tracking-[-0.02em]"
            style={{ animationDelay: "60ms" }}
          >
            <span className="text-volt">BBQ</span>
            <span className="text-line">ueue</span>
          </h1>
          <p
            className="animate-rise mt-3 text-lg font-medium text-line sm:text-xl"
            style={{ animationDelay: "140ms" }}
          >
            Better Badminton Queue.
          </p>
        </div>
      </div>
    </header>
  );
}

function ResumeLink({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={`/sessions/${sessionId}`}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="animate-rise group flex min-h-24 items-center gap-4 rounded-box bg-neutral p-4 pr-3 text-neutral-content shadow-lg ring-1 ring-black/5 transition-transform active:scale-[0.98]"
      style={delayStyle(1)}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-volt text-[#14201a]">
        <PlayIcon className="size-7 translate-x-0.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          Resume session
        </span>
        <span id={detailId} className="truncate text-base text-neutral-content/75">
          {sessionName}
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
    </Link>
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
