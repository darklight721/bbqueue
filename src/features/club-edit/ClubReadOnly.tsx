import { useId, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { leaveClub, useBackendOnline } from "../../backend/clubs.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { HistoryIcon, WarningIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import { ownRow } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";
import { useAccount, useEndedSessions } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { ClubCardLink } from "./ClubCardLink.tsx";
import { clubErrorMessage } from "./clubErrors.ts";
import { DangerZone, LEAVE_MESSAGE, LeaveClub } from "./LeaveClub.tsx";

/**
 * A Shared club as a Player sees it: a roster to read (not a form), with their own row marked
 * "You" and the Organizers named, and no Account IDs. They can leave, which takes the Club off
 * their list.
 */
export function ClubReadOnly({ club }: { club: Club }) {
  const [, navigate] = useLocation();
  const account = useAccount();
  const online = useBackendOnline();
  const sessionCount = useEndedSessions().filter((ended) => ended.clubId === club.id).length;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const headingId = useId();

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
      <div className="flex flex-col gap-8">
        {sessionCount > 0 ? (
          <nav aria-label="Club sessions">
            <ClubCardLink
              href={`/clubs/${encodeURIComponent(club.id)}/sessions`}
              tone="plain"
              icon={<HistoryIcon className="size-6" />}
              label="Sessions"
              detail={countLabel(sessionCount, "past session", "past sessions")}
            />
          </nav>
        ) : null}

        <section aria-labelledby={headingId} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={headingId} className="font-display text-2xl uppercase">
                Players
              </h2>
              <span className="text-sm font-semibold text-base-content/60 tabular-nums">
                {rows.length === 0 ? "None yet" : rows.length}
              </span>
            </div>
            <p className="text-sm text-base-content/65">Organizers look after this roster.</p>
          </div>
          {/* A read-only list, not greyed-out fields: one card, rows ruled off. */}
          <ul className="divide-y divide-base-300 overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100">
            {rows.map((row) => {
              const isMine = row.id === mine?.id;
              return (
                <li
                  key={row.id}
                  className={`relative flex min-h-14 items-center gap-3 py-2.5 pr-3 pl-4 ${
                    isMine ? "bg-primary/[0.07]" : ""
                  }`}
                >
                  {isMine ? (
                    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-lg leading-tight font-semibold">{row.name}</span>
                    {row.link?.role === "organizer" ? (
                      <span className="text-xs font-semibold tracking-wide text-base-content/55 uppercase">
                        Organizer
                      </span>
                    ) : null}
                  </span>
                  {isMine ? (
                    <span className="badge shrink-0 badge-sm badge-neutral font-semibold">You</span>
                  ) : null}
                  <SkillBadge skill={row.skill} />
                </li>
              );
            })}
          </ul>
        </section>

        {mine ? (
          <DangerZone>
            {problem ? (
              <p
                role="alert"
                className="flex items-start justify-center gap-1.5 text-center text-sm font-semibold text-error"
              >
                <WarningIcon className="mt-0.5 size-4 shrink-0" />
                <span>{problem}</span>
              </p>
            ) : null}
            <LeaveClub
              club={club}
              viewer={account?.accountId}
              online={online !== false}
              onLeave={() => setConfirmLeave(true)}
            />
          </DangerZone>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${club.name}?`}
        message={LEAVE_MESSAGE}
        confirmLabel="Leave club"
        tone="danger"
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
