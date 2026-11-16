import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { fetchParentByUserId, fetchParentStudents } from '@/services/api';
import { COLORS, SPACING } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { appIconSupported } from '@/lib/appIcon';
import type { Parent, Student } from '@/types';
import { appAlert } from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import {
  FadeUp, ProfileHero, StatStrip, Section, InfoRow, NavRow, ProfileFooter,
} from '@/components/profile/ProfileKit';
import { call, mail } from '@/lib/contact';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

export default function ParentProfile() {
  const { user, profile, school, logout } = useAuth();
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const found = await fetchParentByUserId(user.id);
        setParent(found);
        if (!found) return;
        const links = await fetchParentStudents(found.id);
        setChildren(links.map(l => ({
          student: l.student,
          className: l.student?.class?.name ?? 'Class',
          sectionName: l.student?.section?.name ?? '',
        })));
      } catch (err) {
        console.error('Parent profile load error', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  const performLogout = async () => {
    await logout();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  };

  const handleLogout = () => {
    appAlert('Log out?', 'You will need to sign in again to see your child’s updates.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: performLogout },
    ]);
  };

  // The parent record can be blank when details were only entered at the
  // child's admission, so fall back to the account and the child's record.
  const kid = (pick: (s: Student) => string | null | undefined) =>
    children.map(c => pick(c.student)).find(v => !!v && String(v).trim()) || null;
  const phone = parent?.phone || profile?.phone || kid(s => s.parent_phone) || kid(s => s.emergency_contact);
  const address = parent?.address || kid(s => s.address);

  const memberSince = parent?.created_at ? new Date(parent.created_at).getFullYear() : '—';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <Header title="My Profile" showBack onBackPress={() => router.back()} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <MobileInlineSkeleton rows={6} />
          ) : (
            <>
              <FadeUp>
                <ProfileHero
                  name={parent?.full_name ?? user?.email ?? 'Parent'}
                  photo={parent?.avatar_url}
                  role="Parent"
                  schoolName={school?.name}
                  badges={[{ icon: 'shield-checkmark', label: 'Verified', tone: 'green' }]}
                />
                <StatStrip items={[
                  { value: children.length, label: children.length === 1 ? 'Child' : 'Children' },
                  { value: school?.academic_year || '—', label: 'Session' },
                  { value: memberSince, label: 'Member since' },
                ]} />
              </FadeUp>

              {children.length > 0 && (
                <FadeUp delay={70}>
                  <Section title={children.length === 1 ? 'My child' : 'My children'}>
                    {children.map((child, i) => (
                      <View key={child.student.id} style={styles.childRow}>
                        {i > 0 && <View style={styles.childDivider} />}
                        <Avatar name={child.student.full_name} uri={child.student.avatar_url} size={46} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.childName} numberOfLines={1}>{child.student.full_name}</Text>
                          <Text style={styles.childMeta} numberOfLines={1}>
                            {child.className}{child.sectionName ? ` · Section ${child.sectionName}` : ''}
                          </Text>
                        </View>
                        <View style={styles.admPill}>
                          <Text style={styles.admLabel}>ADM</Text>
                          <Text style={styles.admValue}>{child.student.admission_number || '—'}</Text>
                        </View>
                      </View>
                    ))}
                  </Section>
                </FadeUp>
              )}

              <FadeUp delay={130}>
                <Section title="Contact details" footer="To change these details, please contact the school office.">
                  <InfoRow first icon="call-outline" label="Mobile number" value={phone} tint="#0E8F6E" />
                  <InfoRow icon="location-outline" label="Address" value={address} tint="#C2611A" />
                  {!!parent?.occupation && <InfoRow icon="briefcase-outline" label="Occupation" value={parent.occupation} tint="#B7791F" />}
                </Section>
              </FadeUp>

              <FadeUp delay={190}>
                <Section title="Quick links">
                  <NavRow first icon="notifications-outline" label="Notifications" tint={COLORS.primary} onPress={() => router.push('/parent-modal/notifications' as never)} />
                  <NavRow icon="time-outline" label="Class timetable" tint="#0E7490" onPress={() => router.push('/parent-modal/timetable' as never)} />
                  {appIconSupported() && (
                    <NavRow icon="apps-outline" label="App icon" tint="#7C3AED" onPress={() => router.push('/parent-modal/app-icon' as never)} />
                  )}
                  {!!school?.contact_number && (
                    <NavRow icon="call-outline" label="Call school office" tint="#0E8F6E" trailing={school.contact_number} onPress={() => call(school.contact_number)} />
                  )}
                  {!!school?.email && (
                    <NavRow icon="mail-outline" label="Email school" tint="#475569" onPress={() => mail(school.email)} />
                  )}
                </Section>
              </FadeUp>

              <FadeUp delay={240}>
                <Button label="Log Out" variant="danger" icon="log-out-outline" size="lg" fullWidth onPress={handleLogout} style={{ marginTop: 24 }} />
                <ProfileFooter />
              </FadeUp>
            </>
          )}
          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  childDivider: { position: 'absolute', top: 0, left: 72, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E3E7EE' },
  childName: { fontSize: 15.5, fontWeight: '700', color: '#0B1736' },
  childMeta: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  admPill: { alignItems: 'flex-end' },
  admLabel: { fontSize: 9.5, fontWeight: '800', color: COLORS.textDim, letterSpacing: 0.8 },
  admValue: { fontSize: 12.5, fontWeight: '700', color: '#334155', marginTop: 1 },
});
