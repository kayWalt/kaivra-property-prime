import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/kaivra";

/**
 * Non-destructive overlay tag showing a property's plot size and full price
 * on top of the existing property image. Reads values from the property
 * record — never hard-coded.
 */
export function PlotPriceTag({
  sizeLabel,
  price,
  currency,
  className,
}: {
  sizeLabel?: string | null;
  price?: number | null;
  currency?: string;
  className?: string;
}) {
  if (!sizeLabel && !price) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-gold/40 bg-onyx/70 px-2.5 py-1.5 backdrop-blur-sm sm:left-3 sm:top-3",
        className,
      )}
    >
      {sizeLabel ? (
        <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-gold">
          {sizeLabel}
        </span>
      ) : null}
      {price ? (
        <span className="block font-display text-sm leading-tight text-onyx-foreground sm:text-base">
          {formatNaira(price, currency)}
        </span>
      ) : null}
    </div>
  );
}
