# Additive Property Listings Catalogue

## Goal
Add a separate **Property Listings** catalogue for current sale, rent, and lease inventory. Use the uploaded image as visual reference while keeping KAIVRA’s existing typography, emerald/ivory palette, controls, spacing, and responsive behavior.

The existing homepage, Investment Projects, applications, payments, partner workflows, authentication, email, and infrastructure remain unchanged.

## Public experience
- Add `/properties` with a strong image-led catalogue header, search, filters, sorting, featured treatment, clear empty states, and responsive listing cards.
- Add `/properties/$slug` with gallery, title, location, price, facts, description, features, availability, and an **Enquire about this property** action using the existing enquiry system.
- Public pages will display only explicitly published listings that are currently suitable for public display.
- Add unique SEO metadata and safe social-sharing metadata per page.
- Add one non-duplicated **Property Listings** link to the existing public desktop and mobile navigation. Do not add catalogue content to the homepage.

## Admin experience
- Add a separate `/admin/property-listings` workspace with search, filters, status tabs, and listing actions.
- Add create/edit screens for listing details, pricing, specifications, features, contact details, publication state, availability, featured status, and image gallery ordering.
- Reuse the existing secure image ticket, byte verification, finalization, and gallery controls with an isolated `listing` path scope.
- Integrate this workspace into the existing permission matrix as its own `property_listings` module, without changing Project permissions.

## Data and security
Create dedicated additive tables rather than reusing Investment Projects:

- `property_listings`: public catalogue fields, publication/availability state, optional specifications, coordinates, safe public contact fields, timestamps, and staff attribution.
- `property_listing_images`: ordered gallery records with cover flag and optional caption.

Security rules:
- Anonymous and signed-in public reads: published listings in public-display availability states, plus their images.
- Authorized staff writes: enforced by database rules and the existing server-side permission architecture; client checks remain presentation-only.
- Draft, archived, internal attribution, and audit details remain private.
- No hard deletion from normal admin flows; archive historical listings.
- Validate unique slugs, non-negative prices/specifications, one cover image, and safe publication state transitions.
- Add explicit grants, row-level security, and indexes in the same additive migration.

## Enquiries and audit
- Reuse the current contact-enquiry pipeline; prefill a factual subject/reference to the selected listing without creating payment or investment behavior.
- Reuse `admin_audit_events` for create, edit, publish/unpublish, price, availability, featured, and archive actions.
- No new email system, payment path, or investment relationship.

## Visual direction from the reference
- Desktop: restrained full-width catalogue banner, compact filter toolbar, four-column image cards where space allows, and a two-column detail layout.
- Mobile: image-first cards, a dedicated filter drawer, large tap targets, no horizontal overflow, and a concise sticky enquiry action where appropriate.
- Preserve KAIVRA’s Instrument Serif/Manrope typography, semantic color tokens, light/dark themes, and existing button/form components.
- The uploaded composite is reference only and will not be embedded in the app.

## Validation
- Confirm public visibility and direct-slug privacy for drafts/unavailable records.
- Test authorized and unauthorized create/edit/publish/image actions, including proxy permission expiry.
- Test search, filters, sorting, gallery, enquiry context, archive/history, and no fake public rows.
- Test mobile, tablet, desktop, dark/light themes, keyboard use, focus, labels, and no overflow.
- Verify homepage, auth, investment projects, applications, payments, partner flow, promotions, email, and existing admin pages remain unchanged.
- Run type checks, tests, migration/security checks, and production build. Do not publish.

## Technical details
- TanStack routes: `properties.index.tsx`, `properties.$slug.tsx`, and authenticated admin listing routes.
- Public reads use narrow safe-column projections; staff mutations use authenticated server functions and existing authorization checks.
- Reuse the `project-images` bucket only at a new server-derived `listing/` prefix, preserving MIME/size/magic-byte checks. No storage policy is weakened.
- The catalogue starts empty. No invented listings or production seed data will be added.
