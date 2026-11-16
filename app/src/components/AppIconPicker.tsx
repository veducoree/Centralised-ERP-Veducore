import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { appAlert, appConfirm } from '@/components/ui/AppDialog';
import { SCHOOL_ICONS, type SchoolIcon } from '@/lib/schoolIcons.generated';
import { appIconSupported, currentAppIcon, setAppIcon } from '@/lib/appIcon';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEFAULT_ICON = require('../../assets/icon.png');

type Tile = { key: string; name: string | null; label: string; sub?: string | null; thumb: number; yours?: boolean };

const COLS = 3;
const GAP = 12;

export function AppIconPicker() {
  const router = useRouter();
  const { school } = useAuth();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(() => currentAppIcon());
  const [busy, setBusy] = useState<string | null | undefined>(undefined);

  const supported = appIconSupported();
  const tileW = Math.floor((width - 32 - GAP * (COLS - 1)) / COLS);

  const tiles = useMemo<Tile[]>(() => {
    const q = query.trim().toLowerCase();
    const mine = SCHOOL_ICONS.find((s) => s.schoolId === school?.id);
    const toTile = (s: SchoolIcon, yours = false): Tile => ({
      key: s.name, name: s.name, label: s.schoolName, sub: s.city, thumb: s.thumb, yours,
    });
    const matches = (s: SchoolIcon) =>
      !q || s.schoolName.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q);

    const list: Tile[] = [];
    if (!q || 'veducore default'.includes(q)) {
      list.push({ key: '__default', name: null, label: 'Veducore', sub: 'Default', thumb: DEFAULT_ICON });
    }
    if (mine && matches(mine)) list.push(toTile(mine, true));
    for (const s of SCHOOL_ICONS) if (s !== mine && matches(s)) list.push(toTile(s));
    return list;
  }, [query, school?.id]);

  const choose = async (t: Tile) => {
    if (busy !== undefined || t.name === active) return;
    const ok = await appConfirm({
      title: 'Change app icon?',
      message: `Your home screen icon will change to ${t.label}. It can take a few seconds to update.`,
      confirmText: 'Change',
    });
    if (!ok) return;
    setBusy(t.name);
    try {
      await setAppIcon(t.name);
      setActive(t.name);
    } catch (e) {
      appAlert('Could not change icon', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(undefined);
    }
  };

  const activeTile = tiles.find((t) => t.name === active)
    ?? (active ? SCHOOL_ICONS.filter((s) => s.name === active).map((s) => ({ label: s.schoolName, thumb: s.thumb }))[0] : null)
    ?? { label: 'Veducore', thumb: DEFAULT_ICON };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <Header title="App Icon" showBack onBackPress={() => router.back()} />

        {!supported ? (
          <View style={styles.unsupported}>
            <Ionicons name="apps-outline" size={40} color="#94A3B8" />
            <Text style={styles.unsupportedTitle}>Not available yet</Text>
            <Text style={styles.unsupportedSub}>
              Update Veducore from the Play Store to choose your school&apos;s app icon.
            </Text>
          </View>
        ) : (
          <FlatList
            data={tiles}
            keyExtractor={(t) => t.key}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <View style={styles.currentCard}>
                  <Image source={activeTile.thumb} style={styles.currentThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currentLabel}>CURRENT ICON</Text>
                    <Text style={styles.currentName} numberOfLines={2}>{activeTile.label}</Text>
                  </View>
                </View>

                <View style={styles.searchBar}>
                  <Ionicons name="search-outline" size={18} color="#94A3B8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search school name or city"
                    placeholderTextColor="#94A3B8"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={17} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                No school found for &ldquo;{query}&rdquo;. New schools are added with each app update.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.name === active;
              const loading = busy === item.name;
              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => choose(item)}
                  style={[styles.tile, { width: tileW }, selected && styles.tileSelected]}
                >
                  <View>
                    <Image source={item.thumb} style={[styles.thumb, { width: tileW - 36, height: tileW - 36 }]} />
                    {loading && (
                      <View style={styles.thumbOverlay}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    )}
                    {selected && (
                      <View style={styles.check}>
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.tileName} numberOfLines={2}>{item.label}</Text>
                  {item.yours ? (
                    <Text style={styles.yours}>Your school</Text>
                  ) : item.sub ? (
                    <Text style={styles.tileSub} numberOfLines={1}>{item.sub}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={
              <Text style={styles.footnote}>
                Logging out switches back to the Veducore icon.
              </Text>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  list: { padding: 16, gap: GAP },

  currentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  currentThumb: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  currentLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.6 },
  currentName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 2 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginTop: 14,
    marginBottom: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },

  tile: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  tileSelected: { borderColor: '#1E5BD8', backgroundColor: '#EFF6FF' },
  thumb: { borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  thumbOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E5BD8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginTop: 8, textAlign: 'center' },
  tileSub: { fontSize: 10.5, color: '#64748B', marginTop: 1 },
  yours: { fontSize: 10.5, fontWeight: '700', color: '#1E5BD8', marginTop: 1 },

  empty: { textAlign: 'center', color: '#64748B', fontSize: 13, paddingVertical: 32, paddingHorizontal: 12, lineHeight: 19 },
  footnote: { textAlign: 'center', color: '#94A3B8', fontSize: 11.5, marginTop: 8 },

  unsupported: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  unsupportedTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginTop: 12 },
  unsupportedSub: { fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
