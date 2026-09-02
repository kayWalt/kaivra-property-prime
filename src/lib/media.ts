import fallbackProject from "@/assets/kaivra-22-00-51.jpg.asset.json";
import fallbackProject2 from "@/assets/kaivra-22-00-55.jpg.asset.json";

/**
 * Media helpers shared by every surface that renders project / property
 * imagery.
 *
 * Production issues handled here:
 *  - Bundled `*.asset.json` files were generated against an older Lovable
 *    project slug (`kaivra-property-prime.lovable.app`). That host now 404s,
 *    so every team/partner/hero image broke on kaivraa.com. We normalise any
 *    `/__l5e/` asset URL onto the live asset host.
 *  - Legacy database rows can hold a root-relative Lovable asset path
 *    (`/__l5e/...`). That path only resolves on the Lovable host, so it 404s
 *    on the custom domain. We rewrite it to the absolute asset URL.
 *  - Older placeholders pointed at `/images/project-*.jpg`, files that do not
 *    exist in `public/`, producing permanently broken images. Fallbacks now
 *    point at real, bundled assets.
 */
const ASSET_CDN_ORIGIN = "https://kaivraa-com.lovable.app";
const STALE_ASSET_HOSTS = [
  "https://kaivra-property-prime.lovable.app",
  "https://kaivra-property-prime-dev.lovable.app",
];

/**
 * Normalises a bundled asset URL (from a `*.asset.json` import) so it always
 * resolves, whichever host the app is served from.
 */
export function assetUrl(url: string): string {
  for (const stale of STALE_ASSET_HOSTS) {
    if (url.startsWith(stale)) return `${ASSET_CDN_ORIGIN}${url.slice(stale.length)}`;
  }
  if (url.startsWith("/__l5e/")) return `${ASSET_CDN_ORIGIN}${url}`;
  return url;
}

export const FALLBACK_PROJECT_IMAGE = assetUrl(fallbackProject.url);
export const FALLBACK_PROPERTY_IMAGE = assetUrl(fallbackProject2.url);

export function mediaSrc(
  src?: string | null,
  fallback: string = FALLBACK_PROJECT_IMAGE,
): string {
  if (!src) return fallback;
  return assetUrl(src);
}
