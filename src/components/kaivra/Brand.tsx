import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  tone = "default",
  withTagline = false,
}: {
  className?: string;
  tone?: "default" | "inverted";
  withTagline?: boolean;
}) {
  return (
    <Link
      to="/"
      className={cn("inline-flex flex-col leading-none", className)}
      aria-label="KAIVRA home"
    >
      <span
        className={cn(
          "font-display text-2xl tracking-[0.22em]",
          tone === "inverted" ? "text-onyx-foreground" : "text-foreground",
        )}
      >
        KAIVRA
      </span>
      {withTagline ? (
        <span
          className={cn(
            "eyebrow mt-1 text-[0.6rem]",
            tone === "inverted" ? "text-gold" : "text-muted-foreground",
          )}
        >
          Real Estate Investment Management
        </span>
      ) : null}
    </Link>
  );
}
