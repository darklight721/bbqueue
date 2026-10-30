import { useId, useState, type CSSProperties, type ReactNode } from "react";
import type { Backend } from "../../backend/backend.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { BrandMark, Wordmark } from "../../components/BrandMark.tsx";
import { Modal } from "../../components/Modal.tsx";
import { setWelcomeDone } from "../../storage/store.ts";
import { CreateAccountForm } from "../account/CreateAccountForm.tsx";
import {
  INSTALL_MESSAGE,
  useInstallHintKind,
  type InstallHintKind,
} from "../account/installHint.ts";
import { InstallSteps } from "../account/InstallSteps.tsx";
import { OfflineNotice } from "../account/OfflineNotice.tsx";
import { CourtLines } from "../home/CourtLines.tsx";

/**
 * First launch: create an Account by entering a name, or skip. Either way the Welcome screen
 * is done and never comes back. Offline, an Account can't be created, but the person can still
 * continue without one.
 *
 * Same court-green hero as Home, so finishing here flows straight into Home. The form sits on a
 * sheet at the bottom, within thumb reach; it is a real `<form>`, so Return / Go submits.
 *
 * In a phone's browser (iOS or Android, not installed) installing comes first: the hero carries
 * the install steps, and the sheet holds only a quieter "Continue in the browser anyway", which
 * opens the form in a bottom sheet. The reason differs: on iOS the installed app has its own
 * storage, so an Account made here would stay behind in the browser; on Android it shares the
 * browser's data, so installing only gives full screen and less risk of the data being cleared.
 */
export function WelcomeScreen({ backend }: { backend: Backend }) {
  const online = useOnline(backend);
  const installHint = useInstallHintKind();

  return (
    <div className="flex min-h-dvh flex-col">
      <Hero>{installHint ? <InstallFirst platform={installHint} /> : undefined}</Hero>
      <main className="px-safe relative z-10 -mt-6 rounded-t-[1.75rem] bg-base-100 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.35)]">
        <div className="animate-rise mx-auto w-full max-w-md" style={delayStyle(3)}>
          {installHint ? (
            <InBrowserAnyway platform={installHint} backend={backend} online={online} />
          ) : (
            <WelcomeWayOn backend={backend} online={online} />
          )}
        </div>
      </main>
    </div>
  );
}

/** The name form, or offline the way on without an Account. */
function WelcomeWayOn({ backend, online }: { backend: Backend; online: boolean }) {
  return online ? <WelcomeForm backend={backend} /> : <WelcomeOffline />;
}

/**
 * With the install steps on it the tagline makes way, so the steps and "Continue in the
 * browser anyway" fit on a phone's first screen.
 */
function Hero({ children }: { children?: ReactNode }) {
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
        {children ?? (
          <p
            className="animate-rise mt-3 max-w-[22rem] text-lg leading-snug font-medium text-line"
            style={delayStyle(2)}
          >
            Fair turns and balanced doubles for your badminton club night.
          </p>
        )}
      </div>
    </header>
  );
}

/** The main message, on the hero. Not dismissible; it goes with the Welcome screen. */
function InstallFirst({ platform }: { platform: InstallHintKind }) {
  const titleId = useId();
  const message = INSTALL_MESSAGE[platform];
  return (
    <section
      aria-labelledby={titleId}
      className="animate-rise relative mt-7 overflow-hidden rounded-[1.25rem] bg-court-deep/90 p-4 pt-5 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.7)] ring-1 ring-line/20 backdrop-blur-sm"
      style={delayStyle(2)}
    >
      {/* A volt service line along the top edge. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-volt" />
      <h2
        id={titleId}
        className="font-display text-[1.75rem] leading-[0.95] font-extrabold tracking-[-0.005em] uppercase"
      >
        {message.title}
      </h2>
      <p className="mt-2 leading-snug text-line/85">{message.body}</p>
      <div className="mt-4">
        <InstallSteps platform={platform} tone="court" />
      </div>
    </section>
  );
}

/**
 * What the sheet says under its title. Only iOS has something to warn about; on Android the
 * installed app shares the browser's data.
 */
const IN_BROWSER_NOTE: Record<InstallHintKind, string> = {
  ios: "What you set up here stays in this browser. The app on your Home Screen won't have it.",
  android: "You can still install the app later, from the browser's ⋮ menu.",
};

/**
 * The less prominent way on. A quieter button opens the name form (or, offline, the way on
 * without an Account) in a bottom sheet; closing the sheet goes back to the install steps.
 */
function InBrowserAnyway({
  platform,
  backend,
  online,
}: {
  platform: InstallHintKind;
  backend: Backend;
  online: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-lg w-full border-[1.5px] border-base-content/25 bg-base-100 text-base-content shadow-none hover:border-base-content/40 hover:bg-base-200"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Continue in the browser anyway
      </button>
      <Modal
        open={open}
        title="Continue in the browser"
        description={IN_BROWSER_NOTE[platform]}
        // Focus the title, not the name field: a keyboard opening by itself would cover the
        // sheet, and Skip for now with it.
        focusTitle
        closeLabel="Close"
        onClose={() => setOpen(false)}
      >
        <div className="pb-2">
          <WelcomeWayOn backend={backend} online={online} />
        </div>
      </Modal>
    </>
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
