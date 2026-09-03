# KAIVRA Production Readiness Roadmap

## In Progress
- [ ] Fix production analytics ingestion on custom domains (kaivraa.com / www.kaivraa.com)
  - Root cause: custom domain DNS points to user's own Cloudflare infrastructure, not Lovable hosting
  - Lovable origin (kaivraa-com.lovable.app) verified working
- [ ] Republish current source so kaivraa.com serves latest build with People tab / footprint view
- [ ] Harden configuration error messages (done in source; needs republish to custom domain)

## New Request
- [ ] Clarify/confirm Supabase status — user asked to "Enable Supabase for this project"
  - Project already uses Lovable Cloud (Supabase-backed); secrets and tables are configured

## Completed
- [x] Rebound stale Supabase service-role secret in Lovable Cloud
- [x] Hardened public endpoint error messages to avoid leaking env variable names
- [x] Published latest source to Lovable origin
- [x] Verified People tab, footprint view, CSV export, security tab on Lovable origin
- [x] Verified no service-role key exposure in production bundles
- [x] Confirmed all existing security controls remain intact
