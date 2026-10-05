import { initials } from "../domain/initials.ts";
import { UserIcon } from "./icons.tsx";

const SIZES = {
  /** Home's top-right corner: a 48px tap target. */
  md: { box: "size-12", ring: "border-2", text: "text-xl", icon: "size-6" },
  /** Account settings. */
  lg: { box: "size-20", ring: "border-[3px]", text: "text-4xl", icon: "size-10" },
} as const;

/**
 * Meant for court green. With an Account: its initials in off-white on a see-through dark-green
 * disc with a solid off-white ring, so the BrandMark stays the only solid off-white disc.
 * With no Account (or no initials): a person icon in an empty, dashed ring.
 * Decorative: whatever wraps it gives the label.
 */
export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  /** The Account's name, or null with no Account. */
  name: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const letters = name ? initials(name) : "";
  const sizes = SIZES[size];
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      className={`grid shrink-0 place-items-center rounded-full text-line select-none ${sizes.box} ${sizes.ring} ${
        letters
          ? "border-line bg-court-deep/65 shadow-[0_6px_14px_rgb(0_0_0/0.18)] backdrop-blur-[2px]"
          : "border-dashed border-line/60 bg-black/10"
      } ${className}`}
    >
      {letters ? (
        <span className={`font-display leading-none font-extrabold tracking-tight ${sizes.text}`}>
          {letters}
        </span>
      ) : (
        <UserIcon className={`${sizes.icon} opacity-85`} />
      )}
    </span>
  );
}
