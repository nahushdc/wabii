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
