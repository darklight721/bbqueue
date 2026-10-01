import type { ReactNode } from "react";

/** Section title row used by every part of the Session screen. */
export function SectionHeader({
  id,
  title,
  detail,
  action,
}: {
  id: string;
  title: string;
  /** Short status next to the title, e.g. "1 of 2 playing". */
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h2 id={id} className="font-display text-3xl uppercase">
          {title}
        </h2>
        {detail ? (
          <span className="truncate text-sm font-semibold text-base-content/60">{detail}</span>
        ) : null}
      </div>
      {action}
    </div>
  );
}
