import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList,
  IndianRupee, FileText, Bell, Settings, LogOut,
  X, UserCircle, ChevronDown, Shield, User,
  Megaphone, UserPlus, ClipboardCheck, CreditCard, CalendarDays, Bus,
  LayoutGrid, GripVertical, RotateCcw, Pencil, Check, MoreVertical,
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
import { fetchSchool, getCachedSchoolSync, fetchNotifications } from '@/services/api';
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

// ── Focusable elements selector (for focus trap) ──────────────────────────────
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ── Sortable sidebar item ─────────────────────────────────────────────────────

function SortableSidebarItem({
  item, active, editMode, isFixed, onNavigate, onUnpin,
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
        {editMode && isFixed && <span className="h-4 w-4 flex-shrink-0" />}

        {!editMode && (
          <span className={cn(
            'flex-shrink-0 transition-colors duration-200',
            active ? 'text-white' : 'text-slate-400 group-hover:text-[#5B6EE8]',
          )}>
            {item.icon}
          </span>
        )}
        {editMode && <span className="flex-shrink-0 text-slate-400">{item.icon}</span>}

        {!editMode ? (
          <button onClick={() => onNavigate(item.path)} className="flex-1 truncate text-left">
            {item.label}
          </button>
        ) : (
          <span className="flex-1 truncate">{item.label}</span>
        )}

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
  onClose: () => void;
  activeNavPath?: string;
  firstFocusRef: React.RefObject<HTMLButtonElement>;
}

function SidebarContent({
  location, school, roleLabel, onNavigate, onSignOut, onClose, activeNavPath, firstFocusRef,
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
    reorder(arrayMove(pinnedItems, oldIndex, newIndex).map((i) => i.path));
  }

  return (
    <>
      {/* Header row: school info + edit toggle + X close */}
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

        {/* Customise toggle */}
        <button
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? 'Done editing' : 'Customise sidebar'}
          className={cn(
            'flex-shrink-0 rounded-[10px] p-1.5 transition-colors',
            editMode
              ? 'bg-[#5B6EE8] text-white'
              : 'text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]',
          )}
        >
          {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>

        {/* X close button — inside sidebar top-right */}
        <button
          ref={firstFocusRef}
          onClick={onClose}
          aria-label="Close menu"
          className="flex-shrink-0 rounded-[10px] p-1.5 text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8] transition-colors"
        >
          <X className="h-5 w-5" />
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
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pinnedItems.map((i) => i.path)} strategy={verticalListSortingStrategy}>
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
                    onNavigate={onNavigate}
                    onUnpin={togglePin}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      {/* Bottom: sign out + branding */}
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
  /** Still accepted for backward-compat but NOT rendered in the header. */
  title?: string;
  activeNavPath?: string;
}) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [school, setSchool] = useState<School | null>(() => getCachedSchoolSync(profile?.school_id));
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs for focus management
  const triggerRef    = useRef<HTMLButtonElement>(null); // 3-dot button
  const firstFocusRef = useRef<HTMLButtonElement>(null); // X button inside sidebar
  const drawerRef     = useRef<HTMLElement>(null);

  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : '';

  // ── Close helpers ─────────────────────────────────────────
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    requestAnimationFrame(() => {
      setTimeout(() => firstFocusRef.current?.focus(), 160);
    });
  }, []);

  // ── Close on route change ─────────────────────────────────
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // ── Escape key + focus trap ───────────────────────────────
  useEffect(() => {
    if (!sidebarOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeSidebar();
        return;
      }

      // Focus trap inside drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, closeSidebar]);

  // ── Close user menu on Esc ────────────────────────────────
  useEffect(() => {
    if (!userMenuOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setUserMenuOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [userMenuOpen]);

  // ── School fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!profile?.school_id) return;
    const cached = getCachedSchoolSync(profile.school_id);
    if (cached) setSchool(cached);
    let cancelled = false;
    fetchSchool(profile.school_id).then((s) => { if (!cancelled && s) setSchool(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [profile?.school_id]);

  // ── Unread notifications count ────────────────────────────
  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    fetchNotifications(undefined, profile.school_id)
      .then((data) => { if (!cancelled) setUnreadCount(data.filter((n) => !n.is_read).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile?.school_id, location.pathname]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setSidebarOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  const sidebarContentProps: SidebarContentProps = {
    location,
    school,
    roleLabel,
    onNavigate: (path) => { navigate(path); closeSidebar(); },
    onSignOut: handleSignOut,
    onClose: closeSidebar,
    activeNavPath,
    firstFocusRef,
  };

  // School initial for fallback avatar
  const schoolInitial = school?.name ? school.name.charAt(0).toUpperCase() : '?';

  return (
    <div className="min-h-screen bg-[#F4F5FB] font-sans text-[#0F172A]">

      {/* ── Overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar drawer ── */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col',
          'border-r border-[#E8EAF3] bg-white shadow-2xl',
          'transition-transform duration-[180ms] ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent {...sidebarContentProps} />
      </aside>

      {/* ── Main content — full width ── */}
      <div className="min-h-screen">

        {/* ════════════ HEADER ════════════ */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-[#E8EAF3] bg-white/90 px-4 backdrop-blur-md sm:gap-4 sm:px-6">

          {/* 1. 3-dot menu trigger */}
          <button
            ref={triggerRef}
            onClick={openSidebar}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-drawer"
            className="flex-shrink-0 rounded-xl bg-white p-2.5 text-slate-500 shadow-[0_4px_20px_rgba(91,110,232,0.08)] hover:text-[#5B6EE8] transition-colors"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {/* 2 + 3. School logo + name + AY chip */}
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            {/* Logo / avatar — 36px mobile, 44px desktop */}
            {school?.logo_url ? (
              <img
                src={school.logo_url}
                alt={school.name}
                title={school.name}
                className="h-9 w-9 flex-shrink-0 rounded-full border border-[#E8EAF3] object-contain sm:h-11 sm:w-11"
              />
            ) : (
              <div
                title={school?.name}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#E8EAF3] bg-[#EEF0FD] text-sm font-bold text-[#5B6EE8] sm:h-11 sm:w-11"
              >
                {schoolInitial}
              </div>
            )}

            {/* Text block */}
            <div className="min-w-0">
              {school?.name ? (
                <p
                  title={school.name}
                  className="truncate text-[14px] font-semibold leading-tight text-[#5B6EE8] sm:text-[16px]"
                >
                  {school.name}
                </p>
              ) : (
                <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              )}
              {school?.academic_year && (
                <span className="mt-0.5 inline-flex items-center rounded-full bg-[#EEF0FD] px-2 py-0.5 text-[10px] font-semibold text-[#5B6EE8]">
                  AY {school.academic_year}
                </span>
              )}
            </div>
          </div>

          {/* 4. Spacer */}
          <div className="flex-1" />

          {/* 5. Notifications bell */}
          <button
            onClick={() => navigate(`/${profile?.role}/notifications`)}
            aria-label="Notifications"
            className="relative flex-shrink-0 rounded-xl bg-white p-2.5 text-slate-500 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-colors hover:text-[#5B6EE8]"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"
                aria-hidden="true"
              />
            )}
          </button>

          {/* 6. Profile card + dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              className="flex items-center gap-2 rounded-2xl bg-white p-1.5 pr-2 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-all hover:-translate-y-0.5 sm:pr-3"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B6EE8] to-[#7B8CF7] text-sm font-bold text-white sm:h-10 sm:w-10">
                {getInitials(profile?.full_name || '?')}
              </div>
              {/* Name + role hidden on mobile */}
              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold leading-tight text-[#0F172A]">{profile?.full_name}</p>
                <p className="text-xs text-slate-400">{roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-[#E8EAF3] bg-white p-1.5 shadow-[0_10px_30px_rgba(91,110,232,0.15)]"
                >
                  <button
                    role="menuitem"
                    onClick={() => { navigate(`/${profile?.role}/profile`); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]"
                  >
                    <UserCircle className="h-4 w-4" /> My Profile
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { navigate(`/${profile?.role}/settings`); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </button>
                  <div className="my-1 h-px bg-[#E8EAF3]" />
                  <button
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        {/* ═══════════════════════════════ */}

        {/* Page content */}
        <main className="px-4 pb-10 pt-4 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
