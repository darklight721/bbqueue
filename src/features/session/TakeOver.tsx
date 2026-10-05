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
 */
export function TakeOver({ clubId, hostName }: { clubId: string; hostName: string }) {
  const online = useBackendOnline();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
    <div className="mt-1.5 flex flex-col items-start gap-1.5">
      <button
        type="button"
        className="btn btn-sm border-base-300 bg-base-100 btn-outline"
        disabled={online === false || busy}
        onClick={() => setConfirming(true)}
      >
        Take over
      </button>
      {online === false ? <OfflineNote>Taking over needs a connection.</OfflineNote> : null}
      {problem ? (
        <p role="alert" className="text-sm font-semibold text-error">
          {problem}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Take over as host?"
        message={`Changes ${hostName} made but never uploaded will be lost, and ${hostName}'s device turns read-only.`}
        confirmLabel="Take over"
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
