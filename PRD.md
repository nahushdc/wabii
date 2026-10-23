# Wabii: Product Requirements Document

Status: living document, written from the code as of October 2026.
Related: [ROADMAP.md](ROADMAP.md) for what is planned, this file for what exists.

## 1. Product summary

Wabii is a journaling app that helps people get thoughts out of their head
quickly (typed or spoken), then turns what they write into self-awareness:
weekly and monthly reflections, patterns, and a conversational companion.

**Who it is for:** people who want to understand their own thinking and
emotions, and who need the capture step to be nearly effortless.

**Principles that drove decisions**
- Capture must be fast and forgiving; typing and speaking are equal citizens.
- Reflection should feel calm, not clinical or gamified.
- Private by default; sharing is explicit, time-limited and revocable.
- Ship quickly: prefer JavaScript-only changes that can be delivered over the air.

## 2. Architecture at a glance

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK 57, React Native 0.86, Expo Router, Reanimated 4, NativeWind | One codebase, file-based routing, UI-thread animations |
| Backend | Supabase: Postgres, Auth, Row Level Security, Edge Functions (Deno), pg_cron | One managed service for data, auth, server logic and schedules |
| AI | Anthropic Claude (claude-sonnet-4-5) for chat, reflections, insights, search answers; Supabase `gte-small` for embeddings | Quality for writing and reflection; embeddings are free and in-database |
| Speech | Deepgram Nova-3 live streaming, English only | Low-latency streaming transcription |
| Notifications | `expo-notifications`; local scheduling for reminders, Expo Push (to Apple APNs) for server-sent pushes | See section 4.9 |
| Delivery | EAS Build, EAS Update, TestFlight | OTA updates for JS; native builds only when native code changes |
| Admin | Separate web app (own folder and repo), shares the Supabase project | See section 4.16 |

**Data model (public schema):** `users`, `journal_entries`, `tags`, `entry_tags`,
`embeddings`, `chat_conversations`, `chat_messages`, `weekly_digests`,
`monthly_digests`, `prompt_themes` (pursuits), `theme_prompts`, `theme_insights`,
`reminders`, `search_history`, `ai_summary_feedback`, `feature_interest`,
`therapist_links`, `user_stories`, `ai_prompts`. Every user-owned table
references `auth.users` with `ON DELETE CASCADE`, which is what makes account
deletion a single operation.

## 3. Cross-cutting decisions and trade-offs

- **Row Level Security everywhere.** Users can only read and write their own
  rows. Trade-off: edge functions that need to act across users (digests) use the
  service role, so those functions must be written carefully. An earlier
  permissive digest policy was tightened (`tighten_digest_rls.sql`).
- **Secrets stay server-side.** The Anthropic and Deepgram keys exist only in
  edge functions. Trade-off: voice audio takes an extra hop through a relay.
- **JavaScript-first, native-light.** Anything that would need a native module
  was avoided where a plain-view solution was acceptable (the home blob, the
  waveform, the toggle). Trade-off: some visuals are approximations of what a
  graphics library would do, in exchange for shipping over the air.
- **Local-first for time-sensitive things.** Reminders are scheduled on the
  device. Trade-off: the phone must open the app occasionally to top up the
  schedule (a rolling 14-day window).
- **No account recovery of deleted data.** Deletion is immediate and complete
  (Apple guideline 5.1.1(v)). Trade-off: no undo.
- **Development switches in production data.** A `force_onboarding` flag on
  `users` lets a test account see onboarding on every launch. It should be
  turned off for the real account before wider testing.

## 4. Features

### 4.1 Accounts and authentication
- **What:** Email and password sign-up, log-in, forgot and reset password,
  sign-out, and in-app account deletion.
- **How:** Supabase Auth; the session is persisted in the keychain through
  `expo-secure-store`. A route guard redirects by auth and onboarding state.
  Deletion calls a `delete-account` edge function that removes the caller's auth
  user; foreign keys cascade through all their data. The function only acts on
  the caller's own JWT and requires an explicit `confirm` flag.
- **Trade-offs:** No social sign-in yet (simpler, but more friction). Deletion
  is destructive by design; the app asks twice.

### 4.2 Onboarding
- **What:** Name, an open question about why the person downloaded the app (text
  or voice, with starter phrases), then reminder and notification setup.
- **How:** Multi-step screen driven by a `step` parameter; answers saved on the
  `users` row (`signup_reason`). The reason question started as chips and became
  free text with dictation because chips lost the person's real language.
- **Trade-offs:** Free text is harder to analyse than chips but far more honest.
  Push registration is deferred to the end so the permission prompt has context.

### 4.3 Writing an entry (text)
- **What:** A single focused writing screen with tags and prompt-theme support.
  No tab bar or add button on this page.
- **How:** `new-entry` screen with a bounded multiline input that scrolls
  natively; word count; optional prompt card from a pursuit; save inserts into
  `journal_entries`, triggers an embedding via the `embed-entry` function, and
  cancels today's pending reminders if "skip if journaled" is set.
- **Trade-offs:** A bounded input rather than an auto-growing one so dragging to
  scroll works. Embedding is fire-and-forget, so search can lag a moment behind
  a fresh entry.

### 4.4 Voice dictation (live transcription)
- **What:** A mic button in the writing screen turns into a bar with cancel, a
  live waveform and stop. Words stream into the same text field; cancel restores
  the text from before.
- **How:** `@siteed/audio-studio` captures 16 kHz PCM16 audio in 100 ms chunks
  and the app streams it over a WebSocket to the `transcribe-voice-live` edge
  function, which relays to Deepgram Nova-3 and relays results back. Interim
  words appear grey and become final as they settle. The waveform level is
  computed from the same PCM stream (loudest 20 ms window, noise gate, adaptive
  peak) and written to a Reanimated shared value, so it never re-renders the
  screen. Stopping waits up to 1.5 s for Deepgram to flush the last phrase.
- **Trade-offs and lessons:**
  - English only: the multilingual model was measurably slower and less accurate
    when no code-switching is needed.
  - Relay architecture keeps the Deepgram key off the device. A direct
    connection with short-lived keys would save roughly 20 to 100 ms, but most of
    the perceived delay is Deepgram's own finalization, so it was not worth the
    added moving parts.
  - The recorder library ignored the requested chunk interval on iOS (emitting
    about once a second). It is patched with `patch-package`
    (`patches/@siteed+audio-studio+3.2.1.patch`), which required a native build.
  - Native loudness metering was tried and reverted: not more responsive than
    measuring the PCM directly.
  - The whole pipeline is shared by onboarding, entry editing, the writing screen
    and chat through one hook (`useLiveTranscription`).

### 4.5 Entries: view, edit, tags
- **What:** Open an entry, edit it (typing or dictation), tag it, start a chat
  about it, delete it.
- **How:** `entry/[id]` screen; tags via `tag-picker` with a preset list plus
  custom tags stored in `tags` and linked through `entry_tags`.
- **Trade-offs:** While dictating into an existing entry the text is read-only,
  to avoid fighting with incoming transcript.

### 4.6 Home
- **What:** A time-of-day question, a slow animated mood blob with a static plus
  and a cycling word (Check in, Rant, Vent, Yap, Reflect), a quiet outlined
  streak pill, then entries grouped by day.
- **How:** The blob is stacked, low-opacity circles inside a morphing clipped
  shape, animated with Reanimated on the UI thread. Two neighbouring colours show
  at a time and cross-fade around a ring. Streak is computed from entry dates
  (`lib/streak.ts`), counted from today or yesterday.
- **Trade-offs:** Built from plain views instead of SVG or Skia so it ships over
  the air; the soft edges are grainier than a real blur. The streak resets after
  a missed day by design, which can feel harsh.

### 4.7 Talk it through (chat about an entry)
- **What:** A conversation grounded in one entry, opened with a reflection from
  the AI, with a Claude-style input (mic, send, live waveform).
- **How:** `chat` edge function loads the entry, pulls a few related past entries
  through embedding search (`match_journal_entries`), and calls Claude. History is
  stored in `chat_conversations` and `chat_messages`. Crisis language is detected
  and answered with a fixed supportive message; the screen shows a "not a
  therapist, call 988" disclaimer.
- **Trade-offs:** Grounding on past entries makes replies more personal but costs
  an extra embedding and query per message. Replies are capped to keep them short
  and conversational.

### 4.8 Search
- **What:** Ask a question in plain language; get matching entries and a short
  answer. The first use shows a one-time intro.
- **How:** `search-entries` embeds the query with `gte-small`, matches entries
  with a Postgres function, and asks Claude to answer from the matches. The
  intro is gated by `users.search_onboarding_seen`. Search lives in the Reflect
  header.
- **Trade-offs:** Semantic search finds meaning, not exact words; an exact-phrase
  fallback is not implemented. Embeddings are 384-dimensional (small and free, but
  less nuanced than larger models).

### 4.9 Reminders and notifications
- **What:** Per-reminder time, days of week, optional custom message,
  skip-if-journaled, on or off. Default copy is a morning, afternoon and evening
  message.
- **How:** Reminders are rows in `reminders`; the app schedules each upcoming
  occurrence as a local notification with `expo-notifications` for the next 14
  days and tracks the notification ids in a local file, so one day's occurrence
  can be cancelled when the person journals. Saving an entry cancels today's.
  Server pushes (weekly and monthly reflections) go through Expo's push service
  to APNs, using the push key held in EAS.
- **Trade-offs:** A server cron plus push was the first version; it was fragile
  (a disabled cron job, silent registration failures, and a missing NOT NULL
  column on `users` upserts were all found). Local scheduling needs no network at
  fire time and follows the device clock, but the schedule only refreshes when
  the app is opened. The Expo push service adds a middleman compared with calling
  APNs directly; kept for simpler tokens and error handling.
- **Planned:** an admin-editable copy system (`notification_zones`) is drafted
  but not live.

### 4.10 Weekly and monthly reflections (Reflect tab)
- **What:** An AI written reflection each week and month, with structured moods,
  new patterns, repeating patterns (with counts) and patterns needing attention,
  a "deep dive" call to action, and thumbs up or down feedback.
- **How:** `weekly-digest` and `monthly-digest` edge functions run on pg_cron
  (Sunday weekly; monthly checked on the last days of the month and generated
  only on the real last day). Each makes two Claude calls: prose, then structured
  JSON, with the previous period's insights passed in so counts are comparable.
  Stored in `weekly_digests` and `monthly_digests` (`insights` JSON). A push is
  sent when ready. Per-user toggles live in Reflection Settings. Bold markdown in
  the prose is rendered by a small `BoldText` component.
- **Trade-offs:** Two calls cost more but keep prose natural and the structure
  reliable. Pattern counts are model-judged, not computed, so they are indicative.

### 4.11 Pursuits (prompt themes) and theme insights
- **What:** A pursuit is something a person wants to explore; they journal
  against it and get an AI summary built from the relevant entries.
- **How:** `prompt_themes` and `theme_prompts` hold pursuits and their prompts;
  `suggest-pursuits` proposes ideas from recent entries; `theme-insights`
  retrieves relevant entries by embedding and summarises them into
  `theme_insights`. Pursuits can be active or inactive. A one-time intro is
  tracked in `users.pursuits_onboarding_seen`.
- **Trade-offs:** Retrieval by embedding means a pursuit can surface entries that
  never mention it by name, which is the point but can also feel surprising.

### 4.12 App lock
- **What:** A 4-digit PIN that re-locks whenever the app leaves the foreground.
- **How:** PIN hashed with SHA-256 and a random salt, stored on the `users` row,
  verified on device; the lock screen overlays the whole app.
- **Trade-offs:** A 4-digit PIN is brute-forceable by someone with the phone.
  There is no biometric unlock (no `expo-local-authentication`). Keeping the hash
  server-side makes it follow the account but is not as strong as the device
  keychain.

### 4.13 Export and import
- **What:** Export entries as text, Markdown, CSV or JSON; import from a file.
- **How:** Client-side formatting and the system share sheet; import through the
  document picker.
- **Trade-offs:** Done on device, so large journals are limited by memory.

### 4.14 Share with coach
- **What:** Generate a time-limited, optional-password link for a coach or
  therapist to read journal content; revoke at any time.
- **How:** `therapist-portal` edge function issues a token with a 48-hour expiry,
  optional password hash, stored in `therapist_links`, and serves a read-only
  view while the link is valid and not revoked.
- **Trade-offs:** Link-based access avoids giving the coach an account but means
  anyone with the link (and password, if set) can read until it expires.

### 4.15 Profile, streak and help
- **What:** Name, email, stats (thoughts shared, words written), streak detail,
  settings list, sign-out, delete account, and a help screen to report an issue,
  share feedback or request a feature.
- **How:** Plain screens over Supabase queries; help opens prefilled mail.

### 4.16 Admin dashboard (separate, in progress)
- **What:** An internal web app to see app data, edit AI prompts, manage
  notification copy and view voice usage.
- **How:** Lives in its own folder and repo; talks to the same Supabase project
  through `admin-*` edge functions. The shared prompt helpers
  (`supabase/functions/_shared`) are used by both the app functions and the
  dashboard, so backend code is shared even though the frontends are not.
- **Trade-offs:** One backend means a mistake in shared code affects both. Draft
  edits in the shared functions are uncommitted and should be reviewed before
  deploy (one had a syntax error).

### 4.17 Release engineering
- **What:** TestFlight distribution, over-the-air JS updates, reproducible
  native builds.
- **How:** EAS Build profiles (development, preview, production) with update
  channels; `runtimeVersion` follows the app version so updates apply only to
  compatible binaries; production updates go to the `production` branch. The
  bundle identifier is `com.wabiiapp.wabii`; the App Store Connect record's
  bundle ID is permanent.
- **Trade-offs:** OTA updates ship fast but only apply on the next launch after
  download, so testers need two launches to see a change. Anything that touches
  native code needs a new build.

## 5. Quality, safety and compliance

- Crisis language detection in chat, with a visible disclaimer.
- In-app account deletion (App Store requirement) and microphone usage text.
- Not yet done: a hosted privacy policy URL (needed for external TestFlight and
  review), App Privacy answers in App Store Connect, and a full QA pass on a
  clean install of the production build.

## 6. Known gaps and risks

- No automated tests; verification has been typecheck, bundle and device checks.
- Some AI features depend on a single model and have no fallback.
- The AI companion, "Map of You" and "Promises" are scoped but not built
  (see ROADMAP.md).
- Digest and notification edge functions in the working tree have uncommitted
  changes that must be reviewed before deployment.

## 7. Open decisions

1. Privacy policy and terms: wording and hosting.
2. Whether to keep English-only speech or add multilingual back with a
   per-user setting.
3. Whether the PIN should gain biometric unlock.
4. Pricing and what sits behind a paid plan (the proactive reminders card
   already says Pro).
5. Final streak behaviour on a missed day (reset, pause, or grace).
