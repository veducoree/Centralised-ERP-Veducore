import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Don't hit the update server more than once every 10 minutes.
const MIN_GAP_MS = 10 * 60 * 1000;

/**
 * Over-the-air updates (EAS Update). Checks on launch and whenever the app comes
 * back to the foreground, downloads silently, and reports `ready` only when a
 * genuinely newer bundle than the one running is downloaded and waiting.
 * If the user never taps "Update", it still applies on the next cold start.
 */
export function useOtaUpdates() {
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const lastCheck = useRef(0);
  const busy = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const check = async () => {
      if (busy.current) return;
      if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or update server unreachable: try again next time.
      } finally {
        busy.current = false;
      }
    };

    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);

  // Guard against spurious prompts: the downloaded bundle must be a different
  // update than the running one AND newer than it.
  const isGenuinelyNew = (() => {
    if (!isUpdatePending || !downloadedUpdate) return false;
    if (downloadedUpdate.updateId && downloadedUpdate.updateId === Updates.updateId) return false;
    const runningAt = Updates.createdAt?.getTime();
    const downloadedAt = downloadedUpdate.createdAt ? new Date(downloadedUpdate.createdAt).getTime() : undefined;
    if (runningAt && downloadedAt && downloadedAt <= runningAt) return false;
    return true;
  })();

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setApplying(false);
    }
  }, []);

  return {
    ready: !__DEV__ && Updates.isEnabled && isGenuinelyNew && !dismissed,
    applying,
    applyUpdate,
    dismiss: () => setDismissed(true),
  };
}
