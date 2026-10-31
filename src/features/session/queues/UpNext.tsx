import { useId, useMemo } from "react";
import { PlusIcon } from "../../../components/icons.tsx";
import { addQueue, upNext } from "../../../domain/engine/index.ts";
import { useAccount } from "../../../storage/store.ts";
import { useNow } from "../clock.ts";
import { useSessionActions, useSessionView } from "../context.ts";
import { isOwnWhileWatching } from "../ownPlayer.ts";
import { SessionPlayerChip } from "../PlayerViews.tsx";
import { upNextReasonLabel } from "./upNextText.ts";

/**
 * Up next: the free players in the order the app would pick them, the Likely next four first.
 * A forecast for everyone watching; the Session host can turn the four into a Queue.
 * Nothing until the first Match has started.
 */
export function UpNext() {
  const view = useSessionView();
  const { session, playerById, asOf, readOnly } = view;
  const actions = useSessionActions();
  const account = useAccount();
  const now = useNow();
  const headingId = useId();
  // Worked out at `asOf`, not the clock, so every device shows the same order.
  const forecast = useMemo(() => upNext(session, asOf), [session, asOf]);
  if (!forecast) return null;
  const { rows, lineup } = forecast;

  const queueThese = () => {
    if (!lineup) return;
    actions.run((s, ctx) => ({ ok: true as const, session: addQueue(s, ctx, lineup) }));
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="font-display text-2xl uppercase">
        Up next
      </h3>
      {rows.length === 0 ? (
        <p className="rounded-box border-[1.5px] border-dashed border-base-300 px-4 py-5 text-center text-base-content/70">
          Everyone’s on court or in a Lineup.
        </p>
      ) : (
        <>
          <ol
            aria-labelledby={headingId}
            className="overflow-hidden rounded-box border-[1.5px] border-base-300 bg-base-100 md:grid md:grid-cols-2"
          >
            {rows.map((row, index) => {
              const player = playerById.get(row.playerId);
              const isMine = !!player && isOwnWhileWatching(player, view, account);
              const reason = upNextReasonLabel(row.reason, now - asOf);
              return (
                <li
                  key={row.playerId}
                  className={`flex min-h-14 items-center gap-3 border-b border-base-300 px-4 py-2 last:border-b-0 md:odd:border-r ${
                    isMine ? "bg-primary/6 shadow-[inset_4px_0_0_var(--color-primary)]" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 text-right font-display text-xl text-base-content/50 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <SessionPlayerChip playerId={row.playerId} layout="inline" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isMine ? (
                        <span className="rounded-full bg-primary px-2 py-px text-xs font-bold tracking-wider text-primary-content uppercase">
                          You
                        </span>
                      ) : null}
                      {row.likelyNext ? (
                        <span className="rounded-full border-[1.5px] border-primary/35 bg-primary/10 px-2 py-px text-xs font-semibold whitespace-nowrap text-primary">
                          Likely next
                        </span>
                      ) : null}
                      {reason ? (
                        <span className="rounded-full border-[1.5px] border-transparent bg-base-200 px-2 py-px text-xs font-semibold whitespace-nowrap text-base-content/75">
                          {reason}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {lineup === null ? (
            <p className="text-sm text-base-content/70">
              The rest will come from whoever comes off court.
            </p>
          ) : readOnly ? null : (
            <button
              type="button"
              className="btn btn-lg btn-outline border-base-300"
              onClick={queueThese}
            >
              <PlusIcon className="size-5" />
              Queue these four
            </button>
          )}
        </>
      )}
    </section>
  );
}
