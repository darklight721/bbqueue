import { useId, useState, useSyncExternalStore } from "react";
import type { Backend } from "../../backend/backend.ts";
import { BrandMark } from "../../components/BrandMark.tsx";
import { blurOnEnter } from "../../components/keyboard.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { validateName } from "../../domain/validation.ts";
import { setAccount, setWelcomeDone } from "../../storage/store.ts";

/**
 * First launch: create an Account by entering a name, or skip. Either way the Welcome screen
 * is done and never comes back. Offline, an Account can't be created, but the person can still
 * continue without one.
 */
export function WelcomeScreen({ backend }: { backend: Backend }) {
  const online = useSyncExternalStore(
    (listener) => backend.observeOnline(listener),
    () => backend.isOnline(),
  );
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameId = useId();
  const nameErrorId = useId();

  const nameError = validateName(name, []);
  const shownError = attempted ? nameError : null;

  async function create() {
    if (creating) return;
    if (nameError) {
      setAttempted(true);
      return;
    }
    setCreating(true);
    setFailed(false);
    try {
      setAccount(await backend.createAccount(name));
      setWelcomeDone();
    } catch (error) {
      console.error("Failed to create Account", error);
      setFailed(true);
      setCreating(false);
    }
  }

  return (
    <main className="px-safe pt-safe mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <BrandMark className="size-20" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl uppercase">Welcome to BBQueue</h1>
        <p className="text-base-content/75">
          Balanced badminton doubles for your club night. Add your name to create an Account, so
          other people can find you and add you to their Clubs. Or skip: the app works fine without
          one, and everything stays on this device.
        </p>
      </div>

      {online ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-sm font-semibold text-base-content/80">
              Your name
            </label>
            <input
              id={nameId}
              type="text"
              className={`input input-lg w-full font-semibold ${shownError ? "input-error" : ""}`}
              value={name}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              disabled={creating}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? nameErrorId : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={blurOnEnter}
            />
            {shownError ? (
              <p id={nameErrorId} className="pl-1 text-sm font-semibold text-error">
                {NAME_ERROR_MESSAGE[shownError]}
              </p>
            ) : null}
          </div>
          {failed ? (
            <p role="alert" className="text-sm font-semibold text-error">
              Couldn't create your Account. Check your connection and try again.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-lg btn-primary"
              disabled={creating}
              onClick={() => void create()}
            >
              Continue
            </button>
            <button
              type="button"
              className="btn btn-lg btn-ghost"
              disabled={creating}
              onClick={setWelcomeDone}
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-box bg-base-200 p-4 font-semibold">
            You're offline. An Account needs a connection, so you can't create one right now. You
            can continue without an Account.
          </p>
          <button type="button" className="btn btn-lg btn-primary" onClick={setWelcomeDone}>
            Continue without an Account
          </button>
        </div>
      )}
    </main>
  );
}
