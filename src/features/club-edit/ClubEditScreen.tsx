import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { Redirect, useLocation } from "wouter";
import {
  createClub,
  createsSharedClubs,
  deleteClub as removeClub,
  leaveClub,
  saveClub,
  useBackendOnline,
} from "../../backend/clubs.ts";
import { getBackend } from "../../backend/index.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { HistoryIcon, PlayIcon, PlusIcon, WarningIcon } from "../../components/icons.tsx";
import { blurOnEnter } from "../../components/keyboard.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { PlayerRowEditor } from "../../components/PlayerRowEditor.tsx";
import { Screen } from "../../components/Screen.tsx";
import { normalizeAccountId, validateAccountId } from "../../domain/accountId.ts";
import { canChangeRoles, canDeleteClub, canEditClub, ownRow } from "../../domain/permissions.ts";
import { newId } from "../../domain/ids.ts";
import { DEFAULT_SKILL, type Account, type Club, type Role } from "../../domain/types.ts";
import { hasClubErrors, validateClub } from "../../domain/validation.ts";
import { useAccount, useClubs, useEndedSessions, useSession } from "../../storage/store.ts";
import { newSessionForClubPath } from "../new-session/newSession.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { AccountLinkSection } from "./AccountLinkSection.tsx";
import { ClubCardLink } from "./ClubCardLink.tsx";
import { linkBlocksSave, type LinkState } from "./linkState.ts";
import { clubErrorMessage } from "./clubErrors.ts";
import { ClubReadOnly } from "./ClubReadOnly.tsx";
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
  const activeSession = useSession();
  const isNew = club === null;
  const sessionCount = club ? endedSessions.filter((ended) => ended.clubId === club.id).length : 0;

  const account = useAccount();
  const online = useBackendOnline();
  const hasBackend = getBackend() !== null;
  // A Shared club's rows are separate records: adding one needs a connection.
  const addBlocked = club?.kind === "shared" && online === false;
  const viewer = account?.accountId;
  const canDelete = !club || canDeleteClub(club, viewer);
  const canLeave = club?.kind === "shared" && !!ownRow(club, viewer);
  // Organizers of a Shared club link Accounts to rows and give them Roles.
  const linking = !!club && canChangeRoles(club, viewer);

  const [initialClub, setInitialClub] = useState(club);
  const [initial, setInitial] = useState(() => formFromClub(club));
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
  const [lookups, setLookups] = useState<Record<string, Account | null>>({});

  const formRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const nameErrorId = useId();
  const playersHeadingId = useId();

  const otherClubNames = useMemo(
    () => clubs.filter((other) => other.id !== club?.id).map((other) => other.name),
    [clubs, club],
  );
  const errors = useMemo(
    () =>
      validateClub(
        { name: form.name, players: form.rows.map((row) => ({ name: row.name })) },
        otherClubNames,
      ),
    [form, otherClubNames],
  );
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

  // --- Linking Accounts (Organizers of a Shared club) ---------------------------------------

  /** Account IDs to look up: typed ones that look right, and the ones rows are linked to. */
  const wantedLookups = useMemo(() => {
    if (!linking) return [];
    const wanted = new Set<string>();
    for (const row of form.rows) {
      if (row.link) wanted.add(normalizeAccountId(row.link.accountId));
      else if (row.idText && validateAccountId(row.idText) === null) {
        wanted.add(normalizeAccountId(row.idText));
      }
    }
    return [...wanted];
  }, [linking, form.rows]);

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

  const effectiveRole = (row: PlayerRow): Role | null => {
    if (row.link) return row.link.role;
    return null;
  };

  /** Where each row's Account link stands. */
  const linkStates = useMemo(() => {
    const states = new Map<string, LinkState>();
    const claimed = new Set<string>();
    for (const row of form.rows) if (row.link) claimed.add(normalizeAccountId(row.link.accountId));
    for (const row of form.rows) {
      if (row.link) {
        const key = normalizeAccountId(row.link.accountId);
        states.set(row.id, {
          kind: "linked",
          accountId: row.link.accountId,
          role: row.link.role,
          isYou: !!viewer && key === normalizeAccountId(viewer),
          exists: key in lookups ? lookups[key] !== null : null,
          name: lookups[key]?.name ?? null,
        });
        continue;
      }
      const text = row.idText ?? "";
      const key = normalizeAccountId(text);
      if (key === "") states.set(row.id, { kind: "empty" });
      else if (validateAccountId(text) !== null) states.set(row.id, { kind: "invalid" });
      else if (claimed.has(key)) states.set(row.id, { kind: "duplicate" });
      else {
        claimed.add(key);
        if (online === false) states.set(row.id, { kind: "offline" });
        else if (!(key in lookups)) states.set(row.id, { kind: "checking" });
        else if (lookups[key] === null) states.set(row.id, { kind: "unknown" });
        else {
          states.set(row.id, {
            kind: "found",
            name: lookups[key]!.name,
            role: row.draftRole ?? "player",
          });
        }
      }
    }
    return states;
  }, [form.rows, lookups, online, viewer]);

  const linkProblem = linking && [...linkStates.values()].some(linkBlocksSave);

  /** The rows as they are to be saved: typed Account IDs that were found become links. */
  function rowsToSave(): PlayerRow[] {
    return form.rows.map((row) => {
      const state = linkStates.get(row.id);
      if (state?.kind !== "found") return row;
      const found = lookups[normalizeAccountId(row.idText ?? "")];
      return found ? { ...row, link: { accountId: found.accountId, role: state.role } } : row;
    });
  }

  function organizersAfter(rows: PlayerRow[]): number {
    return rows.filter((row) => effectiveRole(row) === "organizer").length;
  }

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
    if (!row.link) {
      updateRow(row.id, { draftRole: role });
      return;
    }
    const after = rowsToSave().map((other) =>
      other.id === row.id && other.link ? { ...other, link: { ...other.link, role } } : other,
    );
    if (organizersAfter(after) === 0) {
      setRoleMessage({ rowId: row.id, text: "A Club needs at least one Organizer." });
      return;
    }
    updateRow(row.id, { link: { ...row.link, role } });
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
    const nextRow = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [],
    ).find((element) => element.dataset.rowId === next.id);
    nextRow?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
  }

  async function save() {
    if (saving) return;
    if (invalid || linkProblem) {
      setProblem(null);
      setAttempted(true);
      setSaveTick((tick) => tick + 1);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const rows = rowsToSave();
      const saved = clubFromForm(initialClub?.id ?? newId(), initialClub?.kind ?? "local", {
        ...form,
        rows,
      });
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
          {problem || (attempted && (invalid || linkProblem)) ? (
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
              className="btn btn-lg btn-outline border-base-300"
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
          <nav aria-label="Club sessions" className="flex flex-col gap-3">
            {activeSession?.clubId === club.id ? (
              <ClubCardLink
                href={`/sessions/${encodeURIComponent(activeSession.id)}`}
                tone="active"
                icon={<PlayIcon className="size-6 translate-x-0.5" />}
                label="Open active session"
                detail={activeSession.name}
                onClick={leaveVia(`/sessions/${encodeURIComponent(activeSession.id)}`)}
              />
            ) : (
              <ClubCardLink
                href={newSessionForClubPath(club.id)}
                tone="plain"
                icon={<PlusIcon className="size-6" />}
                label="New session"
                detail={activeSession ? "Replaces the current session" : "Pick players and courts"}
                onClick={leaveVia(newSessionForClubPath(club.id))}
              />
            )}
            {sessionCount > 0 ? (
              <ClubCardLink
                href={`/clubs/${encodeURIComponent(club.id)}/sessions`}
                tone="plain"
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
                const state = linkStates.get(row.id);
                const onlyOrganizer =
                  row.link?.role === "organizer" && organizersAfter(form.rows) <= 1;
                return (
                  <li
                    key={row.id}
                    data-row-id={row.id}
                    className="flex scroll-mb-32 flex-col gap-1"
                  >
                    <PlayerRowEditor
                      value={{ name: row.name, skill: row.skill }}
                      onChange={(value) => updateRow(row.id, value)}
                      // The only Organizer stays: a Shared club always has one.
                      onRemove={onlyOrganizer ? undefined : () => removeRow(row.id)}
                      keepRemoveSpace
                      error={shown?.players[index] ?? null}
                      autoFocus={row.id === focusRowId}
                      onEnter={() => enterFromRow(index)}
                    />
                    {linking && state ? (
                      <AccountLinkSection
                        playerName={row.name}
                        state={state}
                        idText={row.idText ?? ""}
                        online={online !== false}
                        showProblem={attempted}
                        roleMessage={roleMessage?.rowId === row.id ? roleMessage.text : null}
                        onlyOrganizer={onlyOrganizer}
                        onIdText={(text) => updateRow(row.id, { idText: text })}
                        onRole={(role) => changeRole(row, role)}
                        onUnlink={() => updateRow(row.id, { link: undefined })}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
