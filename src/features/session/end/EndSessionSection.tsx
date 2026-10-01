import { useState } from "react";
import { useLocation } from "wouter";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { endSession } from "../../../domain/engine/index.ts";
import { getSession, setSession, setSummary } from "../../../storage/store.ts";
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
    const current = getSession();
    if (!current) return;
    const { summary } = endSession(current, { now: Date.now(), rng: Math.random });
    // All three updates land in one render, so the summary route wins over
    // SessionScreen's "no Session" redirect.
    setSummary(summary);
    setSession(null);
    navigate("/session/summary");
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
