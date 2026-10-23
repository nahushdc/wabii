# Working on Wabii

Instructions for any Claude session working in this repository.

## When you implement something, explain it

After building or fixing anything, the final message to the owner must include,
in plain everyday language (the owner is not an engineer):

1. **How it works**: the logic that was implemented.
2. **Edge cases covered**: the unusual situations that are handled (offline,
   expired sign-in, lost connection, first launch, existing data, retries, and so on).
3. **Not covered or known limits**: anything that can still go wrong.
4. **Tested vs not tested**: what was actually run or checked, and what could
   only be checked on a real phone.

Do this every time, not only when asked. Name known risks (auth expiry, offline,
race conditions, data loss, migrations) explicitly, even when they are handled.

## Other house rules

- Show a design for any new or changed screen before building it, and answer
  questions before building. Build only when told to.
- Multiple sessions edit this working tree. Commit only your own changes with
  targeted `git add` (never `git add -A`), and publish over-the-air updates from
  a clean checkout so another session's unfinished work is not shipped.
- Use the app's existing font and flat styling; avoid gradients.
