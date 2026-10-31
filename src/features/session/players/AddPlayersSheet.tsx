import { useId, useMemo, useState, type ReactNode } from "react";
import { BackendError } from "../../../backend/backend.ts";
import { saveClubs } from "../../../backend/clubs.ts";
import { AddPlayerForm, type NewPlayer } from "../../../components/AddPlayerForm.tsx";
import { Modal } from "../../../components/Modal.tsx";
import { ClubPlayerTile, GuestTile } from "../../../components/PlayerTiles.tsx";
import { addPlayers, type NewPlayerInput } from "../../../domain/engine/index.ts";
import { newId } from "../../../domain/ids.ts";
import type { Club, ClubPlayer } from "../../../domain/types.ts";
import { namesEqual, normalizeName } from "../../../domain/validation.ts";
import { getClubs, useClubs } from "../../../storage/store.ts";
import type { Guest } from "../../new-session/newSession.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { addPlayersLabel, joinNames, rosterChoices, rosterNameMessage } from "./roster.ts";

/**
 * Bottom sheet for adding players mid-session: tick Club players who aren't in the Session yet,
 * line up Guests, then add them all in one change.
 */
export function AddPlayersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Add players" onClose={onClose} focusTitle>
      {open ? <AddPlayersForm onDone={onClose} onCancel={onClose} /> : null}
    </Modal>
  );
}

function AddPlayersForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const clubs = useClubs();
  const club = session.clubId ? (clubs.find((c) => c.id === session.clubId) ?? null) : null;
  const choices = useMemo(
    () => (club ? rosterChoices(club, session.players) : []),
    [club, session.players],
  );
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [guests, setGuests] = useState<Guest[]>([]);
  const [nothingPicked, setNothingPicked] = useState(false);
  const hintId = useId();

  const takenNames = useMemo(
    () => [
      ...session.players.filter((player) => !player.removed).map((player) => player.name),
      ...guests.map((guest) => guest.name),
    ],
    [session.players, guests],
  );
  const picked = choices.filter((choice) => checked.has(choice.player.id) && !choice.nameTaken);
  const count = picked.length + guests.length;

  function toggle(id: string) {
    setNothingPicked(false);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addGuest(player: NewPlayer) {
    setNothingPicked(false);
    setGuests((current) => [...current, { id: newId(), ...player }]);
  }

  function add() {
    if (count === 0) {
      setNothingPicked(true);
      return;
    }
    // Work out the Club roster change first, but only save it once the players are in.
    const allClubs = getClubs();
    const added: ClubPlayer[] = [];
    const inputs: NewPlayerInput[] = picked.map(({ player }) => ({
      name: player.name,
      skill: player.skill,
      clubPlayerId: player.id,
      // Copied as the Club player is now, Account included (ADR-0002).
      ...(player.link ? { accountId: player.link.accountId } : {}),
    }));
    for (const guest of guests) {
      let clubPlayerId: string | null = null;
      if (club && guest.saveToClub) {
        const existing = [...club.players, ...added].find((p) => namesEqual(p.name, guest.name));
        if (existing) clubPlayerId = existing.id;
        else {
          const saved: ClubPlayer = {
            id: newId(),
            name: normalizeName(guest.name),
            skill: guest.skill,
          };
          added.push(saved);
          clubPlayerId = saved.id;
        }
      }
      inputs.push({ name: guest.name, skill: guest.skill, clubPlayerId });
    }
    const returning = picked.filter((choice) => choice.leftEarlier).map((c) => c.player.name);
    for (const guest of guests) {
      if (session.players.some((p) => p.removed && namesEqual(p.name, guest.name))) {
        returning.push(normalizeName(guest.name));
      }
    }

    if (!actions.run((s, ctx) => addPlayers(s, inputs, ctx))) return;
    onDone();
    if (club && added.length > 0) saveGuestsToClub(club, allClubs, added);
    if (returning.length > 0) actions.notify(`Welcome back, ${joinNames(returning)}`);
  }

  function saveGuestsToClub(target: Club, allClubs: Club[], added: ClubPlayer[]) {
    saveClubs(
      allClubs,
      allClubs.map((c) => (c.id === target.id ? { ...c, players: [...c.players, ...added] } : c)),
    ).catch((error: unknown) => {
      // The players are in the Session; only the Club's roster missed out.
      console.error("Failed to save the player to the Club", error);
      const who = joinNames(added.map((player) => player.name));
      const verb = added.length === 1 ? "joined, but wasn't" : "joined, but weren't";
      actions.notify(
        error instanceof BackendError && error.code === "offline"
          ? `${who} ${verb} saved to ${target.name}. You're offline.`
          : `${who} joined, but couldn't be saved to ${target.name}.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-2">
      {club ? (
        <Part title={`From ${club.name}`}>
          {choices.length === 0 ? (
            <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-4 text-center text-base-content/70">
              {club.players.length === 0
                ? `${club.name} has no players yet.`
                : `Everyone in ${club.name} is in this session.`}
            </p>
          ) : (
            <ul
              aria-label={`Players in ${club.name}`}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {choices.map(({ player, leftEarlier, nameTaken }) => (
                <li key={player.id} className="min-w-0">
                  <ClubPlayerTile
                    name={player.name}
                    skill={player.skill}
                    checked={checked.has(player.id) && !nameTaken}
                    disabled={nameTaken}
                    note={nameTaken ? "Name taken" : leftEarlier ? "Left earlier" : undefined}
                    onToggle={() => toggle(player.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Part>
      ) : null}

      <Part title="Guests">
        {guests.length > 0 ? (
          <ul aria-label="Guests to add" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {guests.map((guest) => (
              <li key={guest.id} className="min-w-0">
                <GuestTile
                  name={guest.name}
                  skill={guest.skill}
                  saveToClub={guest.saveToClub}
                  onRemove={() => setGuests((current) => current.filter((g) => g.id !== guest.id))}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="rounded-box bg-base-200 p-4">
          <AddPlayerForm
            existingNames={takenNames}
            onAdd={addGuest}
            showSaveToClub={club !== null}
            addLabel="Add guest"
            checkName={(name) => rosterNameMessage(name, club, choices)}
          />
        </div>
      </Part>

      <div className="flex flex-col gap-3">
        {nothingPicked ? (
          <p id={hintId} role="alert" className="text-sm font-semibold text-error">
            {club ? "Pick players or add a guest first." : "Add a guest first."}
          </p>
        ) : null}
        <button
          type="button"
          className="btn w-full btn-lg btn-primary"
          aria-describedby={nothingPicked ? hintId : undefined}
          onClick={add}
        >
          {addPlayersLabel(count)}
        </button>
        <button type="button" className="btn w-full border-base-300 btn-outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3
        id={headingId}
        className="text-xs font-bold tracking-[0.14em] text-base-content/60 uppercase"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
