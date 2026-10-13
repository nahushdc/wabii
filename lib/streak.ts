// Consecutive days with at least one entry, counted back from today (or
// yesterday, so a streak isn't lost until a full day is missed).
export function calculateStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  // Unique local calendar days as YYYY-MM-DD, newest first.
  const unique = Array.from(new Set(
    dates.map(d => new Date(d).toLocaleDateString('en-CA'))
  )).sort((a, b) => b.localeCompare(a));

  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');

  if (unique[0] !== today && unique[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 864e5);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}
