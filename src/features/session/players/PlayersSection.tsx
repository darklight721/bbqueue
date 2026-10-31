import { useId, useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog.tsx";
import { ChevronDownIcon, MenuDotsIcon, PlusIcon } from "../../../components/icons.tsx";
import { removePlayer, setSittingOut } from "../../../domain/engine/index.ts";
import type { SessionPlayer } from "../../../domain/types.ts";
import { useAccount } from "../../../storage/store.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { isOwnWhileWatching } from "../ownPlayer.ts";
import { accountIdsEqual } from "../../../domain/accountId.ts";
import { SessionPlayerChip } from "../PlayerViews.tsx";
import { AddPlayersSheet } from "./AddPlayersSheet.tsx";
import { OwnRequestControls } from "./OwnRequestControls.tsx";
import { PlayerMenuSheet } from "./PlayerMenuSheet.tsx";
import { SectionHeader } from "../SectionHeader.tsx";
import {
  activePlayersByName,
  PLAYER_SORTS,
  playerStatus,
  playersSummary,
  sortPlayers,
  type PlayerSort,
} from "./playerStatus.ts";
import { loadPlayerSort, savePlayerSort } from "./sortPreference.ts";
import { STATUS_TONE_CLASS } from "./statusTone.ts";

const PLAYERS_HEADING_ID = "session-players";

/**
 * Every Session player: status, Sit out / Back in, a menu (Skill level, Remove), and adding late
 * arrivals (Club players and Guests).
 * Open by default; collapsed shows only the header. Pass `open` / `onOpenChange` to control it
 * from outside (the jump bar opens it before scrolling to it).
 */
export function PlayersSection({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const view = useSessionView();
  const { session, stats, readOnly } = view;
  const account = useAccount();
  const actions = useSessionActions();
  const [ownOpen, setOwnOpen] = useState(true);
  const open = openProp ?? ownOpen;
  const setOpen = (value: boolean) => {
    setOwnOpen(value);
    onOpenChange?.(value);
  };
  const [sort, setSort] = useState<PlayerSort>(loadPlayerSort);
  const bodyId = useId();
  const active = useMemo(() => activePlayersByName(session.players), [session.players]);
  const sorted = useMemo(() => sortPlayers(active, stats, sort), [active, stats, sort]);
  // Watching: the Player's own row goes first, so "me" is the first thing they find.
  const mineId = sorted.find((player) => isOwnWhileWatching(player, view, account))?.id ?? null;
  const players = mineId
    ? [...sorted.filter((player) => player.id === mineId), ...sorted.filter((p) => p.id !== mineId)]
    : sorted;
  const [removing, setRemoving] = useState<SessionPlayer | null>(null);
  const [adding, setAdding] = useState(false);
  // By id, so the menu shows the player as they are now.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuPlayer = menuFor ? (active.find((player) => player.id === menuFor) ?? null) : null;

  return (
    <section aria-labelledby={PLAYERS_HEADING_ID} className="flex flex-col gap-4">
      <SectionHeader
        id={PLAYERS_HEADING_ID}
        title="Players"
        detail={playersSummary(active)}
        action={
          <button
            type="button"
            className="btn shrink-0 btn-square border-base-300 btn-outline sm:w-auto sm:px-4"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
          >
            {/* Phones: just the chevron, so the player count next to the title has room. */}
            <span className="sr-only sm:not-sr-only">{open ? "Hide players" : "Show players"}</span>
            <ChevronDownIcon
              className={`size-6 transition-transform sm:size-5 ${open ? "rotate-180" : ""}`}
            />
          </button>
        }
      />

      {open ? (
        <div id={bodyId} className="flex flex-col gap-4">
          <LeftNotice />

          {players.length > 0 ? (
            <div className="flex flex-col gap-2">
              <SortControl
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  savePlayerSort(value);
                }}
              />
              <ul
                aria-label="Session players"
                className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100 md:grid md:grid-cols-2 md:gap-x-0"
              >
                {players.map((player) => (
                  <PlayerRow key={player.id} player={player} onMenu={() => setMenuFor(player.id)} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
              No players in this session.
            </p>
          )}

          {readOnly ? null : (
            <button
              type="button"
              className="btn btn-lg w-full border-[1.5px] border-dashed border-base-300 bg-transparent shadow-none"
              onClick={() => setAdding(true)}
            >
              <PlusIcon className="size-5" />
              Add players
            </button>
          )}
        </div>
      ) : null}

      <AddPlayersSheet open={adding} onClose={() => setAdding(false)} />
      <PlayerMenuSheet
        player={menuPlayer}
        onClose={() => setMenuFor(null)}
        onRemove={(player) => {
          setMenuFor(null);
          setRemoving(player);
        }}
      />

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

/** Shown to a Player who left: nothing to tap, an Organizer has to add them back. */
function LeftNotice() {
  const { session, readOnly, sharedClubId } = useSessionView();
  const account = useAccount();
  if (!readOnly || sharedClubId === null || !account) return null;
  const mine = session.players.filter(
    (player) => player.accountId && accountIdsEqual(player.accountId, account.accountId),
  );
  if (mine.length === 0 || mine.some((player) => !player.removed)) return null;
  return (
    <p className="rounded-box bg-base-200 px-4 py-3 text-sm font-semibold text-base-content/75">
      You left this session. An Organizer can add you back.
    </p>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: PlayerSort;
  onChange: (value: PlayerSort) => void;
}) {
  const groupName = useId();
  return (
    <fieldset className="flex items-center justify-between gap-3">
      <legend className="sr-only">Sort players</legend>
      <span
        aria-hidden="true"
        className="text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase"
      >
        Sort by
      </span>
      <div className="flex gap-1 rounded-full bg-base-200 p-1">
        {PLAYER_SORTS.map((option) => {
          const on = option.value === value;
          return (
            <label
              key={option.value}
              className={`btn h-10 min-h-10 rounded-full border-0 px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary min-[380px]:px-4 ${
                on ? "btn-secondary" : "btn-ghost text-base-content/70"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={groupName}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PlayerRow({ player, onMenu }: { player: SessionPlayer; onMenu: () => void }) {
  const view = useSessionView();
  const { stats, readOnly } = view;
  const actions = useSessionActions();
  const account = useAccount();
  // Watching a Shared club's Session: the Player's own Session player gets requests, not actions.
  const isMine = isOwnWhileWatching(player, view, account);
  const status = playerStatus(player, stats.get(player.id));
  const onCourt = status.tone === "on-court";

  return (
    <li
      className={`flex min-h-16 border-b border-base-300 py-2 pl-4 last:border-b-0 md:odd:border-r ${
        isMine
          ? "flex-col gap-2.5 bg-primary/6 py-3 shadow-[inset_4px_0_0_var(--color-primary)]"
          : "items-center gap-2"
      } ${readOnly ? "pr-4" : "pr-2"}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={player.sittingOut && !onCourt ? "opacity-55" : ""}>
          <SessionPlayerChip playerId={player.id} layout="inline" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isMine ? (
            <span className="rounded-full bg-primary px-2 py-px text-xs font-bold tracking-wider text-primary-content uppercase">
              You
            </span>
          ) : null}
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

      {isMine ? <OwnRequestControls player={player} onCourt={onCourt} /> : null}
      {readOnly ? null : (
        <>
          <button
            type="button"
            className={`btn w-[4.5rem] shrink-0 px-2 ${
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
            className="btn btn-square shrink-0 btn-ghost text-base-content/70"
            aria-label={`More for ${player.name}`}
            aria-haspopup="dialog"
            onClick={onMenu}
          >
            <MenuDotsIcon className="size-6" />
          </button>
        </>
      )}
    </li>
  );
}
