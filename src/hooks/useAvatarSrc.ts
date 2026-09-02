import { useCallback, useEffect, useState } from "react";
import { signAvatarUrl } from "@/lib/avatar-url.functions";

const AVATAR_ROUTE_PREFIX = "/api/public/avatar/";

/**
 * Resolves a stored avatar URL to something the browser can actually load.
 *
 * Primary source stays the existing same-origin streaming route. If that route
 * cannot serve the file (deployment without a service-role key, transient
 * failure), we fall back to a Storage signed URL generated with the caller's
 * own session, which keeps existing RLS in force. If both fail, the caller
 * gets `null` and renders the initials placeholder.
 */
export function useAvatarSrc(url?: string | null) {
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    setSrc(url ?? null);
    setTriedFallback(false);
  }, [url]);

  const onError = useCallback(() => {
    if (triedFallback || !url || !url.startsWith(AVATAR_ROUTE_PREFIX)) {
      setSrc(null);
      return;
    }
    setTriedFallback(true);
    const path = url.slice(AVATAR_ROUTE_PREFIX.length);
    void signAvatarUrl({ data: { path } })
      .then((res) => setSrc(res.url ?? null))
      .catch(() => setSrc(null));
  }, [triedFallback, url]);

  return { src, onError };
}
