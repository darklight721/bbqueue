import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { leaveClub, useBackendOnline } from "../../backend/clubs.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { Screen } from "../../components/Screen.tsx";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import type { Club } from "../../domain/types.ts";
import { useAccount, useEndedSessions } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { clubErrorMessage } from "./clubErrors.ts";
import { LeaveClub } from "./LeaveClub.tsx";
import { ownRow } from "../../domain/permissions.ts";
import { Link } from "wouter";

/**
 * A Shared club as a Player sees it: the roster to look at, "You" on their own row, no Account IDs
 * and nothing to edit. They can leave, which takes the Club off their list.
 */
export function ClubReadOnly({ club }: { club: Club }) {
  const [, navigate] = useLocation();
  const account = useAccount();
  const online = useBackendOnline();
  const sessionCount = useEndedSessions().filter((ended) => ended.clubId === club.id).length;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mine = ownRow(club, account?.accountId);
  const rows = useMemo(
    () =>
      [...club.players].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [club.players],
  );

  async function leave() {
    setConfirmLeave(false);
    try {
      await leaveClub(club);
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to leave Club", error);
      setProblem(clubErrorMessage(error));
    }
  }

  return (
    <Screen title={club.name} subtitle="You're a Player" backTo="/clubs">
      {sessionCount > 0 ? (
        <Link
          href={`/clubs/${encodeURIComponent(club.id)}/sessions`}
          className="btn btn-outline border-base-300"
        >
          Sessions · {countLabel(sessionCount, "past session", "past sessions")}
        </Link>
      ) : null}

      <section aria-label="Players" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl uppercase">Players</h2>
          <span className="text-sm font-semibold text-base-content/60 tabular-nums">
            {rows.length === 0 ? "None yet" : rows.length}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex min-h-14 items-center gap-3 rounded-box border-[1.5px] border-base-300 bg-base-100 px-4 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-lg font-semibold">{row.name}</span>
              {row.id === mine?.id ? (
                <span className="badge badge-sm badge-neutral font-semibold">You</span>
              ) : null}
              <SkillBadge skill={row.skill} />
            </li>
          ))}
        </ul>
      </section>

      {problem ? (
        <p role="alert" className="text-center text-sm font-semibold text-error">
          {problem}
        </p>
      ) : null}
      <LeaveClub
        club={club}
        viewer={account?.accountId}
        online={online !== false}
        onLeave={() => setConfirmLeave(true)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${club.name}?`}
        message="Your row stays on the roster, but it's no longer linked to your Account, and the Club leaves your list."
        confirmLabel="Leave club"
        tone="danger"
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
