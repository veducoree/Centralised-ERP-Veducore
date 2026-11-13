import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Pencil, Library, X, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchClasses, fetchSubjects, createClassSubjects, updateSubject,
  setSubjectSections, deleteSubject, generateSubjectCode, fetchSubjectAllotments,
} from '@/services/api';
import type { Class, Section, Subject } from '@/types';
import { sortByClassOrder, sortSections } from '@/lib/classOrder';
import { cn } from '@/lib/utils';

type ClassWithSections = Class & { sections: Section[] };
type Allotment = Awaited<ReturnType<typeof fetchSubjectAllotments>>[number];

const COMMON_SUBJECTS = [
  'English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'EVS',
  'Computer', 'Sanskrit', 'General Knowledge', 'Drawing',
];

/** Supabase errors are plain objects, not Error instances. */
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message;
  return fallback;
}

interface SubjectRow { name: string; code: string; codeEdited: boolean }
const emptyRow = (): SubjectRow => ({ name: '', code: '', codeEdited: false });

// ── Section picker ───────────────────────────────────────────────────────────
function SectionPicker({
  sections, selected, onChange,
}: { sections: Section[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const allSelected = sections.length > 0 && sections.every((s) => selected.includes(s.id));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (sections.length === 0) {
    return <p className="text-sm text-amber-600">This class has no sections. Add a section in Classes &amp; Sections first.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(allSelected ? [] : sections.map((s) => s.id))}
        className={cn(
          'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
          allSelected
            ? 'border-[#5B6EE8] bg-[#5B6EE8] text-white'
            : 'border-slate-200 text-slate-600 hover:border-[#5B6EE8] hover:text-[#5B6EE8]',
        )}
      >
        All sections
      </button>
      {sections.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className={cn(
              'min-w-[44px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              on
                ? 'border-[#5B6EE8] bg-[#EEF0FD] text-[#5B6EE8]'
                : 'border-slate-200 text-slate-500 hover:border-slate-300',
            )}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminSubjects() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allotments, setAllotments] = useState<Allotment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addClassId, setAddClassId] = useState('');
  const [addSectionIds, setAddSectionIds] = useState<string[]>([]);
  const [rows, setRows] = useState<SubjectRow[]>([emptyRow()]);
  const [savingAdd, setSavingAdd] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<Subject | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editSectionIds, setEditSectionIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<Subject | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [cls, subs, allot] = await Promise.all([
        fetchClasses(profile.school_id),
        fetchSubjects(profile.school_id),
        fetchSubjectAllotments(profile.school_id),
      ]);
      setClasses(sortByClassOrder(cls).map((c) => ({ ...c, sections: sortSections(c.sections) })));
      setSubjects(subs);
      setAllotments(allot);
    } catch {
      toast('Failed to load subjects', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const allCodes = useMemo(() => subjects.map((s) => s.code), [subjects]);

  // ── Add ────────────────────────────────────────────────────────────────
  function openAdd(classId = '') {
    const cls = classId ? classById.get(classId) : undefined;
    setAddClassId(classId);
    setAddSectionIds(cls ? cls.sections.map((s) => s.id) : []);
    setRows([emptyRow()]);
    setAddOpen(true);
  }

  function changeAddClass(classId: string) {
    setAddClassId(classId);
    const cls = classById.get(classId);
    setAddSectionIds(cls ? cls.sections.map((s) => s.id) : []);
  }

  // Codes are generated against existing codes plus the ones already typed above.
  function regenerateCodes(next: SubjectRow[]): SubjectRow[] {
    const used = [...allCodes];
    return next.map((r) => {
      if (r.codeEdited || !r.name.trim()) {
        if (r.code) used.push(r.code);
        return r.codeEdited ? r : { ...r, code: '' };
      }
      const code = generateSubjectCode(r.name, used);
      used.push(code);
      return { ...r, code };
    });
  }

  function updateRowName(i: number, name: string) {
    setRows((p) => regenerateCodes(p.map((r, j) => (j === i ? { ...r, name } : r))));
  }
  function updateRowCode(i: number, code: string) {
    setRows((p) => p.map((r, j) => (j === i ? { ...r, code: code.toUpperCase(), codeEdited: true } : r)));
  }
  function removeRow(i: number) {
    setRows((p) => {
      const next = p.filter((_, j) => j !== i);
      return regenerateCodes(next.length ? next : [emptyRow()]);
    });
  }
  function addQuickSubject(name: string) {
    setRows((p) => {
      if (p.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) return p;
      const blankIdx = p.findIndex((r) => !r.name.trim());
      const next = blankIdx >= 0
        ? p.map((r, j) => (j === blankIdx ? { ...r, name } : r))
        : [...p, { ...emptyRow(), name }];
      return regenerateCodes(next);
    });
  }

  const existingInAddClass = useMemo(
    () => new Set(subjects.filter((s) => s.class_id === addClassId).map((s) => s.name.trim().toLowerCase())),
    [subjects, addClassId],
  );

  async function handleAdd() {
    if (!profile?.school_id) return;
    if (!addClassId) { toast('Select a class', 'error'); return; }
    if (!addSectionIds.length) { toast('Select at least one section', 'error'); return; }
    const valid = rows.filter((r) => r.name.trim());
    if (!valid.length) { toast('Enter at least one subject name', 'error'); return; }

    setSavingAdd(true);
    try {
      const res = await createClassSubjects({
        schoolId: profile.school_id,
        classId: addClassId,
        sectionIds: addSectionIds,
        subjects: valid.map((r) => ({ name: r.name, code: r.code })),
      });
      const cls = classById.get(addClassId)?.name ?? 'class';
      const parts = [];
      if (res.created) parts.push(`${res.created} subject(s) added to ${cls}`);
      if (res.reused) parts.push(`${res.reused} already existed, sections updated`);
      toast(parts.join(' · ') || 'Saved', 'success');
      setAddOpen(false);
      loadData();
    } catch (err) {
      toast(errorMessage(err, 'Failed to add subjects'), 'error');
    } finally {
      setSavingAdd(false);
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────
  function openEdit(s: Subject) {
    setEditing(s);
    setEditName(s.name);
    setEditCode(s.code ?? '');
    setEditSectionIds(s.section_ids);
  }

  async function handleEdit() {
    if (!editing || !profile?.school_id) return;
    if (!editName.trim()) { toast('Subject name is required', 'error'); return; }
    if (!editSectionIds.length) { toast('Select at least one section', 'error'); return; }
    setSavingEdit(true);
    try {
      await updateSubject(editing.id, { name: editName.trim(), code: editCode.trim().toUpperCase() || null });
      await setSubjectSections(profile.school_id, editing.id, editSectionIds);
      toast('Subject updated', 'success');
      setEditing(null);
      loadData();
    } catch (err) {
      const msg = errorMessage(err, 'Failed to update subject');
      toast(msg.includes('duplicate') ? 'A subject with this name already exists in this class' : msg, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteSubject(deleting.id);
      toast(`"${deleting.name}" deleted`, 'success');
      loadData();
    } catch {
      toast('Failed to delete subject', 'error');
    }
  }

  // ── Derived list ───────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const visibleClasses = classes
    .filter((c) => !classFilter || c.id === classFilter)
    .map((c) => ({
      cls: c,
      subs: subjects
        .filter((s) => s.class_id === c.id)
        .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.code ?? '').toLowerCase().includes(q)),
    }))
    .filter(({ cls, subs }) => !q || subs.length > 0 || cls.name.toLowerCase().includes(q));

  const teacherFor = (sectionId: string, subjectId: string) =>
    allotments.find((a) => a.section_id === sectionId && a.subject_id === subjectId)?.teacher?.full_name;

  const editingClass = editing ? classById.get(editing.class_id) : undefined;
  const addClass = classById.get(addClassId);

  return (
    <DashboardLayout title="Subjects">
      <div className="space-y-6">
        <PageHeader
          title="Subjects"
          description="Add the subjects of each class. Teachers are then allotted subjects class-wise."
          action={
            classes.length > 0 ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => openAdd(classFilter)}>
                Add Subjects
              </Button>
            ) : null
          }
        />

        {loading ? (
          <LoadingSpinner variant="cards" />
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white py-20 text-center">
            <Library className="mb-3 h-12 w-12 text-slate-300" />
            <p className="font-medium text-slate-600">Create classes first</p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              Subjects are added class-wise. Create your classes and sections, then come back here.
            </p>
            <Button className="mt-4" onClick={() => navigate('/admin/classes')}>Go to Classes &amp; Sections</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:max-w-sm">
                <SearchInput value={search} onChange={setSearch} placeholder="Search subject name or code..." />
              </div>
              <div className="w-full sm:w-56">
                <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              {visibleClasses.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-400">No subjects match your search.</p>
              )}
              {visibleClasses.map(({ cls, subs }) => {
                const isCollapsed = collapsed[cls.id];
                const total = subjects.filter((s) => s.class_id === cls.id).length;
                return (
                  <Card key={cls.id} className="overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                      <button
                        onClick={() => setCollapsed((p) => ({ ...p, [cls.id]: !p[cls.id] }))}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        {isCollapsed
                          ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
                          : <ChevronUp className="h-4 w-4 flex-shrink-0 text-slate-400" />}
                        <span className="font-semibold text-slate-900">{cls.name}</span>
                        <Badge variant={total ? 'default' : 'neutral'}>
                          {total} subject{total !== 1 ? 's' : ''}
                        </Badge>
                      </button>
                      <button
                        onClick={() => openAdd(cls.id)}
                        className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#5B6EE8] hover:bg-[#EEF0FD]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </div>

                    {!isCollapsed && (
                      subs.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-slate-400">
                          No subjects yet.{' '}
                          <button onClick={() => openAdd(cls.id)} className="font-medium text-[#5B6EE8] hover:underline">
                            Add subjects for {cls.name}
                          </button>
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-5 py-2.5 font-semibold">Subject</th>
                                <th className="px-4 py-2.5 font-semibold">Code</th>
                                <th className="px-4 py-2.5 font-semibold">Sections &amp; teacher</th>
                                <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {subs.map((s) => (
                                <tr key={s.id} className="hover:bg-[#F7F8FE]">
                                  <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                                  <td className="px-4 py-3">
                                    {s.code
                                      ? <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-bold text-brand-600">{s.code}</span>
                                      : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {cls.sections.filter((sec) => s.section_ids.includes(sec.id)).map((sec) => {
                                        const t = teacherFor(sec.id, s.id);
                                        return (
                                          <span
                                            key={sec.id}
                                            title={t ? `Section ${sec.name}: ${t}` : `Section ${sec.name}: no teacher yet`}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs"
                                          >
                                            <span className="font-semibold text-slate-700">{sec.name}</span>
                                            <span className={t ? 'text-emerald-600' : 'italic text-slate-400'}>
                                              {t ?? 'no teacher'}
                                            </span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="px-5 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => openEdit(s)}
                                        title="Edit"
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => setDeleting(s)}
                                        title="Delete"
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ══ Add Subjects ═══════════════════════════════════════════════════ */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Subjects"
        description="Pick the class and its sections, then enter all subjects of that class."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} loading={savingAdd}>Save Subjects</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Select label="Class" required value={addClassId} onChange={(e) => changeAddClass(e.target.value)}>
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          {addClass && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Sections <span className="text-red-500">*</span></p>
                <SectionPicker sections={addClass.sections} selected={addSectionIds} onChange={setAddSectionIds} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Subjects</p>
                <div className="space-y-2">
                  {rows.map((r, i) => {
                    const exists = r.name.trim() && existingInAddClass.has(r.name.trim().toLowerCase());
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Input
                              placeholder="Subject name, e.g. Mathematics"
                              value={r.name}
                              onChange={(e) => updateRowName(i, e.target.value)}
                              autoFocus={i === rows.length - 1 && i > 0}
                            />
                          </div>
                          <div className="w-28 flex-shrink-0">
                            <Input
                              placeholder="Code"
                              value={exists ? '' : r.code}
                              disabled={!!exists}
                              onChange={(e) => updateRowCode(i, e.target.value)}
                              className="font-mono"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                            title="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {exists && (
                          <p className="mt-1 text-xs text-amber-600">
                            Already in {addClass.name}. Saving will add the selected sections to it.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setRows((p) => [...p, emptyRow()])}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-[20px] border border-dashed border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-[#5B6EE8] hover:text-[#5B6EE8]"
                >
                  <Plus className="h-4 w-4" /> Add another subject
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">Quick add</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SUBJECTS.map((name) => {
                    const added = rows.some((r) => r.name.trim().toLowerCase() === name.toLowerCase());
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={added}
                        onClick={() => addQuickSubject(name)}
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-[#5B6EE8] hover:text-[#5B6EE8] disabled:cursor-default disabled:opacity-40"
                      >
                        + {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ══ Edit Subject ═══════════════════════════════════════════════════ */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Subject"
        description={editingClass ? `Class: ${editingClass.name}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleEdit} loading={savingEdit}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <Input label="Subject Name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input label="Code" value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} className="font-mono" />
          </div>
          {editingClass && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Sections <span className="text-red-500">*</span></p>
              <SectionPicker sections={editingClass.sections} selected={editSectionIds} onChange={setEditSectionIds} />
              <p className="mt-2 text-xs text-slate-400">
                Removing a section also removes the teacher allotted for this subject in that section.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete Subject"
        message={deleting ? `Delete "${deleting.name}"? Teachers allotted to this subject will be unassigned from it.` : ''}
        confirmText="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
