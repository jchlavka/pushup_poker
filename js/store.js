// store.js — tiny localStorage helper for the player's own identity so a
// refresh / rejoin keeps your name (and the last table code).

const K = 'pushup-poker';

export function loadName() {
  try { return localStorage.getItem(K + ':name') || ''; } catch { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(K + ':name', name || ''); } catch {}
}
export function loadLastCode() {
  try { return localStorage.getItem(K + ':code') || ''; } catch { return ''; }
}
export function saveLastCode(code) {
  try { localStorage.setItem(K + ':code', code || ''); } catch {}
}
