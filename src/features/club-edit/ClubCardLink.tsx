import { useId, type MouseEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRightIcon } from "../../components/icons.tsx";

/**
 * Card link from the Club screen (New session / Open active session / Sessions). Same shape as
 * Home's actions; "active" mirrors Home's Resume session card so a running Session stands out.
 * `tile`: a narrower, stacked card for two side by side (icon and arrow on top, text below).
 */
export function ClubCardLink({
  href,
  tone,
  icon,
  label,
  detail,
  tile = false,
  className = "",
  onClick,
}: {
  href: string;
  tone: "plain" | "active";
  icon: ReactNode;
  label: string;
  detail: string;
  tile?: boolean;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const labelId = useId();
  const detailId = useId();
  const active = tone === "active";
  const iconDisc = (
    <span
      className={`grid size-12 shrink-0 place-items-center rounded-full ${
        active ? "bg-volt text-[#14201a]" : "bg-base-200 text-primary"
      }`}
    >
      {icon}
    </span>
  );
  const chevron = (
    <ChevronRightIcon
      className={`size-6 shrink-0 transition-transform group-hover:translate-x-0.5 ${active ? "opacity-60" : "opacity-50"}`}
    />
  );
  const text = (
    <span className={`flex min-w-0 flex-1 flex-col ${tile ? "gap-1" : ""}`}>
      <span
        id={labelId}
        className={`font-display font-bold uppercase ${tile ? "text-xl leading-none" : "text-2xl leading-tight"}`}
      >
        {label}
      </span>
      <span
        id={detailId}
        className={`text-sm leading-snug text-pretty ${active ? "text-neutral-content/75" : "text-base-content/65"}`}
      >
        {detail}
      </span>
    </span>
  );

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className={`group flex rounded-box transition-transform active:scale-[0.98] ${
        tile ? "flex-col gap-3 p-4 pr-3" : "min-h-20 items-center gap-4 p-4 pr-3"
      } ${className} ${
        active
          ? "bg-neutral text-neutral-content shadow-lg ring-1 ring-black/5"
          : "border-[1.5px] border-base-300 bg-base-100 text-base-content shadow-sm"
      }`}
    >
      {tile ? (
        <>
          <span className="flex items-start justify-between gap-2">
            {iconDisc}
            {chevron}
          </span>
          {text}
        </>
      ) : (
        <>
          {iconDisc}
          {text}
          {chevron}
        </>
      )}
    </Link>
  );
}
