import { useEffect, useId, useRef, useState } from "react";
import type { Backend } from "../../backend/backend.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { RefreshIcon, ShareIcon } from "../../components/icons.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import type { Club } from "../../domain/types.ts";
import { joinLinkUrl } from "../join/joinPaths.ts";
import { clubErrorMessage } from "./clubErrors.ts";

/** How long "Link copied" stays up. */
const COPIED_FOR_MS = 4000;

const errorName = (error: unknown) => (error as { name?: unknown } | null)?.name;

/**
 * The Join link card on the Club page, for Organizers of a Shared club (ADR-0010). Share link
 * opens the share sheet with the Join link, or copies it where there is none. The first Share
 * makes the link, which needs a connection; after that the link is on the Club, so Share works
 * offline. Reset link makes a new one, and the old one stops working at once.
 */
export function JoinLinkCard({
  club,
  backend,
  online,
}: {
  club: Club;
  backend: Backend;
  online: boolean;
}) {
  const headingId = useId();
  const reasonId = useId();
  const [sharing, setSharing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasLink = !!club.joinToken;
  // The first Share makes the link on the server.
  const shareBlocked = !hasLink && !online;

  useEffect(() => () => clearTimeout(timer.current), []);

  function say(text: string) {
    clearTimeout(timer.current);
    setStatus(text);
    timer.current = setTimeout(() => setStatus(""), COPIED_FOR_MS);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied");
    } catch (error) {
      console.warn("Couldn't copy the Join link", error);
      setProblem("Couldn't copy the link. Try again.");
    }
  }

  async function share() {
    if (sharing) return;
    setProblem(null);
    setStatus("");
    let token = club.joinToken;
    if (!token) {
      setSharing(true);
      try {
        token = await backend.getJoinLink(club.id);
      } catch (error) {
        console.error("Failed to make the Join link", error);
        setProblem(clubErrorMessage(error));
        return;
      } finally {
        setSharing(false);
      }
    }
    const url = joinLinkUrl(token);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        // Closed without sharing.
        if (errorName(error) === "AbortError") return;
        // Waiting for the server used up the tap, so the sheet was refused: copy instead.
        if (errorName(error) !== "NotAllowedError") {
          console.warn("Couldn't share the Join link", error);
          setProblem("Couldn't share the link. Try again.");
          return;
        }
      }
    }
    await copy(url);
  }

  async function reset() {
    if (resetting) return;
    setResetting(true);
    setProblem(null);
    try {
      await backend.resetJoinLink(club.id);
      say("The old link no longer works.");
    } catch (error) {
      console.error("Failed to reset the Join link", error);
      setProblem(clubErrorMessage(error));
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-box border-[1.5px] border-base-300 bg-base-200/50 p-4"
    >
      <h2 id={headingId} className="font-display text-xl leading-none uppercase">
        Join link
      </h2>
      <p className="text-sm text-base-content/70">
        Anyone with this link can link their Account to an unlinked player and see the club.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn w-full border-base-300 bg-base-100 btn-outline sm:w-auto"
          disabled={shareBlocked}
          aria-busy={sharing || undefined}
          aria-describedby={shareBlocked ? reasonId : undefined}
          onClick={() => void share()}
        >
          {sharing ? (
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
          ) : (
            <ShareIcon className="size-5" />
          )}
          Share link
        </button>
        {hasLink ? (
          <button
            type="button"
            className="btn w-full btn-ghost sm:w-auto"
            disabled={!online}
            aria-describedby={!online ? reasonId : undefined}
            onClick={() => setConfirmReset(true)}
          >
            <RefreshIcon className="size-5" />
            Reset link
          </button>
        ) : null}
      </div>
      {!online ? (
        <OfflineNote id={reasonId}>
          {hasLink
            ? "You're offline. Resetting the link needs a connection."
            : "You're offline. Making the link needs a connection."}
        </OfflineNote>
      ) : null}
      {/* Always mounted, so screen readers announce what appears. */}
      <p role="status" className="text-sm font-semibold text-base-content/80 empty:hidden">
        {status}
      </p>
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-error">
          {problem}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        title="Reset the Join link?"
        message="The old link stops working. People already linked stay linked."
        confirmLabel="Reset link"
        busy={resetting}
        busyLabel="Resetting…"
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
    </section>
  );
}
