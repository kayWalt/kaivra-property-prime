import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferenceChipProps {
  /** Small uppercase caption, e.g. "Investor ID". */
  label?: string;
  /** The KAIVRA reference itself, e.g. KVR-I-26-7X9M42. */
  value: string | null | undefined;
  className?: string;
  /** Compact inline variant for tables and list rows. */
  size?: "sm" | "md";
}

/**
 * Premium, copyable presentation for every public-facing KAIVRA reference.
 * Copies instantly and returns to the normal icon after ~1.5s.
 */
export function ReferenceChip({ label, value, className, size = "md" }: ReferenceChipProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = useCallback(() => {
    if (!value) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  }, [value]);

  if (!value) return null;

  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      ) : null}
      <div
        className={cn(
          "mt-1 flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1",
          size === "sm" && "mt-0 px-1.5 py-0.5",
        )}
      >
        <code
          className={cn(
            "min-w-0 overflow-x-auto whitespace-nowrap font-mono font-semibold tracking-tight text-foreground",
            size === "sm" ? "text-[11px]" : "text-xs sm:text-sm",
          )}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${label ?? "reference"}`}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
        {copied ? <span className="shrink-0 text-[10px] text-emerald-500">Copied</span> : null}
      </div>
    </div>
  );
}
