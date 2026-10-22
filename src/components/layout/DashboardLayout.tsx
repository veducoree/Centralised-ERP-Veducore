import { type ReactNode, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList,
  IndianRupee, FileText, Bell, Settings, LogOut,
  Menu, X, UserCircle, ChevronDown, Shield, User,
  Megaphone, UserPlus, ClipboardCheck, CreditCard, ChevronRight, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool } from '@/services/api';
import { cn, getInitials } from '@/lib/utils';
import veducoreLogo from '@/assets/veducore-logo.png';
import type { School } from '@/types';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const adminNav: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { label: 'Students', path: '/admin/students', icon: <Users className="h-[18px] w-[18px]" /> },
  { label: 'Teachers', path: '/admin/teachers', icon: <GraduationCap className="h-[18px] w-[18px]" /> },
  { label: 'Parents', path: '/admin/parents', icon: <User className="h-[18px] w-[18px]" /> },
  { label: 'Classes & Sections', path: '/admin/classes', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { label: 'Attendance', path: '/admin/attendance', icon: <ClipboardList className="h-[18px] w-[18px]" /> },
  { label: 'Fees', path: '/admin/fees', icon: <IndianRupee className="h-[18px] w-[18px]" /> },
  { label: 'Student Tracking', path: '/admin/tracking', icon: <Shield className="h-[18px] w-[18px]" /> },
  { label: 'ID Cards', path: '/admin/id-cards', icon: <CreditCard className="h-[18px] w-[18px]" /> },
  { label: 'Documents', path: '/admin/documents', icon: <FileText className="h-[18px] w-[18px]" /> },
  { label: 'Holidays', path: '/admin/holidays', icon: <CalendarDays className="h-[18px] w-[18px]" /> },
  { label: 'Notifications', path: '/admin/notifications', icon: <Bell className="h-[18px] w-[18px]" /> },
  { label: 'Settings', path: '/admin/settings', icon: <Settings className="h-[18px] w-[18px]" /> },
  { label: 'Profile', path: '/admin/profile', icon: <UserCircle className="h-[18px] w-[18px]" /> },
];

const teacherNav: NavItem[] = [
  { label: 'Dashboard', path: '/teacher/dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { label: 'My Classes', path: '/teacher/classes', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { label: 'Subjects', path: '/teacher/subjects', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { label: 'Students', path: '/teacher/students', icon: <Users className="h-[18px] w-[18px]" /> },
  { label: 'Add Student', path: '/teacher/add-student', icon: <UserPlus className="h-[18px] w-[18px]" /> },
  { label: 'Attendance', path: '/teacher/attendance', icon: <ClipboardList className="h-[18px] w-[18px]" /> },
  { label: 'Exam Marks', path: '/teacher/exam-marks', icon: <ClipboardCheck className="h-[18px] w-[18px]" /> },
  { label: 'Student Records', path: '/teacher/records', icon: <FileText className="h-[18px] w-[18px]" /> },
  { label: 'Remarks', path: '/teacher/remarks', icon: <Megaphone className="h-[18px] w-[18px]" /> },
  { label: 'Profile', path: '/teacher/profile', icon: <UserCircle className="h-[18px] w-[18px]" /> },
];

const parentNav: NavItem[] = [
  { label: 'Dashboard', path: '/parent/dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { label: 'My Child', path: '/parent/child', icon: <Users className="h-[18px] w-[18px]" /> },
  { label: 'Attendance', path: '/parent/attendance', icon: <ClipboardList className="h-[18px] w-[18px]" /> },
  { label: 'Fees', path: '/parent/fees', icon: <IndianRupee className="h-[18px] w-[18px]" /> },
  { label: 'Academic Records', path: '/parent/records', icon: <FileText className="h-[18px] w-[18px]" /> },
  { label: 'Remarks', path: '/parent/remarks', icon: <Megaphone className="h-[18px] w-[18px]" /> },
  { label: 'Profile', path: '/parent/profile', icon: <UserCircle className="h-[18px] w-[18px]" /> },
];

// ── Sidebar inner content — defined OUTSIDE DashboardLayout so it never
//    re-creates on parent re-renders, preventing the fade animation from
//    re-triggering on every navigation click. ──────────────────────────────────
interface SidebarContentProps {
  navItems: NavItem[];
  location: ReturnType<typeof useLocation>;
  school: School | null;
  roleLabel: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

function SidebarContent({ navItems, location, school, roleLabel, onNavigate, onSignOut }: SidebarContentProps) {
  return (
    <>
      {/* ── Header: logos ── */}
      <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 px-4">
        <img src={veducoreLogo} alt="Veducore" className="h-6 w-auto flex-shrink-0 object-contain" />
        {school?.logo_url && (
          <>
            <div className="h-8 w-px bg-gray-200 flex-shrink-0" />
            <img src={school.logo_url} alt={school.name} className="h-9 w-auto flex-shrink-0 object-contain" />
          </>
        )}
        <span className="ml-auto flex-shrink-0 text-xs font-medium text-gray-400">{roleLabel}</span>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <li key={item.path}>
                <button
                  onClick={() => onNavigate(item.path)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                    active
                      ? 'bg-blue-50 text-blue-700 border-l-[3px] border-blue-600 pl-[calc(0.75rem-3px)]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <span className={cn(
                    'flex-shrink-0 transition-all duration-200',
                    active ? 'text-blue-600' : 'group-hover:scale-110 group-hover:text-blue-600'
                  )}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {!active && (
                    <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 ml-auto h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Bottom: school name + sign out ── */}
      <div className="border-t border-gray-200 p-3 space-y-2">
        {school?.name && (
          <div className="mx-1 overflow-hidden rounded-xl border border-white/60 bg-gradient-to-br from-blue-50/80 via-white/60 to-indigo-50/80 backdrop-blur-md shadow-sm">
            <div className="px-3 py-2.5 text-center">
              <p className="truncate text-xs font-semibold text-gray-700 leading-tight">{school.name}</p>
              {school.academic_year && (
                <p className="mt-0.5 text-[10px] text-gray-400 font-medium">{school.academic_year}</p>
              )}
            </div>
          </div>
        )}
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export function DashboardLayout({ children, title }: { children: ReactNode; title: string }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [school, setSchool] = useState<School | null>(null);

  const navItems = profile?.role === 'admin' ? adminNav : profile?.role === 'teacher' ? teacherNav : parentNav;
  const roleLabel = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '';

  useEffect(() => {
    if (!profile?.school_id) return;
    fetchSchool(profile.school_id).then((s) => { if (s) setSchool(s); }).catch(() => {});
  }, [profile?.school_id]);

  useEffect(() => {
    if (!profile?.school_id) return;
    fetchSchool(profile.school_id).then((s) => { if (s) setSchool(s); }).catch(() => {});
  }, [location.pathname, profile?.school_id]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const sidebarProps: SidebarContentProps = {
    navItems,
    location,
    school,
    roleLabel,
    onNavigate: (path) => { navigate(path); setSidebarOpen(false); },
    onSignOut: handleSignOut,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar — Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Sidebar — Mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-gray-900/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white lg:hidden">
            <SidebarContent {...sidebarProps} />
          </aside>
          <button
            onClick={() => setSidebarOpen(false)}
            className="fixed right-4 top-4 z-50 rounded-lg bg-white/80 p-2 text-gray-600 shadow lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <h1 className="flex-1 truncate text-lg font-semibold text-gray-900">{title}</h1>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-gray-100 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {getInitials(profile?.full_name || '?')}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-900 leading-tight">{profile?.full_name}</p>
                <p className="text-xs text-gray-400">{roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => { navigate(`/${profile?.role}/profile`); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <UserCircle className="h-4 w-4" />
                    My Profile
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
