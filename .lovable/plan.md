# Plan — Rate limiting and upload file-type restrictions

Proposal only. Nothing is implemented, published, deployed, or changed in storage, secrets, or data.

## Part 1 — Rate limiting

### What exists today
- `/api/public/contact` — validated with Zod, honeypot field, and a per-email cap of 3 enquiries per hour enforced in the database read. No per-IP limit; a bot rotating email addresses is unlimited.
- `/api/public/track` — accepts anonymous posts by design, validates and caps every field, returns 202 always, never returns data. No volume limit; abuse would inflate analytics rows.
- `/api/public/ai-chat` — accepts up to 40 messages of 4,000 characters, calls the paid AI gateway. No limit; this is the only endpoint where abuse costs money directly.

### Recommended architecture
Two layers, both compatible with Cloudflare in front of Lovable Cloud:

1. **Cloudflare (primary, preferred).** Rate Limiting Rules at the edge, matched on request path and client IP. Blocks abuse before it reaches the Worker, costs no compute, needs no code, no database, no secrets. Configured in the Cloudflare dashboard/Terraform, not in the repository.
2. **Application fallback (secondary, only where a wrong answer is expensive).** For `/api/public/ai-chat` only, a counter table in the database keyed by a salted hash of the IP plus a time bucket, checked before the model call. This guarantees the cost ceiling even if a caller reaches the origin directly (`kaivraa-com.lovable.app`), which Cloudflare rules do not cover.

Recommendation: do the Cloudflare layer for all three endpoints first; add the application counter for ai-chat only.

### Per endpoint

| Endpoint | Proposed limit | Window | Authenticated difference | Enforced by | Database | Secrets |
|---|---|---|---|---|---|---|
| `/api/public/contact` | 5 requests per IP | 10 minutes | No — the form is public and mostly used signed-out | Cloudflare | None | None |
| `/api/public/track` | 120 requests per IP | 1 minute | No | Cloudflare | None | None |
| `/api/public/ai-chat` | 15 requests per IP (anonymous), 60 per user | 10 minutes | Yes — signed-in investors get the higher limit, keyed on user id from the bearer token | Cloudflare + application counter | One small counter table if the fallback is built | None |

### Legitimate traffic impact
- Contact: a real person sends one enquiry, occasionally two. 5 per 10 minutes is far above normal; shared office/mobile-carrier IPs stay safe.
- Track: a heavy browsing session produces roughly one event per page view plus a few interactions — well under 120 per minute. The client already fails silently, so a throttled event is invisible to the visitor.
- AI chat: a normal support conversation is 5–15 turns. Anonymous visitors hitting 15 in 10 minutes are rare; signed-in investors get 60.

### Abuse identification
Client IP (`cf-connecting-ip`), plus user id where a bearer token is present. Signals already available: repeated identical payloads, honeypot hits on contact, and per-email counts on contact. No new fingerprinting and no additional personal data collected; if the fallback counter is built it stores a salted hash, never a raw IP.

### 429 behaviour
- Contact: JSON `{ "error": "Too many enquiries. Please try again shortly." }`, status 429, `Retry-After` header, CORS headers preserved. The form shows the message inline.
- Track: keep returning 202 (or a bare 429 that the client already swallows) so analytics never affects a visitor journey.
- AI chat: 429 with a short, friendly message the chat panel displays, plus a suggestion to talk to a KAIVRA adviser.

### Risks
- Cloudflare rules are infrastructure, not code, so they do not survive an account change and are not visible in the repository. They must be documented.
- Cloudflare rules do not protect the `*.lovable.app` origin. Only the ai-chat application counter closes that gap.
- Shared NAT (corporate networks, mobile carriers) can put several genuine users behind one IP; the proposed limits leave large headroom for that.

## Part 2 — Server-side upload file-type restrictions

### Current storage state
Three buckets, all private, none with an allowed-MIME list:

| Bucket | Public | Size limit | Allowed types |
|---|---|---|---|
| `avatars` | private | 5 MB | none set |
| `kaivra-docs` | private | 25 MB | none set |
| `project-images` | private | 10 MB | none set |

Type filtering today is browser-side only (`accept` attributes) plus the newly added safe content-type allowlist on the two public read routes, which already stops a stored SVG or HTML file from ever being served as executable content.

### Per category

| Category | Bucket | Accepted now | Recommended types | Max size | Public/private | Breaks existing files? | Migration | Enforce where |
|---|---|---|---|---|---|---|---|---|
| Avatar / profile photo | `avatars` | any image (browser hint only) | jpeg, png, webp | 5 MB | stays private, served through the API route | No — existing avatars are camera/screen images re-encoded to JPEG on upload | None | Bucket MIME list + server ticket check |
| Project / property images | `project-images` | jpeg, png, webp (browser) | jpeg, png, webp | 10 MB | stays private, served through the API route | No | None | Bucket MIME list + server ticket check |
| Passport photograph | `kaivra-docs` | images and PDF | jpeg, png, webp | 10 MB | private | Low risk — verify no stored passport is a PDF before enforcing | Check only | Application validation |
| Signature | `kaivra-docs` | generated PNG | png only | 2 MB | private | No — always produced as PNG by the signature pad | None | Application validation |
| Proof of payment | `kaivra-docs` | images and PDF | jpeg, png, webp, pdf | 25 MB | private | No | None | Bucket MIME list + application validation |
| Other application documents (ID, etc.) | `kaivra-docs` | images and PDF | jpeg, png, webp, pdf | 25 MB | private | No | None | Bucket MIME list + application validation |

### Enforcement approach
`kaivra-docs` mixes categories in one bucket, so the bucket-level list must be the union (jpeg, png, webp, pdf) and the narrower per-category rules (signature = png, passport = image only) belong in the application, in the upload-ticket server functions where the category is known. Both layers are needed: the bucket list is the one a caller with a signed upload URL cannot bypass.

An extra safeguard worth adding at the same time: reject a declared content type that does not match the file's magic bytes, checked server-side at ticket creation and again on the read routes.

### Compatibility concerns found
- Signed upload URLs are created before the file is sent, so a bucket MIME rejection surfaces at PUT time, not at ticket time. The upload components need a clear error message for that case, otherwise a rejected file looks like a silent failure.
- Uploads currently succeed on paths that never go through a server function only when a signed ticket exists, so the ticket layer is a reliable enforcement point.
- Adding a bucket MIME list changes behaviour for any in-flight upload during the change; it should be applied at a quiet time.
- Before enforcing, run a read-only inventory of stored object content types per bucket to confirm nothing already stored falls outside the proposed lists.

## Sequencing proposal
1. Read-only inventory of stored object types (no changes).
2. Bucket MIME lists on the three buckets, plus per-category application validation and clearer upload error messages.
3. Cloudflare rate-limiting rules for the three public endpoints.
4. Optional application-level ai-chat counter to cover direct origin access.

Each step reviewed and approved separately before anything is published.
