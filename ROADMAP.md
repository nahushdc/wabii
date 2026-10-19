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

### 6. AI accountability companion (planned, not built)

A companion that helps people stay accountable to journaling and rebuild a lapsed
streak, rather than relying on a silent push notification.

- **Escalating nudge:** a notification at the reminder time; if there's no entry
  within 15 minutes, a WhatsApp or iMessage message; if still nothing, a phone
  call. This is the "Proactive reminders" card on the Reminders screen, currently
  marked "Pro · Coming soon" and collecting interest in `feature_interest`
  (`proactive_reminders`).
- **Home nudge, deliberately off for now:** after 3 or more days without an entry
  the home screen would show a quiet card under the streak pill ("Enable an AI
  companion to help you stay accountable and build your streak") with an
  "Enable companion" button into the waiting list. Designed and mocked up, but not
  shipped; turn it on when the companion exists.
- **Open questions:** which channels at launch (WhatsApp vs iMessage vs call),
  consent and phone-number collection, quiet hours and a clear way to opt out,
  per-message and per-call cost, and whether this sits behind a paid plan.

### 7. Entry cards coloured by emotion (idea, not built)

Today a card's colour is arbitrary: it is picked from a palette by the first
character of the entry id (`app/(tabs)/index.tsx`, `CARD_COLORS`). The idea is to
colour each card by the emotion in the entry, so the list becomes a glanceable
mood history.

**How intrusive is it, and can it work without reading the note?**
Detecting emotion from text means something has to read the text; there is no
way around that. What we control is *where* it is read and *what is kept*.

- Entry text already goes to Claude for reflections, search and chat, so this is
  not a new category of exposure. But those run on demand or weekly. Per-entry
  detection would process *every* entry at save time, which is a step up and
  should be disclosed in the privacy policy and be opt-in.
- Keep only the result: store a single label from a fixed set (for example
  calm, joyful, anxious, sad, angry, tired, mixed) in a new column such as
  `journal_entries.mood`. Never store the model's reasoning, and have the prompt
  return one word and nothing else.

**Options for text, least to most intrusive**

1. **User picks the mood** at save time (a small row of colours). Zero analysis,
   zero privacy cost, and it produces ground truth for later.
2. **On-device detection.** The text never leaves the phone. Apple's
   NaturalLanguage sentiment is free but only gives positive/negative, and needs
   a native module (so a new build, not an OTA update). A JS word-list approach
   is OTA-able but coarse.
3. **Server-side LLM at save time** (a small, cheap Claude model returning one
   label). Richest and most accurate; the text is sent to the model once per
   entry.
4. **Hybrid (recommended):** ship 1 first, then add 3 as an opt-in setting
   ("Colour my entries by mood") with a fixed label set, and always let the user
   tap a card to correct its colour.

**Voice entries**

- *Words:* voice is already transcribed by Deepgram, so the transcript can go
  through the same text path. No extra audio handling.
- *Tone (pitch, pace, energy):* needs an audio emotion model, either a third-party
  API or an on-device model. It is the most sensitive option, is much less
  reliable than people expect (varies by accent, language, mic and person), and
  would mean sending or analysing the raw voice. Not recommended for v1; revisit
  only if users ask for it. Check data-protection rules before any voice-emotion
  work.
- Today the audio is relayed live to Deepgram and not kept by us (we only log
  byte counts). Confirm Deepgram's own retention setting before making any claim
  about this in the privacy policy.

**Design and risk notes**

- A wrong guess on a heavy entry (colouring grief as "joyful") feels worse than no
  colour. Use a neutral colour when confidence is low, avoid red-means-bad
  judgements, and always allow a correction.
- Colour alone is not enough for accessibility; show the mood word in the entry
  detail.
- Decide whether to backfill existing entries (a one-off cost and a one-off
  reading of every old entry, so it needs its own consent).
- Feeds back into reflections: a stored mood per entry would make weekly and
  monthly mood insights cheaper and more consistent.

### 8. Beta question: voice recordings and local storage (to ask)

We do not keep voice recordings today. Before deciding whether to, ask beta users:

- Do you want a recording of what you said, kept alongside the written entry?
- If yes, where: only on this phone, or backed up to your account?
- Would you want to replay it, or is the transcript enough?
- How long should it be kept, and should you be able to delete just the audio?

What the answers decide:

- **On-device only:** no server storage cost or privacy exposure, but recordings
  are lost on uninstall or a new phone unless included in the device backup, and
  there is no access from other devices.
- **In the cloud (Supabase Storage):** works across devices, but adds storage
  cost, a bigger privacy surface, the need to cover audio in the delete-account
  flow and the privacy policy, and per-user access rules.
- **Neither:** keep the current behaviour (transcript only), which is the
  simplest and most private.

Run this as a short in-app or survey question to the TestFlight group, and
decide after seeing the split. It also informs item 7, since tone-based emotion
detection would need the audio.

### 9. Big, vague questions as pursuits (to design)

People arrive with questions like "Who am I?", "What do I want from life?" and
"What kind of person am I?". Pursuits should be able to hold these, but they are
too large for the app to track as they stand: unlike "Why do I sabotage myself?",
there is no single pattern to count.

- **Open problem:** how to turn a huge question into things the app can actually
  follow in someone's writing. A starting idea is facets: how they describe
  themselves ("I'm the kind of person who..."), what they value, what energises or
  drains them, what they keep returning to, and how any of that shifts over time.
- **Related:** Map of You (item 1 above) and the pursuit redesign, where a pursuit
  is a saved question answered from the whole journal.
- **Cold start:** with no entries yet, the page needs to invite writing (for
  example "Finish this sentence: I'm someone who...") instead of showing nothing.
- **Consent:** a pursuit created from what someone said in onboarding should say
  why it was added, and be easy to change or remove.

### 10. Pursuits redesign (designed, not built)

A pursuit stops being a tag you journal against and becomes a **saved question
about yourself**, answered from the whole journal.

- **Pursuit page:** the question and the person's "why"; what keeps showing up
  (AI-written patterns with entry counts and dates); a mentions-per-week chart;
  related entries; an "Ask about this" chat grounded in those entries and an
  optional "Write" button.
- **Matching by meaning:** when a pursuit is created the AI writes a few "what
  this looks like in a journal" phrases, which are embedded and matched against
  entries. A match table (entry, pursuit, score) is filled when an entry is saved,
  new pursuits are backfilled, and entries already tagged count as full matches.
  Insights are cached and refreshed after enough new matches or weekly.
- **Cold start:** with few matches, show them with a line such as "Only 2 entries
  touch on this so far" instead of a dead end.
- **Empty state (decided):** when there are no pursuits, the Pursuits section on
  Reflect shows a single quiet dashed card, "Add your first pursuit", with a small
  chevron and no button. The whole card is tappable.
- **First-time flow (decided):** shown once from that card, then straight to the
  last step on later visits. 1) A pursuit is a question about you, with example
  questions. 2) Ask once, keep writing: name the question, write as normal, see
  what comes up. 3) Pick a starter question or write your own, with an optional
  "why". This replaces the old Profile pursuits onboarding, which teaches
  journaling against a pursuit.
- **Depends on:** the matching above. The flow says Wabii looks across everything
  written, which is not true of today's pursuits, so ship the matching first.
- **Still open:** whether Wabii should suggest pursuits it notices; whether "Ask
  about this" is in the first version; seeding a pursuit from the reason someone
  gave in onboarding; and item 9 (very big questions such as "Who am I?").

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
