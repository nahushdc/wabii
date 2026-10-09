# Wabii Roadmap

## Vision

Wabii today is a warm AI journaling app: capture (text / live voice / talk-it-through
chat), then AI reflects it back — per-entry chats, pursuits with insights, weekly/monthly
reflections, semantic search. Good foundation, but structurally everything happens
*after the fact*, in the user's own voice only, and ends in insight rather than action.

The next phase reframes the product around three loops instead of one:

**Capture → Model → Practice → (measure whether the model was right) → Capture.**

## Self-awareness & emotional intelligence initiatives

1. **"Map of You" — a living profile, not periodic reports.** Replace read-once
   digests with a persistent, evolving model: triggers, recurring patterns with
   trajectory (rising / fading / resolved), emotional vocabulary, values, recurring
   people, what actually helps. Weekly/monthly reflections become "what changed on
   the map." Builds directly on the pattern-occurrence-count work already shipped
   (`insights` on `weekly_digests`/`monthly_digests`).

2. **Emotional granularity training.** The strongest evidence-backed EQ lever:
   labeling feelings finely improves regulation. At capture time, gently offer
   finer alternatives to vague mood words ("bad day" → *dread, resentment,
   depletion?*), and show vocabulary breadth growing over months. Today moods are
   inferred by AI after the fact — the user never does the labeling work
   themselves, which is where the learning happens.

3. **In-the-moment check-ins, not just retrospective ones.** A 60-second "right
   now" flow: name the feeling, rate intensity, one micro-practice (a reappraisal
   question, "what would you tell a friend"). Triggered by a widget or proactively
   when the Map of You signals elevated risk (e.g. "Sunday evenings", "before that
   recurring meeting").

4. **Predict → compare (blind-spot detection).** Before an event, ask "how will you
   feel after?"; log the actual afterward. Over time, surface where self-forecasts
   are systematically wrong. Pursuits evolve from passive observations into
   hypotheses with lightweight experiments ("this week, try X, report back"),
   closing the loop from insight to action.

5. **External self-awareness.** The blind spot of every journaling app: it only
   hears the user's own voice. Let a user send one question to a trusted person
   ("when I'm stressed, what do I do that I probably don't notice?") and show the
   answer against their own self-view. The existing therapist-portal feature is a
   seed of this pattern — generalize it beyond therapists.

6. **A companion with memory and a spine.** Chat today is per-entry, 2–4 sentences,
   questions-only. Evolve it into one continuous relationship that remembers the
   Map of You, notices out loud ("this is the fourth time you've described your
   sister this way"), gently challenges, and runs real practices — values
   clarification, self-compassion work, and rehearsing a hard conversation via
   roleplay before having it for real.

7. **Body and context signals.** Pull in sleep/HRV (HealthKit) and calendar context
   so patterns can be grounded in physiology, not just text — e.g. "70% of your
   low entries follow under-6-hour nights."

8. **Measure growth, not journaling volume.** Streaks reward showing up. Realign
   the reward system toward actual change: vocabulary breadth over time, forecast
   accuracy (from #4), time-to-recover after a hard entry, an attention pattern
   going from ×5 down to gone.

## Sequencing notes

- **Cheap, reuse existing data/pipeline:** #1–#3 build directly on the digest
  insights work already shipped.
- **High payoff, modest scope:** #4.
- **Bigger bets, likely the real differentiation:** #5 and #6.
- **Cross-cutting requirement:** as the Map of You gets built, privacy needs to be
  a first-class feature (not just the PIN lock already in place) — this becomes an
  intensely sensitive profile.
- **Design caution:** as practice-based features (#3, #4, #6) mature, the AI
  should narrate *less*, not more — insight is cheap, and an app that keeps
  generating beautiful paragraphs about the user can feel profound while changing
  nothing.

## In flight: operations & admin tooling (not yet committed)

A separate track from the self-awareness work above: tooling so the owner can see
how the app is used and tune its AI and notifications without a redeploy. Work was
started in a parallel session and is sitting uncommitted in the working tree. None
of it is live until the SQL is run and the functions are deployed.

### 1. Admin dashboard (local-only web app)

- **Decisions made:** a separate web app (not part of the mobile app), run locally
  (no hosting), in a new `admin-dashboard/` folder. Stack: Vite + React + TypeScript,
  Tailwind + shadcn/ui, Recharts, Supabase for data/auth/functions.
- **Access:** only the owner's account. `admin_users` table + admin-only edge
  functions that check it and use the service-role key; that key never reaches the
  browser. Replaces the old "any signed-in user can edit `ai_prompts`" rule.
- **Planned views:** users (total, signups/day, daily actives), voice usage
  (transcriptions/day, minutes, estimated cost), Deepgram credit balance, live and
  peak concurrency with a warning near the plan limit, prompt editor, notification
  editor.
- **Status:** backend pieces exist (below). The dashboard front end itself
  (`admin-dashboard/`) has not been created yet; `.claude/launch.json` already
  has a dev-server entry for it on port 5173.
- **Still needed from the owner:** their Supabase user id (to seed `admin_users`),
  a Deepgram API key with billing-read access (stored as a Supabase secret), and
  their Deepgram plan's concurrent-stream limit (for the alert threshold).

### 2. Backend pieces drafted (uncommitted)

- **Database scripts** (`supabase/sql/`, each safe to re-run): `admin_foundation.sql`
  (admin table, locks down `ai_prompts`), `voice_sessions.sql` (one row per live
  transcription session), `admin_stats.sql` (user/usage aggregations, service-role
  only), `ai_prompts_versioning.sql` (history of every prompt edit, with reset to
  default), `notification_templates.sql` (editable notification zones and settings).
- **Edge functions** (`supabase/functions/`): `admin-stats`, `admin-deepgram`,
  `admin-prompts`, `admin-notifications`, plus shared helpers in `_shared/`
  (admin check, prompt loading, built-in default prompts).
- **Existing functions edited** (chat, journal-chat, weekly/monthly digest,
  search-entries, suggest-pursuits, theme-insights): prompts now load from the
  database with the old hardcoded text as the fallback.
- **`transcribe-voice-live`:** now logs each session (start, end, status,
  rejected connections) to `voice_sessions`. Usage and concurrency numbers only
  begin from the day this ships; there is no history before it.
- **Order to bring it live:** run the SQL (foundation first, then voice sessions,
  stats, prompt versioning, notification templates), add the admin user row, set
  secrets, deploy the functions, then build the dashboard.

### 3. Editable notifications

- **Zones:** three day zones set by the reminder's hour: morning (5am), afternoon
  (12pm), evening (5pm, including late night). Title is the greeting; the body is
  a gentle invitation to journal, rotated by day.
- **Editable:** zone copy, start hours, and days-ahead window live in
  `notification_zones` / `notification_settings`; `lib/reminder-notifications.ts`
  (uncommitted rewrite) fetches them, caches the last good copy on the phone, and
  falls back to built-in copy if offline. `send-reminders` (server push path) uses
  the same zones.
- **Open decision:** the built-in fallback copy in that rewrite is the older
  generic wording ("Good Morning! 🌅 …"), not the warmer lines written earlier
  (e.g. "A fresh page is waiting. What do you want to carry into today?"). Pick one
  before committing.
- **Limits:** notifications are scheduled locally on each phone, so the server
  can't see delivery or open rates. Changing copy only reaches phones that have
  the new app build and have re-synced reminders on foreground.

### 4. Voice and dictation follow-ups

- **Dictation in the journal composer** shipped (mic icon in the text composer,
  live waveform). Remaining ideas: measure native audio latency and tune the
  analysis interval if the waveform still feels delayed; optional Skia-based orb
  (needs a native rebuild).
- **Revisit the voice-session logging** once the dashboard exists, to confirm
  concurrency numbers match what Deepgram reports.

### 5. Tooling and housekeeping

- **NativeWind and `Pressable`:** a `Pressable` whose `style` is a function
  (pressed state) is silently dropped on device by NativeWind's interop, losing
  padding, margins, and backgrounds. Fixed for Recent activity rows and the
  digest deep-dive button; keep rows styled via a plain `View` inside the
  children function. Audit any new `style={({ pressed }) => …}` usage.
- **Dev build vs preview build:** both share the bundle id `com.nahush.wabii`;
  installing a preview or TestFlight build over the development build makes the
  app stop loading from Metro, so edits appear to do nothing. Use the development
  build for day-to-day work.
- **`.claude/launch.json`:** has an uncommitted `admin-dashboard` entry; commit it
  with the dashboard.

## Already shipped (context)

- Text / live-voice (Deepgram streaming) / talk-it-through chat entry capture
- Weekly & monthly AI reflections, with structured mood + pattern insights
  (new / repeating / attention-needing, with occurrence counts) and a
  "deep dive" CTA into the most persistent pattern
- Pursuits (ongoing personal questions) with per-pursuit theme insights
- Semantic search across entries, chats, insights, and reflections
- PIN-based app lock
- Push notifications for weekly/monthly reflections
- Therapist-sharing portal
