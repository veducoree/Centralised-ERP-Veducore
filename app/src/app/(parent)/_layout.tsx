import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { CustomTabBar, TabItem } from '@/components/layout/CustomTabBar';
import { TabNavigationProvider, useTabNavigation } from '@/context/TabNavigationContext';
import { useAuth } from '@/context/AuthContext';

import ParentDashboard from './dashboard';
import ParentAttendance from './attendance';
import ParentFees from './fees';
import ParentTransport from './transport';
import ParentRecords from './records';
import ParentRemarks from './remarks';

const TABS: TabItem[] = [
  { name: 'attendance', label: 'Attendance', icon: 'checkbox-outline',      iconFocused: 'checkbox' },
  { name: 'fees',       label: 'Fees',       icon: 'cash-outline',          iconFocused: 'cash' },
  { name: 'dashboard',  label: 'Home',       icon: 'home-outline',          iconFocused: 'home' },
  { name: 'records',    label: 'Records',    icon: 'document-text-outline', iconFocused: 'document-text' },
  { name: 'transport',  label: 'Transport',  icon: 'bus-outline',           iconFocused: 'bus' },
];

function ParentLayoutContent() {
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
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        {visitedTabs['dashboard'] && (
          <View style={activeTab === 'dashboard' ? styles.activePane : styles.hiddenPane}>
            <ParentDashboard />
          </View>
        )}
        {visitedTabs['attendance'] && (
          <View style={activeTab === 'attendance' ? styles.activePane : styles.hiddenPane}>
            <ParentAttendance />
          </View>
        )}
        {visitedTabs['fees'] && (
          <View style={activeTab === 'fees' ? styles.activePane : styles.hiddenPane}>
            <ParentFees />
          </View>
        )}
        {visitedTabs['transport'] && (
          <View style={activeTab === 'transport' ? styles.activePane : styles.hiddenPane}>
            <ParentTransport />
          </View>
        )}
        {visitedTabs['records'] && (
          <View style={activeTab === 'records' ? styles.activePane : styles.hiddenPane}>
            <ParentRecords />
          </View>
        )}
        {visitedTabs['remarks'] && (
          <View style={activeTab === 'remarks' ? styles.activePane : styles.hiddenPane}>
            <ParentRemarks />
          </View>
        )}
      </View>
      <CustomTabBar tabs={TABS} activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

export default function ParentLayout() {
  return (
    <TabNavigationProvider initialTab="dashboard">
      <ParentLayoutContent />
    </TabNavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  screen: { flex: 1 },
  activePane: { flex: 1, display: 'flex' },
  hiddenPane: { flex: 1, display: 'none' },
});
