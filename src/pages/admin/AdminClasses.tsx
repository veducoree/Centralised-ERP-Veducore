import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, BookOpen, X, UserCheck, ChevronDown, ChevronUp,
  GraduationCap, Users, Pencil,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchClasses, createClass, deleteClass,
  createSection, deleteSection,
  fetchSubjects,
  fetchTeachers,
  fetchClassTeacherForSection, assignClassTeacher, removeClassTeacher,
  fetchSubjectAssignmentsForSection, assignSubjectTeacher, removeSubjectTeacher,
} from '@/services/api';
import type { Section, Teacher, Subject, ClassAssignment } from '@/types';
import { Badge } from '@/components/ui/Badge';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassRow {
  id: string;
  name: string;
  grade_level: number | null;
  sections: Section[];
  expanded: boolean;
}

// Per section: class teacher + subject assignments
interface SectionData {
  sectionId: string;
  classTeacher: Teacher | null;
  // subject assignments loaded lazily when section is opened
  subjectAssignments: (ClassAssignment & { teacher: Teacher; subject: Subject })[];
  subjectsLoaded: boolean;
}

// ── Class sort order ───────────────────────────────────────────────────────────
// Returns a numeric sort key so Nursery < LKG/KG < UKG < Class 1 < Class 2 …
function getClassSortKey(name: string, gradeLevel: number | null): number {
  const n = name.trim().toLowerCase();

  // Pre-primary order: nursery=0, lkg/kg=1, ukg=2
  if (n === 'nursery' || n === 'pre-nursery' || n === 'pre nursery') return 0;
  if (n === 'lkg' || n === 'kg' || n === 'lower kg' || n === 'lower kindergarten') return 1;
  if (n === 'ukg' || n === 'upper kg' || n === 'upper kindergarten') return 2;

  // If grade_level is set, use it (offset by 3 to place after pre-primary)
  if (gradeLevel != null) return gradeLevel + 3;

  // Try to extract a number from the name ("Class 1", "Grade 5", "1st", "std 3", etc.)
  const match = n.match(/(\d+)/);
  if (match) return parseInt(match[1], 10) + 3;

  // Alphabetical fallback — far down the list
  return 9999;
}

function sortClasses(rows: ClassRow[]): ClassRow[] {
  return [...rows].sort((a, b) => {
    const ka = getClassSortKey(a.name, a.grade_level);
    const kb = getClassSortKey(b.name, b.grade_level);
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminClasses() {
  const { profile } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [search, setSearch] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sectionData, setSectionData] = useState<Record<string, SectionData>>({});
  const [loading, setLoading] = useState(true);

  // expanded section (one at a time per class — classId -> sectionId)
  const [expandedSection, setExpandedSection] = useState<Record<string, string>>({});

  // ── Add Classes modal ────────────────────────────────────────────────
  const [addClassesOpen, setAddClassesOpen] = useState(false);
  const [newClasses, setNewClasses] = useState<
    { name: string; gradeLevel: string; sections: string[] }[]
  >([{ name: '', gradeLevel: '', sections: ['A'] }]);
  const [savingClasses, setSavingClasses] = useState(false);

  // ── Assign Class Teacher modal ───────────────────────────────────────
  const [assignCTOpen, setAssignCTOpen] = useState(false);
  const [assignCTTarget, setAssignCTTarget] = useState<{
    classId: string; sectionId: string; label: string;
  } | null>(null);
  const [selectedCTId, setSelectedCTId] = useState('');
  const [savingCT, setSavingCT] = useState(false);

  // ── Assign Subject Teacher modal ─────────────────────────────────────
  const [assignSTOpen, setAssignSTOpen] = useState(false);
  const [assignSTTarget, setAssignSTTarget] = useState<{
    classId: string; sectionId: string; subjectId: string;
    subjectName: string; subjectCode: string | null; sectionLabel: string;
  } | null>(null);
  const [selectedSTId, setSelectedSTId] = useState('');
  const [savingST, setSavingST] = useState(false);

  // ── Delete confirms ──────────────────────────────────────────────────
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);

  // ── Load initial data ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [rawClasses, teacherList, subjectList] = await Promise.all([
        fetchClasses(profile.school_id),
        fetchTeachers(profile.school_id),
        fetchSubjects(profile.school_id),
      ]);
      setTeachers(teacherList);
      setSubjects(subjectList);

      const rows: ClassRow[] = rawClasses.map((c) => ({
        id: c.id,
        name: c.name,
        grade_level: c.grade_level,
        sections: c.sections,
        expanded: true,
      }));
      setClasses(sortClasses(rows));

      // Load class teachers for all sections in parallel
      const allSections = rawClasses.flatMap((c) => c.sections);
      const entries = await Promise.all(
        allSections.map(async (sec): Promise<[string, SectionData]> => {
          try {
            const ct = await fetchClassTeacherForSection(sec.id);
            return [sec.id, {
              sectionId: sec.id,
              classTeacher: ct?.teacher || null,
              subjectAssignments: [],
              subjectsLoaded: false,
            }];
          } catch {
            return [sec.id, { sectionId: sec.id, classTeacher: null, subjectAssignments: [], subjectsLoaded: false }];
          }
        })
      );
      setSectionData(Object.fromEntries(entries));
    } catch {
      toast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load subject assignments for a section (always fresh) ───────────
  async function loadSectionSubjects(sectionId: string) {
    try {
      const assignments = await fetchSubjectAssignmentsForSection(sectionId);
      setSectionData((prev) => ({
        ...prev,
        [sectionId]: { ...prev[sectionId], subjectAssignments: assignments, subjectsLoaded: true },
      }));
    } catch {
      // silent
    }
  }

  // Also refresh the subjects list so newly added subjects appear
  async function refreshSubjectsAndSection(sectionId: string) {
    if (!profile?.school_id) return;
    const [freshSubjects, assignments] = await Promise.all([
      fetchSubjects(profile.school_id),
      fetchSubjectAssignmentsForSection(sectionId),
    ]);
    setSubjects(freshSubjects);
    setSectionData((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], subjectAssignments: assignments, subjectsLoaded: true },
    }));
  }

  // ── Toggle class expanded ────────────────────────────────────────────
  function toggleClass(classId: string) {
    setClasses((prev) => prev.map((c) => c.id === classId ? { ...c, expanded: !c.expanded } : c));
  }

  // ── Toggle section expanded ──────────────────────────────────────────
  function toggleSection(classId: string, sectionId: string) {
    const current = expandedSection[classId];
    if (current === sectionId) {
      setExpandedSection((prev) => { const n = { ...prev }; delete n[classId]; return n; });
    } else {
      setExpandedSection((prev) => ({ ...prev, [classId]: sectionId }));
      // Always fetch fresh — picks up newly added subjects and assignments
      refreshSubjectsAndSection(sectionId);
    }
  }

  // ── Add Classes helpers ──────────────────────────────────────────────
  const addClassRow = () => setNewClasses((p) => [...p, { name: '', gradeLevel: '', sections: ['A'] }]);
  const removeClassRow = (i: number) => setNewClasses((p) => p.filter((_, j) => j !== i));
  const updateClassRow = (i: number, f: 'name' | 'gradeLevel', v: string) =>
    setNewClasses((p) => p.map((r, j) => j === i ? { ...r, [f]: v } : r));
  const addSecToClass = (i: number) =>
    setNewClasses((p) => p.map((r, j) => j === i ? { ...r, sections: [...r.sections, ''] } : r));
  const updateSecInput = (ci: number, si: number, v: string) =>
    setNewClasses((p) => p.map((r, j) => j === ci ? { ...r, sections: r.sections.map((s, k) => k === si ? v : s) } : r));
  const removeSecInput = (ci: number, si: number) =>
    setNewClasses((p) => p.map((r, j) => j === ci ? { ...r, sections: r.sections.filter((_, k) => k !== si) } : r));

  async function handleSaveClasses() {
    if (!profile?.school_id) return;
    const valid = newClasses.filter((r) => r.name.trim());
    if (!valid.length) { toast('Enter at least one class name', 'error'); return; }
    setSavingClasses(true);
    try {
      for (const row of valid) {
        const cls = await createClass(profile.school_id, row.name.trim(),
          row.gradeLevel ? parseInt(row.gradeLevel, 10) : undefined);
        if (cls) {
          for (const s of row.sections.filter((s) => s.trim()))
            await createSection(profile.school_id, cls.id, s.trim(), 40);
        }
      }
      toast(`${valid.length} class(es) created`, 'success');
      setAddClassesOpen(false);
      setNewClasses([{ name: '', gradeLevel: '', sections: ['A'] }]);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setSavingClasses(false);
    }
  }

  // ── Assign Class Teacher ─────────────────────────────────────────────
  function openAssignCT(classId: string, sectionId: string, label: string) {
    setSelectedCTId(sectionData[sectionId]?.classTeacher?.id || '');
    setAssignCTTarget({ classId, sectionId, label });
    setAssignCTOpen(true);
  }

  async function handleAssignCT() {
    if (!profile?.school_id || !assignCTTarget) return;
    setSavingCT(true);
    try {
      if (selectedCTId) {
        await assignClassTeacher({
          school_id: profile.school_id,
          teacher_id: selectedCTId,
          class_id: assignCTTarget.classId,
          section_id: assignCTTarget.sectionId,
        });
        toast('Class teacher assigned', 'success');
      } else {
        await removeClassTeacher(assignCTTarget.sectionId);
        toast('Class teacher removed', 'success');
      }
      setAssignCTOpen(false);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setSavingCT(false);
    }
  }

  // ── Assign Subject Teacher ───────────────────────────────────────────
  function openAssignST(
    classId: string, sectionId: string, sectionLabel: string,
    subjectId: string, subjectName: string, subjectCode: string | null
  ) {
    const existing = sectionData[sectionId]?.subjectAssignments.find(
      (a) => a.subject_id === subjectId
    );
    setSelectedSTId(existing?.teacher_id || '');
    setAssignSTTarget({ classId, sectionId, subjectId, subjectName, subjectCode, sectionLabel });
    setAssignSTOpen(true);
  }

  async function handleAssignST() {
    if (!profile?.school_id || !assignSTTarget) return;
    setSavingST(true);
    try {
      if (selectedSTId) {
        await assignSubjectTeacher({
          school_id: profile.school_id,
          teacher_id: selectedSTId,
          class_id: assignSTTarget.classId,
          section_id: assignSTTarget.sectionId,
          subject_id: assignSTTarget.subjectId,
        });
        toast('Subject teacher assigned', 'success');
      } else {
        await removeSubjectTeacher(assignSTTarget.sectionId, assignSTTarget.subjectId);
        toast('Subject teacher removed', 'success');
      }
      setAssignSTOpen(false);
      refreshSubjectsAndSection(assignSTTarget.sectionId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setSavingST(false);
    }
  }

  // ── Deletes ──────────────────────────────────────────────────────────
  async function handleDeleteClass() {
    if (!deleteClassId) return;
    try { await deleteClass(deleteClassId); toast('Class deleted', 'success'); loadData(); }
    catch { toast('Failed to delete class', 'error'); }
  }
  async function handleDeleteSection() {
    if (!deleteSectionId) return;
    try { await deleteSection(deleteSectionId); toast('Section deleted', 'success'); loadData(); }
    catch { toast('Failed to delete section', 'error'); }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Classes & Sections">
      <div className="space-y-6">
        <PageHeader
          title="Classes & Sections"
          description="Manage classes, assign class teachers, and assign subject teachers"
          action={
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => { setNewClasses([{ name: '', gradeLevel: '', sections: ['A'] }]); setAddClassesOpen(true); }}
            >
              Add Classes
            </Button>
          }
        />

        <div className="max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by class name or section..." />
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No classes yet</p>
            <p className="mt-1 text-sm text-gray-400">Click "Add Classes" to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {classes.filter((cls) => {
              const q = search.toLowerCase();
              if (!q) return true;
              return cls.name.toLowerCase().includes(q) ||
                cls.sections.some((s) => s.name.toLowerCase().includes(q));
            }).map((cls) => (
              <Card key={cls.id} className="overflow-hidden p-0">
                {/* ── Class header ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <button
                    onClick={() => toggleClass(cls.id)}
                    className="flex items-center gap-2.5 text-left min-w-0"
                  >
                    {cls.expanded
                      ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />}
                    <span className="font-semibold text-gray-900">{cls.name}</span>
                    {cls.grade_level != null && (
                      <span className="text-xs text-gray-400">Grade {cls.grade_level}</span>
                    )}
                    <Badge variant="neutral">
                      {cls.sections.length} section{cls.sections.length !== 1 ? 's' : ''}
                    </Badge>
                  </button>
                  <button
                    onClick={() => setDeleteClassId(cls.id)}
                    className="ml-3 flex-shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* ── Sections list ── */}
                {cls.expanded && (
                  <div className="divide-y divide-gray-100">
                    {cls.sections.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-gray-400">No sections in this class</p>
                    ) : cls.sections.map((sec) => {
                      const sd = sectionData[sec.id];
                      const isSectionOpen = expandedSection[cls.id] === sec.id;
                      const subjectAssignments = sd?.subjectAssignments || [];

                      return (
                        <div key={sec.id}>
                          {/* Section row */}
                          <div className="flex items-center justify-between px-5 py-3 bg-gray-50/40">
                            {/* Left: section name + class teacher */}
                            <button
                              onClick={() => toggleSection(cls.id, sec.id)}
                              className="flex items-center gap-3 text-left min-w-0 flex-1"
                            >
                              {isSectionOpen
                                ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                                : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800">
                                  Section {sec.name}
                                </p>
                                {sd?.classTeacher ? (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <GraduationCap className="h-3 w-3 flex-shrink-0 text-blue-500" />
                                    <span className="text-xs font-medium text-blue-600 truncate">
                                      {sd.classTeacher.full_name}
                                    </span>
                                    <span className="text-xs text-gray-400">(Class Teacher)</span>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic mt-0.5">No class teacher assigned</p>
                                )}
                              </div>
                            </button>

                            {/* Right: action buttons */}
                            <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                              <button
                                title="Assign class teacher"
                                onClick={() => openAssignCT(cls.id, sec.id, `${cls.name} — Section ${sec.name}`)}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                Class Teacher
                              </button>
                              <button
                                title="Delete section"
                                onClick={() => setDeleteSectionId(sec.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Subject assignments panel */}
                          {isSectionOpen && (
                            <div className="px-5 py-4 bg-white border-t border-gray-100">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  Subject Teachers — {cls.name} Section {sec.name}
                                </p>
                                <button
                                  onClick={() => refreshSubjectsAndSection(sec.id)}
                                  className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                                >
                                  ↻ Refresh
                                </button>
                              </div>

                              {subjects.length === 0 ? (
                                <p className="text-sm text-gray-400">
                                  No subjects found. Teachers can add subjects from their Subjects page.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {subjects.map((subj) => {
                                    const assignment = subjectAssignments.find(
                                      (a) => a.subject_id === subj.id
                                    );
                                    const assignedTeacher = assignment?.teacher || null;

                                    return (
                                      <div
                                        key={subj.id}
                                        className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-semibold text-gray-900 truncate">
                                              {subj.name}
                                            </span>
                                            {subj.code && (
                                              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-600 flex-shrink-0">
                                                {subj.code}
                                              </span>
                                            )}
                                          </div>
                                          {assignedTeacher ? (
                                            <div className="mt-0.5 flex items-center gap-1">
                                              <Users className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                                              <span className="text-xs font-medium text-emerald-600 truncate">
                                                {assignedTeacher.full_name}
                                              </span>
                                            </div>
                                          ) : (
                                            <p className="mt-0.5 text-xs text-gray-400 italic">
                                              Not assigned
                                            </p>
                                          )}
                                        </div>
                                        <button
                                          title={assignedTeacher ? 'Change teacher' : 'Assign teacher'}
                                          onClick={() => openAssignST(
                                            cls.id, sec.id,
                                            `${cls.name} — Sec ${sec.name}`,
                                            subj.id, subj.name, subj.code
                                          )}
                                          className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                        >
                                          {assignedTeacher
                                            ? <Pencil className="h-3.5 w-3.5" />
                                            : <Plus className="h-3.5 w-3.5" />
                                          }
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ══ Add Classes Modal ═════════════════════════════════════════════ */}
      <Modal
        open={addClassesOpen}
        onClose={() => setAddClassesOpen(false)}
        title="Add Classes & Sections"
        description="Add multiple classes at once. Assign teachers after creating."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddClassesOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveClasses} loading={savingClasses}>Create All</Button>
          </>
        }
      >
        <div className="space-y-3">
          {newClasses.map((row, idx) => (
            <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="flex gap-3">
                    <Input
                      label={idx === 0 ? 'Class Name' : undefined}
                      required
                      placeholder="e.g. Nursery, KG, Class 1"
                      value={row.name}
                      onChange={(e) => updateClassRow(idx, 'name', e.target.value)}
                    />
                    <div className="w-24 flex-shrink-0">
                      <Input
                        label={idx === 0 ? 'Grade No.' : undefined}
                        type="number"
                        placeholder="1"
                        value={row.gradeLevel}
                        onChange={(e) => updateClassRow(idx, 'gradeLevel', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    {idx === 0 && <p className="mb-2 text-xs font-medium text-gray-500">Sections</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      {row.sections.map((sec, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1">
                          <input
                            type="text"
                            value={sec}
                            maxLength={4}
                            onChange={(e) => updateSecInput(idx, sIdx, e.target.value)}
                            placeholder="A"
                            className="w-14 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm font-semibold focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                          {row.sections.length > 1 && (
                            <button onClick={() => removeSecInput(idx, sIdx)} className="text-gray-300 hover:text-red-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => addSecToClass(idx)}
                        className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                  </div>
                </div>
                {newClasses.length > 1 && (
                  <button onClick={() => removeClassRow(idx)} className="mt-1 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addClassRow}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Another Class
          </button>
        </div>
      </Modal>

      {/* ══ Assign Class Teacher Modal ════════════════════════════════════ */}
      <Modal
        open={assignCTOpen}
        onClose={() => setAssignCTOpen(false)}
        title="Assign Class Teacher"
        description={assignCTTarget?.label}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignCTOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignCT} loading={savingCT} icon={<UserCheck className="h-4 w-4" />}>
              {selectedCTId ? 'Assign' : 'Remove'}
            </Button>
          </>
        }
      >
        <Select
          label="Class Teacher"
          value={selectedCTId}
          onChange={(e) => setSelectedCTId(e.target.value)}
        >
          <option value="">— No class teacher —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}{t.employee_id ? ` (${t.employee_id})` : ''}
            </option>
          ))}
        </Select>
      </Modal>

      {/* ══ Assign Subject Teacher Modal ══════════════════════════════════ */}
      <Modal
        open={assignSTOpen}
        onClose={() => setAssignSTOpen(false)}
        title="Assign Subject Teacher"
        description={
          assignSTTarget
            ? `${assignSTTarget.subjectName}${assignSTTarget.subjectCode ? ` (${assignSTTarget.subjectCode})` : ''} — ${assignSTTarget.sectionLabel}`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignSTOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignST} loading={savingST} icon={<UserCheck className="h-4 w-4" />}>
              {selectedSTId ? 'Assign' : 'Remove'}
            </Button>
          </>
        }
      >
        <Select
          label="Subject Teacher"
          value={selectedSTId}
          onChange={(e) => setSelectedSTId(e.target.value)}
        >
          <option value="">— No teacher —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}{t.employee_id ? ` (${t.employee_id})` : ''}
            </option>
          ))}
        </Select>
      </Modal>

      {/* ══ Confirm Deletes ═══════════════════════════════════════════════ */}
      <ConfirmDialog
        open={!!deleteClassId}
        onClose={() => setDeleteClassId(null)}
        onConfirm={handleDeleteClass}
        title="Delete Class"
        message="This will also delete all its sections. This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
      <ConfirmDialog
        open={!!deleteSectionId}
        onClose={() => setDeleteSectionId(null)}
        onConfirm={handleDeleteSection}
        title="Delete Section"
        message="Are you sure you want to delete this section?"
        confirmText="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
