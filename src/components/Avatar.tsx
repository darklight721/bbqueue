import { initials } from "../domain/initials.ts";
import { UserIcon } from "./icons.tsx";

const SIZES = {
  /** Home's top-right corner: a 48px tap target. */
  md: { box: "size-12", text: "text-xl", icon: "size-6" },
  /** Account settings. */
  lg: { box: "size-20", text: "text-4xl", icon: "size-10" },
} as const;

/**
 * The Account's initials on an off-white disc (like the BrandMark), or a person icon on an
 * outlined, see-through disc when there is no Account (or no initials). Meant for court green.
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
      className={`grid shrink-0 place-items-center rounded-full select-none ${sizes.box} ${
        letters
          ? "bg-line text-court shadow-[0_6px_14px_rgb(0_0_0/0.2)]"
          : "border-2 border-dashed border-line/70 bg-black/10 text-line"
      } ${className}`}
    >
      {letters ? (
        <span className={`font-display leading-none font-extrabold tracking-tight ${sizes.text}`}>
          {letters}
        </span>
      ) : (
        <UserIcon className={sizes.icon} />
      )}
    </span>
  );
}
