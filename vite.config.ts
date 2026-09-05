// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // Registers the "cloudflare:scheduled" runtime hook that runs the KAIVRA
    // email processors when the Worker's Cron Trigger fires.
    plugins: ["./nitro/plugins/email-cron.ts"],
    cloudflare: {
      wrangler: {
        // Production Worker name and Cron Trigger. Cloudflare invokes the
        // scheduled() handler directly every 15 minutes — no HTTP endpoint,
        // no cron secret required for scheduled runs.
        name: "kaivra-property-prime",
        triggers: { crons: ["*/15 * * * *"] },
      },
      // The lovable config wrapper types only declare nodeCompat/deployConfig;
      // nitro itself supports the full cloudflare.wrangler passthrough.
    } as { nodeCompat?: boolean; deployConfig?: boolean; wrangler?: Record<string, unknown> },
  },
});
