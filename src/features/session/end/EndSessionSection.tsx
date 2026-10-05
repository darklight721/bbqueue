import { useState } from "react";
import { useLocation } from "wouter";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { endSession } from "../../../domain/engine/index.ts";
import { endSharedSession } from "../../../backend/sessions.ts";
import { addEndedSession, findActiveSession, setSession } from "../../../storage/store.ts";
import { useSessionView } from "../context.ts";

/** "1 match in progress will…", "3 matches in progress will…" */
function inProgressMessage(active: number): string | undefined {
  if (active === 0) return undefined;
  return `${active} ${active === 1 ? "match" : "matches"} in progress will be ended without a score.`;
}

/** Deliberately quiet and last on the page: ends the night and shows the summary. */
export function EndSessionSection() {
  const { session } = useSessionView();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const active = session.matches.filter((match) => match.status === "active").length;

  function end() {
    setConfirming(false);
    const entry = findActiveSession(session.id);
    if (!entry) return;
    const ended = endSession(entry.session, { now: Date.now(), rng: Math.random });
    // Everything lands in one render, so the new route wins over SessionScreen's
    // "no Session" redirect. A Session without Ended matches is not kept. The Ended session stays
    // on this device; publishing it to a Shared club comes with ticket 09.
    if (ended) addEndedSession(ended);
    if (entry.shared) endSharedSession(entry.shared.clubId);
    else setSession(null);
    navigate(ended ? `/sessions/${ended.id}/summary` : "/");
  }

  return (
    <section
      aria-label="End session"
      className="mt-6 flex flex-col items-center gap-3 border-t-[1.5px] border-base-300 pt-8"
    >
      <p className="max-w-sm text-center text-sm text-base-content/65">
        Finished for the night? Ending the session shows a summary and clears the courts.
      </p>
      <button
        type="button"
        className="btn btn-lg btn-outline btn-error w-full max-w-sm"
        onClick={() => setConfirming(true)}
      >
        End session
      </button>

      <ConfirmDialog
        open={confirming}
        title="End session?"
        message={inProgressMessage(active)}
        confirmLabel="End session"
        tone="danger"
        onConfirm={end}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
