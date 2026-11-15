/**
 * Building blocks shared by the parent and teacher "My Profile" screens so
 * both look the same: navy hero with avatar, stat strip, grouped sections.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS, HERO_GRADIENT, getInitials } from '@/lib/utils';

const INK = '#0B1736';

export function FadeUp({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 360, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

export function ProfileHero({ name, photo, role, schoolName, badges = [] }: {
  name: string;
  photo?: string | null;
  role: string;
  schoolName?: string | null;
  badges?: { icon: keyof typeof Ionicons.glyphMap; label: string; tone?: 'green' | 'light' }[];
}) {
  return (
    <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      {/* soft decorative circles */}
      <View style={[styles.orb, { width: 180, height: 180, top: -70, right: -50 }]} />
      <View style={[styles.orb, { width: 110, height: 110, bottom: -50, left: -30, opacity: 0.06 }]} />

      <View style={styles.avatarRing}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(name || '?')}</Text>
          </View>
        )}
        <View style={styles.verified}>
          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
        </View>
      </View>

      <Text style={styles.heroName} numberOfLines={2}>{name || '—'}</Text>
      <View style={styles.heroChips}>
        <View style={styles.roleChip}><Text style={styles.roleChipText}>{role}</Text></View>
        {badges.map((b) => (
          <View key={b.label} style={[styles.badge, b.tone === 'green' && styles.badgeGreen]}>
            <Ionicons name={b.icon} size={12} color={b.tone === 'green' ? '#6EE7B7' : '#FFFFFF'} />
            <Text style={[styles.badgeText, b.tone === 'green' && { color: '#A7F3D0' }]}>{b.label}</Text>
          </View>
        ))}
      </View>
      {!!schoolName && (
        <View style={styles.schoolRow}>
          <Ionicons name="school-outline" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.schoolText} numberOfLines={1}>{schoolName}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

export function StatStrip({ items }: { items: { value: string | number; label: string }[] }) {
  return (
    <View style={styles.stats}>
      {items.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <View style={styles.statDivider} />}
          <View style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export function Section({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
      {!!footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

export function InfoRow({ icon, label, value, first, action, onPress, tint = COLORS.primary }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  first?: boolean;
  action?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {!first && <View style={styles.divider} />}
      <View style={[styles.rowIcon, { backgroundColor: tint + '14' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, !value && styles.rowValueEmpty]} numberOfLines={2}>{value || 'Not provided'}</Text>
      </View>
      {action && onPress ? (
        <View style={styles.rowAction}><Ionicons name={action} size={15} color={COLORS.primary} /></View>
      ) : null}
    </Pressable>
  );
}

export function NavRow({ icon, label, first, onPress, tint = '#475569', trailing }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; first?: boolean; onPress: () => void; tint?: string; trailing?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, styles.navRow, pressed && styles.rowPressed]}>
      {!first && <View style={styles.divider} />}
      <View style={[styles.rowIcon, { backgroundColor: tint + '14' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.navLabel}>{label}</Text>
      {!!trailing && <Text style={styles.navTrailing}>{trailing}</Text>}
      <Ionicons name="chevron-forward" size={16} color={COLORS.textDim} />
    </Pressable>
  );
}

export function ProfileFooter() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <View style={styles.footer}>
      <Text style={styles.footerBrand}>Veducore</Text>
      <Text style={styles.footerText}>Version {version}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  hero: {
    borderRadius: 24, paddingTop: 26, paddingBottom: 22, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden',
    shadowColor: INK, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 6,
  },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF', opacity: 0.07 },
  avatarRing: { width: 92, height: 92, borderRadius: 46, padding: 3, backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 12 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 43, backgroundColor: '#DCE8FD' },
  avatarFallback: { flex: 1, borderRadius: 43, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: INK, letterSpacing: 0.5 },
  verified: {
    position: 'absolute', right: 2, bottom: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#13306E',
  },
  heroName: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.3 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  roleChip: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  roleChipText: { fontSize: 12, fontWeight: '800', color: INK },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.22)' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, maxWidth: '90%' },
  schoolText: { fontSize: 12.5, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  stats: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: -18, marginHorizontal: 14,
    paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9DEE7',
    shadowColor: INK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: INK },
  statLabel: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontWeight: '500', textAlign: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#D9DEE7', marginVertical: 4 },

  section: { marginTop: 22 },
  sectionTitle: { fontSize: 11.5, fontWeight: '700', color: COLORS.textDim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  sectionFooter: { fontSize: 12, color: COLORS.textDim, marginTop: 8, marginHorizontal: 4, lineHeight: 17 },
  group: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9DEE7',
    shadowColor: INK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  navRow: { paddingVertical: 13 },
  rowPressed: { backgroundColor: '#F6F8FB' },
  divider: { position: 'absolute', top: 0, left: 62, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E3E7EE' },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 11.5, color: COLORS.textDim, fontWeight: '600' },
  rowValue: { fontSize: 15, color: INK, fontWeight: '600', marginTop: 1 },
  rowValueEmpty: { color: COLORS.textDim, fontWeight: '500' },
  rowAction: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF4FE', alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  navTrailing: { fontSize: 13, color: COLORS.textDim, marginRight: 2 },

  footer: { alignItems: 'center', marginTop: 22 },
  footerBrand: { fontSize: 13, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  footerText: { fontSize: 11.5, color: '#A8B3C4', marginTop: 2 },
});
