import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { saveClub } from "../../backend/clubs.ts";
import { getBackend } from "../../backend/index.ts";
import { CourtCard, CourtCardEditButton } from "../../components/CourtCard.tsx";
import { NameSheet } from "../../components/NameSheet.tsx";
import { ownRow } from "../../domain/permissions.ts";
import type { Club } from "../../domain/types.ts";
import { normalizeName, validateName } from "../../domain/validation.ts";
import { useClubs } from "../../storage/store.ts";
import { clubErrorMessage, clubNameMessage } from "./clubErrors.ts";

/**
 * The court-green card at the top of the Club page: the Club's name and what kind of Club it is.
 * `canRename`: an Edit button that opens a sheet with the name, as on the Account page; Save
 * renames the Club and nothing else.
 */
export function ClubCard({
  club,
  viewer,
  canRename,
  animate,
}: {
  club: Club;
  viewer: string | undefined;
  canRename: boolean;
  /** Rise in: the page just opened (not a switch in or out of Players Edit mode). */
  animate: boolean;
}) {
  const clubs = useClubs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(club.name);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const nameId = useId();
  // Says the rename went through, since the sheet that showed it is gone.
  const [announcement, setAnnouncement] = useState("");

  // Unique among this device's Clubs, ignoring case; its own name in a different case is fine.
  const otherNames = clubs.filter((other) => other.id !== club.id).map((other) => other.name);
  const nameError = validateName(draft, otherNames);
  const shownError = attempted && nameError ? clubNameMessage(nameError) : null;

  function startEditing() {
    // Synchronously, so the sheet focuses its field inside the tap and iOS opens the keyboard.
    flushSync(() => {
      setDraft(club.name);
      setAttempted(false);
      setFailure(null);
      setEditing(true);
    });
    setAnnouncement("");
  }

  function stopEditing() {
    // Synchronously, so the sheet is gone before focus goes back to Edit.
    flushSync(() => setEditing(false));
    editRef.current?.focus();
  }

  async function save() {
    if (saving) return;
    if (nameError) {
      setAttempted(true);
      inputRef.current?.focus();
      return;
    }
    const name = normalizeName(draft);
    if (name === club.name) {
      stopEditing();
      return;
    }
    // Put the keyboard away so the busy state and the result are in view.
    inputRef.current?.blur();
    setSaving(true);
    setFailure(null);
    try {
      // A Local club: the device's copy. A Shared club: one rename, nothing else.
      await saveClub(club, { ...club, name });
      setSaving(false);
      stopEditing();
      setAnnouncement("Club renamed");
    } catch (error) {
      console.error("Failed to rename Club", error);
      setSaving(false);
      setFailure(clubErrorMessage(error));
    }
  }

  return (
    <CourtCard label="Club" animate={animate}>
      <div className="flex items-start justify-between gap-3">
        <h2
          id={nameId}
          className="min-w-0 pt-0.5 font-display text-4xl leading-none font-bold break-words uppercase"
        >
          {club.name}
        </h2>
        {canRename ? (
          <CourtCardEditButton buttonRef={editRef} label="Edit club name" onClick={startEditing} />
        ) : null}
      </div>
      <KindLine club={club} viewer={viewer} />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <NameSheet
        open={editing}
        title="Edit club name"
        inputRef={inputRef}
        label="Club name"
        value={draft}
        saving={saving}
        error={shownError}
        failure={failure}
        onChange={(value) => {
          setDraft(value);
          setFailure(null);
        }}
        onSave={() => void save()}
        onClose={stopEditing}
      />
    </CourtCard>
  );
}

/** "Shared club · You're an Organizer", "This device only" (with a Backend), or nothing. */
function KindLine({ club, viewer }: { club: Club; viewer: string | undefined }) {
  let text: string | null = null;
  if (club.kind === "shared") {
    const role = ownRow(club, viewer)?.link?.role;
    text =
      role === "organizer"
        ? "Shared club · You're an Organizer"
        : role === "player"
          ? "Shared club · You're a Player"
          : "Shared club";
  } else if (getBackend() !== null) {
    text = "This device only";
  }
  return text ? <p className="mt-3 text-sm font-semibold text-line/85">{text}</p> : null;
}
