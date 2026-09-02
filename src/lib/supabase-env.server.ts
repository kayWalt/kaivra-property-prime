/**
 * Production-safe resolution of the server-side Supabase configuration.
 *
 * Lovable hosting injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, but a
 * self-hosted deployment (GitHub -> Cloudflare) may only expose the VITE_*
 * build variables. Resolving both name sets keeps image/storage endpoints
 * working in either environment, and returning `null` (instead of throwing)
 * lets callers degrade to the initials placeholder rather than a 500.
 */
function pick(...names: string[]): string | undefined {
  for (const name of names) {
    // Runtime env (Lovable hosting / Cloudflare Worker bindings).
    const runtime =
      typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    if (runtime) return runtime;
    // Build-time inlined env (self-hosted GitHub -> Cloudflare builds only
    // carry the VITE_* variables, and only through import.meta.env).
    const inlined = (import.meta.env as Record<string, string | undefined>)[name];
    if (inlined) return inlined;
  }
  return undefined;
}

export type StorageConfig = { url: string; key: string; serviceRole: boolean };

export function resolveStorageConfig(): StorageConfig | null {
  const url = pick("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!url) return null;
  const serviceKey = pick("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey) return { url, key: serviceKey, serviceRole: true };
  const publishable = pick("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!publishable) return null;
  return { url, key: publishable, serviceRole: false };
}

function authHeaders(cfg: StorageConfig): Record<string, string> {
  const headers: Record<string, string> = { apikey: cfg.key };
  // New-format keys (sb_secret_/sb_publishable_) are opaque, not JWTs, but
  // Storage still accepts them as a bearer token.
  headers["Authorization"] = `Bearer ${cfg.key}`;
  return headers;
}

/**
 * Streams a Storage object through the app's own origin. Returns null when the
 * object is missing or the environment is not configured.
 */
export async function downloadStorageObject(
  bucket: string,
  path: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const cfg = resolveStorageConfig();
  if (!cfg) {
    console.error("[storage] Supabase environment is not configured on this deployment.");
    return null;
  }
  const endpoint = `${cfg.url}/storage/v1/object/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(endpoint, { headers: authHeaders(cfg) });
  if (!res.ok) return null;
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "image/jpeg",
  };
}
