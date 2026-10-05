import { useId, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { deleteMyAccount, useBackendOnline } from "../../backend/clubs.ts";
import { BackendError } from "../../backend/backend.ts";
import { Modal } from "../../components/Modal.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { planAccountDeletion } from "../../domain/accountDeletion.ts";
import type { Account } from "../../domain/types.ts";
import { useClubs, useEndedSessions, useSharedSessions } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";

function deleteError(error: unknown): string {
  switch (error instanceof BackendError ? error.code : null) {
    case "offline":
      return "You're offline. Deleting your Account needs a connection.";
    case "last-organizer":
      return "You're the only Organizer of a club with other people. Make someone else an Organizer first.";
    case "forbidden":
      return "Somebody was added to one of the clubs that would be deleted. Check the list and try again.";
    default:
      return "Couldn't delete your Account. Nothing on this device changed. Try again.";
  }
}

/**
 * "Delete Account" (ticket 11), at the end of Account settings. Blocked, with the Clubs named, while
 * this Account is the only Organizer of a Shared club that has other people. Otherwise one dialog
 * lists the Shared clubs that will be deleted (with their Ended sessions) and the ones this Account
 * will be unlinked from. Needs a connection.
 */
export function DeleteAccount({ account }: { account: Account }) {
  const clubs = useClubs();
  const endedSessions = useEndedSessions();
  const sharedSessions = useSharedSessions();
  const online = useBackendOnline();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();

  const plan = useMemo(
    () =>
      planAccountDeletion({
        accountId: account.accountId,
        clubs,
        endedSessions,
        hostedClubIds: sharedSessions
          .filter((entry) => entry.hostAccountId.toLowerCase() === account.accountId.toLowerCase())
          .map((entry) => entry.clubId),
      }),
    [account.accountId, clubs, endedSessions, sharedSessions],
  );
  const blocked = plan.blocked.length > 0;
  const disabled = blocked || online === false || busy;

  async function run() {
    setBusy(true);
    setProblem(null);
    try {
      await deleteMyAccount(plan);
      setConfirming(false);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Failed to delete the Account", error);
      setConfirming(false);
      setProblem(deleteError(error));
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Delete Account"
      className="flex flex-col gap-2 border-t border-base-300 pt-6"
    >
      <button
        type="button"
        className={`btn w-full btn-ghost ${disabled ? "" : "text-error"}`}
        disabled={disabled}
        aria-describedby={disabled || problem ? noteId : undefined}
        onClick={() => setConfirming(true)}
      >
        Delete Account
      </button>
      {blocked ? (
        <div id={noteId} className="px-4 text-center text-sm text-base-content/75">
          <p>You're the only Organizer of:</p>
          <ul className="my-1 font-semibold">
            {plan.blocked.map((club) => (
              <li key={club.id}>{club.name}</li>
            ))}
          </ul>
          <p>Make someone else an Organizer first.</p>
        </div>
      ) : online === false ? (
        <OfflineNote id={noteId} className="justify-center px-4 text-center">
          You're offline. Deleting your Account needs a connection.
        </OfflineNote>
      ) : problem ? (
        <p id={noteId} role="alert" className="px-4 text-center text-sm font-semibold text-error">
          {problem}
        </p>
      ) : null}

      <Modal
        open={confirming}
        title="Delete your Account?"
        description="This removes your Account from the server. It can't be undone, and your Account ID can't be used again."
        onClose={() => (busy ? undefined : setConfirming(false))}
      >
        <div className="flex flex-col gap-4">
          {plan.deleteClubs.length > 0 ? (
            <div>
              <p className="font-semibold">These shared clubs will be deleted:</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.deleteClubs.map(({ club, endedCount }) => (
                  <li key={club.id}>
                    {club.name}
                    {endedCount > 0 ? (
                      <span className="text-base-content/70">
                        {" "}
                        and its {countLabel(endedCount, "past session", "past sessions")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.unlinkClubs.length > 0 ? (
            <div>
              <p className="font-semibold">You'll be unlinked from these clubs:</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.unlinkClubs.map((club) => (
                  <li key={club.id}>{club.name}</li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-base-content/70">
                Your row stays on their rosters as a plain player.
              </p>
            </div>
          ) : null}
          {plan.hostedClubs.length > 0 ? (
            <p className="text-sm text-base-content/70">
              You host the active session of {plan.hostedClubs.map((club) => club.name).join(", ")}.
              It stays for another Organizer to take over, and this device keeps a copy if it has no
              session of its own.
            </p>
          ) : null}
          {plan.deleteClubs.length === 0 && plan.unlinkClubs.length === 0 ? (
            <p>No shared clubs are affected.</p>
          ) : null}
          <p className="text-sm text-base-content/70">
            Your local clubs and the sessions on this device stay.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn btn-lg btn-outline border-base-300"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-lg btn-error"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? "Deleting…" : "Delete Account"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
