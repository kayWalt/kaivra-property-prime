# KAIVRA Investments

BUILD "KAIVRA" — A WORLD-CLASS REAL ESTATE INVESTMENT MANAGEMENT PLATFORM

Build KAIVRA as a simple, elegant, futuristic, mobile-first real-estate investment management platform.

KAIVRA should allow real-estate investors/subscribers to discover or access a property project, complete their investment/subscription form, provide payment information, upload their passport photograph, signature and proof of payment, submit the application, and receive confirmation.

Investment Advisers and Admins should be able to manage projects, view submitted investor forms, verify payments, manage investors, and download completed applications as professional PDFs.

IMPORTANT:

The application must remain SIMPLE for investors.

Do not turn KAIVRA into a complicated enterprise CRM.

The investor journey should feel like:

OPEN KAIVRA

→ SELECT/OPEN INVESTMENT

→ COMPLETE FORM

→ UPLOAD DOCUMENTS

→ REVIEW

→ SUBMIT

→ RECEIVE CONFIRMATION

The Adviser/Admin experience can contain more management functionality.

==================================================

1. PRODUCT IDENTITY

==================================================

Product name:

KAIVRA

Positioning:

"Smart Real Estate Investment Management"

KAIVRA must support multiple real-estate projects.

It must NOT be hard-coded exclusively for Hutu Prestige.

Examples of projects that may be created in the system:

HUTU PRESTIGE MOUNTAIN RESORT PHASE 2

HUTU PRESTIGE POLO LAKE RESORT ESTATE

Other future real-estate projects.

Administrators must be able to create unlimited projects.

==================================================

2. VISUAL DIRECTION

==================================================

Create a world-class futuristic luxury real-estate visual identity.

The design should feel like a combination of:

- Luxury real estate

- Private wealth management

- Modern fintech

- Premium investment platform

- High-end property marketing

The visual language should complement the existing KAIVRA/Hutu Prestige billboard and property-promotion designs.

The property photographs should be treated as premium marketing assets rather than generic UI images.

Use large, cinematic property photography throughout the public-facing experience.

Do not make the application look like a generic banking dashboard.

Do not make it look like a traditional real-estate website.

Do not use excessive gradients, excessive glassmorphism, excessive shadows, or unnecessary animations.

The interface should feel expensive, calm, trustworthy and futuristic.

==================================================

3. COLOUR SYSTEM

==================================================

Primary palette:

IVORY

ONYX

EMERALD

CHAMPAGNE GOLD

Use:

- Deep onyx for strong contrast

- Warm ivory for primary surfaces

- Emerald for investment/action/success states

- Champagne gold for premium accents

- Soft neutral tones for secondary information

The visual balance should be approximately:

70% ivory/light neutral

20% onyx/dark

7% emerald

3% gold accent

Do not use bright neon colours.

Use semantic design tokens only.

All colours must be defined in:

src/styles.css

Do not scatter hardcoded colour utilities throughout components.

Create semantic tokens such as:

--background

--foreground

--primary

--primary-foreground

--secondary

--accent

--accent-foreground

--muted

--border

--card

--success

--warning

--destructive

Support both light and dark UI where appropriate, but keep the primary KAIVRA identity consistent.

==================================================

4. TYPOGRAPHY

==================================================

Headings:

Instrument Serif

Body/UI:

Manrope

Use typography hierarchy carefully.

Large editorial serif headings should communicate luxury.

Manrope should provide clarity for:

- Forms

- Buttons

- Tables

- Financial information

- Navigation

- Status labels

Do not overuse serif typography.

==================================================

5. GENERAL UX PRINCIPLE

==================================================

Every screen should answer:

"What does the user need to do next?"

Keep the interface clean.

Use:

- Generous whitespace

- Clear hierarchy

- Large touch targets

- Short forms

- Progressive disclosure

- Clear CTAs

- Minimal unnecessary fields

- Inline validation

- Helpful empty states

Avoid overwhelming the investor.

==================================================

6. PUBLIC LANDING PAGE

==================================================

Route:

/

Create a premium cinematic landing page.

Hero section:

Large full-width real-estate/property photograph.

Overlay:

KAIVRA

"Invest in the future you can own."

Supporting text:

"Securely manage your real-estate investments, subscriptions and payments in one simple platform."

Primary CTA:

"START INVESTING"

Secondary CTA:

"ACCESS MY INVESTMENT"

Use a subtle cinematic entrance animation.

The property image should occupy a major portion of the first screen.

Do not use generic stock office photographs.

The system should allow Admin to configure the project/hero images later.

==================================================

7. PROJECT SHOWCASE

==================================================

On the landing page display featured real-estate projects.

Each project should appear as a premium property card.

Card includes:

Project photograph

Project name

Location

Short description

Starting price

Available property types

CTA:

"VIEW PROJECT"

Use large image cards with subtle hover/motion effects.

On mobile, cards should become horizontally scrollable or vertically stacked.

==================================================

8. PROJECT DETAIL PAGE

==================================================

Create a premium project detail experience.

Display:

Hero property photograph

Project name

Location

Description

Property options

Property sizes

Prices

Available units

Payment plans

Promotions if configured

Investment CTA

Example:

HUTU PRESTIGE MOUNTAIN RESORT PHASE 2

"Premium residential investment opportunity."

Show property cards:

150 SQM

3 Bedroom Terrace Duplex

₦7M

250 SQM

4 Bedroom Terrace Duplex + BQ

₦10M

400 SQM

4 Bedroom Fully Detached Duplex + BQ

₦18M

500 SQM

5 Bedroom Fully Detached Duplex + BQ

₦22M

IMPORTANT:

These are examples only.

Do not hard-code these prices.

All projects, properties and prices must load from the database.

CTA:

"SUBSCRIBE / INVEST"

==================================================

9. AUTHENTICATION

==================================================

Route:

/auth

Create a simple combined:

SIGN IN / CREATE ACCOUNT

Support:

- Email/password

- Google sign-in

Keep authentication visually simple.

After login, route users according to their role.

==================================================

10. USER ROLES

==================================================

Use:

super_admin

admin

adviser

investor

New users should default to:

investor

Roles must be stored in a separate user_roles table.

Never trust frontend role values.

Enforce permissions server-side/database-side.

==================================================

11. INVESTOR DASHBOARD

==================================================

Route:

/_authenticated/dashboard

Keep the investor dashboard extremely simple.

Header:

KAIVRA

Notification bell

Profile

Main greeting:

"Welcome back, [Investor Name]"

Display:

MY INVESTMENTS

Each investment card should show:

Project photograph

Project name

Property

Property size

Investment value

Amount paid

Outstanding balance

Status

Example:

HUTU PRESTIGE MOUNTAIN RESORT PHASE 2

4 Bedroom Terrace Duplex + BQ

250 SQM

Investment:

₦10,000,000

Paid:

₦7,000,000

Outstanding:

₦3,000,000

Status:

UNDER REVIEW

Primary button:

"VIEW INVESTMENT"

Secondary:

"SUBMIT PAYMENT"

==================================================

12. INVESTOR QUICK ACTIONS

==================================================

Display simple action cards:

COMPLETE APPLICATION

SUBMIT PAYMENT

MY DOCUMENTS

MY INVESTMENTS

Avoid filling the dashboard with unnecessary statistics.

==================================================

13. INVESTOR APPLICATION

==================================================

Route:

/_authenticated/application?id=...

This is the centerpiece of the application.

Make it exceptionally clean and easy to use.

Use a multi-step form.

Steps:

1. Project & Property

2. Personal

3. Contact

4. Investment

5. Payment

6. Documents

7. Review & Declaration

Show a compact progress indicator.

Example:

01

PROJECT

02

PERSONAL

03

CONTACT

04

INVESTMENT

05

PAYMENT

06

DOCUMENTS

07

REVIEW

Use smooth transitions between steps.

Do not create unnecessary page reloads.

==================================================

14. STEP 1 — PROJECT & PROPERTY

==================================================

If the investor arrived from a specific project page, preselect the project.

Otherwise display:

"Select your investment"

Show project cards with photographs.

After project selection:

Show available properties.

Each property card contains:

Property photograph

Property type

Size

Price

Availability

Payment plan

Select button.

Once selected:

Automatically populate:

Property type

Property size

Unit price

Project

==================================================

15. STEP 2 — PERSONAL DETAILS

==================================================

Fields:

Full Name *

Date of Birth *

Gender

Nationality

Marital Status

Occupation

Company/Organization

Residential Address *

State

Country

Keep the layout clean.

Use two-column layout on desktop and single-column layout on mobile.

==================================================

16. STEP 3 — CONTACT DETAILS

==================================================

Fields:

Phone Number *

Email Address *

WhatsApp Number

Alternative Phone

Residential Address

Mailing Address

Checkbox:

"Same as residential address"

Use proper country-code support.

==================================================

17. STEP 4 — INVESTMENT DETAILS

==================================================

Display selected investment.

Project

Property

Property Type

Property Size

Number of Units

Unit Price

Total Investment Value

Calculate:

Total Investment Value =

Number of Units × Unit Price

Allow payment plan selection:

Outright

Installment

Custom

Display financial summary:

TOTAL INVESTMENT

₦XX,XXX,XXX

TOTAL PAID

₦XX,XXX,XXX

OUTSTANDING

₦XX,XXX,XXX

Do not allow users to manually alter automatically calculated values.

==================================================

18. STEP 5 — PAYMENT

==================================================

Title:

"Payment Confirmation"

Create a clean payment form based on the existing KAIVRA payment confirmation requirements.

Fields:

Subscriber's Name

Sender

Bank

Email Address

Phone Number

Amount of Transaction

Address

Site

Type/Size of Property

Number of Units

Initial Deposit

Total Payment Made

Next Payment / Amount

Next Payment Date

Transaction Date

Transaction Reference

Payment Method

Options:

Bank Transfer

Bank Deposit

POS

Cash

Other

Payment Description

Use NGN formatting.

Example:

₦18,000,000.00

==================================================

19. MULTIPLE PAYMENT RECORDS

==================================================

Investors may make multiple payments.

Add:

"+ ADD PAYMENT"

Each payment contains:

Amount

Paid Date

Bank

Sender

Transaction Reference

Payment Method

Description

Proof of Payment

Display a simple payment history.

Example:

PAYMENT 01

₦7,000,000

30 Aug 2026

Pending Verification

PAYMENT 02

₦3,000,000

05 Sep 2026

Verified

Automatically calculate:

Total Paid

Outstanding Balance

==================================================

20. STEP 6 — DOCUMENTS

==================================================

Make document upload extremely simple.

Title:

"Your Documents"

Subtitle:

"Upload clear copies of your documents."

Create three primary upload cards.

PASSPORT PHOTOGRAPH

SIGNATURE

PROOF OF PAYMENT

Then:

ADDITIONAL DOCUMENTS

Optional.

==================================================

21. PASSPORT UPLOAD

==================================================

Passport upload card:

"Passport Photograph"

Buttons:

TAKE PHOTO

UPLOAD PHOTO

Allow:

JPG

JPEG

PNG

WEBP

Support mobile camera capture.

Show preview immediately.

Allow:

Crop

Rotate

Replace

Remove

Client-side image compression/downscaling before upload.

Maintain good visual quality.

==================================================

22. SIGNATURE

==================================================

Signature section:

"Your Signature"

Two options:

UPLOAD SIGNATURE

DRAW SIGNATURE

For draw signature use a pointer-event signature canvas.

Buttons:

CLEAR

REDRAW

SAVE SIGNATURE

Store the final signature as an image.

Clearly identify it as:

"Investor Signature"

==================================================

23. PROOF OF PAYMENT

==================================================

Allow:

TAKE PHOTO

UPLOAD RECEIPT

SCAN DOCUMENT

Support:

JPG

JPEG

PNG

WEBP

PDF

Allow multiple proof-of-payment files.

Each proof of payment should be linked to its payment record.

Show:

✓ Uploaded

and a preview/view button.

==================================================

24. ADDITIONAL DOCUMENTS

==================================================

Optional uploads:

National ID

International Passport

Driver's Licence

Voter's Card

Allocation Documents

Agreements

Other

Allow multiple uploads.

==================================================

25. AUTOSAVE

==================================================

Automatically save the application.

Use approximately 1.2-second debounced autosave.

Save:

- localStorage

- database

Display:

SAVING...

SAVED

OFFLINE

If offline:

Queue changes locally.

When connection returns:

Automatically synchronize.

Never lose entered information.

==================================================

26. STEP 7 — REVIEW

==================================================

Create an elegant summary.

Sections:

PERSONAL

CONTACT

INVESTMENT

PAYMENTS

DOCUMENTS

Allow:

EDIT

next to every section.

Show financial summary prominently.

TOTAL INVESTMENT

TOTAL PAID

OUTSTANDING

==================================================

27. DECLARATION

==================================================

Display:

"Investor Declaration"

Text:

"I confirm that the information provided in this application is true and accurate to the best of my knowledge. I confirm that the payment information and documents submitted relate to my investment/application."

Checkbox:

☐ I confirm that the information provided is accurate.

Required before submission.

==================================================

28. SUBMIT

==================================================

Primary button:

"SUBMIT APPLICATION"

Before submission:

"Please review your information carefully before submitting."

Confirmation modal:

"Submit Application?"

Buttons:

CANCEL

SUBMIT

Disable button while submitting.

Prevent duplicate submissions.

==================================================

29. SUCCESS SCREEN

==================================================

After submission:

Display a sophisticated success animation.

✓

"Application Submitted"

"Your investment application has been successfully submitted and is now under review."

Display:

Application Reference

Example:

KVR-2026-000001

Status:

SUBMITTED

Buttons:

VIEW APPLICATION

DOWNLOAD PDF

RETURN TO DASHBOARD

==================================================

30. PDF GENERATION

==================================================

When an application is submitted, generate a professional branded PDF.

Use jsPDF or an appropriate reliable PDF solution.

PDF must contain:

KAIVRA branding

Project name

Application reference

Submission date

Investor passport photograph

Personal details

Contact details

Investment details

Property information

Payment information

Payment history

Total investment

Total paid

Outstanding balance

Next payment

Investor signature

Proof-of-payment information

Declaration

Application status

Investment Adviser if applicable

The PDF should look like a professionally designed real-estate investment document.

Use A4.

Include:

KAIVRA

Real Estate Investment Management

Footer:

Application Reference

Generated Date

Page Number

Do not make the PDF look like a browser screenshot.

==================================================

31. ADMIN DASHBOARD

==================================================

Route:

/_authenticated/admin

Admin dashboard should be more information-dense than the investor dashboard.

Top statistics:

TOTAL INVESTORS

TOTAL APPLICATIONS

PENDING REVIEW

PAYMENT VERIFICATION

APPROVED

TOTAL INVESTMENT VALUE

Below:

SUBMITTED APPLICATIONS

Display a clean table on desktop.

Mobile should use cards.

Columns:

Reference

Investor

Project

Property

Amount

Paid

Status

Adviser

Date

Actions

Actions:

VIEW

DOWNLOAD PDF

==================================================

32. INVESTMENT ADVISER DASHBOARD

==================================================

Advisers should have a simple dashboard.

Display:

MY INVESTORS

MY APPLICATIONS

PENDING REVIEW

PAYMENT VERIFICATION

TOTAL INVESTMENT VALUE

Advisers should only see investors/applications they are authorized to manage.

==================================================

33. ADMIN/ADVISER SUBMITTED FORMS

==================================================

Create:

/_authenticated/admin

and appropriate adviser submitted-form views.

IMPORTANT:

ONLY:

ADMIN

SUPER_ADMIN

AUTHORIZED INVESTMENT ADVISER

can view submitted investor forms globally/within their authorized scope.

INVESTORS MUST NOT have access to other investors' forms.

Investor can only view their own application.

==================================================

34. FORM DETAILS

==================================================

Admin/adviser can open a submitted form.

Display:

Investor

Passport

Personal information

Contact information

Project

Property

Investment

Payment history

Proof of payment

Signature

Additional documents

Status

Adviser

Audit history

Buttons:

DOWNLOAD PDF

PRINT

VIEW DOCUMENTS

VERIFY PAYMENT

==================================================

35. PAYMENT VERIFICATION

==================================================

Admin/adviser with permission can verify individual payments.

Payment statuses:

PENDING

VERIFIED

REJECTED

When rejected:

Require a reason.

Example:

"Proof of payment is unclear."

The investor should receive a notification.

==================================================

36. APPLICATION STATUS

==================================================

Use:

DRAFT

SUBMITTED

UNDER_REVIEW

PAYMENT_VERIFICATION

APPROVED

REJECTED

REQUIRES_CORRECTION

When status is:

REQUIRES_CORRECTION

the investor can reopen and edit the application.

==================================================

37. ASSISTED INVESTOR REGISTRATION

==================================================

Keep the previously implemented Assisted Registration functionality.

An authorized Investment Adviser/Admin can create an application on behalf of an investor who cannot complete the form themselves.

Workflow:

ADD INVESTOR

→ ASSISTED REGISTRATION

→ ENTER INVESTOR DETAILS

→ SELECT PROJECT

→ SELECT PROPERTY

→ ENTER PAYMENT

→ UPLOAD PASSPORT

→ UPLOAD INVESTOR SIGNATURE

→ UPLOAD PROOF OF PAYMENT

→ REVIEW

→ SUBMIT

The adviser must confirm:

"I confirm that the investor has provided the information and documents required and has authorized me to submit this application on their behalf."

Clearly record:

Application Method:

ASSISTED REGISTRATION

Do NOT represent the adviser as the investor/signatory.

==================================================

38. PROJECT MANAGEMENT

==================================================

Route:

/_authenticated/admin/projects

Admin can:

CREATE PROJECT

EDIT PROJECT

ARCHIVE PROJECT

ACTIVATE/DEACTIVATE PROJECT

Manage:

Project name

Location

Description

Hero image

Gallery images

Currency

Banks

Payment plans

Self-registration availability

Active status

==================================================

39. PROPERTY MANAGEMENT

==================================================

Each project can contain multiple properties.

Admin can create:

Property name

Property type

Size

Unit price

Units available

Property description

Property images

Payment plan

Availability status

Do not hard-code property prices.

==================================================

40. PROPERTY PHOTOGRAPHS

==================================================

Property imagery is a major part of KAIVRA's visual identity.

Allow Admin to upload:

Hero image

Gallery images

Property images

Project images

Use optimized images.

Display them using:

- Cinematic hero sections

- Premium cards

- Image galleries

- Full-screen image viewer

- Smooth transitions

Avoid generic stock photography where actual project photographs are available.

==================================================

41. PHOTO UPLOAD SYSTEM

==================================================

Create a reusable secure upload component.

Used for:

- Passport

- Signature

- Proof of payment

- Property photographs

- Project photographs

- Additional documents

Features:

Drag and drop on desktop

Camera capture on mobile

Preview

Progress

Compression where appropriate

Replace

Delete

Retry

Clear error messages

==================================================

42. STORAGE

==================================================

Use Lovable Cloud Storage.

Create private bucket:

kaivra-docs

Sensitive investor documents must remain private.

Use signed URLs for authorized viewing.

Do not expose direct public document URLs.

==================================================

43. DATABASE

==================================================

Use:

Lovable Cloud Postgres.

Create the following enums:

app_role:

super_admin

admin

adviser

investor

application_status:

draft

submitted

under_review

payment_verification

approved

rejected

requires_correction

doc_kind:

passport

signature

proof_of_payment

additional

payment_method:

bank_transfer

bank_deposit

pos

cash

other

payment_status:

pending

verified

rejected

==================================================

44. DATABASE TABLES

==================================================

profiles:

id

full_name

email

phone

user_roles:

user_id

role

projects:

id

name

location

description

currency

banks

payment_plans

hero_image

self_registration_open

is_active

created_at

properties:

id

project_id

name

property_type

size_label

unit_price

units_available

description

image_urls

is_active

applications:

id

reference

investor_id

project_id

property_id

status

current_step

personal JSONB

contact JSONB

investment JSONB

payment_info JSONB

declaration_accepted

review_note

reviewed_by

reviewed_at

submitted_at

created_at

updated_at

application_payments:

id

application_id

amount

paid_on

bank

sender

reference

method

description

cash_details

status

verified_by

verified_at

application_documents:

id

application_id

payment_id

kind

label

file_path

file_name

mime_type

size_bytes

application_events:

id

application_id

actor

action

detail

created_at

notifications:

id

user_id

title

body

link

read_at

created_at

project_advisers:

project_id

adviser_id

==================================================

45. SECURITY / RLS

==================================================

All tables must have proper Row Level Security.

Create secure functions:

has_role()

is_staff()

can_view_application()

Rules:

INVESTOR:

Can only view their own applications.

Can edit their own applications only when:

draft

or

requires_correction

Can delete only their own drafts.

ADVISER:

Can view applications belonging to projects they are assigned to through project_advisers.

ADMIN:

Can view/manage all applications.

SUPER_ADMIN:

Full authorized access.

Child tables such as:

application_payments

application_documents

application_events

must use secure authorization based on can_view_application().

Do not rely solely on frontend route protection.

==================================================

46. APPLICATION REFERENCE

==================================================

Create a sequence for human-readable application references.

When application status leaves:

draft

automatically assign:

KVR-YYYY-000001

Example:

KVR-2026-000001

Do not assign the final reference until the application leaves draft status.

==================================================

47. AUDIT TRAIL

==================================================

Record important actions:

Application created

Application updated

Application submitted

Document uploaded

Payment added

Payment verified

Payment rejected

Status changed

PDF generated

PDF downloaded

Application reviewed

Correction requested

Application approved

Application rejected

Record:

Actor

Action

Date/time

Detail

==================================================

48. NOTIFICATIONS

==================================================

Create a notification bell.

Display unread count.

Notify investor when:

Application submitted

Application under review

Payment verified

Payment rejected

Correction required

Application approved

Application rejected

Notify Admin/Adviser when:

New application submitted

New payment submitted

Correction submitted

==================================================

49. NAVIGATION

==================================================

INVESTOR:

Dashboard

My Investments

My Applications

Payments

Documents

Notifications

Profile

ADVISER:

Dashboard

My Investors

My Applications

Payments

Documents

Notifications

Profile

ADMIN:

Dashboard

Investors

Applications

Payments

Projects

Advisers

Reports

Notifications

Settings

SUPER_ADMIN:

Full administrative navigation.

Navigation must automatically adapt based on role.

Do not display unauthorized navigation items.

==================================================

50. MOBILE EXPERIENCE

==================================================

Mobile-first.

The investor should be able to complete the entire application from a smartphone.

Optimize for:

Android

iPhone

Tablet

Desktop

Use:

Sticky bottom Continue button

Large touch targets

Simple dropdowns

Camera upload

Image preview

Signature drawing

Document upload

Clear progress indicator

Avoid tiny controls.

==================================================

51. ANIMATIONS

==================================================

Use subtle premium motion.

Examples:

Hero image fade/zoom

Card hover

Page transition

Step transition

Button micro-interaction

Upload progress

Success checkmark

Notification animation

Do NOT animate every element.

Animations must be fast and purposeful.

Respect:

prefers-reduced-motion

==================================================

52. LOADING STATES

==================================================

Every async operation needs a proper loading state.

Examples:

Loading projects

Loading properties

Saving application

Uploading passport

Uploading signature

Uploading proof of payment

Submitting application

Generating PDF

Loading dashboard

Searching applications

Verifying payment

Never show blank screens.

Use skeleton loaders where appropriate.

==================================================

53. ERROR STATES

==================================================

Provide professional error messages.

Examples:

"Something went wrong. Please try again."

"Your document could not be uploaded."

"Your session has expired. Please sign in again."

"You do not have permission to view this application."

"Application not found."

Do not expose technical stack traces.

==================================================

54. EMPTY STATES

==================================================

Examples:

No investments:

"You don't have any investments yet."

CTA:

"Explore Projects"

No applications:

"No applications yet."

CTA:

"Start Application"

No payments:

"No payment records yet."

==================================================

55. SEARCH AND FILTERS

==================================================

Admin:

Search investors/applications by:

Name

Phone

Email

Application reference

Project

Property

Adviser

Transaction reference

Filters:

Project

Adviser

Status

Payment status

Date range

Property type

Use server-side pagination and filtering for scalability.

==================================================

56. PDF DOWNLOAD PERMISSIONS

==================================================

ONLY:

ADMIN

SUPER_ADMIN

AUTHORIZED INVESTMENT ADVISER

can download submitted investor forms from the management interface.

Investors can only access their own application/PDF.

Never allow an investor to change an application ID in the URL and retrieve another investor's PDF.

Enforce this at the backend/storage level.

==================================================

57. PRINT

==================================================

Admin/adviser can print an application.

Print layout should be:

A4

Clean

Professional

No navigation

No buttons

No unnecessary UI

KAIVRA branding retained.

==================================================

58. SEO

==================================================

Add per-route SEO metadata.

Examples:

KAIVRA | Real Estate Investment Management

KAIVRA | Investment Opportunities

KAIVRA | Investor Application

KAIVRA | Project Management

==================================================

59. PERFORMANCE

==================================================

The application must remain fast.

Use:

Lazy loading

Image optimization

Pagination

Efficient database queries

Optimized uploads

Skeleton states

Caching where appropriate

Do not load every document/image unnecessarily.

==================================================

60. ACCESSIBILITY

==================================================

Use:

Proper labels

Keyboard navigation

Accessible buttons

ARIA labels where required

Good contrast

Visible focus states

Readable typography

Screen-reader-friendly form errors

Do not rely only on colour to communicate status.

==================================================

61. PRODUCTION QUALITY

==================================================

This is NOT a prototype.

Build all functionality fully.

No fake buttons.

No placeholder links.

No dead routes.

No broken navigation.

No dummy submission flow.

No fake PDF generation.

No mock document upload in production functionality.

No console errors.

No TypeScript errors.

No broken database queries.

No RLS/security gaps.

No unauthorized document access.

==================================================

62. FINAL USER JOURNEY

==================================================

PUBLIC USER:

Landing Page

→ View Project

→ View Property

→ Subscribe/Invest

→ Create Account/Login

→ Application

→ Project

→ Property

→ Personal

→ Contact

→ Investment

→ Payment

→ Documents

→ Review

→ Declaration

→ Submit

→ Application Reference

→ PDF

→ Dashboard

==================================================

63. ASSISTED INVESTOR JOURNEY

==================================================

ADVISER:

Login

→ Dashboard

→ Add Investor

→ Assisted Registration

→ Enter Investor Information

→ Select Project

→ Select Property

→ Enter Payment

→ Upload Passport

→ Upload Investor Signature

→ Upload Proof of Payment

→ Review

→ Submit

→ Application Created

→ PDF Generated

→ Investor Record Updated

==================================================

64. ADMIN JOURNEY

==================================================

ADMIN:

Login

→ Dashboard

→ Applications

→ Search/Filter

→ Open Application

→ Review Investor

→ Review Property

→ Review Payments

→ View Documents

→ Verify Payment

→ Update Status

→ Download PDF

→ Print

→ Audit Trail

==================================================

65. FINAL DESIGN STANDARD

==================================================

KAIVRA must look like a product that could compete visually with leading global fintech, wealth-management and premium real-estate platforms.

The design should communicate:

TRUST

WEALTH

PROPERTY

SECURITY

PREMIUM QUALITY

SIMPLICITY

Use real project photography prominently.

The billboard/property-promotion visual language should influence the marketing side of the platform, especially:

- Project hero sections

- Property cards

- Promotional banners

- Investment opportunity cards

- Project detail pages

However, keep the actual investor forms clean and distraction-free.

Marketing pages can be visually rich.

Financial/forms pages should be calm and highly functional.

==================================================

66. MOST IMPORTANT PRODUCT PRINCIPLE

==================================================

DO NOT OVERCOMPLICATE KAIVRA.

For an investor, the application should feel like:

"Choose my property → Enter my details → Confirm my payment → Upload my documents → Submit."

For an adviser:

"Manage my investors → Complete applications → Verify information → Download PDFs."

For an admin:

"Manage projects → Manage investors → Review applications → Verify payments → Manage the entire platform."

Keep the underlying architecture powerful while keeping the user interface extremely simple.

==================================================

67. FINAL ACCEPTANCE TEST

==================================================

Before considering the application complete, test:

1. New investor registration

2. Google login

3. Email login

4. Investor dashboard

5. Project selection

6. Property selection

7. Personal form

8. Contact form

9. Investment calculation

10. Multiple payments

11. Proof-of-payment upload

12. Passport upload

13. Signature upload

14. Additional document upload

15. Autosave

16. Offline recovery

17. Form validation

18. Declaration

19. Submission

20. Application reference generation

21. PDF generation

22. Investor dashboard update

23. Admin receives application

24. Adviser receives authorized application

25. Payment verification

26. Status changes

27. Correction workflow

28. Investor notification

29. Admin PDF download

30. Adviser PDF download

31. Investor cannot access another investor

32. Adviser cannot access unauthorized projects/investors

33. Secure document access

34. Mobile responsiveness

35. Desktop responsiveness

36. Empty states

37. Error states

38. Loading states

39. Audit trail

40. No console errors

41. No TypeScript errors

42. No broken routes

43. No broken buttons

Fix all errors discovered during testing.

FINAL REQUIREMENT:

Build KAIVRA as a complete production-ready application, not merely a collection of screens.

The final result should be simple for investors, powerful for advisers, secure for administrators, scalable for multiple real-estate projects, and visually comparable to the world's best modern investment and real-estate applications.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kaivra-property-prime.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ed07bbc9-27a3-47b9-a689-45532021be05).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
