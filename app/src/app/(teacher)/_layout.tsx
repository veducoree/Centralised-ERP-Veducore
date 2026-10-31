import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { CustomTabBar, TabItem } from '@/components/layout/CustomTabBar';
import { TabNavigationProvider, useTabNavigation } from '@/context/TabNavigationContext';
import { useAuth } from '@/context/AuthContext';

import TeacherDashboard from './dashboard';
import TeacherClasses from './my-classes';
import TeacherAttendance from './attendance';
import TeacherMarks from './marks';
import TeacherStudents from './students';

const TABS: TabItem[] = [
  { name: 'my-classes', label: 'Classes',    icon: 'book-outline',        iconFocused: 'book' },
  { name: 'attendance', label: 'Attendance', icon: 'checkbox-outline',    iconFocused: 'checkbox' },
  { name: 'dashboard',  label: 'Home',       icon: 'grid-outline',        iconFocused: 'grid' },
  { name: 'marks',      label: 'Marks',      icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
  { name: 'students',   label: 'Students',   icon: 'people-outline',      iconFocused: 'people' },
];

function TeacherLayoutContent() {
  const { activeTab, setActiveTab } = useTabNavigation();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({ dashboard: true });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    setVisitedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [activeTab]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        {visitedTabs['dashboard'] && (
          <View style={activeTab === 'dashboard' ? styles.activePane : styles.hiddenPane}>
            <TeacherDashboard />
          </View>
        )}
        {visitedTabs['my-classes'] && (
          <View style={activeTab === 'my-classes' ? styles.activePane : styles.hiddenPane}>
            <TeacherClasses />
          </View>
        )}
        {visitedTabs['attendance'] && (
          <View style={activeTab === 'attendance' ? styles.activePane : styles.hiddenPane}>
            <TeacherAttendance />
          </View>
        )}
        {visitedTabs['marks'] && (
          <View style={activeTab === 'marks' ? styles.activePane : styles.hiddenPane}>
            <TeacherMarks />
          </View>
        )}
        {visitedTabs['students'] && (
          <View style={activeTab === 'students' ? styles.activePane : styles.hiddenPane}>
            <TeacherStudents />
          </View>
        )}
      </View>
      <CustomTabBar tabs={TABS} activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

export default function TeacherLayout() {
  return (
    <TabNavigationProvider initialTab="dashboard">
      <TeacherLayoutContent />
    </TabNavigationProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  screen: { flex: 1 },
  activePane: { flex: 1, display: 'flex' },
  hiddenPane: { flex: 1, display: 'none' },
});
