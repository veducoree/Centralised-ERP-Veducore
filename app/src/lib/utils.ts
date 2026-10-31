export function formatCurrency(amount: number, symbol = '₹'): string {
  return `${symbol}${amount.toLocaleString('en-IN')}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

export function getAge(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function getDayName(dayIndex: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex] ?? '';
}

export const COLORS = {
  primary: '#4F46E5',
  primaryLight: '#6366F1',
  primaryDark: '#3730A3',
  primaryBg: '#EEF2FF',
  accent: '#EC4899',
  bg: '#F8FAFC',
  background: '#F8FAFC',
  canvas: '#F8FAFC',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderLight: '#F1F5F9',
  success: '#10B981',
  successBg: '#ECFDF5',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  info: '#3B82F6',
  infoBg: '#EFF6FF',
  present: '#10B981',
  absent: '#EF4444',
  late: '#F59E0B',
  paid: '#10B981',
  pending: '#F59E0B',
  overdue: '#EF4444',
  active: '#10B981',
  inactive: '#94A3B8',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const SHADOW = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  hover: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
};

export const GLASS_BG = {
  gradientStart: '#FFFFFF',
  gradientMid: '#F8FAFC',
  gradientEnd: '#F1F5F9',
};

export const GLASS = {
  bg: '#FFFFFF',
  bgSubtle: '#F8FAFC',
  bgMedium: '#F1F5F9',
  bgHover: '#E2E8F0',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderBright: '#CBD5E1',
  highlight: '#FFFFFF',
  shadow: 'rgba(15, 23, 42, 0.06)',
  text: '#0F172A',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  accent: '#4F46E5',
  accentLight: '#6366F1',
  accentDark: '#3730A3',
  accentGlow: '#EEF2FF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  present: '#10B981',
  absent: '#EF4444',
  late: '#F59E0B',
  paid: '#10B981',
  pending: '#F59E0B',
  overdue: '#EF4444',
};

export const GLASS_SHADOW = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 3,
};
