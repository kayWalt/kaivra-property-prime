import type { Database } from "@/integrations/supabase/types";
import { formatNaira } from "@/lib/kaivra";

export type PropertyListing = Database["public"]["Tables"]["property_listings"]["Row"] & {
  property_listing_images?: Database["public"]["Tables"]["property_listing_images"]["Row"][];
};

export const PROPERTY_TYPES = ["land", "house", "apartment", "duplex", "villa", "commercial", "office", "shop", "warehouse", "estate", "other"] as const;
export const LISTING_TYPES = ["sale", "rent", "lease"] as const;
export const PROPERTY_STATUSES = ["available", "coming_soon", "sold", "rented", "leased", "unavailable"] as const;
export const LISTING_STATUSES = ["draft", "published", "archived"] as const;

export function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function listingPrice(listing: Pick<PropertyListing, "price" | "price_display_text" | "currency">) {
  return listing.price_display_text?.trim() || (listing.price == null ? "Price on request" : formatNaira(listing.price, listing.currency));
}

export function listingLocation(listing: Pick<PropertyListing, "location" | "city" | "state">) {
  return [listing.location, listing.city, listing.state].filter((value, index, all) => value && all.indexOf(value) === index).join(", ");
}

export function listingCover(listing: PropertyListing) {
  const images = [...(listing.property_listing_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return images.find((image) => image.is_cover)?.url ?? images[0]?.url ?? null;
}

export function listingFeatures(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
