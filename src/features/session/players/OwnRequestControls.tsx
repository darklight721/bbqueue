import { useState } from "react";
import { BackendError } from "../../../backend/backend.ts";
import { useBackendOnline } from "../../../backend/clubs.ts";
import { requestSessionChange } from "../../../backend/sessions.ts";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import type { SessionPlayer, SessionRequestKind } from "../../../domain/types.ts";
import { useRequests } from "../../../storage/store.ts";
import { useSessionActions, useSessionView } from "../context.ts";

function requestError(error: unknown): string {
  switch (error instanceof BackendError ? error.code : null) {
    case "offline":
      return "You're offline. Asking the host needs a connection.";
    case "not-found":
      return "This session has ended.";
    default:
      return "Couldn't send that to the host. Please try again.";
  }
}

/**
 * What a Player can do for their own Session player while watching (ADR-0007): ask the host to
 * switch their Sitting out, or to let them leave. A request waits ("Waiting for host") until the
 * host's device applies or skips it; only one waits at a time.
 */
export function OwnRequestControls({ player }: { player: SessionPlayer }) {
  const { session, sharedClubId } = useSessionView();
  const actions = useSessionActions();
  const online = useBackendOnline();
  const requests = useRequests(sharedClubId).filter(
    (request) => request.sessionId === session.id && request.sessionPlayerId === player.id,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sending, setSending] = useState(false);
  if (!sharedClubId) return null;

  const waiting = sending || requests.some((request) => request.status === "pending");
  const last = requests.at(-1);
  const notApplied = !waiting && last?.status === "skipped";
  const offline = online === false;

  async function send(kind: SessionRequestKind) {
    setSending(true);
    try {
      await requestSessionChange(sharedClubId!, {
        sessionId: session.id,
        sessionPlayerId: player.id,
        kind,
      });
    } catch (error) {
      console.error("Failed to send the request", error);
      actions.notify(requestError(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      {waiting ? (
        <span className="rounded-full border-[1.5px] border-dashed border-base-content/35 px-2 py-px text-xs font-semibold whitespace-nowrap text-base-content/75">
          Waiting for host
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`btn px-2 ${player.sittingOut ? "btn-primary" : "btn-outline border-base-300"}`}
            aria-label={player.sittingOut ? "Ask to be back in" : "Ask to sit out"}
            disabled={offline}
            title={offline ? "Needs a connection" : undefined}
            onClick={() => void send(player.sittingOut ? "back-in" : "sit-out")}
          >
            {player.sittingOut ? "Back in" : "Sit out"}
          </button>
          <button
            type="button"
            className="btn px-2 btn-ghost text-base-content/70 hover:text-error"
            aria-label="Leave this session"
            disabled={offline}
            title={offline ? "Needs a connection" : undefined}
            onClick={() => setConfirmLeave(true)}
          >
            Leave
          </button>
        </div>
      )}
      {notApplied ? (
        <span className="text-xs text-base-content/60">Your last request wasn't needed.</span>
      ) : null}
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this session?"
        message="You won't be picked for matches. Only an Organizer can add you back."
        confirmLabel="Leave"
        tone="danger"
        onConfirm={() => {
          setConfirmLeave(false);
          void send("leave");
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
