import { useId, useState } from "react";
import { BackendError } from "../../../backend/backend.ts";

import { requestSessionChange } from "../../../backend/sessions.ts";
import { useOnline } from "../../../backend/useOnline.ts";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { OfflineNote } from "../../../components/OfflineNote.tsx";
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

/** What the waiting line says the host was asked for. */
function waitingDetail(kind: SessionRequestKind | null, onCourt: boolean): string | null {
  switch (kind) {
    case "sit-out":
      return "You asked to sit out.";
    case "back-in":
      return "You asked to be back in.";
    case "leave":
      // The engine can't take a player out mid-match: the host applies it afterwards.
      return onCourt ? "You'll leave when this match ends." : "You asked to leave.";
    default:
      return null;
  }
}

/**
 * What a Player can do for their own Session player while watching (ADR-0007): ask the host to
 * switch their Sitting out, or to let them leave. A request waits ("Waiting for host") until the
 * host's device applies or skips it; only one waits at a time. Sits under the row's name and
 * status, full width, so the labels can say what they do.
 */
export function OwnRequestControls({
  player,
  onCourt,
}: {
  player: SessionPlayer;
  /** In a Match right now: a leave waits until the Match ends. */
  onCourt: boolean;
}) {
  const { session, sharedClubId } = useSessionView();
  const actions = useSessionActions();
  const online = useOnline();
  const requests = useRequests(sharedClubId).filter(
    (request) => request.sessionId === session.id && request.sessionPlayerId === player.id,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sending, setSending] = useState<SessionRequestKind | null>(null);
  const offlineId = useId();
  if (!sharedClubId) return null;

  const pending = requests.find((request) => request.status === "pending") ?? null;
  const waiting = sending !== null || pending !== null;
  const last = requests.at(-1);
  const notApplied = !waiting && last?.status === "skipped";
  const offline = online === false;

  async function send(kind: SessionRequestKind) {
    setSending(kind);
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
      setSending(null);
    }
  }

  if (waiting) {
    const detail = waitingDetail(pending?.kind ?? sending, onCourt);
    return (
      <div className="flex items-center gap-2.5 rounded-field border-[1.5px] border-base-300 bg-base-100 px-3 py-2">
        <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-70 motion-reduce:hidden" />
          <span className="relative inline-flex size-2.5 rounded-full bg-warning" />
        </span>
        <p className="flex min-w-0 flex-col text-sm leading-snug" role="status">
          <span className="font-semibold">Waiting for host</span>
          {detail ? <span className="text-base-content/65">{detail}</span> : null}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`btn px-2 ${player.sittingOut ? "btn-primary" : "btn-outline border-base-300 bg-base-100"}`}
          disabled={offline}
          title={offline ? "Needs a connection" : undefined}
          aria-describedby={offline ? offlineId : undefined}
          onClick={() => void send(player.sittingOut ? "back-in" : "sit-out")}
        >
          {player.sittingOut ? "Ask to be back in" : "Ask to sit out"}
        </button>
        <button
          type="button"
          className="btn px-2 btn-ghost text-error"
          disabled={offline}
          title={offline ? "Needs a connection" : undefined}
          aria-describedby={offline ? offlineId : undefined}
          onClick={() => setConfirmLeave(true)}
        >
          Leave this session
        </button>
      </div>
      {offline ? (
        <OfflineNote id={offlineId}>Asking the host needs a connection.</OfflineNote>
      ) : notApplied ? (
        <p className="text-sm text-base-content/60">Your last request wasn't needed.</p>
      ) : null}
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this session?"
        message={
          onCourt
            ? "You'll leave when this match ends and won't be picked again. Only an Organizer can add you back."
            : "You won't be picked for matches. Only an Organizer can add you back."
        }
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
