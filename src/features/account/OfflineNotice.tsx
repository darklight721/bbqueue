import type { ReactNode } from "react";
import { OfflineIcon } from "../../components/icons.tsx";

/** "You're offline" card for actions that need a connection (creating an Account). */
export function OfflineNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-box bg-base-200 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-base-100 text-base-content/70">
        <OfflineIcon className="size-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-display text-xl leading-tight font-bold uppercase">You're offline</p>
        <p className="text-base-content/75">{children}</p>
      </div>
    </div>
  );
}
