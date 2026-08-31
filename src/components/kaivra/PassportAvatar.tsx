import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function initialsFor(name?: string | null) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /[a-zA-Z]/.test(p));
  if (parts.length === 0) return "KV";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "KV";
}

/**
 * Circular investor avatar rendered from the passport document signed URL.
 * Falls back to premium initials whenever the URL is missing, expired,
 * unreachable or the file is corrupt — never a broken image.
 */
export function PassportAvatar({
  url,
  name,
  className,
  textClassName,
  loading = false,
  zoomable = false,
}: {
  url?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  textClassName?: string | undefined;
  loading?: boolean | undefined;
  zoomable?: boolean | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setFailed(false);
    setReady(false);
  }, [url]);

  const base = cn(
    "relative shrink-0 overflow-hidden rounded-full border border-border bg-muted shadow-sm",
    "size-14",
    className,
  );

  if (loading) {
    return <span className={cn(base, "animate-pulse")} aria-hidden />;
  }

  if (!url || failed) {
    return (
      <span
        className={cn(
          base,
          "flex items-center justify-center bg-secondary font-display tracking-wide text-secondary-foreground",
          textClassName,
        )}
        aria-label={name ? `${name} — no photograph on file` : "No photograph on file"}
      >
        {initialsFor(name)}
      </span>
    );
  }

  const img = (
    <img
      src={url}
      alt={name ? `${name}'s passport photograph` : "Investor passport photograph"}
      loading="lazy"
      decoding="async"
      onLoad={() => setReady(true)}
      onError={() => setFailed(true)}
      className={cn(
        "size-full object-cover transition-opacity duration-300",
        ready ? "opacity-100" : "opacity-0",
      )}
    />
  );

  if (!zoomable) return <span className={base}>{img}</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(base, "cursor-zoom-in transition-shadow hover:shadow-md")}
        aria-label="Open larger photograph"
      >
        {img}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-2">
          <img
            src={url}
            alt={name ? `${name}'s passport photograph` : "Investor passport photograph"}
            className="max-h-[70vh] w-full rounded-md object-contain"
            onError={() => {
              setFailed(true);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
