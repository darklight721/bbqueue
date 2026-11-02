import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { saveClub } from "../../backend/clubs.ts";
import { getBackend } from "../../backend/index.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { PlusIcon, WarningIcon } from "../../components/icons.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { PlayerRowEditor } from "../../components/PlayerRowEditor.tsx";
import { Screen } from "../../components/Screen.tsx";
import { normalizeAccountId } from "../../domain/accountId.ts";
import { canChangeRoles, canEditClub, organizerCount } from "../../domain/permissions.ts";
import { newId } from "../../domain/ids.ts";
import { DEFAULT_SKILL, type Club, type Role } from "../../domain/types.ts";
import { hasClubErrors, validateClub } from "../../domain/validation.ts";
import { useAccount, useClubs } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { LinkedLine, LinkStatus } from "./AccountLinkSection.tsx";
import { clubErrorMessage } from "./clubErrors.ts";
import {
  clubFromForm,
  formFromClub,
  formSignature,
  type PlayerRow,
  type RosterForm,
} from "./clubForm.ts";
import {
  clubPath,
  editPlayersPath,
  isOverClubPage,
  JUST_CREATED_PARAM,
  leavingEditPlayers,
  type FromEditPlayers,
} from "./clubPaths.ts";
import {
  accountIdFromName,
  accountIdsToLookUp,
  applyFoundAccounts,
  linkBlocksSave,
  linkProblem,
  linkStates as linkStatesOf,
  type Lookups,
} from "./linkState.ts";

/** A fresh, empty roster row. */
function blankRow(): PlayerRow {
  return { id: newId(), name: "", skill: DEFAULT_SKILL };
}

/**
 * `/clubs/:clubId/players`: Edit players, for those who may change the roster. Unknown ids go
 * back to the Clubs list; anyone else (or an Organizer made a Player while here) to the Club page.
 */
export function EditPlayersScreen({ clubId }: { clubId: string }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const clubs = useClubs();
  const viewer = useAccount()?.accountId;
  const club = clubs.find((candidate) => candidate.id === clubId);
  const [justCreated] = useState(() => new URLSearchParams(search).get(JUST_CREATED_PARAM) === "1");

  // A reload or Back to this page shouldn't add another empty row.
  useEffect(() => {
    if (justCreated) {
      navigate(editPlayersPath(clubId), { replace: true, state: window.history.state });
    }
    // Once, on opening.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!club) return <Redirect to="/clubs" replace />;
  if (!canEditClub(club, viewer)) return <Redirect to={clubPath(club.id)} replace />;
  return <EditPlayers key={club.id} club={club} startWithBlankRow={justCreated} />;
}

/**
 * The roster as a form (names, Skill levels, Account links and Roles), with Add player and Save
 * pinned below. Save sends only the roster and returns to the Club page; Back throws the changes
 * away, asking first when there are any.
 */
function EditPlayers({
  club,
  startWithBlankRow,
}: {
  club: Club;
  /** Open with an empty row to type in, focused (a Club that was just created). */
  startWithBlankRow: boolean;
}) {
  const [, navigate] = useLocation();
  const account = useAccount();
  const online = useOnline();
  const viewer = account?.accountId;
  // A Shared club's rows are separate records: adding one needs a connection.
  const addBlocked = club.kind === "shared" && online === false;
  // Organizers of a Shared club link Accounts to rows and give them Roles.
  const linking = canChangeRoles(club, viewer);

  const [initialClub, setInitialClub] = useState(club);
  // An untouched blank row isn't a change: Back still leaves without asking.
  const [initial, setInitial] = useState<RosterForm>(() => {
    const saved = formFromClub(club);
    return startWithBlankRow ? { rows: [...saved.rows, blankRow()] } : saved;
  });
  const [form, setForm] = useState<RosterForm>(initial);
  const [attempted, setAttempted] = useState(false);
  const [focusRowId, setFocusRowId] = useState<string | null>(() =>
    startWithBlankRow ? (initial.rows.at(-1)?.id ?? null) : null,
  );
  const [saveTick, setSaveTick] = useState(0);
  const [discardResolver, setDiscardResolver] = useState<((ok: boolean) => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<{ rowId: string; text: string } | null>(null);
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

  const formRef = useRef<HTMLFieldSetElement>(null);

  /** Rows whose name field holds an `@Account ID` (it isn't a name, so it isn't checked as one). */
  const typingId = (row: PlayerRow) => linking && !row.link && accountIdFromName(row.name) !== null;
  const errors = useMemo(() => {
    // The Club name isn't edited here: only the rows are checked.
    const checked = validateClub(
      { name: club.name, players: form.rows.map((row) => ({ name: row.name })) },
      [],
    );
    return {
      ...checked,
      name: null,
      players: checked.players.map((error, index) => (typingId(form.rows[index]!) ? null : error)),
    };
    // `typingId` only reads `linking`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [form, club.name, linking]);
  const invalid = hasClubErrors(errors);
  const shown = attempted ? errors : null;
  const dirty = formSignature(form) !== formSignature(initial);

  // A Shared club can change under us (another Organizer, or a sync). Follow it while there is
  // nothing unsaved; with unsaved changes keep them, and Save sends only what this person changed.
  const [seenClub, setSeenClub] = useState(club);
  if (club !== seenClub) {
    setSeenClub(club);
    if (!dirty) {
      // Keep blank rows still waiting to be typed in.
      const blank = form.rows.filter(
        (row) => row.name.trim() === "" && !row.link && !club.players.some((p) => p.id === row.id),
      );
      const fresh = { rows: [...formFromClub(club).rows, ...blank] };
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

  function updateRow(id: string, patch: Partial<PlayerRow>) {
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
    updateRow(row.id, { link: { ...row.link, role } });
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
    const row = blankRow();
    setForm((current) => ({ ...current, rows: [...current.rows, row] }));
    setFocusRowId(row.id);
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

  /** Back to the Club page: back through history when it's underneath, else in this page's place. */
  function leave(how: FromEditPlayers) {
    leavingEditPlayers(club.id, how);
    if (isOverClubPage(window.history.state)) window.history.back();
    else navigate(clubPath(club.id), { replace: true });
  }

  async function save() {
    if (saving) return;
    // Nothing to send (an untouched empty row isn't a change).
    if (!dirty) {
      leave("saved");
      return;
    }
    if (invalid || linkProblemShown) {
      setProblem(null);
      setAttempted(true);
      setSaveTick((tick) => tick + 1);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await saveClub(initialClub, clubFromForm(initialClub, form));
      leave("saved");
    } catch (error) {
      console.error("Failed to save Club", error);
      setProblem(clubErrorMessage(error));
      setSaving(false);
    }
  }

  function guardBack(): boolean | Promise<boolean> {
    if (saving) return false;
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => setDiscardResolver(() => resolve));
  }

  function settleDiscard(ok: boolean) {
    discardResolver?.(ok);
    setDiscardResolver(null);
  }

  const playerCount = form.rows.length;

  return (
    <Screen
      title="Edit players"
      subtitle={`${club.name} · ${countLabel(playerCount, "player", "players")}`}
      backTo={clubPath(club.id)}
      onBack={guardBack}
      onLeave={() => leave("back")}
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
              disabled={addBlocked || saving}
              onClick={addRow}
            >
              <PlusIcon className="size-5" />
              Add player
            </button>
            <button
              type="button"
              className="btn btn-lg btn-primary"
              disabled={saving}
              aria-busy={saving || undefined}
              onClick={() => void save()}
            >
              {saving ? (
                <>
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      }
    >
      {/* Not a <form>: Enter in a field shouldn't trigger Save. Fields are off while saving. */}
      <fieldset ref={formRef} disabled={saving} className="flex min-w-0 flex-col gap-8">
        <section aria-label="Players" className="flex flex-col gap-3">
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
                // The only Organizer stays: a Shared club always has one.
                const onlyOrganizer =
                  row.link?.role === "organizer" && organizerCount({ players: form.rows }) <= 1;
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
                      onRemove={onlyOrganizer ? undefined : () => removeRow(row.id)}
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
      </fieldset>

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
