import { useId, type ReactNode } from "react";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { leaveClubProblem, ownRow } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";

/** What the Leave club confirm says happens. */
export const LEAVE_MESSAGE =
  "It goes from your Clubs list. Your row stays on the roster, unlinked from your Account.";

/**
 * "Leave club" for an Account that has a row on a Shared club, styled like Delete club; turned
 * off with the reason when it can't be done. Goes inside a `DangerZone`.
 */
export function LeaveClub({
  club,
  viewer,
  online,
  onLeave,
}: {
  club: Club;
  viewer: string | undefined;
  online: boolean;
  onLeave: () => void;
}) {
  const reasonId = useId();
  if (!ownRow(club, viewer)) return null;
  const lastOrganizer = leaveClubProblem(club, viewer) === "last-organizer";
  const blocked = lastOrganizer || !online;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        // Red only when it can be used; daisyUI's disabled grey shows otherwise.
        className={`btn w-full btn-ghost ${blocked ? "" : "text-error"}`}
        disabled={blocked}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={onLeave}
      >
        Leave club
      </button>
      {lastOrganizer ? (
        <p id={reasonId} className="px-4 text-center text-sm text-base-content/70">
          You're the only Organizer. Make someone else an Organizer before you leave.
        </p>
      ) : !online ? (
        <OfflineNote id={reasonId} className="justify-center px-4 text-center">
          You're offline. Leaving a Club needs a connection.
        </OfflineNote>
      ) : null}
    </div>
  );
}

/** The ruled-off end of the Club screen for actions that can't be taken back (Leave, Delete). */
export function DangerZone({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-t border-base-300 pt-6">{children}</div>;
}
