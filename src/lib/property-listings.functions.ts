import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminCan } from "@/lib/admin-permissions.server";
import { LISTING_STATUSES, LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/property-listings";

const optionalText = z.string().trim().max(500).nullable().optional();
const optionalNumber = z.number().nonnegative().nullable().optional();
const imageSchema = z.object({ url: z.string().startsWith("/api/public/project-image/listing/"), caption: z.string().trim().max(240), is_cover: z.boolean() });
const listingSchema = z.object({
  id: z.string().uuid().optional(), title: z.string().trim().min(3).max(180), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  property_type: z.enum(PROPERTY_TYPES), listing_type: z.enum(LISTING_TYPES), location: z.string().trim().min(2).max(200), city: optionalText, state: optionalText,
  country: z.string().trim().min(2).max(100).default("Nigeria"), short_description: z.string().trim().max(300).nullable().optional(), description: z.string().trim().min(10).max(10000),
  price: optionalNumber, price_display_text: z.string().trim().max(100).nullable().optional(), currency: z.string().trim().min(3).max(3).default("NGN"),
  size_value: optionalNumber, size_unit: z.string().trim().max(40).nullable().optional(), bedrooms: z.number().int().nonnegative().nullable().optional(), bathrooms: optionalNumber,
  parking_spaces: z.number().int().nonnegative().nullable().optional(), property_status: z.enum(PROPERTY_STATUSES), listing_status: z.enum(LISTING_STATUSES), featured: z.boolean(),
  developer_name: optionalText, contact_name: optionalText, contact_email: z.string().email().nullable().optional().or(z.literal("")), contact_phone: optionalText,
  latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), key_features: z.array(z.string().trim().min(1).max(160)).max(40),
  images: z.array(imageSchema).max(30),
});

export type PropertyListingInput = z.infer<typeof listingSchema>;

export const savePropertyListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listingSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminCan(context.supabase as never, context.userId, "property_listings", data.id ? "edit" : "create");
    const { images, id, ...listing } = data;
    if (images.length > 0 && !images.some((image) => image.is_cover)) {
      throw new Error("Choose a cover image before saving the listing.");
    }
    const payload = {
      id,
      title: listing.title, slug: listing.slug, property_type: listing.property_type,
      listing_type: listing.listing_type, location: listing.location, city: listing.city ?? null,
      state: listing.state ?? null, country: listing.country, short_description: listing.short_description ?? null,
      description: listing.description, price: listing.price ?? null,
      price_display_text: listing.price_display_text ?? null, currency: listing.currency,
      size_value: listing.size_value ?? null, size_unit: listing.size_unit ?? null,
      bedrooms: listing.bedrooms ?? null, bathrooms: listing.bathrooms ?? null,
      parking_spaces: listing.parking_spaces ?? null, property_status: listing.property_status,
      listing_status: listing.listing_status, featured: listing.featured,
      developer_name: listing.developer_name ?? null, contact_name: listing.contact_name ?? null,
      contact_email: listing.contact_email || null, contact_phone: listing.contact_phone ?? null,
      latitude: listing.latitude ?? null, longitude: listing.longitude ?? null,
      key_features: listing.key_features,
    };
    const { data: listingId, error } = await context.supabase.rpc("save_property_listing", {
      _listing: payload,
      _images: images,
    });
    if (error || !listingId) throw new Error(error?.message || "Listing could not be saved.");
    return { id: listingId };
  });

export const archivePropertyListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdminCan(context.supabase as never, context.userId, "property_listings", "edit");
    const { error } = await context.supabase.from("property_listings").update({ listing_status: "archived", updated_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
