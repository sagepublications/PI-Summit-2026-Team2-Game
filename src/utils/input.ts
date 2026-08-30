/**
 * True for a fresh Space/Enter press. Ignores key auto-repeat so holding the
 * key can't race through scenes, and stops Space scrolling the page.
 */
export function isConfirmKey(e: KeyboardEvent): boolean {
  if (e.repeat) return false;
  if (e.code !== 'Space' && e.code !== 'Enter') return false;
  e.preventDefault();
  return true;
}
