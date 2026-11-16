import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { appAlert } from '@/components/ui/AppDialog';

// Don't hit the update server more than once every 10 minutes.
const MIN_GAP_MS = 10 * 60 * 1000;

/**
 * Over-the-air updates (EAS Update). Checks on launch and whenever the app
 * comes back to the foreground; once a new bundle is downloaded, offers a restart.
 * If the user says "Later", the update still applies on the next cold start.
 */
export function useOtaUpdates() {
  const lastCheck = useRef(0);
  const busy = useRef(false);
  const prompted = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const check = async () => {
      if (busy.current || prompted.current) return;
      if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
      busy.current = true;
      lastCheck.current = Date.now();
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (!isAvailable) return;
        const { isNew } = await Updates.fetchUpdateAsync();
        if (!isNew) return;
        prompted.current = true;
        appAlert(
          'Update ready',
          'A new version of Veducore has been downloaded. Restart now to use it.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart', onPress: () => { Updates.reloadAsync().catch(() => {}); } },
          ],
          { tone: 'info', icon: 'cloud-download' },
        );
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
}
