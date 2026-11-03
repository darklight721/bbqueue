import { useId, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Modal } from "../../components/Modal.tsx";
import { parseJoinLink } from "../../domain/joinLink.ts";
import { joinPath } from "../join/joinPaths.ts";

/**
 * "Have a Join link?" sheet on the Clubs page: paste a Join link (or just its token) and Open goes
 * to its Join page. For the installed app on iPhone and iPad, where a tapped link opens in the
 * browser instead. The title takes focus on open, so the iOS keyboard waits for a tap on the field.
 */
export function JoinLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Have a Join link?" focusTitle closeLabel="Close" onClose={onClose}>
      <JoinLinkForm />
    </Modal>
  );
}

function JoinLinkForm() {
  const [, navigate] = useLocation();
  const [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const messageId = useId();
  const token = parseJoinLink(text);
  const shownError = attempted && !token ? "That isn't a Join link." : null;

  return (
    <form
      noValidate
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!token) {
          setAttempted(true);
          inputRef.current?.focus();
          return;
        }
        navigate(joinPath(token));
      }}
    >
      <label htmlFor={fieldId} className="text-sm font-semibold text-base-content/80">
        Paste the Join link
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        type="text"
        inputMode="url"
        className={`input input-lg mt-1 w-full font-semibold ${shownError ? "input-error" : ""}`}
        value={text}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? messageId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setAttempted(false);
        }}
      />
      {/* One reserved line for the message, so it doesn't push the button down. */}
      <div className="flex min-h-7 items-end pl-1 text-sm leading-tight font-semibold text-error">
        {shownError ? <p id={messageId}>{shownError}</p> : null}
      </div>
      <button type="submit" className="btn btn-lg btn-primary mt-3 w-full">
        Open
      </button>
    </form>
  );
}
