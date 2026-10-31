import { useId, useState } from "react";
import { BackendError } from "../../../backend/backend.ts";
import { saveClubs } from "../../../backend/clubs.ts";
import { Modal } from "../../../components/Modal.tsx";
import { setSkill } from "../../../domain/engine/index.ts";
import {
  SKILL_LABEL,
  SKILL_LEVELS,
  type SessionPlayer,
  type SkillLevel,
} from "../../../domain/types.ts";
import { getClubs, useClubs } from "../../../storage/store.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { messageForReason } from "../reasons.ts";
import { playerStatus } from "./playerStatus.ts";

/**
 * One Session player's menu: change their Skill level (and, if chosen, the Club player's too),
 * or remove them from the Session. Open while `player` is set.
 */
export function PlayerMenuSheet({
  player,
  onClose,
  onRemove,
}: {
  player: SessionPlayer | null;
  onClose: () => void;
  /** Ask to remove the player (the menu closes first). */
  onRemove: (player: SessionPlayer) => void;
}) {
  const { stats } = useSessionView();
  const status = player ? playerStatus(player, stats.get(player.id)) : null;
  const played = player ? (stats.get(player.id)?.matchesPlayed ?? 0) : 0;
  return (
    <Modal
      open={player !== null}
      title={player?.name ?? ""}
      description={status ? `${status.label} · ${played} played` : undefined}
      onClose={onClose}
      // Focusing the first Skill level on open shows its focus ring on iOS, though nothing was typed.
      focusTitle
    >
      {player && status ? (
        <PlayerMenu
          key={player.id}
          player={player}
          onCourt={status.tone === "on-court"}
          onDone={onClose}
          onCancel={onClose}
          onRemove={() => onRemove(player)}
        />
      ) : null}
    </Modal>
  );
}

function PlayerMenu({
  player,
  onCourt,
  onDone,
  onCancel,
  onRemove,
}: {
  player: SessionPlayer;
  onCourt: boolean;
  onDone: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const clubs = useClubs();
  const club = session.clubId ? (clubs.find((c) => c.id === session.clubId) ?? null) : null;
  const onRoster =
    club !== null &&
    player.clubPlayerId !== null &&
    club.players.some((p) => p.id === player.clubPlayerId);
  const [skill, setSkillChoice] = useState<SkillLevel>(player.skill);
  const [alsoClub, setAlsoClub] = useState(false);
  // Nothing to copy to the Club until the Skill level changes.
  const changed = skill !== player.skill;
  const groupName = useId();
  const clubBoxId = useId();
  const blockedId = useId();

  function save() {
    if (!actions.run((s, ctx) => setSkill(s, player.id, skill, ctx))) return;
    onDone();
    if (club && onRoster && changed && alsoClub) updateClubPlayer(club.id, club.name);
  }

  function updateClubPlayer(clubId: string, clubName: string) {
    const allClubs = getClubs();
    const next = allClubs.map((c) =>
      c.id === clubId
        ? {
            ...c,
            players: c.players.map((p) => (p.id === player.clubPlayerId ? { ...p, skill } : p)),
          }
        : c,
    );
    saveClubs(allClubs, next).catch((error: unknown) => {
      // The Session has the new Skill level; only the Club's roster missed out.
      console.error("Failed to update the Club player's Skill level", error);
      actions.notify(
        error instanceof BackendError && error.code === "offline"
          ? `${player.name} wasn't updated in ${clubName}. You're offline.`
          : `${player.name} couldn't be updated in ${clubName}.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-2">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase">
          Skill level
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-base-200 p-1">
          {SKILL_LEVELS.map((level) => {
            const on = skill === level;
            return (
              <label
                key={level}
                className={`btn h-11 min-h-11 rounded-full border-0 px-0 text-[0.8125rem] min-[360px]:text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary ${
                  on ? "btn-primary" : "btn-ghost text-base-content/75"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={groupName}
                  value={level}
                  checked={on}
                  onChange={() => setSkillChoice(level)}
                />
                {SKILL_LABEL[level]}
              </label>
            );
          })}
        </div>
        {onRoster && club ? (
          <label
            htmlFor={clubBoxId}
            className="-ml-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-field pr-1 pl-2 has-[:disabled]:cursor-default has-[:disabled]:text-base-content/40"
          >
            <input
              id={clubBoxId}
              type="checkbox"
              className="checkbox shrink-0 checkbox-primary"
              checked={changed && alsoClub}
              disabled={!changed}
              onChange={(event) => setAlsoClub(event.target.checked)}
            />
            <span className="text-base">Also update in {club.name}</span>
          </label>
        ) : null}
        <p className="text-sm text-base-content/70">Counts from the next lineup.</p>
      </fieldset>

      <div className="flex flex-col gap-3">
        <button type="button" className="btn w-full btn-lg btn-primary" onClick={save}>
          Save
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={`btn btn-outline px-3 ${
              onCourt
                ? "border-base-300 text-base-content/40 pointer-events-auto!"
                : "border-error/50 text-error hover:border-error hover:bg-error/10"
            }`}
            aria-disabled={onCourt ? true : undefined}
            aria-describedby={onCourt ? blockedId : undefined}
            onClick={() => {
              if (!onCourt) onRemove();
            }}
          >
            Remove
          </button>
          <button type="button" className="btn border-base-300 btn-outline" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {onCourt ? (
          <p id={blockedId} className="text-sm text-base-content/70">
            On court. {messageForReason("player-in-active-match")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
