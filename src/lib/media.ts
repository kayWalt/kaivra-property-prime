import fallbackProject from "@/assets/kaivra-22-00-51.jpg.asset.json";
import fallbackProject2 from "@/assets/kaivra-22-00-55.jpg.asset.json";

/**
 * Media helpers shared by every surface that renders project / property
 * imagery.
 *
 * Two production issues are handled here:
 *  - Legacy rows can still hold a root-relative Lovable asset path
 *    (`/__l5e/...`). That path only resolves on the Lovable host, so it 404s
 *    on the custom domain. We rewrite it to the absolute CDN URL.
 *  - Older placeholders pointed at `/images/project-*.jpg`, files that do not
 *    exist in `public/`, producing permanently broken images. Fallbacks now
 *    point at real, bundled assets.
 */
const ASSET_CDN_ORIGIN = "https://kaivra-property-prime.lovable.app";

export const FALLBACK_PROJECT_IMAGE = fallbackProject.url;
export const FALLBACK_PROPERTY_IMAGE = fallbackProject2.url;

export function mediaSrc(
  src?: string | null,
  fallback: string = FALLBACK_PROJECT_IMAGE,
): string {
  if (!src) return fallback;
  if (src.startsWith("/__l5e/")) return `${ASSET_CDN_ORIGIN}${src}`;
  return src;
}
