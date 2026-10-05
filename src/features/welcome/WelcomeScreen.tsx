import { useId, type CSSProperties } from "react";
import type { Backend } from "../../backend/backend.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import { setWelcomeDone } from "../../storage/store.ts";
import { CreateAccountForm } from "../account/CreateAccountForm.tsx";
import { OfflineNotice } from "../account/OfflineNotice.tsx";
import { CourtLines } from "../home/CourtLines.tsx";

/**
 * First launch: create an Account by entering a name, or skip. Either way the Welcome screen
 * is done and never comes back. Offline, an Account can't be created, but the person can still
 * continue without one.
 *
 * Same court-green hero as Home, so finishing here flows straight into Home. The form sits on a
 * sheet at the bottom, within thumb reach; it is a real `<form>`, so Return / Go submits.
 */
export function WelcomeScreen({ backend }: { backend: Backend }) {
  const online = useOnline(backend);

  return (
    <div className="flex min-h-dvh flex-col">
      <Hero />
      <main className="px-safe relative z-10 -mt-6 rounded-t-[1.75rem] bg-base-100 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.35)]">
        <div className="animate-rise mx-auto w-full max-w-md" style={delayStyle(3)}>
          {online ? <WelcomeForm backend={backend} /> : <WelcomeOffline />}
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

function WelcomeForm({ backend }: { backend: Backend }) {
  const skipNoteId = useId();
  return (
    <CreateAccountForm
      backend={backend}
      submitLabel="Continue"
      offlineMessage="You're offline. Connect and try again, or skip for now."
      onCreated={setWelcomeDone}
    >
      {(creating) => (
        <>
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
        </>
      )}
    </CreateAccountForm>
  );
}

function WelcomeOffline() {
  return (
    <div className="flex flex-col gap-5">
      <OfflineNotice>
        An Account needs a connection. You can continue without one and add your name later.
      </OfflineNotice>
      <button type="button" className="btn btn-lg btn-primary w-full" onClick={setWelcomeDone}>
        Continue without an Account
      </button>
    </div>
  );
}

function delayStyle(step: number): CSSProperties {
  return { animationDelay: `${step * 70}ms` };
}
