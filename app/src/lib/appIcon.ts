import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { SCHOOL_ICONS } from '@/lib/schoolIcons.generated';

/**
 * Alternate launcher icons (one per school, bundled at build time by
 * scripts/sync-school-icons.mjs). The native module is loaded lazily so an
 * older binary without it never crashes — the feature just hides itself.
 */
type IconsModule = typeof import('expo-alternate-app-icons');

let mod: IconsModule | null | undefined;
function native(): IconsModule | null {
  if (mod !== undefined) return mod;
  // Expo Go / older binaries don't include the native module: bail out quietly
  // instead of letting the library's import throw (and log a red error).
  if (SCHOOL_ICONS.length === 0 || !requireOptionalNativeModule('ExpoAlternateAppIcons')) {
    mod = null;
    return mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-alternate-app-icons') as IconsModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** Android only for now (iOS deferred), and only when this build has icons. */
export function appIconSupported(): boolean {
  if (Platform.OS !== 'android' || SCHOOL_ICONS.length === 0) return false;
  try {
    return !!native()?.supportsAlternateIcons;
  } catch {
    return false;
  }
}

/** Name of the active alternate icon, or null for the default Veducore icon. */
export function currentAppIcon(): string | null {
  try {
    return (native()?.getAppIconName() as string | null) ?? null;
  } catch {
    return null;
  }
}

/** Switch launcher icon; `null` restores the default. Throws if it didn't apply. */
export async function setAppIcon(name: string | null): Promise<void> {
  const m = native();
  if (!m) throw new Error('App icons are not supported on this version. Please update the app.');
  await m.setAlternateAppIcon(name as never);
  // The native side swallows unknown-icon errors, so confirm it actually switched.
  if (currentAppIcon() !== name) {
    throw new Error('This icon is not available in your app version yet. Please update the app from the Play Store.');
  }
}

/** Restore the default icon (used on logout). Never throws. */
export async function resetAppIconSafely(): Promise<void> {
  if (!appIconSupported()) return;
  try {
    if (currentAppIcon() !== null) await native()?.setAlternateAppIcon(null);
  } catch {
    // best effort
  }
}
