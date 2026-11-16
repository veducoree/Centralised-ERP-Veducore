import { useSyncExternalStore } from 'react';

/**
 * Shared state for the header notification bell. The role dashboard (always
 * mounted under the tab layout) owns fetching + live updates and publishes the
 * unread count and inbox opener here, so every tab's Header shows the same bell.
 */
type BellState = { unread: number; openInbox: (() => void) | null };

let state: BellState = { unread: 0, openInbox: null };
const listeners = new Set<() => void>();

export function setBell(next: Partial<BellState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useBell(): BellState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
