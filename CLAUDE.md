# Jobboks — project notes

Android TWA wrapper + React/Vite/Tailwind PWA bookkeeping & job-management app
for contractors. Deployed on Netlify, auto-deploys from GitHub
`github.com/vidarsig/busseness-ap` (`main`). Web changes go live in minutes;
clear PWA cache with Ctrl+Shift+R (2-3x) or force-close/reopen the Android app.

## About the owner (IMPORTANT — how to work with them)
- 40-year contractor, NOT an accountant. Has a stated handicap → keep everything
  EXTREMELY simple. Do as much for them as possible. One-tap. Plain words, not jargon.
- Bookkeeping is international: jurisdiction-specific values (tax rates, labels)
  live in Settings, never hardcoded.
- "By the book" / audit-compliant always. Saved/issued invoices are locked.
- A worker can NEVER convert a job to an invoice without approval.

## Business status / plans
- Going into the **US market**.
- Registering an **LLC in Wyoming**. Waiting for the **EIN** number.
- Will then **apply for a sales-tax number** (US = state sales tax, NOT VAT;
  company collects sales tax and remits it to the state).
- 6-month goal: **500–1000 subscribers would be a satisfactory start.**

## Launch to-do (US)
- "Get paid in app" via a payment processor (Stripe / Stripe Connect). ACH is the
  winner for big contractor invoices (0.8% capped at $5 vs card 2.9%+30c). This is
  the #1 feature the giants have that Jobboks lacks. Owner cannot create accounts /
  enter banking details — the user does that themselves (safety rule); app should
  guide them through connecting their own Stripe in plain words.
- US "Sales Tax" mode: relabel "VAT" → "Sales Tax" for US users, let them set their
  state %. Tax labels are already Settings-driven, so this is mostly relabeling +
  state-rate input, not a rebuild.

## Competitive position (research summary)
- Books giants: QuickBooks (~49% US), Xero (~3.7M). Trades giants: ServiceTitan
  (100k+ pros), Housecall Pro (40k+), Jobber.
- Jobboks' wedge: **local + all-in-one (books AND jobs) + dead-simple + AI-native.**
  No giant sits in that gap for small contractors. Don't try to out-QuickBooks
  QuickBooks; stay in the wedge, nail payments next, let AI learn per-user.

## Launch video (in progress — pick up next session)
- Story-driven explainer following "Mike", a contractor, through one day.
  Scripts saved to the owner's Downloads:
  `Jobboks_Story_Script_US.txt` (full storyboard) and
  `Jobboks_Canva_PasteReady_Story_US.txt` (narration to paste into Canva).
- Building it in **Canva** video editor. Owner does the sign-up/trial + download
  themselves (safety: no accounts/payment by Claude).
- **THEME the owner wants (remember this!): rustic vibe — pickup trucks, worn
  hand tools, wood textures, golden morning light, work boots/denim. Honest,
  down-to-earth. Brand blue+purple only on the app/text overlays.**
- Canva Elements search terms: "rustic contractor pickup truck", "worn work
  tools wood table", "tradesman truck tailgate tools", "carpenter hands tools
  sunset". Videos: "contractor working slow motion", "pickup truck driving rural".
- Idea to maybe build later: VOICE-to-estimate on the site visit (talk to AI:
  "23 Oak Street, roof, 90 sq m, 3 days" → estimate writes itself). Marked
  [NEXT] in the story script; not built yet.

## Job pipeline (site-visit-first)
JobStatus = survey (Vettvangsskoðun / Site visit) → scheduled (Færslur) →
active (Í vinnslu; logs hours/materials/photos) → complete (Lokið → invoice).
Plus paused (Á bið) and cancelled (Hætt við, reachable from any stage incl. site
visit). Offers/quotes live in INVOICES, not Jobs — there is no "waiting" stage.
Labels in STATUS_LABELS map in Jobs.tsx.
