import { useBackendOnline } from "../../backend/clubs.ts";
import { OfflineNote } from "../../components/OfflineNote.tsx";
import { useNow } from "./clock.ts";
import { copyNote } from "./copyAge.ts";

/**
 * Shown to everyone who isn't the Session host (ADR-0007): they watch, the host changes. Says who
 * the host is and, when the copy isn't live (offline, or a while since the host's last upload),
 * how old it is.
 */
export function WatchingNote({ hostName, updatedAt }: { hostName: string; updatedAt: number }) {
  const online = useBackendOnline();
  const now = useNow();
  const note = copyNote({ updatedAt, now, online });
  return (
    <div className="flex flex-col gap-1 rounded-box bg-base-200 px-4 py-3">
      <p className="text-sm font-semibold">Watching. {hostName} runs this session.</p>
      <p className="text-sm text-base-content/70">Only the session host can change it.</p>
      {note ? (
        note.offline ? (
          <OfflineNote role="status">{note.text}</OfflineNote>
        ) : (
          <p role="status" className="text-sm text-base-content/70">
            {note.text}
          </p>
        )
      ) : null}
    </div>
  );
}
