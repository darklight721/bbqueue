import { useId, type MouseEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRightIcon } from "../../components/icons.tsx";

/**
 * Card link from the Club screen (New session / Open active session / Sessions). Same shape as
 * Home's actions; "active" mirrors Home's Resume session card so a running Session stands out.
 */
export function ClubCardLink({
  href,
  tone,
  icon,
  label,
  detail,
  onClick,
}: {
  href: string;
  tone: "plain" | "active";
  icon: ReactNode;
  label: string;
  detail: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const labelId = useId();
  const detailId = useId();
  const active = tone === "active";
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className={`group flex min-h-20 items-center gap-4 rounded-box p-4 pr-3 transition-transform active:scale-[0.98] ${
        active
          ? "bg-neutral text-neutral-content shadow-lg ring-1 ring-black/5"
          : "border-[1.5px] border-base-300 bg-base-100 text-base-content shadow-sm"
      }`}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-full ${
          active ? "bg-volt text-[#14201a]" : "bg-base-200 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-display text-2xl leading-tight font-bold uppercase">
          {label}
        </span>
        <span
          id={detailId}
          className={`truncate text-sm ${active ? "text-neutral-content/75" : "text-base-content/65"}`}
        >
          {detail}
        </span>
      </span>
      <ChevronRightIcon
        className={`size-6 shrink-0 transition-transform group-hover:translate-x-0.5 ${active ? "opacity-60" : "opacity-50"}`}
      />
    </Link>
  );
}
