import { useId, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { deleteMyAccount } from "../../backend/clubs.ts";
import { BackendError } from "../../backend/backend.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { CheckIcon, LinkIcon, PlayIcon, TrashIcon } from "../../components/icons.tsx";
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
 * "Delete Account", at the end of Account settings. Blocked, with the Clubs named, while
 * this Account is the only Organizer of a Shared club that has other people. Otherwise one dialog
 * lists the Shared clubs that will be deleted (with their Ended sessions) and the ones this Account
 * will be unlinked from. Needs a connection.
 */
export function DeleteAccount({ account }: { account: Account }) {
  const clubs = useClubs();
  const endedSessions = useEndedSessions();
  const sharedSessions = useSharedSessions();
  const online = useOnline();
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
        // Red only when it can be used, like Delete club; daisyUI's disabled grey shows otherwise.
        className={`btn w-full btn-ghost ${disabled ? "" : "text-error"}`}
        disabled={disabled}
        aria-describedby={disabled || problem ? noteId : undefined}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon className="size-5" />
        Delete Account
      </button>
      {blocked ? (
        <div
          id={noteId}
          className="flex flex-col gap-2 rounded-box bg-base-200 px-4 py-3 text-sm text-base-content/75"
        >
          <p>You're the only Organizer of:</p>
          <ul className="flex flex-wrap gap-1.5">
            {plan.blocked.map((club) => (
              <li
                key={club.id}
                className="rounded-full border-[1.5px] border-base-300 bg-base-100 px-2.5 py-0.5 font-semibold text-base-content"
              >
                {club.name}
              </li>
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
        description="This can't be undone, and your Account ID can't be used again."
        onClose={() => (busy ? undefined : setConfirming(false))}
      >
        {/* Long lists scroll here, so Cancel and Delete always stay on screen. */}
        <div className="-mx-6 flex max-h-[45dvh] flex-col gap-5 overflow-y-auto border-y border-base-300 px-6 py-4">
          {plan.deleteClubs.length > 0 ? (
            <PlanSection
              tone="danger"
              icon={<TrashIcon className="size-4" />}
              title="Shared clubs that will be deleted"
            >
              <PlanList>
                {plan.deleteClubs.map(({ club, endedCount }) => (
                  <li key={club.id} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{club.name}</span>
                    <span className="shrink-0 text-sm text-base-content/65">
                      {endedCount > 0
                        ? countLabel(endedCount, "past session", "past sessions")
                        : "No past sessions"}
                    </span>
                  </li>
                ))}
              </PlanList>
            </PlanSection>
          ) : null}
          {plan.unlinkClubs.length > 0 ? (
            <PlanSection
              icon={<LinkIcon className="size-4" />}
              title="Clubs you'll be unlinked from"
              note="Your row stays on their rosters as a plain player."
            >
              <PlanList>
                {plan.unlinkClubs.map((club) => (
                  <li key={club.id} className="truncate px-3 py-2 font-semibold">
                    {club.name}
                  </li>
                ))}
              </PlanList>
            </PlanSection>
          ) : null}
          {plan.hostedClubs.length > 0 ? (
            <PlanSection
              icon={<PlayIcon className="size-4" />}
              title="Sessions you host"
              note="They stay for another Organizer to take over. This device keeps a copy if it has no session of its own."
            >
              <PlanList>
                {plan.hostedClubs.map((club) => (
                  <li key={club.id} className="truncate px-3 py-2 font-semibold">
                    {club.name}
                  </li>
                ))}
              </PlanList>
            </PlanSection>
          ) : null}
          {plan.deleteClubs.length === 0 && plan.unlinkClubs.length === 0 ? (
            <p className="text-base-content/80">No shared clubs are affected.</p>
          ) : null}
          <p className="flex items-center gap-2 text-sm text-base-content/80">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"
            >
              <CheckIcon className="size-4" />
            </span>
            Your local clubs and the sessions on this device stay.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 pb-2">
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
            aria-busy={busy || undefined}
            onClick={() => void run()}
          >
            {busy ? (
              <>
                <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete Account"
            )}
          </button>
        </div>
      </Modal>
    </section>
  );
}

/** One part of the plan: a small labelled heading, its list, and an optional line under it. */
function PlanSection({
  tone = "plain",
  icon,
  title,
  note,
  children,
}: {
  tone?: "danger" | "plain";
  icon: ReactNode;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  const iconTone =
    tone === "danger" ? "bg-error/12 text-error" : "bg-base-200 text-base-content/70";
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-bold">
        <span
          aria-hidden="true"
          className={`grid size-6 shrink-0 place-items-center rounded-full ${iconTone}`}
        >
          {icon}
        </span>
        {title}
      </h3>
      {children}
      {note ? <p className="text-sm text-base-content/65">{note}</p> : null}
    </section>
  );
}

function PlanList({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-base-300 rounded-box border-[1.5px] border-base-300 bg-base-100">
      {children}
    </ul>
  );
}
