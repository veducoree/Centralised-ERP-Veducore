import { Linking } from 'react-native';

/** Opens the dialer / mail app; silently ignores devices that can't. */
export const call = (phone?: string | null) => { if (phone) Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {}); };
export const mail = (email?: string | null) => { if (email) Linking.openURL(`mailto:${email}`).catch(() => {}); };
