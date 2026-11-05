import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PencilIcon } from "../../../components/icons.tsx";
import { NAME_ERROR_MESSAGE } from "../../../components/nameErrors.ts";
import { NameSheet } from "../../../components/NameSheet.tsx";
import type { Court } from "../../../domain/types.ts";
import {
  MAX_COURT_NAME_LENGTH,
  normalizeCourtName,
  validateCourtName,
  type NameError,
} from "../../../domain/validation.ts";
import { useSessionActions, useSessionView } from "../context.ts";

function courtNameMessage(error: NameError): string {
  if (error === "duplicate") return "Another court has this name";
  if (error === "too-long") return `Name is too long (at most ${MAX_COURT_NAME_LENGTH} characters)`;
  return NAME_ERROR_MESSAGE[error];
}

/** The pencil beside a Court's name and the sheet it opens. For the Session host only. */
export function CourtNameEdit({ court }: { court: Court }) {
  const { session } = useSessionView();
  const actions = useSessionActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(court.name);
  const [attempted, setAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);

  const otherNames = session.courts
    .filter((other) => other.id !== court.id)
    .map((other) => other.name);
  const nameError = validateCourtName(draft, otherNames);
  const shownError = attempted && nameError ? courtNameMessage(nameError) : null;

  function startEditing() {
    // Synchronously, so the sheet focuses inside the tap.
    flushSync(() => {
      setDraft(court.name);
      setAttempted(false);
      setEditing(true);
    });
  }

  function stopEditing() {
    // Synchronously, so the sheet is gone before focus goes back to the pencil.
    flushSync(() => setEditing(false));
    editRef.current?.focus();
  }

  function save() {
    if (nameError) {
      setAttempted(true);
      inputRef.current?.focus();
      return;
    }
    if (normalizeCourtName(draft) === court.name) {
      stopEditing();
      return;
    }
    if (actions.renameCourt(court.id, draft)) {
      stopEditing();
      actions.notify("Court renamed");
    }
  }

  return (
    <>
      <button
        ref={editRef}
        type="button"
        // Not a `btn`: its hover and focus colours are for the page, and a Busy Court's header is the
        // primary colour in either theme. This takes the header's colour in every state.
        className="-my-2 grid size-11 shrink-0 cursor-pointer touch-manipulation place-items-center rounded-field opacity-80 outline-offset-2 outline-current hover:bg-current/10 hover:opacity-100 focus-visible:outline-2 active:bg-current/15"
        aria-label={`Edit name of ${court.name}`}
        title="Edit court name"
        onClick={startEditing}
      >
        <PencilIcon className="size-5" />
      </button>
      <NameSheet
        open={editing}
        title="Edit court name"
        inputRef={inputRef}
        label="Court name"
        value={draft}
        saving={false}
        error={shownError}
        failure={null}
        onChange={setDraft}
        onSave={save}
        onClose={stopEditing}
      />
    </>
  );
}
