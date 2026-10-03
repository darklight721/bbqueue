import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { ChevronRightIcon, HistoryIcon, PlusIcon } from "../../components/icons.tsx";
import { blurOnEnter } from "../../components/keyboard.ts";
import { NAME_ERROR_MESSAGE } from "../../components/nameErrors.ts";
import { PlayerRowEditor } from "../../components/PlayerRowEditor.tsx";
import { Screen } from "../../components/Screen.tsx";
import { newId } from "../../domain/ids.ts";
import { DEFAULT_SKILL, type Club } from "../../domain/types.ts";
import { hasClubErrors, validateClub } from "../../domain/validation.ts";
import { getClubs, setClubs, useClubs, useEndedSessions } from "../../storage/store.ts";
import { countLabel } from "../session-summary/summaryFormat.ts";
import { clubFromForm, formFromClub, formSignature, type ClubForm } from "./clubForm.ts";

/** New club (no `clubId`) or Edit club. Unknown ids go back to the Clubs list. */
export function ClubEditScreen({ clubId }: { clubId?: string }) {
  const clubs = useClubs();
  if (clubId === undefined) return <ClubEditor key="new" club={null} />;
  const club = clubs.find((candidate) => candidate.id === clubId);
  if (!club) return <Redirect to="/clubs" replace />;
  return <ClubEditor key={club.id} club={club} />;
}

function ClubEditor({ club }: { club: Club | null }) {
  const [, navigate] = useLocation();
  const clubs = useClubs();
  const endedSessions = useEndedSessions();
  const isNew = club === null;
  const sessionCount = club ? endedSessions.filter((ended) => ended.clubId === club.id).length : 0;

  const [initial] = useState(() => formFromClub(club));
  const [form, setForm] = useState<ClubForm>(initial);
  const [attempted, setAttempted] = useState(false);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discardResolver, setDiscardResolver] = useState<((ok: boolean) => void) | null>(null);

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

  function addRow() {
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

  function save() {
    if (invalid) {
      setAttempted(true);
      setSaveTick((tick) => tick + 1);
      return;
    }
    const saved = clubFromForm(club?.id ?? newId(), form);
    const latest = getClubs();
    setClubs(
      isNew
        ? [...latest, saved]
        : latest.map((existing) => (existing.id === saved.id ? saved : existing)),
    );
    navigate("/clubs", { replace: true });
  }

  function deleteClub() {
    if (!club) return;
    setConfirmDelete(false);
    setClubs(getClubs().filter((existing) => existing.id !== club.id));
    navigate("/clubs", { replace: true });
  }

  function guardBack(): boolean | Promise<boolean> {
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
      title={isNew ? "New club" : "Edit club"}
      backTo="/clubs"
      onBack={guardBack}
      footer={
        <div className="flex flex-col gap-2">
          {shown && invalid ? (
            <p role="alert" className="text-center text-sm font-semibold text-error">
              Fix the highlighted fields to save.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn btn-lg btn-outline border-base-300"
              onClick={addRow}
            >
              <PlusIcon className="size-5" />
              Add player
            </button>
            <button type="button" className="btn btn-lg btn-primary" onClick={save}>
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
              {shown.name === "duplicate" ? "Club name already used" : NAME_ERROR_MESSAGE.required}
            </p>
          ) : null}
        </div>

        {club && sessionCount > 0 ? (
          <ClubSessionsLink
            href={`/clubs/${encodeURIComponent(club.id)}/sessions`}
            count={sessionCount}
            // Unsaved changes: confirm like Back before leaving.
            onClick={async (event) => {
              if (!dirty) return;
              event.preventDefault();
              if (await guardBack()) navigate(`/clubs/${encodeURIComponent(club.id)}/sessions`);
            }}
          />
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

          {playerCount === 0 ? (
            <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-6 text-center text-base-content/70">
              No players yet. Tap <span className="font-semibold">Add player</span> below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {form.rows.map((row, index) => (
                <li key={row.id} data-row-id={row.id} className="scroll-mb-32">
                  <PlayerRowEditor
                    value={{ name: row.name, skill: row.skill }}
                    onChange={(value) => updateRow(row.id, value)}
                    onRemove={() => removeRow(row.id)}
                    error={shown?.players[index] ?? null}
                    autoFocus={row.id === focusRowId}
                    onEnter={() => enterFromRow(index)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isNew ? (
          <div className="border-t border-base-300 pt-6">
            <button
              type="button"
              className="btn btn-ghost w-full text-error"
              onClick={() => setConfirmDelete(true)}
            >
              Delete club
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${club?.name ?? "club"}?`}
        message="This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={deleteClub}
        onCancel={() => setConfirmDelete(false)}
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

/** Card link to this Club's Ended sessions. */
function ClubSessionsLink({
  href,
  count,
  onClick,
}: {
  href: string;
  count: number;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const labelId = useId();
  const detailId = useId();
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="group flex min-h-20 items-center gap-4 rounded-box border-[1.5px] border-base-300 bg-base-100 p-4 pr-3 text-base-content shadow-sm transition-transform active:scale-[0.98]"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-base-200 text-primary">
        <HistoryIcon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          Sessions
        </span>
        <span id={detailId} className="truncate text-sm text-base-content/65">
          {countLabel(count, "past session", "past sessions")}
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
