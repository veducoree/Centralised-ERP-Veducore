import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { fetchTeacherByUserId, fetchTeacherAssignments } from '@/services/api';
import { COLORS, SPACING, formatDate } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import { appIconSupported } from '@/lib/appIcon';
import type { Teacher } from '@/types';
import { appAlert } from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { MobileInlineSkeleton } from '@/components/ui/Skeleton';
import {
  FadeUp, ProfileHero, StatStrip, Section, InfoRow, NavRow, ProfileFooter,
} from '@/components/profile/ProfileKit';

interface AssignmentInfo {
  key: string;
  className: string;
  sectionName: string;
  subjectName: string | null;
  isClassTeacher: boolean;
}

type AssignmentRow = {
  class?: { name?: string } | null;
  section?: { name?: string } | null;
  subject?: { name?: string } | null;
  class_id?: string;
  section_id?: string;
  is_class_teacher?: boolean;
};

function yearsSince(date?: string | null) {
  if (!date) return '—';
  const ms = Date.now() - new Date(date).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  const y = ms / (365.25 * 86400000);
  return y < 1 ? '<1' : String(Math.floor(y));
}

export default function TeacherProfileModal() {
  const { user, profile, school, logout } = useAuth();
  const router = useRouter();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const found = await fetchTeacherByUserId(user.id);
        setTeacher(found);
        if (found) {
          const rows = (await fetchTeacherAssignments(found.id)) as unknown as AssignmentRow[];
          setAssignments(rows.map((a, i) => ({
            key: `${a.class_id ?? ''}-${a.section_id ?? ''}-${i}`,
            className: a.class?.name ?? 'Class',
            sectionName: a.section?.name ?? '',
            subjectName: a.subject?.name ?? null,
            isClassTeacher: !!a.is_class_teacher,
          })));
        }
      } catch (err) {
        console.error('Error loading teacher profile:', err);
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
    appAlert('Log out?', 'You will need to sign in again to mark attendance and marks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: performLogout },
    ]);
  };

  const phone = teacher?.phone || profile?.phone || null;
  const classCount = new Set(assignments.map(a => `${a.className}-${a.sectionName}`)).size;
  const inchargeOf = assignments.filter(a => a.isClassTeacher);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <Header title="My Profile" showBack />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <MobileInlineSkeleton rows={6} />
          ) : (
            <>
              <FadeUp>
                <ProfileHero
                  name={teacher?.full_name ?? 'Teacher'}
                  photo={teacher?.avatar_url}
                  role="Teacher"
                  schoolName={school?.name}
                  badges={[
                    ...(teacher?.subject ? [{ icon: 'book-outline' as const, label: teacher.subject }] : []),
                    ...(inchargeOf.length ? [{ icon: 'shield-checkmark' as const, label: 'Class Incharge', tone: 'green' as const }] : []),
                  ]}
                />
                <StatStrip items={[
                  { value: classCount, label: classCount === 1 ? 'Class' : 'Classes' },
                  { value: inchargeOf.length, label: 'Incharge of' },
                  { value: yearsSince(teacher?.date_of_joining), label: 'Years here' },
                ]} />
              </FadeUp>

              {assignments.length > 0 && (
                <FadeUp delay={70}>
                  <Section title="Teaching">
                    {assignments.map((a, i) => (
                      <View key={a.key} style={styles.classRow}>
                        {i > 0 && <View style={styles.classDivider} />}
                        <View style={[styles.classIcon, a.isClassTeacher && styles.classIconIncharge]}>
                          <Ionicons name={a.isClassTeacher ? 'shield-checkmark-outline' : 'people-outline'} size={17} color={a.isClassTeacher ? '#0E8F6E' : COLORS.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.className} numberOfLines={1}>
                            {a.className}{a.sectionName ? ` - ${a.sectionName}` : ''}
                          </Text>
                          <Text style={styles.classMeta} numberOfLines={1}>
                            {a.isClassTeacher ? 'Class teacher' : a.subjectName ?? 'Subject teacher'}
                          </Text>
                        </View>
                        {a.isClassTeacher && (
                          <View style={styles.inchargeTag}><Text style={styles.inchargeText}>Incharge</Text></View>
                        )}
                      </View>
                    ))}
                  </Section>
                </FadeUp>
              )}

              <FadeUp delay={120}>
                <Section title="Professional">
                  <InfoRow first icon="id-card-outline" label="Employee ID" value={teacher?.employee_id} />
                  <InfoRow icon="ribbon-outline" label="Qualification" value={teacher?.qualification} tint="#B7791F" />
                  <InfoRow icon="book-outline" label="Primary subject" value={teacher?.subject} tint="#0B7CB8" />
                  <InfoRow icon="calendar-outline" label="Joined on" value={teacher?.date_of_joining ? formatDate(teacher.date_of_joining) : null} tint="#0F8A7E" />
                </Section>
              </FadeUp>

              <FadeUp delay={170}>
                <Section title="Contact details" footer="Profile details are managed by the school administrator.">
                  <InfoRow first icon="call-outline" label="Mobile number" value={phone} tint="#0E8F6E" />
                  <InfoRow icon="location-outline" label="Address" value={teacher?.address} tint="#C2611A" />
                </Section>
              </FadeUp>

              <FadeUp delay={220}>
                <Section title="Quick links">
                  <NavRow first icon="finger-print-outline" label="My attendance & leave" tint="#0E8F6E" onPress={() => router.push('/teacher-modal/my-attendance' as never)} />
                  <NavRow icon="time-outline" label="My schedule" tint="#0E7490" onPress={() => router.push('/teacher-modal/schedule' as never)} />
                  <NavRow icon="notifications-outline" label="Notifications" tint={COLORS.primary} onPress={() => router.push('/teacher-modal/notifications' as never)} />
                  {appIconSupported() && (
                    <NavRow icon="apps-outline" label="App icon" tint="#7C3AED" onPress={() => router.push('/teacher-modal/app-icon' as never)} />
                  )}
                </Section>
              </FadeUp>

              <FadeUp delay={260}>
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
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  classDivider: { position: 'absolute', top: 0, left: 62, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E3E7EE' },
  classIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#EEF4FE', alignItems: 'center', justifyContent: 'center' },
  classIconIncharge: { backgroundColor: '#E7F5EF' },
  className: { fontSize: 15, fontWeight: '700', color: '#0B1736' },
  classMeta: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 1 },
  inchargeTag: { backgroundColor: '#E7F5EF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  inchargeText: { fontSize: 10.5, fontWeight: '800', color: '#0E8F6E' },
});
