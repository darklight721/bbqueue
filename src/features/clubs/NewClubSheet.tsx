import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "wouter";
import { createClub } from "../../backend/clubs.ts";
import { Modal } from "../../components/Modal.tsx";
import { newId } from "../../domain/ids.ts";
import { normalizeName, validateName } from "../../domain/validation.ts";
import { useClubs } from "../../storage/store.ts";
import { clubErrorMessage, clubNameMessage } from "../club-edit/clubErrors.ts";
import { newClubPath } from "../club-edit/clubPaths.ts";

/**
 * "New club" sheet on the Clubs page: a name, then Create club. The Club is made as before (a
 * Shared club while signed in, starting with the creator's own row as Organizer; a Local club
 * otherwise), and its page opens in Players Edit mode to add the players.
 */
export function NewClubSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The sheet stays put while the Club is being made.
  const [creating, setCreating] = useState(false);
  return (
    <Modal
      open={open}
      title="New club"
      closeLabel="Close"
      onClose={() => {
        if (!creating) onClose();
      }}
    >
      <NewClubForm creating={creating} setCreating={setCreating} />
    </Modal>
  );
}

function NewClubForm({
  creating,
  setCreating,
}: {
  creating: boolean;
  setCreating: (creating: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const clubs = useClubs();
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** The new Club's id, once created: its page opens as soon as the Club is on the device. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const messageId = useId();

  const nameError = validateName(
    name,
    clubs.map((club) => club.name),
  );
  const shownError = attempted && nameError ? clubNameMessage(nameError) : null;

  // A Shared club reaches the device through the server's listener, a moment after it is created.
  useEffect(() => {
    if (createdId && clubs.some((club) => club.id === createdId)) {
      navigate(newClubPath(createdId));
    }
  }, [createdId, clubs, navigate]);

  async function create() {
    if (creating) return;
    if (nameError) {
      setAttempted(true);
      inputRef.current?.focus();
      return;
    }
    const id = newId();
    setCreating(true);
    setFailure(null);
    try {
      await createClub({ id, name: normalizeName(name), kind: "local", players: [] });
      setCreatedId(id);
    } catch (error) {
      console.error("Failed to create Club", error);
      setFailure(
        clubErrorMessage(error).replace(
          "Couldn't save your changes. Try again.",
          "Couldn't create the club. Try again.",
        ),
      );
      setCreating(false);
    }
  }

  return (
    <form
      noValidate
      aria-busy={creating || undefined}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label htmlFor={nameId} className="text-sm font-semibold text-base-content/80">
        Club name
      </label>
      <input
        ref={inputRef}
        id={nameId}
        type="text"
        className={`input input-lg mt-1 w-full font-semibold ${shownError ? "input-error" : ""}`}
        value={name}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="go"
        readOnly={creating}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? messageId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          setFailure(null);
        }}
      />
      {/* One reserved line for any message, so an error doesn't push the button down. */}
      <div className="flex min-h-7 items-end pl-1 text-sm leading-tight font-semibold text-error">
        {shownError ? <p id={messageId}>{shownError}</p> : null}
        {/* Always mounted, so screen readers announce a failure when its text appears. */}
        <p role="alert">{shownError ? null : failure}</p>
      </div>

      <button
        type="submit"
        className={`btn btn-lg btn-primary mt-3 w-full ${creating ? "btn-disabled" : ""}`}
        // aria-disabled rather than disabled: keeps focus on the button while busy.
        aria-disabled={creating || undefined}
        aria-busy={creating || undefined}
      >
        {creating ? (
          <>
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            Creating…
          </>
        ) : (
          "Create club"
        )}
      </button>
    </form>
  );
}
