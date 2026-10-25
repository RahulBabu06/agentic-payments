// Progressive enhancement only: Safari/iOS does not expose the Vibration API.
export function setHaptics(enabled: boolean) {
  try { sessionStorage.setItem("voicepay:haptics", enabled ? "on" : "off"); } catch {}
  if (!enabled) cancelHaptics();
}

export function hapticsEnabled() {
  try { return sessionStorage.getItem("voicepay:haptics") === "on"; } catch { return false; }
}

export function pulseHaptics(pattern: number | number[] = 20) {
  if (typeof navigator === "undefined" || !navigator.vibrate || !hapticsEnabled()) return;
  if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try { navigator.vibrate(pattern); } catch {}
}

export function cancelHaptics() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(0); } catch {}
  }
}
