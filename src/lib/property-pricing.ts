export interface PromotionalPropertyPrice {
  unit_price: number | string;
  promo_price?: number | string | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
}

export function propertyPricing(property: PromotionalPropertyPrice, at = new Date()) {
  const standardPrice = Number(property.unit_price ?? 0);
  const promoPrice = Number(property.promo_price ?? 0);
  const startsAt = property.promo_starts_at ? new Date(property.promo_starts_at) : null;
  const endsAt = property.promo_ends_at ? new Date(property.promo_ends_at) : null;
  const active =
    promoPrice > 0 &&
    promoPrice <= standardPrice &&
    startsAt !== null &&
    endsAt !== null &&
    !Number.isNaN(startsAt.getTime()) &&
    !Number.isNaN(endsAt.getTime()) &&
    at >= startsAt &&
    at <= endsAt;

  return {
    standardPrice,
    effectivePrice: active ? promoPrice : standardPrice,
    promoPrice: active ? promoPrice : null,
    promoEndsAt: active ? endsAt : null,
    isPromoActive: active,
  };
}