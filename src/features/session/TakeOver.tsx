import { useState } from "react";
import { BackendError } from "../../backend/backend.ts";
import { useBackendOnline } from "../../backend/clubs.ts";
import { takeOverSession } from "../../backend/sessions.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";

function takeOverError(error: unknown): string {
  switch (error instanceof BackendError ? error.code : null) {
    case "offline":
      return "You're offline. Taking over needs a connection.";
    case "forbidden":
      return "Only Organizers can take over.";
    case "not-found":
      return "This session has ended.";
    default:
      return "Couldn't take over. Please try again.";
  }
}

/**
 * "Take over" for an Organizer who isn't the Session host (ADR-0007): a confirm dialog warns that
 * the host's changes that were never uploaded are lost, then this Account becomes the host.
 * Sits as a ruled-off footer of the watching strip: easy to find, small and outlined so it isn't
 * tapped by accident, and the dialog asks first.
 */
export function TakeOver({ clubId, hostName }: { clubId: string; hostName: string }) {
  const online = useBackendOnline();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offline = online === false;

  async function confirm() {
    setConfirming(false);
    setBusy(true);
    setProblem(null);
    try {
      await takeOverSession(clubId);
    } catch (error) {
      console.error("Failed to take over", error);
      setProblem(takeOverError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-base-content/10 pt-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          {offline ? (
            <OfflineNote>Taking over needs a connection.</OfflineNote>
          ) : (
            <p className="text-base-content/65">As an Organizer, you can run it instead.</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm h-9 shrink-0 border-base-300 bg-base-100 btn-outline"
          disabled={offline || busy}
          onClick={() => setConfirming(true)}
        >
          {busy ? "Taking over…" : "Take over"}
        </button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-error">
          {problem}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Take over as host?"
        message={`You'll run this session from this device. Changes ${hostName} hasn't uploaded are lost, and ${hostName}'s device switches to watching.`}
        confirmLabel="Take over"
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
