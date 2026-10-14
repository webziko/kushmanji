// The window opens where the person left it, the size they left it (M1-12). A place saved on a monitor that is no
// longer connected (a laptop taken off its desk) is not used: the window would open where nobody can see it.

const MIN = { width: 960, height: 600 };

/**
 * The bounds to open with: the saved ones when enough of the window would be on one of the `screens` (their
 * `workArea`s), otherwise null for the default size, centred.
 */
export function placeToOpen(saved, screens) {
  const values = ["x", "y", "width", "height"].map((key) => Number(saved?.[key]));
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values.map(Math.round);
  if (width < MIN.width || height < MIN.height) return null;
  // Its top 40 pixels (where it is dragged from) must be at least partly on a screen, and at least 200 wide.
  const reachable = screens.some(({ x: sx, y: sy, width: sw, height: sh }) => {
    const across = Math.min(x + width, sx + sw) - Math.max(x, sx);
    const down = Math.min(y + 40, sy + sh) - Math.max(y, sy);
    return across >= 200 && down >= 20;
  });
  return reachable ? { x, y, width, height } : null;
}
