import { Link } from "@tanstack/react-router";
import { Bath, BedDouble, CarFront, MapPin, Maximize2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FALLBACK_PROPERTY_IMAGE, mediaSrc } from "@/lib/media";
import { listingCover, listingLocation, listingPrice, titleCase, type PropertyListing } from "@/lib/property-listings";

export function PropertyListingCard({ listing }: { listing: PropertyListing }) {
  const cover = mediaSrc(listingCover(listing), FALLBACK_PROPERTY_IMAGE);
  return <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-card">
    <Link to="/properties/$slug" params={{ slug: listing.slug }} className="relative block aspect-[4/3] overflow-hidden">
      <img src={cover} alt={listing.title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">{listing.featured ? <Badge className="bg-gold text-gold-foreground"><Star className="mr-1 size-3" /> Featured</Badge> : null}<Badge variant="secondary">For {titleCase(listing.listing_type)}</Badge></div>
    </Link>
    <div className="p-4">
      <h2 className="line-clamp-2 font-display text-xl"><Link to="/properties/$slug" params={{ slug: listing.slug }}>{listing.title}</Link></h2>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{listingLocation(listing)}</p>
      <p className="mt-3 text-xl font-semibold text-primary">{listingPrice(listing)}</p>
      <div className="mt-3 flex min-h-6 flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {listing.bedrooms != null ? <span className="flex items-center gap-1"><BedDouble className="size-4" />{listing.bedrooms} beds</span> : null}
        {listing.bathrooms != null ? <span className="flex items-center gap-1"><Bath className="size-4" />{listing.bathrooms} baths</span> : null}
        {listing.parking_spaces != null ? <span className="flex items-center gap-1"><CarFront className="size-4" />{listing.parking_spaces} parking</span> : null}
        {listing.size_value != null ? <span className="flex items-center gap-1"><Maximize2 className="size-4" />{listing.size_value} {listing.size_unit}</span> : null}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4"><div className="flex gap-2"><Badge variant="outline">{titleCase(listing.property_type)}</Badge><Badge variant="outline" className="text-success">{titleCase(listing.property_status)}</Badge></div><Button asChild size="sm"><Link to="/properties/$slug" params={{ slug: listing.slug }}>View details</Link></Button></div>
    </div>
  </article>;
}
