import { useMemo, useState } from "react";
import { AddPlayerForm, type NewPlayer } from "../../../components/AddPlayerForm.tsx";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { CloseIcon } from "../../../components/icons.tsx";
import { addPlayer, removePlayer, setSittingOut } from "../../../domain/engine/index.ts";
import { newId } from "../../../domain/ids.ts";
import type { ClubPlayer, SessionPlayer } from "../../../domain/types.ts";
import { namesEqual, normalizeName } from "../../../domain/validation.ts";
import { getClubs, setClubs } from "../../../storage/store.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { SessionPlayerChip } from "../PlayerViews.tsx";
import { messageForReason } from "../reasons.ts";
import { SectionHeader } from "../SectionHeader.tsx";
import { activePlayersByName, playerStatus, playersSummary } from "./playerStatus.ts";
import { STATUS_TONE_CLASS } from "./statusTone.ts";

const PLAYERS_HEADING_ID = "session-players";

/** Every Session player: status, Sit out / Back in, Remove, and adding late arrivals. */
export function PlayersSection() {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const players = useMemo(() => activePlayersByName(session.players), [session.players]);
  const [removing, setRemoving] = useState<SessionPlayer | null>(null);

  return (
    <section aria-labelledby={PLAYERS_HEADING_ID} className="flex flex-col gap-4">
      <SectionHeader id={PLAYERS_HEADING_ID} title="Players" detail={playersSummary(players)} />

      <AddSessionPlayer />

      {players.length > 0 ? (
        <ul className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100 md:grid md:grid-cols-2 md:gap-x-0">
          {players.map((player) => (
            <PlayerRow key={player.id} player={player} onRemove={() => setRemoving(player)} />
          ))}
        </ul>
      ) : (
        <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
          No players in this session.
        </p>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ""} from this session?`}
        message="Their matches so far still count."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) actions.run((s, ctx) => removePlayer(s, target.id, ctx));
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

function PlayerRow({ player, onRemove }: { player: SessionPlayer; onRemove: () => void }) {
  const { stats } = useSessionView();
  const actions = useSessionActions();
  const status = playerStatus(player, stats.get(player.id));
  const onCourt = status.tone === "on-court";

  return (
    <li className="flex min-h-16 items-center gap-2 border-b border-base-300 py-2 pr-2 pl-4 last:border-b-0 md:odd:border-r">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={player.sittingOut && !onCourt ? "opacity-55" : ""}>
          <SessionPlayerChip playerId={player.id} layout="inline" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full border-[1.5px] px-2 py-px text-xs font-semibold whitespace-nowrap ${STATUS_TONE_CLASS[status.tone]}`}
          >
            {status.label}
          </span>
          {status.note ? (
            <span className="rounded-full border-[1.5px] border-dashed border-base-content/35 px-2 py-px text-xs font-semibold whitespace-nowrap text-base-content/75">
              {status.note}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={`btn min-w-[6.5rem] shrink-0 ${
          player.sittingOut ? "btn-primary" : "btn-outline border-base-300"
        }`}
        aria-label={`${player.sittingOut ? "Back in" : "Sit out"} ${player.name}`}
        onClick={() =>
          actions.run((s, ctx) => setSittingOut(s, player.id, !player.sittingOut, ctx))
        }
      >
        {player.sittingOut ? "Back in" : "Sit out"}
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-square shrink-0 ${
          onCourt ? "text-base-content/30 pointer-events-auto!" : "text-base-content/70 hover:text-error"
        }`}
        aria-label={`Remove ${player.name}`}
        aria-disabled={onCourt ? true : undefined}
        title={onCourt ? messageForReason("player-in-active-match") : undefined}
        onClick={() => {
          if (onCourt) actions.notify(messageForReason("player-in-active-match"));
          else onRemove();
        }}
      >
        <CloseIcon className="size-6" />
      </button>
    </li>
  );
}

function AddSessionPlayer() {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const activeNames = useMemo(
    () => session.players.filter((player) => !player.removed).map((player) => player.name),
    [session.players],
  );

  function add({ name, skill, saveToClub }: NewPlayer) {
    const returning = session.players.some(
      (player) => player.removed && namesEqual(player.name, name),
    );

    // Work out the Club roster change first, but only save it once the player is in.
    const clubs = getClubs();
    const club = saveToClub && session.clubId ? clubs.find((c) => c.id === session.clubId) : null;
    let clubPlayerId: string | null = null;
    let added: ClubPlayer | null = null;
    if (club) {
      const existing = club.players.find((player) => namesEqual(player.name, name));
      if (existing) clubPlayerId = existing.id;
      else {
        added = { id: newId(), name: normalizeName(name), skill };
        clubPlayerId = added.id;
      }
    }

    const ok = actions.run((s, ctx) =>
      addPlayer(s, { name, skill, clubPlayerId: clubPlayerId ?? undefined }, ctx),
    );
    if (!ok) return;
    if (club && added) {
      const newPlayer = added;
      setClubs(
        clubs.map((c) => (c.id === club.id ? { ...c, players: [...c.players, newPlayer] } : c)),
      );
    }
    if (returning) actions.notify(`Welcome back, ${normalizeName(name)}`);
  }

  return (
    <div className="rounded-box bg-base-200 p-4">
      <AddPlayerForm
        existingNames={activeNames}
        onAdd={add}
        showSaveToClub={session.clubId !== null}
        addLabel="Add player"
      />
    </div>
  );
}
