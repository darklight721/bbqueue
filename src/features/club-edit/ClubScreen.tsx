import { useEffect, useId, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { deleteClub as removeClub, leaveClub } from "../../backend/clubs.ts";
import { getBackend } from "../../backend/index.ts";
import { useOnline } from "../../backend/useOnline.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { TrashIcon, WarningIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import { canDeleteClub, canEditClub, ownRow } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";
import { useAccount, useClubs } from "../../storage/store.ts";
import { ClubCard } from "./ClubCard.tsx";
import { clubPath, JUST_CREATED_PARAM } from "./clubPaths.ts";
import { clubErrorMessage } from "./clubErrors.ts";
import { ClubSessionCards } from "./ClubSessionCards.tsx";
import { DangerZone, LEAVE_MESSAGE, LeaveClub } from "./LeaveClub.tsx";
import { MakeShared } from "./MakeShared.tsx";
import { PlayersEditing } from "./PlayersEditing.tsx";
import { PlayersHeading, PlayersHeadingButton, RosterList } from "./Roster.tsx";

/** `/clubs/:clubId`: the Club page, for everyone who can see the Club. Unknown ids go back to the Clubs list. */
export function ClubScreen({ clubId }: { clubId: string }) {
  const clubs = useClubs();
  const club = clubs.find((candidate) => candidate.id === clubId);
  if (!club) return <Redirect to="/clubs" replace />;
  return <ClubPage key={club.id} club={club} />;
}

type Mode = { kind: "view"; focusEdit: boolean } | { kind: "editing"; startWithBlankRow: boolean };

function ClubPage({ club }: { club: Club }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const viewer = useAccount()?.accountId;
  const canEdit = canEditClub(club, viewer);
  const [justCreated] = useState(() => new URLSearchParams(search).get(JUST_CREATED_PARAM) === "1");
  const [mode, setMode] = useState<Mode>(() =>
    justCreated && canEdit
      ? { kind: "editing", startWithBlankRow: true }
      : { kind: "view", focusEdit: false },
  );

  // A reload or Back to this page shouldn't open Edit mode again.
  useEffect(() => {
    if (justCreated) navigate(clubPath(club.id), { replace: true });
    // Once, on opening.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Someone who may no longer change the Club (an Organizer made a Player) leaves Edit mode.
  if (mode.kind === "editing" && canEdit) {
    return (
      <PlayersEditing
        club={club}
        startWithBlankRow={mode.startWithBlankRow}
        onDone={() => setMode({ kind: "view", focusEdit: true })}
      />
    );
  }
  return (
    <ClubView
      club={club}
      viewer={viewer}
      canEdit={canEdit}
      focusEdit={mode.kind === "view" && mode.focusEdit}
      onEditPlayers={() => setMode({ kind: "editing", startWithBlankRow: false })}
    />
  );
}

/** The Club page outside Players Edit mode. */
function ClubView({
  club,
  viewer,
  canEdit,
  focusEdit,
  onEditPlayers,
}: {
  club: Club;
  viewer: string | undefined;
  canEdit: boolean;
  /** Back from Edit mode: focus the Players heading's Edit, which took Cancel's place. */
  focusEdit: boolean;
  onEditPlayers: () => void;
}) {
  const [, navigate] = useLocation();
  const account = useAccount();
  const online = useOnline();
  const hasBackend = getBackend() !== null;
  const canDelete = canDeleteClub(club, viewer);
  const canLeave = club.kind === "shared" && !!ownRow(club, viewer);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Delete club / Leave club confirmed and waiting for the server. */
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const playersHeadingId = useId();
  const editRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusEdit) editRef.current?.focus({ preventScroll: true });
    // Once, on leaving Edit mode.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteClub() {
    if (deleting) return;
    setDeleting(true);
    setProblem(null);
    try {
      await removeClub(club);
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to delete Club", error);
      setProblem(clubErrorMessage(error));
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    setProblem(null);
    try {
      await leaveClub(club);
      navigate("/clubs", { replace: true });
    } catch (error) {
      console.error("Failed to leave Club", error);
      setProblem(clubErrorMessage(error));
      setConfirmLeave(false);
      setLeaving(false);
    }
  }

  return (
    <Screen title="Club" backTo="/clubs" onBack={() => !deleting && !leaving}>
      <ClubCard club={club} viewer={viewer} canRename={canEdit} animate={!focusEdit} />

      <ClubSessionCards club={club} viewer={viewer} />

      <section aria-labelledby={playersHeadingId} className="flex flex-col gap-3">
        <PlayersHeading
          id={playersHeadingId}
          count={club.players.length}
          action={
            canEdit ? (
              <PlayersHeadingButton buttonRef={editRef} editing={false} onClick={onEditPlayers} />
            ) : null
          }
          note={canEdit ? null : "Organizers look after this roster."}
        />
        <RosterList
          club={club}
          viewer={viewer}
          emptyNote={
            canEdit ? (
              <>
                No players yet. Tap <span className="font-semibold">Edit</span> to add them.
              </>
            ) : (
              "No players yet."
            )
          }
        />
      </section>

      {club.kind === "local" && hasBackend ? (
        <MakeShared club={club} account={account} online={online !== false} />
      ) : null}

      {canLeave || canDelete ? (
        <DangerZone>
          {problem ? (
            <p
              role="alert"
              className="flex items-start justify-center gap-1.5 text-center text-sm font-semibold text-error"
            >
              <WarningIcon className="mt-0.5 size-4 shrink-0" />
              <span>{problem}</span>
            </p>
          ) : null}
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

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${club.name}?`}
        message="This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        busyLabel="Deleting…"
        onConfirm={() => void deleteClub()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${club.name}?`}
        message={LEAVE_MESSAGE}
        confirmLabel="Leave club"
        tone="danger"
        busy={leaving}
        busyLabel="Leaving…"
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
