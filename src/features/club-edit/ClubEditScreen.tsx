import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { Redirect, useLocation } from "wouter";
import {
  createClub,
  createsSharedClubs,
  deleteClub as removeClub,
  leaveClub,
  saveClub,
} from "../../backend/clubs.ts";
import { getBackend } from "../../backend/index.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import {
  HistoryIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from "../../components/icons.tsx";
import { blurOnEnter } from "../../components/keyboard.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { PlayerRowEditor } from "../../components/PlayerRowEditor.tsx";
import { Screen } from "../../components/Screen.tsx";
import { normalizeAccountId } from "../../domain/accountId.ts";
import {
  canChangeRoles,
  canDeleteClub,
  canEditClub,
  isSessionHost,
  organizerCount,
  ownRow,
} from "../../domain/permissions.ts";
import { newId } from "../../domain/ids.ts";
import { DEFAULT_SKILL, type Club, type Role } from "../../domain/types.ts";
import { hasClubErrors, validateClub } from "../../domain/validation.ts";
import {
  activeSessionOfClub,
  useAccount,
  useActiveSessions,
  useClubs,
  useEndedSessions,
} from "../../storage/store.ts";
import { newSessionForClubPath } from "../new-session/newSession.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { LinkedLine, LinkStatus } from "./AccountLinkSection.tsx";
import { ClubCardLink } from "./ClubCardLink.tsx";
import {
  accountIdFromName,
  accountIdsToLookUp,
  applyFoundAccounts,
  linkBlocksSave,
  linkProblem,
  linkStates as linkStatesOf,
  type Lookups,
} from "./linkState.ts";
import { clubErrorMessage } from "./clubErrors.ts";
import { ClubReadOnly } from "./ClubReadOnly.tsx";
import { MakeShared } from "./MakeShared.tsx";
import { DangerZone, LEAVE_MESSAGE, LeaveClub } from "./LeaveClub.tsx";
import {
  clubFromForm,
  formFromClub,
  formSignature,
  type ClubForm,
  type PlayerRow,
} from "./clubForm.ts";

/** New club (no `clubId`) or Edit club. Unknown ids go back to the Clubs list. */
export function ClubEditScreen({ clubId }: { clubId?: string }) {
  const clubs = useClubs();
  const account = useAccount();
  if (clubId === undefined) return <ClubEditor key="new" club={null} />;
  const club = clubs.find((candidate) => candidate.id === clubId);
  if (!club) return <Redirect to="/clubs" replace />;
  // Players of a Shared club only look: no editing, no Account IDs.
  if (!canEditClub(club, account?.accountId)) return <ClubReadOnly key={club.id} club={club} />;
  return <ClubEditor key={club.id} club={club} />;
}

function ClubEditor({ club }: { club: Club | null }) {
  const [, navigate] = useLocation();
  const clubs = useClubs();
  const endedSessions = useEndedSessions();
  const activeEntries = useActiveSessions();
  const isNew = club === null;
  const sessionCount = club ? endedSessions.filter((ended) => ended.clubId === club.id).length : 0;
  // This Club's Active session: the device's own for a Local club, the Shared club's record otherwise.
  const activeEntry = club ? activeSessionOfClub(activeEntries, club.id) : null;
  const activeSession = activeEntry?.session ?? null;
  // Only the device's own Session is replaced by starting a new one; a Shared club's isn't touched.
  const replacesDeviceSession =
    club?.kind === "local" && activeEntries.some((entry) => !entry.shared);

  const account = useAccount();
  const online = useOnline();
  const hasBackend = getBackend() !== null;
  // A Shared club's rows are separate records: adding one needs a connection.
  const addBlocked = club?.kind === "shared" && online === false;
  const viewer = account?.accountId;
  const canDelete = !club || canDeleteClub(club, viewer);
  const canLeave = club?.kind === "shared" && !!ownRow(club, viewer);
  // Organizers of a Shared club link Accounts to rows and give them Roles; so does whoever
  // creates a Club while signed in (it will be a Shared club).
  const [createsShared] = useState(() => isNew && createsSharedClubs());
  const linking = club ? canChangeRoles(club, viewer) : createsShared;

  const [initialClub, setInitialClub] = useState(club);
  // A new Shared club starts with the creator's own row, linked to them as Organizer.
  const [initial, setInitial] = useState(() => formFromClub(club, createsShared ? account : null));
  const [form, setForm] = useState<ClubForm>(initial);
  const [attempted, setAttempted] = useState(false);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discardResolver, setDiscardResolver] = useState<((ok: boolean) => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<{ rowId: string; text: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Accounts found by Account ID (null: none has it), keyed by lowercase Account ID. */
  const [lookups, setLookups] = useState<Lookups>({});
  /** Rows whose name field was left: a half-typed `@Account ID` there is now worth a message. */
  const [leftRows, setLeftRows] = useState<ReadonlySet<string>>(() => new Set());

  // A name field's `@Account ID` that matches an Account links the row to it straight away, and
  // the Account's name replaces the text.
  if (linking) {
    const resolved = applyFoundAccounts(form.rows, lookups, online);
    if (resolved !== form.rows) setForm({ ...form, rows: resolved });
  }

  const formRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const nameErrorId = useId();
  const playersHeadingId = useId();

  const otherClubNames = useMemo(
    () => clubs.filter((other) => other.id !== club?.id).map((other) => other.name),
    [clubs, club],
  );
  /** Rows whose name field holds an `@Account ID` (it isn't a name, so it isn't checked as one). */
  const typingId = (row: PlayerRow) => linking && !row.link && accountIdFromName(row.name) !== null;
  const errors = useMemo(() => {
    const checked = validateClub(
      { name: form.name, players: form.rows.map((row) => ({ name: row.name })) },
      otherClubNames,
    );
    return {
      ...checked,
      players: checked.players.map((error, index) => (typingId(form.rows[index]!) ? null : error)),
    };
    // `typingId` only reads `linking`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [form, otherClubNames, linking]);
  const invalid = hasClubErrors(errors);
  const shown = attempted ? errors : null;
  const dirty = formSignature(form) !== formSignature(initial);

  // A Shared club can change under us (another Organizer, or a sync). Follow it while there is
  // nothing unsaved; with unsaved changes keep them, and Save sends only what this person changed.
  const [seenClub, setSeenClub] = useState(club);
  if (club !== seenClub) {
    setSeenClub(club);
    if (club && !dirty) {
      const fresh = formFromClub(club);
      if (formSignature(fresh) !== formSignature(initial)) {
        setInitialClub(club);
        setInitial(fresh);
        setForm(fresh);
      }
    }
  }

  // --- Linking Accounts ----------------------------------------------------------------------

  const wantedLookups = useMemo(
    () => (linking ? accountIdsToLookUp(form.rows) : []),
    [linking, form.rows],
  );

  useEffect(() => {
    const backend = getBackend();
    if (!backend || online !== true) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const key of wantedLookups) {
      if (key in lookups) continue;
      // Typing: wait for a pause. Rows that are linked already are looked up straight away.
      const linkedAlready = form.rows.some(
        (row) => row.link && normalizeAccountId(row.link.accountId) === key,
      );
      timers.push(
        setTimeout(
          () => {
            backend.lookupAccount(key).then(
              (found) => setLookups((current) => ({ ...current, [key]: found })),
              () => undefined,
            );
          },
          linkedAlready ? 0 : 300,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
    // `lookups` is read to skip what is known; a new answer needs no new run.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedLookups, online]);

  /** Saved links by row id, to tell them from links made on this screen. */
  const savedLinks = useMemo(
    () =>
      new Map(
        initial.rows.flatMap((row) =>
          row.link ? [[row.id, normalizeAccountId(row.link.accountId)] as const] : [],
        ),
      ),
    [initial],
  );

  /** Where each row's Account link stands. */
  const linkStates = useMemo(
    () => linkStatesOf(form.rows, { lookups, online, viewer, savedLinks }),
    [form.rows, lookups, online, viewer, savedLinks],
  );

  const linkProblemShown = linking && [...linkStates.values()].some(linkBlocksSave);

  // After a failed Save, bring the first problem into view.
  useEffect(() => {
    if (saveTick === 0) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    field.focus({ preventScroll: true });
    // Centre it so neither the sticky top bar nor the footer covers it.
    if (typeof field.scrollIntoView === "function") {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [saveTick]);

  // Keep a freshly added row clear of the pinned footer.
  useEffect(() => {
    if (!focusRowId) return;
    const row = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [],
    ).find((element) => element.dataset.rowId === focusRowId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusRowId]);

  function updateRow(id: string, patch: Partial<ClubForm["rows"][number]>) {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }

  function removeRow(id: string) {
    setForm((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  }

  function changeRole(row: PlayerRow, role: Role) {
    setRoleMessage(null);
    if (!row.link) return;
    const after = form.rows.map((other) =>
      other.id === row.id && other.link ? { ...other, link: { ...other.link, role } } : other,
    );
    if (organizerCount({ players: after }) === 0) {
      setRoleMessage({ rowId: row.id, text: "A Club needs at least one Organizer." });
      return;
    }
    // Whoever creates a Club is one of its Organizers.
    if (isNew && role !== "organizer" && isViewer(row)) {
      setRoleMessage({
        rowId: row.id,
        text: "You start as an Organizer. Change your Role after saving.",
      });
      return;
    }
    updateRow(row.id, { link: { ...row.link, role } });
  }

  function isViewer(row: PlayerRow): boolean {
    return (
      !!viewer &&
      !!row.link &&
      normalizeAccountId(row.link.accountId) === normalizeAccountId(viewer)
    );
  }

  /** ✕ on a link that isn't saved yet: drop the link, clear the name, and go back to typing. */
  function undoLink(id: string) {
    setRoleMessage((current) => (current?.rowId === id ? null : current));
    updateRow(id, { name: "", link: undefined });
    nameFieldOf(id)?.focus();
  }

  function nameFieldOf(id: string): HTMLInputElement | null {
    const row = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [],
    ).find((element) => element.dataset.rowId === id);
    return row?.querySelector<HTMLInputElement>('input[type="text"]') ?? null;
  }

  function markLeft(id: string, left: boolean) {
    setLeftRows((current) => {
      if (current.has(id) === left) return current;
      const next = new Set(current);
      if (left) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function addRow() {
    if (addBlocked) return;
    const id = newId();
    setForm((current) => ({
      ...current,
      rows: [...current.rows, { id, name: "", skill: DEFAULT_SKILL }],
    }));
    setFocusRowId(id);
  }

  /** Enter in a name: go to the next row's name, or add a new row from the last one. */
  function enterFromRow(index: number) {
    if (form.rows[index]?.name.trim() === "") return;
    const next = form.rows[index + 1];
    if (!next) {
      addRow();
      return;
    }
    nameFieldOf(next.id)?.focus();
  }

  async function save() {
    if (saving) return;
    if (invalid || linkProblemShown) {
      setProblem(null);
      setAttempted(true);
      setSaveTick((tick) => tick + 1);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const saved = clubFromForm(initialClub?.id ?? newId(), initialClub?.kind ?? "local", form);
      if (initialClub) await saveClub(initialClub, saved);
      else await createClub({ ...saved, kind: createsSharedClubs() ? "shared" : "local" });
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to save Club", error);
      setProblem(clubErrorMessage(error));
      setSaving(false);
    }
  }

  async function deleteClub() {
    if (!club) return;
    setConfirmDelete(false);
    try {
      await removeClub(club);
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to delete Club", error);
      setProblem(clubErrorMessage(error));
    }
  }

  async function leave() {
    if (!club) return;
    setConfirmLeave(false);
    try {
      await leaveClub(club);
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to leave Club", error);
      setProblem(clubErrorMessage(error));
    }
  }

  function guardBack(): boolean | Promise<boolean> {
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => setDiscardResolver(() => resolve));
  }

  function settleDiscard(ok: boolean) {
    discardResolver?.(ok);
    setDiscardResolver(null);
  }

  /** Click handler for a link off this screen: with unsaved changes, confirm like Back first. */
  function leaveVia(href: string) {
    return async (event: MouseEvent<HTMLAnchorElement>) => {
      if (!dirty) return;
      event.preventDefault();
      if (await guardBack()) navigate(href);
    };
  }

  const playerCount = form.rows.length;

  return (
    <Screen
      title={isNew ? "New club" : "Edit club"}
      subtitle={club?.kind === "local" && hasBackend ? "This device only" : undefined}
      backTo="/clubs"
      onBack={guardBack}
      footer={
        <div className="flex flex-col gap-2">
          {/* One line at a time, most pressing first, so the footer grows by a line at most. */}
          {problem || (attempted && (invalid || linkProblemShown)) ? (
            <p
              role="alert"
              className="flex items-start justify-center gap-1.5 text-center text-sm font-semibold text-error"
            >
              <WarningIcon className="mt-0.5 size-4 shrink-0" />
              <span>{problem ?? "Fix the highlighted fields to save."}</span>
            </p>
          ) : addBlocked ? (
            <OfflineNote className="justify-center text-center">
              You're offline. Adding players needs a connection.
            </OfflineNote>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn gap-1.5 border-base-300 px-3 whitespace-nowrap btn-lg btn-outline"
              disabled={addBlocked}
              onClick={addRow}
            >
              <PlusIcon className="size-5" />
              Add player
            </button>
            <button
              type="button"
              className="btn btn-lg btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              Save
            </button>
          </div>
        </div>
      }
    >
      {/* Not a <form>: Enter in a field shouldn't trigger Save. */}
      <div ref={formRef} className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-sm font-semibold text-base-content/80">
            Club name
          </label>
          <input
            id={nameId}
            type="text"
            className={`input input-lg w-full font-semibold ${shown?.name ? "input-error" : ""}`}
            value={form.name}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- a new club starts with its name
            autoFocus={isNew}
            aria-invalid={shown?.name ? true : undefined}
            aria-describedby={shown?.name ? nameErrorId : undefined}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            onKeyDown={blurOnEnter}
          />
          {shown?.name ? (
            <p id={nameErrorId} className="pl-1 text-sm font-semibold text-error">
              {shown.name === "duplicate"
                ? "Club name already used"
                : NAME_ERROR_MESSAGE[shown.name]}
            </p>
          ) : null}
        </div>

        {club ? (
          // Side by side in two equal columns; a card on its own takes the whole row.
          <nav aria-label="Club sessions" className="grid grid-cols-2 gap-3">
            {activeSession ? (
              <ClubCardLink
                href={`/sessions/${encodeURIComponent(activeSession.id)}`}
                tone="active"
                tile={sessionCount > 0}
                className={sessionCount > 0 ? "" : "col-span-2"}
                icon={<PlayIcon className="size-6 translate-x-0.5" />}
                label="Open active session"
                detail={
                  activeEntry?.shared
                    ? `${activeSession.name} · ${
                        isSessionHost(activeEntry.shared, viewer)
                          ? "You're the host"
                          : `Host: ${activeEntry.shared.hostName}`
                      }`
                    : activeSession.name
                }
                onClick={leaveVia(`/sessions/${encodeURIComponent(activeSession.id)}`)}
              />
            ) : (
              <ClubCardLink
                href={newSessionForClubPath(club.id)}
                tone="plain"
                tile={sessionCount > 0}
                className={sessionCount > 0 ? "" : "col-span-2"}
                icon={<PlusIcon className="size-6" />}
                label="New session"
                detail={
                  club.kind === "shared" && online === false
                    ? "Needs a connection to start"
                    : replacesDeviceSession
                      ? "Replaces the current session"
                      : "Pick players and courts"
                }
                onClick={leaveVia(newSessionForClubPath(club.id))}
              />
            )}
            {sessionCount > 0 ? (
              <ClubCardLink
                href={`/clubs/${encodeURIComponent(club.id)}/sessions`}
                tone="plain"
                tile
                icon={<HistoryIcon className="size-6" />}
                label="Sessions"
                detail={countLabel(sessionCount, "past session", "past sessions")}
                onClick={leaveVia(`/clubs/${encodeURIComponent(club.id)}/sessions`)}
              />
            ) : null}
          </nav>
        ) : null}

        <section aria-labelledby={playersHeadingId} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={playersHeadingId} className="font-display text-2xl uppercase">
              Players
            </h2>
            <span className="text-sm font-semibold text-base-content/60 tabular-nums">
              {playerCount === 0 ? "None yet" : playerCount}
            </span>
          </div>

          {linking && online === false ? (
            <OfflineNote className="rounded-box bg-base-200 px-3 py-2">
              You're offline. Linking Accounts and changing Roles need a connection.
            </OfflineNote>
          ) : null}

          {playerCount === 0 ? (
            <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
              No players yet. Tap <span className="font-semibold">Add player</span> below.
            </p>
          ) : (
            <ul className={`flex flex-col ${linking ? "gap-4" : "gap-3"}`}>
              {form.rows.map((row, index) => {
                const state = linking ? linkStates.get(row.id) : undefined;
                const onlyOrganizer =
                  row.link?.role === "organizer" && organizerCount({ players: form.rows }) <= 1;
                // The only Organizer stays: a Shared club always has one. A new Club keeps its
                // creator.
                const keepRow = onlyOrganizer || (isNew && isViewer(row));
                const typing = typingId(row);
                const complete = attempted || leftRows.has(row.id);
                const statusId = `${row.id}-link-status`;
                return (
                  <li
                    key={row.id}
                    data-row-id={row.id}
                    className="flex scroll-mb-32 flex-col gap-1"
                  >
                    <PlayerRowEditor
                      value={{ name: row.name, skill: row.skill }}
                      onChange={(value) => {
                        if (value.name !== row.name) markLeft(row.id, false);
                        updateRow(row.id, value);
                      }}
                      onRemove={keepRow ? undefined : () => removeRow(row.id)}
                      keepRemoveSpace
                      linkable={linking && !row.link && online !== false}
                      error={shown?.players[index] ?? null}
                      invalid={typing && !!state && linkProblem(state, complete) !== null}
                      describedBy={typing ? statusId : undefined}
                      autoFocus={row.id === focusRowId}
                      onEnter={() => enterFromRow(index)}
                      onBlur={() => markLeft(row.id, true)}
                    />
                    {typing && state ? (
                      <LinkStatus id={statusId} state={state} complete={complete} />
                    ) : null}
                    {state?.kind === "linked" ? (
                      <LinkedLine
                        playerName={row.name}
                        state={state}
                        online={online !== false}
                        roleMessage={roleMessage?.rowId === row.id ? roleMessage.text : null}
                        onlyOrganizer={onlyOrganizer}
                        onRole={(role) => changeRole(row, role)}
                        onUnlink={() => updateRow(row.id, { link: undefined })}
                        onUndo={() => undoLink(row.id)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {club?.kind === "local" && hasBackend ? (
          <MakeShared club={club} account={account} online={online !== false} dirty={dirty} />
        ) : null}

        {club && (canLeave || canDelete) ? (
          <DangerZone>
            {canLeave ? (
              <LeaveClub
                club={club}
                viewer={viewer}
                online={online !== false}
                onLeave={() => setConfirmLeave(true)}
              />
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="btn w-full text-error btn-ghost"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon className="size-5" />
                Delete club
              </button>
            ) : null}
          </DangerZone>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${club?.name ?? "club"}?`}
        message="This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => void deleteClub()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${club?.name ?? "club"}?`}
        message={LEAVE_MESSAGE}
        confirmLabel="Leave club"
        tone="danger"
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={discardResolver !== null}
        title="Discard changes?"
        message="Your changes to this club won't be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => settleDiscard(true)}
        onCancel={() => settleDiscard(false)}
      />
    </Screen>
  );
}
