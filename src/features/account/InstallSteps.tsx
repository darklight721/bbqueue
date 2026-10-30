import type { ReactNode } from "react";
import { BrandMark } from "../../components/BrandMark.tsx";
import { MenuDotsIcon, PlusIcon, ShareIcon } from "../../components/icons.tsx";
import type { InstallHintKind } from "./installHint.ts";

/**
 * How to install, as three numbered steps for the platform. `court` sits on the court-green hero,
 * `plain` on the page background.
 */
export function InstallSteps({
  platform,
  tone,
}: {
  platform: InstallHintKind;
  tone: "court" | "plain";
}) {
  const muted = tone === "court" ? "text-line/75" : "text-base-content/65";
  const strong = `font-semibold ${tone === "court" ? "text-line" : "text-base-content"}`;
  return (
    <ol className="flex flex-col gap-2.5">
      {platform === "ios" ? (
        <>
          <Step number={1} tone={tone} icon={<ShareIcon className="size-[1.15rem]" />}>
            Open the browser's <span className={strong}>Share</span> menu{" "}
            <span className={muted}>(it may be under ⋯)</span>
          </Step>
          <Step number={2} tone={tone} icon={<PlusIcon className="size-[1.15rem]" />}>
            Choose <span className={strong}>Add to Home Screen</span>
          </Step>
        </>
      ) : (
        <>
          <Step number={1} tone={tone} icon={<MenuDotsIcon className="size-[1.15rem]" />}>
            Open the browser's <span className={strong}>⋮</span> menu
          </Step>
          <Step number={2} tone={tone} icon={<PlusIcon className="size-[1.15rem]" />}>
            Choose <span className={strong}>Install app</span> or{" "}
            <span className={strong}>Add to Home Screen</span>
          </Step>
        </>
      )}
      <Step number={3} tone={tone} icon={<BrandMark className="size-5" />}>
        Open BBQueue from your Home Screen
      </Step>
    </ol>
  );
}

function Step({
  number,
  tone,
  icon,
  children,
}: {
  number: number;
  tone: "court" | "plain";
  icon: ReactNode;
  children: ReactNode;
}) {
  const iconTile =
    tone === "court"
      ? "bg-line/12 text-line ring-1 ring-line/25"
      : "bg-base-200 text-base-content/80 ring-1 ring-base-300";
  return (
    <li className="flex items-center gap-3">
      {/* The list already numbers the steps for screen readers. */}
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-volt font-display text-base leading-none font-extrabold text-[#14201a]"
      >
        {number}
      </span>
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      <span
        aria-hidden="true"
        className={`grid size-9 shrink-0 place-items-center rounded-[0.6rem] ${iconTile}`}
      >
        {icon}
      </span>
    </li>
  );
}
