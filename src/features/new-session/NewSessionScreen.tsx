import { type ReactNode, useId, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { BackendError } from "../../backend/backend.ts";
import { saveClubs, useBackendOnline } from "../../backend/clubs.ts";
import { startSharedSession } from "../../backend/sessions.ts";
import { AddPlayerForm, type NewPlayer } from "../../components/AddPlayerForm.tsx";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { CloseIcon, UsersIcon } from "../../components/icons.tsx";
import { blurOnEnter } from "../../components/keyboard.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { NumberStepper } from "../../components/NumberStepper.tsx";
import { Screen } from "../../components/Screen.tsx";
import { SkillBadge } from "../../components/SkillBadge.tsx";
import { createSession, MAX_COURTS, suggestPointSystem } from "../../domain/engine/index.ts";
import { newId } from "../../domain/ids.ts";
import type { Club, PointSystem } from "../../domain/types.ts";
import { normalizeName } from "../../domain/validation.ts";
import { canStartSession } from "../../domain/permissions.ts";
import {
  activeSessionOfClub,
  getClubs,
  getSession,
  setSession,
  useAccount,
  useActiveSessions,
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
  sessionClubParam,
  selectedLabel,
} from "./newSession.ts";

/**
 * `/sessions/new`, optionally `?club=<id>` (opened from a Club screen): that Club is chosen and
 * can't be changed, and Back returns to the Club. An unknown id gives the normal screen.
 */
export function NewSessionScreen() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const account = useAccount();
  const everyClub = useClubs();
  // Only Organizers start Sessions of a Shared club.
  const clubs = useMemo(
    () => everyClub.filter((candidate) => canStartSession(candidate, account?.accountId)),
    [everyClub, account],
  );
  const online = useBackendOnline();
  const activeSessions = useActiveSessions();
  const sortedClubs = useMemo(() => byName(clubs), [clubs]);
  const lockedClubId = sessionClubParam(search, clubs);

  const [name, setName] = useState(() => defaultSessionName(new Date()));
  const [clubChoice, setClubChoice] = useState(() => lockedClubId ?? initialClubChoice(clubs));
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [guests, setGuests] = useState<Guest[]>([]);
  const [courts, setCourts] = useState(1);
  const [hours, setHours] = useState(1);
  const [manualPoints, setManualPoints] = useState<PointSystem | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

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

  // A Shared club has one Active session at a time (ADR-0007), and starting one is checked on the
  // server: it needs a connection. Local clubs and no club only touch this device's own Session.
  const sharedActive =
    club?.kind === "shared"
      ? (activeSessionOfClub(activeSessions, club.id)?.session ?? null)
      : null;
  const needsConnection = club?.kind === "shared" && online === false;

  const nameMissing = normalizeName(name) === "";
  const blocker =
    clubChoice === NO_CHOICE
      ? "Choose a club"
      : sharedActive
        ? "This club already has an active session"
        : needsConnection
          ? "You're offline. Starting needs a connection"
          : nameMissing
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
    if (!canStart || starting) return;
    if (club?.kind === "shared") {
      // Doesn't touch the device's own Session, so there is nothing to replace.
      void startShared();
      return;
    }
    const existing = getSession();
    if (existing) setConfirmReplace(existing.name);
    else start();
  }

  /** The Session and the Club roster change that Start saves. */
  function plan() {
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
    const session = createSession(plan.input, { now: Date.now(), rng: Math.random });
    return { allClubs, plan, session };
  }

  /** Save guests marked "Save to club". */
  function saveGuests(allClubs: Club[], clubs: Club[] | null) {
    if (!clubs) return;
    // A Shared club's roster is changed through the server: if that fails (offline, or no
    // longer an Organizer) the Session still starts, just without the saved guests.
    saveClubs(allClubs, clubs).catch((error: unknown) =>
      console.error("Failed to save guests to the Club", error),
    );
  }

  /** Local club or no Club: the Session goes in this device's own slot. */
  function start() {
    const { allClubs, plan: made, session } = plan();
    saveGuests(allClubs, made.clubs);
    setSession(session);
    navigate(`/sessions/${session.id}`);
  }

  /** Shared club: the server decides that the Club has no Active session yet, then this device hosts it. */
  async function startShared() {
    if (!club) return;
    const { allClubs, plan: made, session } = plan();
    setStarting(true);
    setStartError(null);
    try {
      await startSharedSession(club.id, session);
    } catch (error) {
      console.error("Failed to start the shared session", error);
      setStartError(startErrorMessage(error));
      setStarting(false);
      return;
    }
    saveGuests(allClubs, made.clubs);
    navigate(`/sessions/${session.id}`);
  }

  return (
    <Screen
      title="New session"
      backTo={lockedClubId ? `/clubs/${encodeURIComponent(lockedClubId)}` : "/"}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p
              aria-live="polite"
              className="font-display text-xl leading-tight font-bold tabular-nums"
            >
              {selectedLabel(playerCount)}
            </p>
            {startError ? (
              <p role="alert" className="text-sm leading-snug font-semibold text-error">
                {startError}
              </p>
            ) : needsConnection && !sharedActive ? (
              // Wraps instead of being cut off next to the button.
              <OfflineNote className="leading-snug">{blocker}</OfflineNote>
            ) : (
              <p
                className={`text-sm text-base-content/65 ${sharedActive ? "leading-snug" : "truncate"}`}
              >
                {blocker ??
                  `${courts} ${courts === 1 ? "court" : "courts"} · ${hours} ${hours === 1 ? "hour" : "hours"} · ${pointSystem} points`}
              </p>
            )}
          </div>
          {sharedActive ? (
            <Link
              href={`/sessions/${encodeURIComponent(sharedActive.id)}`}
              className="btn btn-lg btn-primary shrink-0"
            >
              Open active session
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-lg btn-primary shrink-0"
              disabled={!canStart || starting}
              onClick={requestStart}
            >
              Start session
            </button>
          )}
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
          onKeyDown={blurOnEnter}
        />
        {nameMissing ? (
          <p id={nameErrorId} className="pl-1 text-sm font-semibold text-error">
            {NAME_ERROR_MESSAGE.required}
          </p>
        ) : null}
      </div>

      {/* Club */}
      {lockedClubId && club ? (
        <LockedClub id={clubId} name={club.name} />
      ) : (
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
      )}

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
            // Row-major (left to right, then down) so A–Z neighbours stay on screen together,
            // and visual order = DOM order = focus / screen-reader order.
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {clubPlayers.map((player) => (
                <li key={player.id} className="min-w-0">
                  <ClubPlayerTile
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
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {guests.map((guest) => (
              <li key={guest.id} className="min-w-0">
                <GuestTile
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
        {club?.kind === "shared" && online === false && guests.some((guest) => guest.saveToClub) ? (
          <OfflineNote role="status">
            You're offline. Guests still join, but won't be saved to {club.name}.
          </OfflineNote>
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

function startErrorMessage(error: unknown): string {
  switch (error instanceof BackendError ? error.code : null) {
    case "offline":
      return "You're offline. Starting needs a connection.";
    case "session-exists":
      return "This club already has an active session.";
    case "forbidden":
      return "Only Organizers can start a session for this club.";
    case "not-found":
      return "This club is no longer available.";
    default:
      return "Couldn't start the session. Please try again.";
  }
}

/**
 * The Club when New session was opened from a Club screen: shown as a fixed value (no chevron,
 * filled background, Club icon) so it reads as already decided rather than as a broken picker.
 */
function LockedClub({ id, name }: { id: string; name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-base-content/80">
        Club
      </label>
      <div className="relative">
        <UsersIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-primary"
        />
        <input
          id={id}
          type="text"
          readOnly
          value={name}
          title={name}
          className="input input-lg w-full cursor-default border-transparent bg-base-200 pl-12 font-semibold text-ellipsis"
        />
      </div>
    </div>
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

/**
 * One Club player in the two-column picker: the whole tile toggles the checkbox.
 * Name on top (truncated; full name in `title` and the checkbox's accessible name), compact Skill below.
 */
function ClubPlayerTile({
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
      title={name}
      className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-box border-[1.5px] py-2 pr-2 pl-2.5 transition-colors select-none has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        checked ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 active:bg-base-200"
      }`}
    >
      <input
        type="checkbox"
        className="checkbox shrink-0 checkbox-primary"
        checked={checked}
        aria-labelledby={nameId}
        onChange={onToggle}
      />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span id={nameId} className="max-w-full truncate leading-tight font-semibold">
          {name}
        </span>
        <SkillBadge skill={skill} compact size="sm" />
      </span>
    </label>
  );
}

/**
 * One Guest in the same two-column grid as Club players: name, compact Skill, an optional status
 * line ("Name taken" / "Saves to club") and a remove ✕ in the top-right corner (44px target).
 */
function GuestTile({
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
      className={`relative flex h-full min-h-14 flex-col items-start gap-1 rounded-box border-[1.5px] bg-base-100 py-2 pl-3 ${
        clash ? "border-error" : "border-base-300"
      }`}
    >
      {/* pr keeps the name clear of the ✕; the lines below run under it (the ✕ is only 44px tall). */}
      <span title={guest.name} className="max-w-full truncate pr-11 leading-tight font-semibold">
        {guest.name}
      </span>
      <SkillBadge skill={guest.skill} compact size="sm" />
      {clash ? (
        <span className="pr-2 text-xs leading-tight font-semibold text-error">
          <span aria-hidden="true">Name taken</span>
          <span className="sr-only">Name already used by a Club player</span>
        </span>
      ) : guest.saveToClub ? (
        <span className="pr-2 text-xs leading-tight text-base-content/65">Saves to club</span>
      ) : null}
      <button
        type="button"
        className="btn absolute top-0 right-0 size-11 rounded-box btn-ghost p-0 text-base-content/70 btn-square hover:text-error"
        aria-label={`Remove ${guest.name}`}
        onClick={onRemove}
      >
        <CloseIcon className="size-5" />
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
