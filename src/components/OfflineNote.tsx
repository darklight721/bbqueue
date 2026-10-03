import type { ReactNode } from "react";
import { OfflineIcon } from "./icons.tsx";

/**
 * One quiet line saying what needs a connection, with the no-connection icon. For short notes
 * beside the thing that is turned off; `OfflineNotice` is the larger card.
 */
export function OfflineNote({
  children,
  id,
  role,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  role?: "status";
  className?: string;
}) {
  return (
    <p
      id={id}
      role={role}
      className={`flex items-start gap-1.5 text-sm text-base-content/70 ${className}`}
    >
      <OfflineIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
