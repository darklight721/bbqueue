import { type ReactNode, useId, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AddPlayerForm, type NewPlayer } from "../../components/AddPlayerForm.tsx";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { CloseIcon } from "../../components/icons.tsx";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { NumberStepper } from "../../components/NumberStepper.tsx";
import { Screen } from "../../components/Screen.tsx";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import { createSession, MAX_COURTS, suggestPointSystem } from "../../domain/engine/index.ts";
import { newId } from "../../domain/ids.ts";
import type { Club, PointSystem } from "../../domain/types.ts";
import { normalizeName } from "../../domain/validation.ts";
import {
  getClubs,
  getSession,
  setClubs,
  setSession,
  setSummary,
  useClubs,
} from "../../storage/store.ts";
import {
  byName,
  clashingGuestIds,
  COURTS_MIN,
  defaultSessionName,
  type Guest,
  HOURS_MAX,
  HOURS_MIN,
  HOURS_STEP,
  initialClubChoice,
  MIN_PLAYERS,
  NO_CHOICE,
  NO_CLUB,
  planStart,
  selectedLabel,
} from "./newSession.ts";

export function NewSessionScreen() {
  const [, navigate] = useLocation();
  const clubs = useClubs();
  const sortedClubs = useMemo(() => byName(clubs), [clubs]);

  const [name, setName] = useState(() => defaultSessionName(new Date()));
  const [clubChoice, setClubChoice] = useState(() => initialClubChoice(clubs));
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [guests, setGuests] = useState<Guest[]>([]);
  const [courts, setCourts] = useState(1);
  const [hours, setHours] = useState(1);
  const [manualPoints, setManualPoints] = useState<PointSystem | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  const nameId = useId();
  const nameErrorId = useId();
  const clubId = useId();

  const club: Club | null = clubs.find((candidate) => candidate.id === clubChoice) ?? null;
  const clubPlayers = useMemo(() => (club ? byName(club.players) : []), [club]);
  const checkedCount = clubPlayers.filter((player) => checked.has(player.id)).length;
  const playerCount = checkedCount + guests.length;

  const suggestion = suggestPointSystem({ players: playerCount, courts, hours });
  const pointSystem: PointSystem = manualPoints ?? suggestion?.pointSystem ?? 21;

  const clashes = useMemo(() => clashingGuestIds(guests, club), [guests, club]);
  const takenNames = useMemo(
    () => [...(club?.players.map((player) => player.name) ?? []), ...guests.map((g) => g.name)],
    [club, guests],
  );

  const nameMissing = normalizeName(name) === "";
  const blocker = nameMissing
    ? "Enter a session name"
    : playerCount < MIN_PLAYERS
      ? `Add at least ${MIN_PLAYERS} players`
      : clashes.size > 0
        ? "Two players have the same name"
        : null;
  const canStart = blocker === null;

  function chooseClub(next: string) {
    setClubChoice(next);
    setChecked(new Set());
    if (next === NO_CLUB || next === NO_CHOICE) {
      setGuests((current) => current.map((guest) => ({ ...guest, saveToClub: false })));
    }
  }

  function toggle(playerId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  const allChecked = clubPlayers.length > 0 && checkedCount === clubPlayers.length;

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(clubPlayers.map((player) => player.id)));
  }

  function addGuest(player: NewPlayer) {
    setGuests((current) => [...current, { id: newId(), ...player }]);
  }

  function requestStart() {
    if (!canStart) return;
    const existing = getSession();
    if (existing) setConfirmReplace(existing.name);
    else start();
  }

  function start() {
    const allClubs = getClubs();
    const plan = planStart({
      name,
      club: allClubs.find((candidate) => candidate.id === club?.id) ?? null,
      allClubs,
      checkedIds: checked,
      guests,
      courts,
      hours,
      pointSystem,
      newId,
    });
    if (plan.clubs) setClubs(plan.clubs);
    const session = createSession(plan.input, { now: Date.now(), rng: Math.random });
    setSummary(null);
    setSession(session);
    navigate("/session");
  }

  return (
    <Screen
      title="New session"
      backTo="/"
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p
              aria-live="polite"
              className="font-display text-xl leading-tight font-bold tabular-nums"
            >
              {selectedLabel(playerCount)}
            </p>
            <p className="truncate text-sm text-base-content/65">
              {blocker ??
                `${courts} ${courts === 1 ? "court" : "courts"} · ${hours} ${hours === 1 ? "hour" : "hours"} · ${pointSystem} points`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-lg btn-primary shrink-0"
            disabled={!canStart}
            onClick={requestStart}
          >
            Start session
          </button>
        </div>
      }
    >
      {/* Session name */}
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-sm font-semibold text-base-content/80">
          Session name
        </label>
        <input
          id={nameId}
          type="text"
          className={`input input-lg w-full font-semibold ${nameMissing ? "input-error" : ""}`}
          value={name}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={nameMissing ? true : undefined}
          aria-describedby={nameMissing ? nameErrorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing ? (
          <p id={nameErrorId} className="pl-1 text-sm font-semibold text-error">
            {NAME_ERROR_MESSAGE.required}
          </p>
        ) : null}
      </div>

      {/* Club */}
      <div className="flex flex-col gap-1">
        <label htmlFor={clubId} className="text-sm font-semibold text-base-content/80">
          Club
        </label>
        <select
          id={clubId}
          className="select select-lg w-full text-base"
          value={clubChoice}
          onChange={(event) => chooseClub(event.target.value)}
        >
          {clubChoice === NO_CHOICE ? (
            <option value={NO_CHOICE} disabled>
              Choose a club
            </option>
          ) : null}
          {sortedClubs.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          <option value={NO_CLUB}>No club (guests only)</option>
        </select>
      </div>

      {clubChoice !== NO_CLUB ? (
        <Section
          title="Club players"
          aside={
            club && clubPlayers.length > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm -mr-2" onClick={toggleAll}>
                {allChecked ? "Select none" : "Select all"}
              </button>
            ) : null
          }
        >
          {!club ? (
            <EmptyNote>Choose a club to see its players.</EmptyNote>
          ) : clubPlayers.length === 0 ? (
            <EmptyNote>This club has no players yet. Add guests below.</EmptyNote>
          ) : (
            <ul className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100">
              {clubPlayers.map((player) => (
                <li key={player.id} className="border-b border-base-300 last:border-b-0">
                  <ClubPlayerRow
                    name={player.name}
                    skill={player.skill}
                    checked={checked.has(player.id)}
                    onToggle={() => toggle(player.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <Section title="Guests" aside={guests.length > 0 ? <Count n={guests.length} /> : null}>
        {guests.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {guests.map((guest) => (
              <li key={guest.id}>
                <GuestRow
                  guest={guest}
                  clash={clashes.has(guest.id)}
                  onRemove={() =>
                    setGuests((current) => current.filter((other) => other.id !== guest.id))
                  }
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
          />
        </div>
      </Section>

      <Section title="Courts and time">
        <div className="grid grid-cols-2 gap-3">
          <NumberStepper
            label="Courts"
            value={courts}
            min={COURTS_MIN}
            max={MAX_COURTS}
            onChange={setCourts}
          />
          <NumberStepper
            label="Hours"
            value={hours}
            min={HOURS_MIN}
            max={HOURS_MAX}
            step={HOURS_STEP}
            onChange={setHours}
          />
        </div>
      </Section>

      <PointSystemField
        value={pointSystem}
        onChange={setManualPoints}
        suggestion={suggestion}
        onUseSuggestion={() => setManualPoints(null)}
      />

      <ConfirmDialog
        open={confirmReplace !== null}
        title={`End the current session '${confirmReplace ?? ""}'?`}
        message="It will be discarded."
        confirmLabel="Discard and start"
        tone="danger"
        onConfirm={() => {
          setConfirmReplace(null);
          start();
        }}
        onCancel={() => setConfirmReplace(null)}
      />
    </Screen>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id={headingId} className="font-display text-2xl uppercase">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-sm font-semibold text-base-content/60 tabular-nums">{n}</span>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
      {children}
    </p>
  );
}

function ClubPlayerRow({
  name,
  skill,
  checked,
  onToggle,
}: {
  name: string;
  skill: Guest["skill"];
  checked: boolean;
  onToggle: () => void;
}) {
  const nameId = useId();
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 transition-colors ${
        checked ? "bg-primary/10" : "active:bg-base-200"
      }`}
    >
      <input
        type="checkbox"
        className="checkbox checkbox-primary"
        checked={checked}
        aria-labelledby={nameId}
        onChange={onToggle}
      />
      <span id={nameId} className="min-w-0 flex-1 truncate text-lg font-semibold">
        {name}
      </span>
      <SkillBadge skill={skill} />
    </label>
  );
}

function GuestRow({
  guest,
  clash,
  onRemove,
}: {
  guest: Guest;
  clash: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex min-h-14 items-center gap-3 rounded-box border-[1.5px] bg-base-100 py-1 pr-1 pl-4 ${
        clash ? "border-error" : "border-base-300"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg font-semibold">{guest.name}</span>
        {clash ? (
          <span className="text-sm font-semibold text-error">{NAME_ERROR_MESSAGE.duplicate}</span>
        ) : guest.saveToClub ? (
          <span className="text-sm text-base-content/65">Will be saved to the club</span>
        ) : null}
      </div>
      <SkillBadge skill={guest.skill} />
      <button
        type="button"
        className="btn btn-ghost btn-square shrink-0 text-base-content/70 hover:text-error"
        aria-label={`Remove ${guest.name}`}
        onClick={onRemove}
      >
        <CloseIcon className="size-6" />
      </button>
    </div>
  );
}

function PointSystemField({
  value,
  onChange,
  suggestion,
  onUseSuggestion,
}: {
  value: PointSystem;
  onChange: (value: PointSystem) => void;
  suggestion: { pointSystem: PointSystem; gamesEach: number } | null;
  onUseSuggestion: () => void;
}) {
  const groupName = useId();
  const reasonId = useId();
  const differs = suggestion !== null && suggestion.pointSystem !== value;
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={suggestion ? reasonId : undefined}>
      <legend className="mb-3 font-display text-2xl uppercase">Point system</legend>
      <div className="grid grid-cols-2 gap-3">
        {([21, 31] as const).map((points) => {
          const on = value === points;
          return (
            <label
              key={points}
              className={`btn btn-lg h-16 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                on ? "btn-primary" : "btn-outline border-base-300 bg-base-100"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={groupName}
                value={points}
                aria-label={`${points} points`}
                checked={on}
                onChange={() => onChange(points)}
              />
              <span className="font-display text-3xl font-bold">{points}</span>
              <span className="text-sm font-semibold opacity-80">points</span>
            </label>
          );
        })}
      </div>
      {suggestion ? (
        <div className="flex min-h-9 items-center justify-between gap-2">
          <p id={reasonId} className="text-sm text-base-content/70">
            Suggested: {suggestion.pointSystem} — about {suggestion.gamesEach}{" "}
            {suggestion.gamesEach === 1 ? "game" : "games"} each
          </p>
          {differs ? (
            <button type="button" className="btn btn-ghost btn-sm -mr-2" onClick={onUseSuggestion}>
              Use suggestion
            </button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
