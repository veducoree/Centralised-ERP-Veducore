import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { fetchParentByUserId, fetchParentStudents } from '@/services/api';
import { COLORS, SPACING, RADIUS, SHADOW, getInitials } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { Avatar } from '@/components/ui/Avatar';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/context/AuthContext';
import type { Parent, ParentStudent, Student, Class, Section } from '@/types';

interface ChildInfo {
  student: Student;
  className: string;
  sectionName: string;
}

export default function ParentProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);

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
      }
    }
    load();
  }, [user?.id]);

  const performLogout = async () => {
    await logout();
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/login');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ],
    );
  };

  const initials = parent ? getInitials(parent.full_name) : '?';

  const infoRows: { icon: string; label: string; value: string | null }[] = parent
    ? [
        { icon: 'mail-outline',      label: 'Email',   value: parent.email },
        { icon: 'call-outline',      label: 'Phone',   value: parent.phone ?? 'Not provided' },
        { icon: 'location-outline',  label: 'Address', value: parent.address },
      ]
    : [];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <Header title="My Profile" showBack onBackPress={() => router.back()} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Avatar & Hero */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <Text style={styles.name}>{parent?.full_name ?? '—'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>Verified Parent</Text>
            </View>
          </View>

          {/* Info Card */}
          <GlassCard padding={0} style={styles.cardContainer}>
            {infoRows.map((row, index) => (
              <View
                key={row.label}
                style={[styles.infoRow, index < infoRows.length - 1 && styles.divider]}>
                <View style={styles.infoIconCircle}>
                  <Ionicons name={row.icon as any} size={18} color={COLORS.primary} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value ?? '—'}</Text>
                </View>
              </View>
            ))}
          </GlassCard>

          {/* Children List */}
          {children.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Enrolled Children</Text>
              <GlassCard padding={0} style={styles.cardContainer}>
                {children.map((child, index) => (
                  <View
                    key={child.student.id}
                    style={[styles.childRow, index < children.length - 1 && styles.divider]}>
                    <Avatar
                      name={child.student.full_name}
                      uri={child.student.avatar_url}
                      size={44}
                      color={child.student.gender === 'female' ? '#EC4899' : COLORS.primary}
                    />
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text style={styles.childName}>{child.student.full_name}</Text>
                      <Text style={styles.childClass}>{child.className} – Section {child.sectionName}</Text>
                      <Text style={styles.childAdm}>Adm No: {child.student.admission_number}</Text>
                    </View>
                  </View>
                ))}
              </GlassCard>
            </>
          )}

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => Alert.alert('Coming Soon', 'Profile editing will be available soon.')}
            activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
            <Text style={styles.editBtnText}>Edit Contact Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            <Text style={styles.logoutBtnText}>Log Out Account</Text>
          </TouchableOpacity>

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.lg },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EEF0FD',
    borderWidth: 2,
    borderColor: '#C7CDFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: COLORS.primary },
  name: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xs },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#EEF0FD',
    borderWidth: 1,
    borderColor: '#C7CDFB',
  },
  roleText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cardContainer: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  infoIconCircle: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  childRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  childName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  childClass: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  childAdm: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  editBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  logoutBtnText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
});
