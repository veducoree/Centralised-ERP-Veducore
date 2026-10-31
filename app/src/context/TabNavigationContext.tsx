import React, { createContext, useContext, useState, useCallback } from 'react';

interface TabNavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabNavigationContext = createContext<TabNavigationContextType>({
  activeTab: 'dashboard',
  setActiveTab: () => {},
});

export function TabNavigationProvider({
  children,
  initialTab = 'dashboard',
}: {
  children: React.ReactNode;
  initialTab?: string;
}) {
  const [activeTab, setActiveTabState] = useState(initialTab);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
  }, []);

  return (
    <TabNavigationContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabNavigationContext.Provider>
  );
}

export function useTabNavigation() {
  return useContext(TabNavigationContext);
}
