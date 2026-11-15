/**
 * App-styled replacement for React Native's stock Alert.
 *
 *   appAlert('Logout', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Logout', style: 'destructive', onPress }])
 *
 * Same call shape as Alert.alert, so screens switch over by renaming the call.
 * <DialogHost /> is mounted once in the root layout and shows dialogs one at a time.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, Animated, Easing, Platform,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/utils';

export interface DialogButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: (value?: string) => void | Promise<void>;
}

export type DialogTone = 'info' | 'success' | 'error' | 'warning' | 'danger';

export interface DialogOptions {
  cancelable?: boolean;
  tone?: DialogTone;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options: DialogOptions;
}

// ── Tiny store ───────────────────────────────────────────────
let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<(q: DialogRequest[]) => void>();
const emit = () => listeners.forEach((l) => l(queue));

export function appAlert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
  queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options: options ?? {} }];
  emit();
}

/** Promise form for confirmations: resolves true when the confirm button is pressed. */
export function appConfirm(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}): Promise<boolean> {
  return new Promise((resolve) => {
    appAlert(opts.title, opts.message, [
      { text: opts.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmText ?? 'Confirm', style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { icon: opts.icon, tone: opts.destructive ? 'danger' : undefined });
  });
}

// ── Look & feel ──────────────────────────────────────────────
const TONES: Record<DialogTone, { color: string; bg: string; ring: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info:    { color: COLORS.primary, bg: '#EBF2FE', ring: '#D7E5FD', icon: 'information-circle' },
  success: { color: '#059669', bg: '#ECFDF5', ring: '#D1FAE5', icon: 'checkmark-circle' },
  error:   { color: '#DC2626', bg: '#FEF2F2', ring: '#FEE2E2', icon: 'close-circle' },
  warning: { color: '#D97706', bg: '#FFFBEB', ring: '#FEF3C7', icon: 'alert-circle' },
  danger:  { color: '#DC2626', bg: '#FEF2F2', ring: '#FEE2E2', icon: 'warning' },
};

function guessTone(r: DialogRequest): DialogTone {
  if (r.options.tone) return r.options.tone;
  const t = `${r.title} ${r.message ?? ''}`.toLowerCase();
  if (r.buttons.some((b) => b.style === 'destructive')) return 'danger';
  if (/(fail|error|could not|couldn't|unable|invalid|denied|not available|expired)/.test(t)) return 'error';
  if (/(success|submitted|saved|approved|downloaded|sent|done|updated|marked|added|created|paid)/.test(t)) return 'success';
  if (/(required|please|warning|select|missing|not received|choose)/.test(t)) return 'warning';
  return 'info';
}

function guessIcon(r: DialogRequest, tone: DialogTone): keyof typeof Ionicons.glyphMap {
  if (r.options.icon) return r.options.icon;
  const t = r.title.toLowerCase();
  if (/log ?out|sign ?out/.test(t)) return 'log-out-outline';
  if (/delete|remove/.test(t)) return 'trash-outline';
  if (/payment|fee/.test(t) && tone !== 'error') return tone === 'success' ? 'checkmark-circle' : 'wallet-outline';
  if (/camera|photo|gallery/.test(t)) return 'camera-outline';
  return TONES[tone].icon;
}

// ── Host ─────────────────────────────────────────────────────
export function DialogHost() {
  const [items, setItems] = useState<DialogRequest[]>(queue);
  const current = items[0];

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  const close = (btn?: DialogButton) => {
    const id = current?.id;
    queue = queue.filter((q) => q.id !== id);
    emit();
    // Let the closing animation start before running the action (e.g. navigation).
    if (btn?.onPress) setTimeout(() => { void btn.onPress?.(); }, 60);
  };

  return current ? <DialogCard key={current.id} req={current} onClose={close} /> : null;
}

function DialogCard({ req, onClose }: { req: DialogRequest; onClose: (b?: DialogButton) => void }) {
  const tone = guessTone(req);
  const t = TONES[tone];
  const icon = guessIcon(req, tone);
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [closing, setClosing] = useState(false);

  const cancelBtn = req.buttons.find((b) => b.style === 'cancel');
  const dismissable = req.options.cancelable !== false && (!!cancelBtn || req.buttons.length === 1);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 9 }),
    ]).start();
  }, [fade, pop]);

  const finish = (btn?: DialogButton) => {
    if (closing) return;
    setClosing(true);
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0.6, duration: 140, useNativeDriver: true }),
    ]).start(() => onClose(btn));
  };

  // Cancel first (left), the main action last (right / bottom).
  const ordered = [...req.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : 0) - (b.style === 'cancel' ? -1 : 0));
  const stacked = ordered.length > 2 || ordered.some((b) => (b.text ?? '').length > 14);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const translateY = pop.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Layer onBack={() => dismissable && finish(cancelBtn ?? req.buttons[0])}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissable && finish(cancelBtn ?? req.buttons[0])} />
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }, { translateY }] }]}>
          <View style={[styles.iconRing, { backgroundColor: t.ring }]}>
            <View style={[styles.iconCircle, { backgroundColor: t.bg }]}>
              <Ionicons name={icon} size={28} color={t.color} />
            </View>
          </View>

          <Text style={styles.title}>{req.title}</Text>
          {!!req.message && <Text style={styles.message}>{req.message}</Text>}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {(stacked ? [...ordered].reverse() : ordered).map((b, i) => (
              <DialogAction
                key={`${b.text}-${i}`}
                btn={b}
                tone={t.color}
                primary={b.style !== 'cancel' && (ordered.length === 1 || b === ordered[ordered.length - 1] || b.style === 'destructive')}
                stacked={stacked}
                onPress={() => finish(b)}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Layer>
  );
}

/**
 * iOS: a full-window overlay sits above every screen and native modal, with
 * no present/dismiss race when a sheet is closing. Android: a transparent
 * Modal (its own window, also above other modals; back button = cancel).
 */
function Layer({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onBack}>
      {children}
    </Modal>
  );
}

function DialogAction({ btn, primary, stacked, tone, onPress }: {
  btn: DialogButton; primary: boolean; stacked: boolean; tone: string; onPress: () => void;
}) {
  const destructive = btn.style === 'destructive';
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 50, bounciness: v === 1 ? 8 : 0 }).start();

  return (
    <Animated.View style={[stacked ? styles.btnStacked : styles.btnRow, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress} onPressIn={() => spring(0.96)} onPressOut={() => spring(1)} style={{ width: '100%' }}>
        {({ pressed }) =>
          primary ? (
            <LinearGradient
              colors={destructive
                ? pressed ? ['#B42318', '#9F1D14'] : ['#E5483B', '#D92D20']
                : pressed ? ['#1A4FC4', '#143FA3'] : ['#1E5BD8', '#1A4FC4']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.btn, { shadowColor: destructive ? '#DC2626' : tone }, styles.btnShadow]}>
              <Text style={styles.btnTextPrimary} numberOfLines={1}>{btn.text ?? 'OK'}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.btn, styles.btnSecondary, pressed && styles.btnSecondaryPressed]}>
              <Text style={[styles.btnTextSecondary, destructive && { color: '#DC2626' }]} numberOfLines={1}>{btn.text ?? 'OK'}</Text>
            </View>
          )
        }
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 26, paddingTop: 26, paddingBottom: 18, paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 30, elevation: 16,
  },
  iconRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center', letterSpacing: -0.2 },
  message: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
  actionsStacked: { flexDirection: 'column' },
  btnRow: { flex: 1 },
  btnStacked: { width: '100%' },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  btnShadow: { shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
  btnSecondary: { backgroundColor: '#F1F4F8', borderWidth: 1, borderColor: '#E2E7EE' },
  btnSecondaryPressed: { backgroundColor: '#E4E9F0', borderColor: '#CBD3DE' },
  btnTextPrimary: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  btnTextSecondary: { color: '#334155', fontSize: 15, fontWeight: '700' },
});
