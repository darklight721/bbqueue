import { type RefObject, useId, useMemo, useRef, useState } from "react";
import { SearchIcon } from "../../../components/icons.tsx";
import { Modal } from "../../../components/Modal.tsx";
import { useSessionView } from "../context.ts";
import { SessionPlayerChip } from "../PlayerViews.tsx";
import { activePlayersByName, playerStatus } from "../players/playerStatus.ts";
import { STATUS_TONE_CLASS } from "../players/statusTone.ts";

export interface PlayerPickerProps {
  open: boolean;
  /** e.g. "Team A · spot 1" */
  title: string;
  /** Player ids not to offer (already in this Queue). */
  exclude: readonly string[];
  onPick: (playerId: string) => void;
  onClose: () => void;
}

/** Bottom sheet listing Session players (with status) to fill a Queue spot. */
export function PlayerPicker(props: PlayerPickerProps) {
  // Focus the sheet itself, not the filter, so the phone keyboard doesn't cover the list.
  const focusRef = useRef<HTMLDivElement>(null);
  return (
    <Modal
      open={props.open}
      title="Pick a player"
      description={props.title}
      onClose={props.onClose}
      initialFocusRef={focusRef}
    >
      {props.open ? <PickerBody {...props} focusRef={focusRef} /> : null}
    </Modal>
  );
}

function PickerBody({
  exclude,
  onPick,
  onClose,
  focusRef,
}: PlayerPickerProps & { focusRef: RefObject<HTMLDivElement | null> }) {
  const { session, stats } = useSessionView();
  const [filter, setFilter] = useState("");
  const filterId = useId();

  const candidates = useMemo(
    () => activePlayersByName(session.players).filter((player) => !exclude.includes(player.id)),
    [session.players, exclude],
  );
  const needle = filter.trim().toLocaleLowerCase();
  const shown = needle
    ? candidates.filter((player) => player.name.toLocaleLowerCase().includes(needle))
    : candidates;

  return (
    <div ref={focusRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <label htmlFor={filterId} className="input w-full">
        <SearchIcon className="size-5 opacity-60" />
        <span className="sr-only">Filter players</span>
        <input
          id={filterId}
          type="search"
          className="grow text-base"
          placeholder="Filter by name"
          autoComplete="off"
          enterKeyHint="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-base-content/65">
          {candidates.length === 0 ? "Everyone is already in this queue." : "No players match."}
        </p>
      ) : (
        <ul aria-label="Players" className="-mx-2 max-h-[55dvh] overflow-y-auto overscroll-contain">
          {shown.map((player) => {
            const status = playerStatus(player, stats.get(player.id));
            const statusId = `${filterId}-${player.id}`;
            return (
              <li key={player.id}>
                <button
                  type="button"
                  aria-label={player.name}
                  aria-describedby={statusId}
                  className="flex min-h-14 w-full items-center gap-2 rounded-field px-2 py-2 text-left hover:bg-base-200 active:bg-base-300"
                  onClick={() => onPick(player.id)}
                >
                  <span className="min-w-0 flex-1">
                    <SessionPlayerChip playerId={player.id} layout="inline" />
                  </span>
                  <span
                    id={statusId}
                    className={`shrink-0 rounded-full border-[1.5px] px-2 py-px text-xs font-semibold whitespace-nowrap ${STATUS_TONE_CLASS[status.tone]}`}
                  >
                    {status.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="btn btn-ghost mb-2" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
