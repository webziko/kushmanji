// Agents update on their own schedule, often weekly. The app cannot stop that, so it notices instead: each
// bridge names the newest version it was run against (`about.tested`), and an install newer than that gets a
// quiet note in the chat. What to do when that happens is in docs/MAINTENANCE.md.

const numbers = (version) =>
  String(version ?? "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);

/** Whether `installed` is a later version than `tested`. Unknown or unreadable versions are never "newer". */
export function isNewer(installed, tested) {
  const a = numbers(installed);
  const b = numbers(tested);
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
