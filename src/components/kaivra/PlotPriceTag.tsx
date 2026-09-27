import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/kaivra";
import { propertyPricing } from "@/lib/property-pricing";

/**
 * Non-destructive overlay tag showing a property's plot size and full price
 * on top of the existing property image. Reads values from the property
 * record — never hard-coded.
 */
export function PlotPriceTag({
  sizeLabel,
  price,
  promoPrice,
  promoStartsAt,
  promoEndsAt,
  currency,
  className,
}: {
  sizeLabel?: string | null;
  price?: number | null;
  promoPrice?: number | null;
  promoStartsAt?: string | null;
  promoEndsAt?: string | null;
  currency?: string;
  className?: string;
}) {
  if (!sizeLabel && !price) return null;
  const pricing = propertyPricing({
    unit_price: price ?? 0,
    promo_price: promoPrice ?? null,
    promo_starts_at: promoStartsAt ?? null,
    promo_ends_at: promoEndsAt ?? null,
  });
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
        <span className="block leading-tight">
          {pricing.isPromoActive ? (
            <span className="mr-1.5 text-[0.65rem] text-onyx-foreground/70 line-through">
              {formatNaira(pricing.standardPrice, currency)}
            </span>
          ) : null}
          <span className="font-display text-sm text-onyx-foreground sm:text-base">
            {formatNaira(pricing.effectivePrice, currency)}
          </span>
        </span>
      ) : null}
    </div>
  );
}
