import { useId, useMemo, useState } from "react";
import { makeClubShared } from "../../backend/clubs.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { Modal } from "../../components/Modal.tsx";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import type { ShareChoice } from "../../domain/makeShared.ts";
import type { Account, Club } from "../../domain/types.ts";
import { namesEqual } from "../../domain/validation.ts";
import { clubErrorMessage } from "./clubErrors.ts";

/** What the confirm dialog says: others will see the Club, and there is no way back. */
export const MAKE_SHARED_MESSAGE =
  "Anyone you add will be able to see this Club and its Sessions. This can't be undone.";

const ADD_ME = "add-me";

/**
 * "Make shared club" on a Local club (ticket 10): pick which player you are (an existing row, or
 * "Add me"), confirm, and the Club, its roster, Ended sessions and running Session move to the
 * server. Signed out there is nothing to share with, so it says what's needed instead; offline it
 * is turned off with the reason.
 */
export function MakeShared({
  club,
  account,
  online,
  dirty,
}: {
  club: Club;
  account: Account | null;
  online: boolean;
  /** The form has changes that aren't saved: they would be left behind. */
  dirty: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reasonId = useId();
  const groupName = useId();

  const rows = useMemo(
    () =>
      [...club.players].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [club.players],
  );
  const addMeTaken = !!account && rows.some((row) => namesEqual(row.name, account.name));

  if (!account) {
    return (
      <section aria-label="Share this club" className="flex flex-col gap-1">
        <p className="text-sm text-base-content/70">
          Create an Account to share this club with other people.
        </p>
      </section>
    );
  }

  const blocked = !online || dirty || busy;
  const choice: ShareChoice | null =
    picked === null
      ? null
      : picked === ADD_ME
        ? { type: "add-me" }
        : { type: "row", rowId: picked };

  async function run() {
    if (!choice) return;
    setConfirming(false);
    setChoosing(false);
    setBusy(true);
    setProblem(null);
    try {
      await makeClubShared(club, choice);
      // The Club is Shared now; this screen follows it.
    } catch (error) {
      console.error("Failed to make the Club shared", error);
      setProblem(
        clubErrorMessage(error).replace(
          "Couldn't save your changes. Try again.",
          "Couldn't make this club shared. It's still on this device only. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Share this club" className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-lg btn-outline border-base-300"
        disabled={blocked}
        aria-describedby={blocked || problem ? reasonId : undefined}
        onClick={() => {
          setPicked(null);
          setChoosing(true);
        }}
      >
        {busy ? "Making shared…" : "Make shared club"}
      </button>
      {!online ? (
        <OfflineNote id={reasonId}>You're offline. Sharing a club needs a connection.</OfflineNote>
      ) : dirty ? (
        <p id={reasonId} className="text-sm text-base-content/70">
          Save your changes first.
        </p>
      ) : problem ? (
        <p id={reasonId} role="alert" className="text-sm font-semibold text-error">
          {problem}
        </p>
      ) : (
        <p className="text-sm text-base-content/70">
          Let other people see this club and its sessions. Only this device has it today.
        </p>
      )}

      <Modal
        open={choosing}
        title="Which player are you?"
        description="You'll be this club's Organizer."
        onClose={() => setChoosing(false)}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Which player are you?</legend>
          <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-box border-[1.5px] border-base-300 px-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                  <input
                    type="radio"
                    className="radio radio-primary"
                    name={groupName}
                    value={row.id}
                    checked={picked === row.id}
                    onChange={() => setPicked(row.id)}
                  />
                  <span className="font-semibold">{row.name}</span>
                </label>
              </li>
            ))}
            <li>
              <label
                className={`flex min-h-12 items-center gap-3 rounded-box border-[1.5px] px-3 ${
                  addMeTaken
                    ? "border-base-300 opacity-60"
                    : "cursor-pointer border-base-300 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                }`}
              >
                <input
                  type="radio"
                  className="radio radio-primary"
                  name={groupName}
                  value={ADD_ME}
                  disabled={addMeTaken}
                  checked={picked === ADD_ME}
                  onChange={() => setPicked(ADD_ME)}
                />
                <span className="flex flex-col">
                  <span className="font-semibold">Add me</span>
                  <span className="text-sm text-base-content/70">
                    {addMeTaken
                      ? `A player called ${account.name} is on the roster already. Pick that row.`
                      : `${account.name}, Intermediate`}
                  </span>
                </span>
              </label>
            </li>
          </ul>
        </fieldset>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-lg btn-outline border-base-300"
            onClick={() => setChoosing(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-lg btn-primary"
            disabled={!choice}
            onClick={() => {
              setChoosing(false);
              setConfirming(true);
            }}
          >
            Continue
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        title={`Make ${club.name} a shared club?`}
        message={MAKE_SHARED_MESSAGE}
        confirmLabel="Make shared club"
        onConfirm={() => void run()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
