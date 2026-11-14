import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList,
  IndianRupee, FileText, Bell, Settings, LogOut,
  X, UserCircle, ChevronDown, Shield, User,
  Megaphone, UserPlus, ClipboardCheck, CalendarDays, Bus,
  LayoutGrid, GripVertical, RotateCcw, Pencil, Check, ChevronRight, ChevronLeft, UserRound, Boxes, Library, CalendarClock, CalendarRange, UserCog, ArrowUpCircle, CalendarCheck2, LifeBuoy,
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
import { NotificationBell } from './NotificationBell';
import { PlatformBanner } from './PlatformNotices';
import { portalName, schoolBranding } from '@/lib/branding';
import { usePermissions } from '@/auth/PermissionsContext';
import { cn, getInitials } from '@/lib/utils';
import veducoreLogo from '@/assets/veducore-logo.png';
import type { School } from '@/types';
import {
  SidebarPrefProvider as _SidebarPrefProvider, useSidebarPref, FIXED_PATHS,
} from '@/context/SidebarPrefContext';
import { ConfirmDialog } from '@/components/ui/Modal';

// ── Nav config ────────────────────────────────────────────────────────────────

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
  { label: 'Subjects',           path: '/admin/subjects',      icon: <Library className="h-5 w-5" /> },
  { label: 'Timetable',          path: '/admin/timetable',     icon: <CalendarClock className="h-5 w-5" /> },
  { label: 'Attendance',         path: '/admin/attendance',    icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Exams & Results',    path: '/admin/exams',         icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: 'Fees',               path: '/admin/fees',          icon: <IndianRupee className="h-5 w-5" /> },
  { label: 'Transport',          path: '/admin/transport',     icon: <Bus className="h-5 w-5" /> },
  { label: 'Student Tracking',   path: '/admin/tracking',      icon: <Shield className="h-5 w-5" /> },
  { label: 'Documents',          path: '/admin/documents',     icon: <FileText className="h-5 w-5" /> },
  { label: 'Holidays',           path: '/admin/holidays',      icon: <CalendarDays className="h-5 w-5" /> },
  { label: 'Academic Year',      path: '/admin/sessions',      icon: <CalendarRange className="h-5 w-5" /> },
  { label: 'Promotion',          path: '/admin/promotion',     icon: <ArrowUpCircle className="h-5 w-5" /> },
  { label: 'Notifications',      path: '/admin/notifications', icon: <Bell className="h-5 w-5" /> },
  { label: 'Staff & Roles',      path: '/admin/staff',         icon: <UserCog className="h-5 w-5" /> },
  { label: 'Help & Support',     path: '/admin/support',       icon: <LifeBuoy className="h-5 w-5" /> },
  { label: 'All Modules',        path: '/admin/all-modules',   icon: <Boxes className="h-5 w-5" /> },
];

export const teacherNav: NavItem[] = [
  { label: 'Dashboard',        path: '/teacher/dashboard',   icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'My Classes',       path: '/teacher/classes',     icon: <BookOpen className="h-5 w-5" /> },
  { label: 'My Timetable',     path: '/teacher/schedule',    icon: <CalendarClock className="h-5 w-5" /> },
  { label: 'Students',         path: '/teacher/students',    icon: <Users className="h-5 w-5" /> },
  { label: 'Add Student',      path: '/teacher/add-student', icon: <UserPlus className="h-5 w-5" /> },
  { label: 'Class Attendance', path: '/teacher/attendance',  icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'My Attendance',    path: '/teacher/my-attendance', icon: <CalendarCheck2 className="h-5 w-5" /> },
  { label: 'Exam Marks',       path: '/teacher/exam-marks',  icon: <ClipboardCheck className="h-5 w-5" /> },
  { label: 'Student Records',  path: '/teacher/records',     icon: <FileText className="h-5 w-5" /> },
  { label: 'Remarks',          path: '/teacher/remarks',     icon: <Megaphone className="h-5 w-5" /> },
];

export const parentNav: NavItem[] = [
  { label: 'Dashboard',        path: '/parent/dashboard',    icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'My Child',         path: '/parent/child',        icon: <Users className="h-5 w-5" /> },
  { label: 'Timetable',        path: '/parent/timetable',    icon: <CalendarClock className="h-5 w-5" /> },
  { label: 'Attendance',       path: '/parent/attendance',   icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Fees',             path: '/parent/fees',         icon: <IndianRupee className="h-5 w-5" /> },
  { label: 'Transport',        path: '/parent/transport',    icon: <Bus className="h-5 w-5" /> },
  { label: 'Academic Records', path: '/parent/records',      icon: <FileText className="h-5 w-5" /> },
  { label: 'Remarks',          path: '/parent/remarks',      icon: <Megaphone className="h-5 w-5" /> },
];

// ── Focusable selector for focus trap ────────────────────────────────────────
const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ── Sortable sidebar item ─────────────────────────────────────────────────────

function SortableSidebarItem({
  item, active, editMode, isFixed, expanded, onNavigate, onUnpin,
}: {
  item: NavItem;
  active: boolean;
  editMode: boolean;
  isFixed: boolean;
  expanded: boolean;
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

  // Collapsed: icon-only button
  if (!expanded) {
    return (
      <li ref={setNodeRef} style={style}>
        <button
          onClick={() => onNavigate(item.path)}
          title={item.label}
          aria-label={item.label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            active
              ? 'bg-gradient-to-br from-[#5B6EE8] to-[#6F82F5] text-white shadow-[0_4px_12px_rgba(91,110,232,0.35)]'
              : 'text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]',
          )}
        >
          {item.icon}
        </button>
      </li>
    );
  }

  // Expanded: full row with label
  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          'group flex w-full items-center gap-3.5 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-200',
          active && !editMode
            ? 'bg-gradient-to-br from-[#5B6EE8] to-[#6F82F5] text-white shadow-[0_6px_16px_rgba(91,110,232,0.35)]'
            : editMode
            ? 'bg-[#F8F9FF] text-slate-600'
            : 'text-slate-600 hover:bg-[#EEF0FD] hover:text-[#5B6EE8] cursor-pointer',
        )}
        onClick={!editMode ? () => onNavigate(item.path) : undefined}
        role={!editMode ? 'button' : undefined}
        tabIndex={!editMode ? 0 : undefined}
        onKeyDown={!editMode ? (e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(item.path); } : undefined}
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

        {/* label + unpin — fade in when expanded */}
        <span className={cn(
          'flex-shrink-0 transition-colors duration-200',
          active && !editMode ? 'text-white' : editMode ? 'text-slate-400' : 'text-slate-400 group-hover:text-[#5B6EE8]',
        )}>
          {item.icon}
        </span>

        {!editMode ? (
          <span className="flex-1 truncate transition-opacity duration-200 opacity-100">{item.label}</span>
        ) : (
          <span className="flex-1 truncate transition-opacity duration-200 opacity-100">{item.label}</span>
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  school: School | null;
  roleLabel: string;
  activeNavPath?: string;
  onNavigate: (path: string) => void;
  firstFocusRef: React.RefObject<HTMLButtonElement>;
}

function Sidebar({
  expanded, onExpand, onCollapse,
  school, roleLabel, activeNavPath, onNavigate, firstFocusRef,
}: SidebarProps) {
  const location = useLocation();
  const { pinnedItems: allPinned, isFixed, togglePin, reorder, reset, isCustomised } = useSidebarPref();
  const { canPath } = usePermissions();
  // Staff only see the modules their role allows.
  const pinnedItems = allPinned.filter((i) => canPath(i.path));
  const [editMode, setEditMode] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => onExpand(), 120);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    onCollapse();
  }

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

  const schoolInitial = school?.name ? school.name.charAt(0).toUpperCase() : '?';

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'fixed top-[72px] bottom-0 left-0 z-30 flex flex-col border-r border-[#E8EAF3] bg-white',
        'transition-[width] duration-300 ease-in-out overflow-hidden',
        expanded ? 'w-72' : 'w-[64px]',
      )}
    >
      {/* ── Nav items ── */}
      <nav
        className={cn(
          'sidebar-scroll flex-1 overflow-y-auto py-3',
          expanded ? 'px-3' : 'flex flex-col items-center px-2',
        )}
        aria-label="Main navigation"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pinnedItems.map((i) => i.path)} strategy={verticalListSortingStrategy}>
            <ul className={cn('space-y-1', !expanded && 'flex flex-col items-center')}>
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
                    expanded={expanded}
                    onNavigate={onNavigate}
                    onUnpin={togglePin}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      {/* ── Bottom ── */}
      <div className="border-t border-[#E8EAF3] p-2">
        {expanded ? (
          <>
            {/* Edit mode hint */}
            {editMode && (
              <div className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-3 py-2 mb-1">
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

            {/* Customise button */}
            <button
              onClick={() => setEditMode((v) => !v)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap overflow-hidden',
                editMode
                  ? 'bg-[#5B6EE8] text-white'
                  : 'text-slate-500 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]',
              )}
            >
              {editMode ? <><Check className="h-4 w-4 flex-shrink-0" /><span className="transition-opacity duration-200">Done</span></> : <><Pencil className="h-4 w-4 flex-shrink-0" /><span className="transition-opacity duration-200">Edit Nav</span></>}
            </button>

            {/* Veducore branding — clickable */}
            <div className="py-2">
              <a
                href="https://veducore.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 transition-colors hover:bg-[#EEF0FD] whitespace-nowrap overflow-hidden"
              >
                <img src={veducoreLogo} alt="Veducore" className="h-6 w-auto object-contain flex-shrink-0" />
                <span className="text-[11px] font-medium text-slate-400 transition-opacity duration-200">Powered by Veducore</span>
              </a>
            </div>
          </>
        ) : (
          /* Collapsed: pen + right arrow */
          <div className="flex flex-col items-center gap-1 py-1">
            <button
              onClick={onExpand}
              aria-label="Customise sidebar"
              title="Customise Sidebar"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-[#EEF0FD] hover:text-[#5B6EE8] transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <a
              href="https://veducore.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Powered by Veducore"
              className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#EEF0FD] transition-colors"
            >
              <img src={veducoreLogo} alt="Veducore" className="h-5 w-auto object-contain" />
            </a>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => { reset(); setEditMode(false); }}
        title="Reset Sidebar"
        message="This will restore the default sidebar for your role. Your custom order and pinned modules will be lost."
        confirmText="Reset"
        variant="danger"
      />
    </aside>
  );
}

// ── DashboardLayout ───────────────────────────────────────────────────────────

export function DashboardLayout({
  children,
  title,
  activeNavPath,
}: {
  children: ReactNode;
  title?: string;
  activeNavPath?: string;
}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [school, setSchool] = useState<School | null>(() => getCachedSchoolSync(profile?.school_id));

  const firstFocusRef = useRef<HTMLButtonElement>(null);

  const { roleName, canPath } = usePermissions();
  const roleLabel = profile?.role === 'admin' && roleName && roleName !== 'Owner'
    ? roleName
    : profile?.role
      ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
      : '';

  // ── Sidebar stays open/closed based on hover only ───────────

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
    // Settings page saves broadcast the fresh school row.
    const onUpdate = (e: Event) => { const s = (e as CustomEvent<School | null>).detail; if (s) setSchool(s); };
    window.addEventListener('veducore:school-updated', onUpdate);
    return () => { cancelled = true; window.removeEventListener('veducore:school-updated', onUpdate); };
  }, [profile?.school_id]);

  // ── Browser tab: "Attendance · GVCS Teacher Portal" + school logo favicon ──
  const portal = portalName(school, profile?.role);
  useEffect(() => {
    document.title = title ? `${title} · ${portal}` : portal;
    const link = (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null) ?? (() => {
      const l = document.createElement('link');
      l.rel = 'icon';
      document.head.appendChild(l);
      return l;
    })();
    if (!link.dataset.defaultHref) link.dataset.defaultHref = link.href;
    const useLogo = !!school?.logo_url && schoolBranding(school).enabled;
    link.href = useLogo ? school!.logo_url! : link.dataset.defaultHref;
    if (useLogo) link.removeAttribute('type');
  }, [title, portal, school]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setSidebarExpanded(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F4F5FB] font-sans text-[#0F172A]">

      {/* ── Single sidebar ── */}
      <Sidebar
        expanded={sidebarExpanded}
        onExpand={() => {
          setSidebarExpanded(true);
          requestAnimationFrame(() => setTimeout(() => firstFocusRef.current?.focus(), 160));
        }}
        onCollapse={() => setSidebarExpanded(false)}
        school={school}
        roleLabel={roleLabel}
        activeNavPath={activeNavPath}
        onNavigate={(path) => { navigate(path); }}
        firstFocusRef={firstFocusRef}
      />

      {/* ── Full-width navbar — sits above everything including sidebar ── */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-[72px] items-center gap-3 border-b border-[#E8EAF3] bg-white/90 pl-4 pr-4 backdrop-blur-md sm:pl-6 sm:pr-6">

          {/* School logo + name — always visible in navbar */}
          <div className="flex min-w-0 items-center gap-3">
            {school?.logo_url ? (
              <img
                src={school.logo_url}
                alt={school.name}
                title={school.name}
                className="h-11 w-11 flex-shrink-0 rounded-xl border border-[#E8EAF3] object-contain"
              />
            ) : (
              <div
                title={school?.name}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[#E8EAF3] bg-[#EEF0FD] text-base font-bold text-[#5B6EE8]"
              >
                {school?.name ? school.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <div className="min-w-0">
              {school?.name ? (
                <p title={school.name} className="truncate max-w-[160px] text-[15px] font-semibold leading-tight text-[#0F172A] sm:max-w-[260px]">
                  {school.name}
                </p>
              ) : (
                <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              )}
              {school && schoolBranding(school).enabled && portal !== 'Veducore' && (
                <p className="mt-0.5 hidden truncate text-[11px] font-medium text-slate-500 sm:block">{portal}</p>
              )}
            </div>
          </div>

          <div className="flex-1" />

          {/* Notifications */}
          <NotificationBell role={profile?.role} schoolId={profile?.school_id} />

          {/* Profile dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-[0_4px_20px_rgba(91,110,232,0.08)] transition-all hover:-translate-y-0.5"
            >
              <UserRound className="h-5 w-5 text-slate-500" />
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-[#E8EAF3] bg-white p-1.5 shadow-[0_10px_30px_rgba(91,110,232,0.15)]">
                  <div className="px-3 py-2 border-b border-[#E8EAF3] mb-1">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{profile?.full_name}</p>
                    <p className="text-xs text-slate-400">{roleLabel}</p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => { navigate(`/${profile?.role}/profile`); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]"
                  >
                    <UserCircle className="h-4 w-4" /> My Profile
                  </button>
                  {profile?.role === 'admin' && canPath('/admin/settings') && (
                    <button
                      role="menuitem"
                      onClick={() => { navigate('/admin/settings'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-[#EEF0FD] hover:text-[#5B6EE8]"
                    >
                      <Settings className="h-4 w-4" /> School Settings
                    </button>
                  )}
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

      {/* ── Main — offset by sidebar + below navbar ── */}
      <div className="min-h-screen pl-[64px] pt-[72px]">
        {/* Page content */}
        <main className="px-4 pb-10 pt-4 sm:px-8">
          <PlatformBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
