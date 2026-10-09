import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2" />
      <path d="M6 6.5l1 13h10l1-13" />
      <path d="M10 10.5v5.5M14 10.5v5.5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <path d="M16 4.9a3.25 3.25 0 0 1 0 6.2M18 14.8c1.6.7 2.7 2.4 3 4.7" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </Icon>
  );
}

/** Wi-Fi fan with a slash: no connection. */
export function OfflineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 8.75a14 14 0 0 1 4.6-2.95M10.9 5.05A14 14 0 0 1 21.5 8.75" />
      <path d="M5.75 12.25a9 9 0 0 1 4-2.1M14.9 10.4a9 9 0 0 1 3.35 1.85" />
      <path d="M9.1 15.6a4.5 4.5 0 0 1 5.8 0" />
      <path d="M12 19.25v.01" />
      <path d="m3.5 3.5 17 17" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </Icon>
  );
}

/** Box with an arrow leaving it: the usual "share" glyph. */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v11M7.75 7.5 12 3.25l4.25 4.25" />
      <path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </Icon>
  );
}

/** Clock with a back-turning arrow: looking back on earlier Sessions. */
export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.35-5.65" />
      <path d="M4 3.5v4.5h4.5" />
      <path d="M12 8v4.25l2.75 1.75" />
    </Icon>
  );
}

/** Head and shoulders: a person (the avatar with no Account). */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20c.9-3.9 3.75-6 7.25-6s6.35 2.1 7.25 6" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4z" />
      <path d="m13 7 4 4" />
    </Icon>
  );
}

/** Two overlapping sheets: copy. */
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </Icon>
  );
}

/** Two chain links: a Club player linked to an Account. */
export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 14a4.25 4.25 0 0 0 6 0l3-3a4.25 4.25 0 0 0-6-6l-1 1" />
      <path d="M14 10a4.25 4.25 0 0 0-6 0l-3 3a4.25 4.25 0 0 0 6 6l1-1" />
    </Icon>
  );
}

/** An open eye: watching a Session somebody else runs. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** A rising line with dots on a baseline: Stats. */
export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h16" />
      <path d="m5.5 15.5 4-4.5 3.5 2.5 5.5-7" />
      <circle cx="18.5" cy="6.5" r="1" fill="currentColor" />
    </Icon>
  );
}
