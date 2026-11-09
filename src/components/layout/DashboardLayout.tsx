import { type ReactNode, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList,
  IndianRupee, FileText, Bell, Settings, LogOut,
  Menu, X, UserCircle, ChevronDown, Shield, User,
  Megaphone, UserPlus, ClipboardCheck, CreditCard, CalendarDays, Bus,
  LayoutGrid, Pin, PinOff, GripVertical, RotateCcw, Pencil, Check,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool, getCachedSchoolSync } from '@/services/api';
import { cn, getInitials } from '@/lib/utils';
import veducoreLogo from '@/assets/veducore-logo.png';
import type { School } from '@/types';
import {
  SidebarPrefProvider as _SidebarPrefProvider, useSidebarPref, FIXED_PATHS,
} from '@/context/SidebarPrefContext';
import { ConfirmDialog } from '@/components/ui/Modal';

// ── Nav config (single source of truth) ──────────────────────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

export const adminNav: NavItem[] = [
  { label: 'Dashboard',          path: '/admin/dashboard',     icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Students',           path: '/admin/students',      icon: <Users className="h-5 w-5" /> },
  { label: 'Teachers',           path: '/admin/teachers',      icon: <GraduationCap className="h-5 w-5" /> },
  { label: 'Parents',            path: '/admin/parents',       icon: <User className="h-5 w-5" /> },
  { label: 'Classes & Sections', path: '/admin/classes',       icon: <BookOpen className="h-5 w-5" /> },
  { label: 'Attendance',         path: '/admin/attendance',    icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Fees',               path: '/admin/fees',          icon: <IndianRupee className="h-5 w-5" /> },
  { label: 'Transport',          path: '/admin/transport',     icon: <Bus className="h-5 w-5" /> },
  { label: 'Student Tracking',   path: '/admin/tracking',      icon: <Shield className="h-5 w-5" /> },
  { label: 'ID Cards',           path: '/admin/id-cards',      icon: <CreditCard className="h-5 w-5" /> },
  { label: 'Documents',          path: '/admin/documents',     icon: <FileText className="h-5 w-5" /> },
  { label: 'Holidays',           path: '/admin/holidays',      icon: <CalendarDays className="h-5 w-5" /> },
  { label: 'Notifications',      path: '/admin/notifications', icon: <Bell className="h-5 w-5" /> },
  { label: 'Settings',           path: '/admin/settings',      icon: <Settings className="h-5 w-5" /> },
  { label: 'All Modules',        path: '/admin/all-modules',   icon: <LayoutGrid className="h-5 w-5" /> },
  { label: 'Profile',            path: '/admin/profile',       icon: <UserCircle className="h-5 w-5" /> },
];

export const teacherNav: NavItem[] = [
  { label: 'Dashboard',        path: '/teacher/dashboard',   icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'My Classes',       path: '/teacher/classes',     icon: <BookOpen className="h-5 w-5" /> },
  { label: 'Subjects',         path: '/teacher/subjects',    icon: <BookOpen className="h-5 w-5" /> },
  { label: 'Students',         path: '/teacher/students',    icon: <Users className="h-5 w-5" /> },
  { label: 'Add Student',      path: '/teacher/add-student', icon: <UserPlus className="h-5 w-5" /> },
  { label: 'Attendance',       path: '/teacher/attendance',  icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Exam Marks',       path: '/teacher/exam-marks',  icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: 'Student Records',  path: '/teacher/records',     icon: <FileText className="h-5 w-5" /> },
  { label: 'Remarks',          path: '/teacher/remarks',     icon: <Megaphone className="h-5 w-5" /> },
  { label: 'Profile',          path: '/teacher/profile',     icon: <UserCircle className="h-5 w-5" /> },
];

export const parentNav: NavItem[] = [
  { label: 'Dashboard',        path: '/parent/dashboard',    icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'My Child',         path: '/parent/child',        icon: <Users className="h-5 w-5" /> },
  { label: 'Attendance',       path: '/parent/attendance',   icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Fees',             path: '/parent/fees',         icon: <IndianRupee className="h-5 w-5" /> },
  { label: 'Transport',        path: '/parent/transport',    icon: <Bus className="h-5 w-5" /> },
  { label: 'Academic Records', path: '/parent/records',      icon: <FileText className="h-5 w-5" /> },
  { label: 'Remarks',          path: '/parent/remarks',      icon: <Megaphone className="h-5 w-5" /> },
  { label: 'Profile',          path: '/parent/profile',      icon: <UserCircle className="h-5 w-5" /> },
];

// ── Sortable sidebar item (used in edit mode) ─────────────────────────────────

function SortableSidebarItem({
  item, active, editMode, isFixed,
  onNavigate, onUnpin,
}: {
  item: NavItem;
  active: boolean;
  editMode: boolean;
  isFixed: boolean;
  onNavigate: (path: string) => void;
  onUnpin: (path: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.path, disabled: !editMode || isFixed });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          'group flex w-full items-center gap-3.5 rounded-[14px] px-4 py-3 text-sm font-medium transition-all duration-200',
          active && !editMode
            ? 'bg-gradient-to-br from-[#5B6EE8] to-[#6F82F5] text-white shadow-[0_6px_16px_rgba(91,110,232,0.35)]'
            : editMode
            ? 'bg-[#F8F9FF] text-slate-600'
            : 'text-slate-600 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]',
        )}
      >
        {/* Drag handle — only in edit mode, only non-fixed */}
        {editMode && !isFixed && (
          <button
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            aria-label="Drag to reorder"
            tabIndex={0}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {editMode && isFixed && (
          <span className="h-4 w-4 flex-shrink-0" /> /* spacer to keep alignment */
        )}

        {/* Icon */}
        {!editMode && (
          <span className={cn(
            'flex-shrink-0 transition-colors duration-200',
            active ? 'text-white' : 'text-slate-400 group-hover:text-[#5B6EE8]',
          )}>
            {item.icon}
          </span>
        )}
        {editMode && (
          <span className="flex-shrink-0 text-slate-400">{item.icon}</span>
        )}

        {/* Label — click navigates only in normal mode */}
        {!editMode ? (
          <button
            onClick={() => onNavigate(item.path)}
            className="flex-1 truncate text-left"
          >
            {item.label}
          </button>
        ) : (
          <span className="flex-1 truncate">{item.label}</span>
        )}

        {/* Unpin button — only in edit mode, only non-fixed */}
        {editMode && !isFixed && (
          <button
            onClick={() => onUnpin(item.path)}
            className="ml-auto flex-shrink-0 rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
            aria-label={`Unpin ${item.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

// ── SidebarContent ────────────────────────────────────────────────────────────

interface SidebarContentProps {
  location: ReturnType<typeof useLocation>;
  school: School | null;
  roleLabel: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  activeNavPath?: string;
}

function SidebarContent({
  location, school, roleLabel, onNavigate, onSignOut, activeNavPath,
}: SidebarContentProps) {
  const { pinnedItems, isFixed, togglePin, reorder, reset, isCustomised } = useSidebarPref();
  const [editMode, setEditMode] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pinnedItems.findIndex((i) => i.path === active.id);
    const newIndex = pinnedItems.findIndex((i) => i.path === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(pinnedItems, oldIndex, newIndex);
    reorder(newOrder.map((i) => i.path));
  }

  return (
    <>
      {/* Header: School Name & Academic Year */}
      <div className="flex min-h-[5rem] items-center gap-3 border-b border-[#E8EAF3] px-5 py-4">
        {school?.logo_url && (
          <img src={school.logo_url} alt={school.name} className="h-11 w-11 flex-shrink-0 rounded-xl object-contain" />
        )}
        <div className="min-w-0 flex-1">
          {school?.name ? (
            <p className="line-clamp-2 break-words text-sm font-semibold leading-snug tracking-tight text-[#5B6EE8]" title={school.name}>
              {school.name}
            </p>
          ) : (
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          )}
          <div className="mt-1.5 flex items-center gap-2">
            {school?.academic_year && (
              <span className="inline-flex items-center rounded-full bg-[#EEF0FD] px-2 py-0.5 text-[10px] font-semibold text-[#5B6EE8]">
                AY {school.academic_year}
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-400">{roleLabel}</span>
          </div>
        </div>

        {/* Edit toggle */}
        <button
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? 'Done editing' : 'Customise sidebar'}
          className={cn(
            'flex-shrink-0 rounded-lg p-1.5 transition-colors',
            editMode
              ? 'bg-[#5B6EE8] text-white'
              : 'text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]',
          )}
        >
          {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Edit mode toolbar */}
      {editMode && (
        <div className="flex items-center justify-between border-b border-[#E8EAF3] bg-[#F8F9FF] px-5 py-2.5">
          <span className="text-xs font-medium text-slate-500">Drag to reorder · × to unpin</span>
          {isCustomised && (
            <button
              onClick={() => setResetConfirmOpen(true)}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pinnedItems.map((i) => i.path)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {pinnedItems.map((item) => {
                const active = activeNavPath
                  ? activeNavPath === item.path || activeNavPath.startsWith(item.path + '/')
                  : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <SortableSidebarItem
                    key={item.path}
                    item={item}
                    active={active}
                    editMode={editMode}
                    isFixed={isFixed(item.path)}
                    onNavigate={(path) => { onNavigate(path); }}
                    onUnpin={togglePin}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      {/* Bottom: Veducore + sign out */}
      <div className="space-y-2 border-t border-[#E8EAF3] p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3.5 rounded-[14px] px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
        <div className="flex flex-col items-start px-4 pb-1 pt-2">
          <img src={veducoreLogo} alt="Veducore" className="h-7 w-auto max-w-full object-contain" />
          <span className="mt-1 text-[11px] text-slate-400">Powered by Veducore</span>
        </div>
      </div>

      {/* Reset confirmation */}
      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => { reset(); setEditMode(false); }}
        title="Reset Sidebar"
        message="This will restore the default sidebar for your role. Your custom order and pinned modules will be lost."
        confirmText="Reset"
        variant="danger"
      />
    </>
  );
}

// ── DashboardLayout ───────────────────────────────────────────────────────────

export function DashboardLayout({
  children,
  title,
  activeNavPath,
}: {
  children: ReactNode;
  title: string;
  activeNavPath?: string;
}) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [school, setSchool] = useState<School | null>(() => getCachedSchoolSync(profile?.school_id));

  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : '';

  useEffect(() => {
    if (!profile?.school_id) return;
    const cached = getCachedSchoolSync(profile.school_id);
    if (cached) setSchool(cached);
    let isCancelled = false;
    fetchSchool(profile.school_id)
      .then((s) => { if (!isCancelled && s) setSchool(s); })
      .catch(() => {});
    return () => { isCancelled = true; };
  }, [profile?.school_id]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setSidebarOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  const sidebarProps: SidebarContentProps = {
    location,
    school,
    roleLabel,
    onNavigate: (path) => { navigate(path); setSidebarOpen(false); },
    onSignOut: handleSignOut,
    activeNavPath,
  };

  return (
      <div className="min-h-screen bg-[#F4F5FB] font-sans text-[#0F172A]">
        {/* Sidebar — Desktop */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-[#E8EAF3] bg-white lg:flex">
          <SidebarContent {...sidebarProps} />
        </aside>

        {/* Sidebar — Mobile drawer */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[#E8EAF3] bg-white shadow-2xl lg:hidden">
              <SidebarContent {...sidebarProps} />
            </aside>
            <button
              onClick={() => setSidebarOpen(false)}
              className="fixed right-4 top-4 z-50 rounded-xl bg-white p-2 text-slate-600 shadow-lg lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Main content */}
        <div className="lg:pl-72">
          {/* Top header */}
          <header className="sticky top-0 z-20 flex h-20 items-center gap-4 bg-[#F4F5FB]/80 px-4 backdrop-blur-md sm:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl bg-white p-2.5 text-slate-500 shadow-[0_4px_20px_rgba(91,110,232,0.08)] hover:text-[#5B6EE8] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1 className="flex-1 truncate text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
              {title}
            </h1>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 rounded-2xl bg-white p-1.5 pr-3 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-all hover:-translate-y-0.5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7] text-sm font-bold text-white">
                  {getInitials(profile?.full_name || '?')}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-semibold leading-tight text-[#0F172A]">{profile?.full_name}</p>
                  <p className="text-xs text-slate-400">{roleLabel}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-[#E8EAF3] bg-white p-1.5 shadow-[0_10px_30px_rgba(91,110,232,0.15)]">
                    <button
                      onClick={() => { navigate(`/${profile?.role}/profile`); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]"
                    >
                      <UserCircle className="h-4 w-4" />
                      My Profile
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
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
          <main className="px-4 pb-10 pt-2 sm:px-8">
            {children}
          </main>
        </div>
      </div>
  );
}
