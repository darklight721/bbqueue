import { useId } from "react";
import { leaveClubProblem, ownRow } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";

/** "Leave club" for an Account that has a row on a Shared club; blocked with the reason when it can't. */
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
  const blocked = leaveClubProblem(club, viewer);
  const reason =
    blocked === "last-organizer"
      ? "You're the only Organizer. Make someone else an Organizer before you leave."
      : !online
        ? "You're offline. Leaving a Club needs a connection."
        : null;
  return (
    <div className="flex flex-col gap-2 border-t border-base-300 pt-6">
      <button
        type="button"
        className="btn btn-outline w-full"
        disabled={reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onClick={onLeave}
      >
        Leave club
      </button>
      {reason ? (
        <p id={reasonId} className="text-center text-sm text-base-content/70">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
