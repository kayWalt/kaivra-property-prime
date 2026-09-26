# Independence promo pricing and missing phases

## What will change

- Keep every existing investment and application intact.
- Add separate active offerings for **Mountain Resort Phase 1**, **GreenCity Resort Phase 1**, and **GreenCity Resort Phase 2**. Keep the existing Mountain Phase 2 and Polo Lake offerings.
- Preserve the current generic GreenCity record for historical links/applications, but hide it from new investors after the two phase-specific offerings are ready.
- Show the standard price crossed out beside the promotional price on the homepage, project pages, property cards, and application selection/review.
- Apply the promotional price to new applications only while the offer is active: **16 September–9 October 2026**. Existing applications retain their saved price.

## Prices from the supplied artwork

| Offering | Plot | Standard | Promo |
|---|---:|---:|---:|
| Mountain Phase 1 | 150 / 250 / 400 / 500 SQM | ₦18m / ₦30m / ₦48m / ₦60m | ₦15.3m / ₦25.5m / ₦40.8m / ₦51m |
| Mountain Phase 2 | 150 / 250 / 400 / 500 SQM | ₦9m / ₦15m / ₦24m / ₦30m | ₦6.75m / ₦11.25m / ₦18m / ₦22.5m |
| Polo Lake Phase 1 | 150 / 250 / 400 / 500 SQM | ₦12m / ₦20m / ₦32m / ₦40m | ₦9m / ₦15m / ₦24m / ₦30m |
| GreenCity Phase 1 | 500 / 750 / 1,000 SQM | ₦75m / ₦112.5m / ₦150m | ₦63.75m / ₦95.625m / ₦127.5m |
| GreenCity Phase 2 | 500 / 750 / 1,000 SQM | ₦75m / ₦112.5m / ₦150m | ₦63.75m / ₦95.625m / ₦127.5m |

## Database changes

- Add optional promotional price/start/end fields to properties, with validation that promo price is positive and no higher than standard price.
- Add the three missing phase records and their exact plot options; update the two matching existing offerings with the supplied standard and promotional prices.
- Update the existing application price guard to use the active promotional price when an application is submitted during the offer period; otherwise use standard price.
- Keep all existing grants and row security unchanged. No applications, payments, documents, users, or history rows are rewritten.

## App changes

- Add one shared effective-price helper so all screens use the same date-aware result.
- Update existing property-price displays and application calculations to show/use the promotional price while retaining the standard-price comparison.
- Keep the uploaded flyers as pricing references only; existing project photography and visual design remain unchanged.

## Verification

- Confirm all five offerings and every supplied price.
- Confirm new applications use promo prices through 9 October 2026 and automatically fall back afterward.
- Confirm existing application snapshots do not change.
- Check homepage, project detail, and application flow on mobile and desktop; run typecheck/build and inspect current build logs.
