# Plumbline on the App Store

Everything to paste into App Store Connect, plus the one-time setup. Screenshots and the 1024px icon are in `appstore/`.

## Listing

- **App name (30):** Plumbline: Planter Assessment
- **Subtitle (30):** Assess church planting couples
- **Bundle ID:** com.parkermanuel.plumbline
- **SKU:** plumbline-ios
- **Primary category:** Business · **Secondary:** Reference
- **Price:** Free app, no in-app purchases (networks buy assessments on the website)
- **Promotional text (170):** One assessment instead of five. The planter, the spouse and their references each answer on their own. You get one graded report and an interview guide.
- **Keywords (100):** church planting,planter,assessment,pastor,church,network,ministry,marriage,leadership,gifts,calling
- **Support URL:** https://plumblineassessment.com
- **Marketing URL:** https://plumblineassessment.com
- **Privacy policy URL:** https://plumblineassessment.com/#/privacy
- **Copyright:** 2026 Parker Manuel

**Description**

Plumbline is the church planter assessment for networks. It replaces five separate tools with one: character and calling, marriage, leadership and planting capacity, personality and work style, spiritual gifts, references, city fit, honesty checks, and a graded report with an interview guide.

How it works
• Set up an assessment in five minutes. Plumbline emails the planter, the spouse and their references their own private links.
• Each person answers on their own, one question at a time. Answers save as they go, so they can stop and finish later on any device.
• Watch progress live from your dashboard and send reminders with one tap.
• Read a graded report with a clear recommendation, strengths, growth areas, concerns, couple gaps and blind spots. Every score shows how it was set.
• Use the interview guide built from their answers: questions to ask, what to listen for, and a place for your team to score.
• Release each spouse's personal report when you're ready. Each one is written to encourage and to name next steps.

Built for the people who send planters
• Four voices: planter, spouse, references and you.
• Spouses never see each other's individual answers.
• Your network's assessments are visible only to your team.
• Built by a church planter, drawing on 30 years of planting research.

The report is one input, not a decision. Plumbline gives a readiness signal and a conversation guide.

## App Review

**Notes for the reviewer**

Plumbline is used by church planting network leaders to assess planting couples. Planters, spouses and references answer through personal links emailed to them, so they don't need accounts.

• To see full sample reports with no account: on the home screen, tap "See a sample report".
• To see the network leader dashboard: tap "Network leaders", then "Use a password instead", and sign in with the demo account below. Regular users sign in with a 6-digit code emailed to them.
• To delete an account: Network leaders → Settings & team → Your account → Delete my account.
• The app has no purchases. Networks buy assessments on the website, and the app doesn't link to or mention purchasing.

**Demo account:** review@plumblineassessment.com · password: (set in Supabase, see setup step 5)

**Export compliance:** the app uses only standard HTTPS encryption (ITSAppUsesNonExemptEncryption = NO is set).

**Age rating:** answer "None" to every question → 4+.

## App Privacy ("nutrition label")

Tracking: **No**. Every type below is **linked to the user** and used only for **App Functionality**.

| Data type | What it is |
|---|---|
| Contact Info → Name | Names of network leaders, planters, spouses and references |
| Contact Info → Email Address | For sign-in and assessment links |
| Sensitive Info | Religious beliefs and marriage, health and stress answers in assessments |
| User Content → Other User Content | Assessment answers, notes and uploaded results |
| Identifiers → User ID | The network leader's account ID |

Not collected: location, contacts, browsing history, purchases, financial info, diagnostics, advertising data.

## One-time setup (in order)

1. **Supabase database:** paste `supabase/update-2026-10-23.sql` into the SQL Editor and press Run.
2. **Supabase sign-in email:** Authentication → Emails → Magic Link and Confirm signup: paste `supabase/templates/magic-link.html`, subject "Your Plumbline sign-in".
3. **Stripe:**
   - Developers → API keys → Create restricted key "Plumbline": Checkout Sessions write, Coupons write, Promotion Codes write, Customers read. Save it as the GitHub secret `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → Add endpoint `https://msjmhbggcwwppqzfkxug.supabase.co/functions/v1/plumbline-stripe` for `checkout.session.completed` and `invoice.paid`. Save its signing secret as the GitHub secret `STRIPE_WEBHOOK_SECRET`.
   - Settings → Branding: the Plumbline icon (`appstore/app-icon-1024.png`), accent #ff6b4a, brand color #121212.
   - Settings → Customer emails: turn on "Successful payments" and "Refunds".
4. **Apple:**
   - App Store Connect → Apps → + New App: iOS, name above, bundle ID com.parkermanuel.plumbline (register it under Certificates, Identifiers & Profiles → Identifiers first), SKU plumbline-ios.
   - Users and Access → Integrations → App Store Connect API → generate a key with the App Manager role. Save GitHub secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole .p8 file) and `APPLE_TEAM_ID` (Membership details).
5. **Reviewer account:** Supabase → Authentication → Users → Add user: review@plumblineassessment.com with a password of your choice, "Auto confirm". Sign in once on the website, create a network called "App Review", then give it assessments from the Platform page.
6. **Build:** GitHub → Actions → "iPhone app" → Run workflow. About 15 minutes later the build shows in TestFlight. Install it on your phone, check it, then add it to the version in App Store Connect and Submit for Review.
