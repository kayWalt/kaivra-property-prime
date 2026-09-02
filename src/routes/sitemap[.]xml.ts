import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://kaivraa.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

function pick(...names: string[]): string | undefined {
  for (const name of names) {
    const runtime =
      typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    if (runtime) return runtime;
    const inlined = (import.meta.env as Record<string, string | undefined>)[name];
    if (inlined) return inlined;
  }
  return undefined;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/real-estate-investment-abuja", changefreq: "monthly", priority: "0.8" },
          { path: "/auth", changefreq: "yearly", priority: "0.3" },
        ];

        // Expand each publicly visible project detail page (same source and
        // visibility filter the public catalogue uses: is_active = true).
        const url = pick("SUPABASE_URL", "VITE_SUPABASE_URL");
        const key = pick("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
        if (url && key) {
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
                  headers.delete("Authorization");
                }
                headers.set("apikey", key);
                return fetch(input, { ...init, headers });
              },
            },
          });

          const pageSize = 1000;
          for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase
              .from("projects")
              .select("id")
              .eq("is_active", true)
              .order("id")
              .range(offset, offset + pageSize - 1);
            if (error) break; // never let a sitemap 500 on a data hiccup
            entries.push(
              ...data.map((p) => ({
                path: `/projects/${p.id}`,
                changefreq: "weekly" as const,
                priority: "0.7",
              })),
            );
            if (data.length < pageSize) break;
          }
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
