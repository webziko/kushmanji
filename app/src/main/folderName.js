// A new video's folder name, apart from projects.js so it can be tested without Electron.

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A folder name Windows accepts: letters of any script with their marks (a Kannada or Hindi name stays itself,
 * M1-11), digits and hyphens; Latin accents are dropped so "Café" stays "cafe". Every place that puts the name in
 * a URL encodes it. Device names (CON, NUL, COM1...) are refused by Windows even with an extension, so they get a
 * suffix.
 */
export function folderNameFor(name) {
  const slug = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  // Cut by letters, not UTF-16 units: half of a letter outside the basic plane (Adlam, rarer Chinese) would make the
  // folder's name impossible to put in a URL, and the video would not open.
  const short = Array.from(slug).slice(0, 48).join("").replace(/-+$/, "");
  if (!short) return "untitled";
  return RESERVED.test(short) ? `${short}-video` : short;
}
