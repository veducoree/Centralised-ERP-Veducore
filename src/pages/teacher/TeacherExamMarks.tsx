import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ClipboardList, ChevronRight, Save, ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentsBySection,
  fetchStudentRecords,
  createStudentRecord,
  deleteStudentRecord,
  fetchSubjects,
} from '@/services/api';
import type { Teacher, ClassAssignment, Student, StudentRecord, Subject, ExamDef, RecordType } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

// ── localStorage helpers ──────────────────────────────────────────────────────

const EXAM_DEFS_KEY = (schoolId: string) => `veducore_exam_defs_${schoolId}`;

function loadExamDefs(schoolId: string): ExamDef[] {
  try {
    return JSON.parse(localStorage.getItem(EXAM_DEFS_KEY(schoolId)) ?? '[]') as ExamDef[];
  } catch {
    return [];
  }
}

function saveExamDefs(schoolId: string, defs: ExamDef[]): void {
  localStorage.setItem(EXAM_DEFS_KEY(schoolId), JSON.stringify(defs));
}

function seedExamDefsIfEmpty(schoolId: string, teacherId: string): void {
  const existing = loadExamDefs(schoolId);
  if (existing.length > 0) return;
  const defaults: ExamDef[] = [
    {
      id: 'examdef-001',
      exam_name: 'Unit Test 1',
      record_type: 'unit_test',
      max_marks: 50,
      section_id: 'sec-001',
      date: '2026-01-15',
      school_id: schoolId,
      created_by_teacher_id: teacherId,
    },
    {
      id: 'examdef-002',
      exam_name: 'Mid Term',
      record_type: 'mid_term',
      max_marks: 100,
      section_id: 'sec-001',
      date: '2026-03-10',
      school_id: schoolId,
      created_by_teacher_id: teacherId,
    },
    {
      id: 'examdef-003',
      exam_name: 'Final Exam',
      record_type: 'final_exam',
      max_marks: 100,
      section_id: 'sec-001',
      date: '2026-05-20',
      school_id: schoolId,
      created_by_teacher_id: teacherId,
    },
  ];
  saveExamDefs(schoolId, defaults);
}

type View = 'list' | 'enter-marks';

export default function TeacherExamMarks() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allRecords, setAllRecords] = useState<StudentRecord[]>([]);
  const [examDefs, setExamDefs] = useState<ExamDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Create exam modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [examDefForm, setExamDefForm] = useState({
    exam_name: '',
    record_type: 'unit_test',
    max_marks: '50',
    section_id: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Enter marks view
  const [view, setView] = useState<View>('list');
  const [selectedExamDef, setSelectedExamDef] = useState<ExamDef | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [sectionStudents, setSectionStudents] = useState<Student[]>([]);
  const [marksInput, setMarksInput] = useState<Record<string, string>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [submittingMarks, setSubmittingMarks] = useState(false);

  // Delete
  const [deleteExamId, setDeleteExamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profile?.id || !profile?.school_id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const [a, r, s] = await Promise.all([
          fetchTeacherAssignments(t.id),
          fetchStudentRecords({ teacherId: t.id }),
          fetchSubjects(profile.school_id),
        ]);
        setAssignments(a);
        setAllRecords(r);
        setSubjects(s);
        // Seed ExamDefs if this is the first load
        seedExamDefsIfEmpty(profile.school_id, t.id);
        setExamDefs(loadExamDefs(profile.school_id));
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-read ExamDefs when school changes (covers hot reload edge cases)
  useEffect(() => {
    if (profile?.school_id) setExamDefs(loadExamDefs(profile.school_id));
  }, [profile?.school_id]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const uniqueSections = assignments.reduce(
    (acc: { id: string; label: string }[], a) => {
      if (!acc.find((x) => x.id === a.section_id)) {
        acc.push({ id: a.section_id, label: `${a.class?.name} - ${a.section?.name}` });
      }
      return acc;
    },
    []
  );

  const assignedSectionIds = new Set(assignments.map((a) => a.section_id));
  const visibleExamDefs = examDefs
    .filter((d) => assignedSectionIds.has(d.section_id))
    .sort((a, b) => b.date.localeCompare(a.date));

  // ── Helpers ────────────────────────────────────────────────────────────────

  function sectionLabelFor(sectionId: string): string {
    const a = assignments.find((x) => x.section_id === sectionId);
    return a ? `${a.class?.name ?? ''} - ${a.section?.name ?? ''}` : sectionId;
  }

  function getSubjectsForExam(examDef: ExamDef): Subject[] {
    const isClassTeacher = assignments.some(
      (a) => a.section_id === examDef.section_id && (a.is_class_teacher === true || !a.subject_id)
    );
    if (isClassTeacher) return subjects;
    return subjects.filter((sub) =>
      assignments.some(
        (a) => a.section_id === examDef.section_id && a.subject_id === sub.id
      )
    );
  }

  function countMarked(examDef: ExamDef, subject: Subject): number {
    return allRecords.filter(
      (r) => r.exam_name === examDef.exam_name && r.subject_id === subject.id
    ).length;
  }

  function getRecordTypeLabel(rt: string) {
    const labels: Record<string, string> = {
      unit_test: 'Unit Test',
      mid_term: 'Mid Term',
      final_exam: 'Final Exam',
      assignment: 'Assignment',
      practical: 'Practical',
    };
    return labels[rt] || rt;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleCreateExam() {
    if (!teacher || !profile?.school_id || !examDefForm.exam_name.trim() || !examDefForm.section_id) {
      toast('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const newDef: ExamDef = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36),
        exam_name: examDefForm.exam_name.trim(),
        record_type: examDefForm.record_type,
        max_marks: parseFloat(examDefForm.max_marks) || 50,
        section_id: examDefForm.section_id,
        date: examDefForm.date,
        school_id: profile.school_id,
        created_by_teacher_id: teacher.id,
      };
      const updated = [...examDefs, newDef];
      saveExamDefs(profile.school_id, updated);
      setExamDefs(updated);
      setCreateModalOpen(false);
      setExamDefForm({
        exam_name: '',
        record_type: 'unit_test',
        max_marks: '50',
        section_id: uniqueSections[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
      });
      toast('Exam created', 'success');
    } finally {
      setSaving(false);
    }
  }

  async function openEnterMarks(examDef: ExamDef, subject: Subject) {
    setSelectedExamDef(examDef);
    setSelectedSubject(subject);
    setView('enter-marks');
    const students = await fetchStudentsBySection(examDef.section_id);
    setSectionStudents(students);
    const existing = allRecords.filter(
      (r) => r.exam_name === examDef.exam_name && r.subject_id === subject.id
    );
    const marks: Record<string, string> = {};
    const comments: Record<string, string> = {};
    for (const r of existing) {
      marks[r.student_id] = String(r.marks);
      comments[r.student_id] = r.teacher_comment || '';
    }
    setMarksInput(marks);
    setCommentInput(comments);
  }

  async function handleSaveMarks() {
    if (!teacher || !profile?.school_id || !selectedExamDef || !selectedSubject) return;
    setSubmittingMarks(true);
    try {
      const existing = allRecords.filter(
        (r) => r.exam_name === selectedExamDef.exam_name && r.subject_id === selectedSubject.id
      );
      for (const r of existing) {
        await deleteStudentRecord(r.id);
      }
      for (const student of sectionStudents) {
        const marksVal = marksInput[student.id];
        if (marksVal === undefined || marksVal === '') continue;
        const parsed = parseFloat(marksVal);
        if (isNaN(parsed)) continue;
        await createStudentRecord({
          school_id: profile.school_id,
          student_id: student.id,
          teacher_id: teacher.id,
          subject_id: selectedSubject.id,
          subject_name: selectedSubject.name,
          record_type: selectedExamDef.record_type as RecordType,
          exam_name: selectedExamDef.exam_name,
          marks: parsed,
          max_marks: selectedExamDef.max_marks,
          date: selectedExamDef.date,
          teacher_comment: commentInput[student.id] || undefined,
        });
      }
      toast('Marks saved successfully', 'success');
      await loadData();
      setView('list');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save marks', 'error');
    } finally {
      setSubmittingMarks(false);
    }
  }

  async function handleDeleteExam() {
    if (!deleteExamId || !profile?.school_id) return;
    const def = examDefs.find((d) => d.id === deleteExamId);
    if (!def) return;
    try {
      // Delete all records for this exam where student belongs to this section
      const toDelete = allRecords.filter(
        (r) => r.exam_name === def.exam_name && r.student?.section_id === def.section_id
      );
      for (const r of toDelete) {
        await deleteStudentRecord(r.id);
      }
      const updated = examDefs.filter((d) => d.id !== deleteExamId);
      saveExamDefs(profile.school_id, updated);
      setExamDefs(updated);
      toast('Exam deleted', 'success');
      await loadData();
    } catch {
      toast('Failed to delete exam', 'error');
    } finally {
      setDeleteExamId(null);
    }
  }

  // ── Enter Marks View ──────────────────────────────────────────────────────

  if (view === 'enter-marks' && selectedExamDef && selectedSubject) {
    const totalStudents = sectionStudents.length;
    const filled = sectionStudents.filter(
      (s) => marksInput[s.id] !== undefined && marksInput[s.id] !== ''
    ).length;

    return (
      <DashboardLayout title="Enter Marks">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Exams
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{selectedExamDef.exam_name}</h2>
                <p className="text-sm text-gray-500">
                  {selectedSubject.name} &middot; {sectionLabelFor(selectedExamDef.section_id)} &middot;{' '}
                  {getRecordTypeLabel(selectedExamDef.record_type)}
                </p>
                <p className="text-sm text-gray-500">
                  Max Marks: {selectedExamDef.max_marks} &middot; Date: {formatDate(selectedExamDef.date)}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-3 sm:mt-0">
                <span className="text-sm text-gray-500">
                  {filled}/{totalStudents} filled
                </span>
                <Button
                  onClick={handleSaveMarks}
                  loading={submittingMarks}
                  icon={<Save className="h-4 w-4" />}
                >
                  Save Marks
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600 w-8">#</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Student Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Adm. No.</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 w-32">
                    Marks{' '}
                    <span className="font-normal text-gray-400">/ {selectedExamDef.max_marks}</span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Comment (optional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sectionStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{student.full_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{student.admission_number}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={selectedExamDef.max_marks}
                        value={marksInput[student.id] || ''}
                        onChange={(e) =>
                          setMarksInput({ ...marksInput, [student.id]: e.target.value })
                        }
                        className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={commentInput[student.id] || ''}
                        onChange={(e) =>
                          setCommentInput({ ...commentInput, [student.id]: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        placeholder="Optional comment..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-gray-100 px-4 py-3">
              <Button
                onClick={handleSaveMarks}
                loading={submittingMarks}
                icon={<Save className="h-4 w-4" />}
              >
                Save All Marks
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Exam List View ────────────────────────────────────────────────────────

  return (
    <DashboardLayout title="Exam Marks">
      <div className="space-y-6">
        <PageHeader
          title="Exam Marks"
          description="Create exams and enter student marks per subject"
          action={
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setExamDefForm({
                  exam_name: '',
                  record_type: 'unit_test',
                  max_marks: '50',
                  section_id: uniqueSections[0]?.id || '',
                  date: new Date().toISOString().split('T')[0],
                });
                setCreateModalOpen(true);
              }}
            >
              Create Exam
            </Button>
          }
        />

        {loading ? (
          <LoadingSpinner />
        ) : visibleExamDefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <ClipboardList className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No exams created yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Click &ldquo;Create Exam&rdquo; to add Unit Test 1, Mid Term, Final Exam etc.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleExamDefs.map((def) => {
              const subjectsForExam = getSubjectsForExam(def);
              return (
                <div
                  key={def.id}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{def.exam_name}</p>
                      <Badge variant="info">{getRecordTypeLabel(def.record_type)}</Badge>
                      <span className="text-xs text-gray-500">{sectionLabelFor(def.section_id)}</span>
                      <span className="text-xs text-gray-400">&middot; Max: {def.max_marks}</span>
                      <span className="text-xs text-gray-400">&middot; {formatDate(def.date)}</span>
                    </div>
                    <button
                      onClick={() => setDeleteExamId(def.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Delete exam"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Subject rows */}
                  {subjectsForExam.length === 0 ? (
                    <div className="px-5 py-3 text-xs text-gray-400">
                      No subjects assigned for this section.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {subjectsForExam.map((sub) => {
                        const marked = countMarked(def, sub);
                        return (
                          <div
                            key={sub.id}
                            className="flex items-center gap-4 px-5 py-3 hover:bg-blue-50/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-800">{sub.name}</span>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {marked} student{marked !== 1 ? 's' : ''} marked
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<ChevronRight className="h-3.5 w-3.5" />}
                              onClick={() => openEnterMarks(def, sub)}
                            >
                              Enter Marks
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Exam Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Exam"
        description="Set exam details. You'll enter marks per subject after creating."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateExam} loading={saving}>
              Create Exam
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Exam Name"
            required
            value={examDefForm.exam_name}
            onChange={(e) => setExamDefForm({ ...examDefForm, exam_name: e.target.value })}
            placeholder="e.g. Unit Test 1, Mid Term, Final Exam"
          />
          <Select
            label="Exam Type"
            required
            value={examDefForm.record_type}
            onChange={(e) => setExamDefForm({ ...examDefForm, record_type: e.target.value })}
          >
            <option value="unit_test">Unit Test</option>
            <option value="mid_term">Mid Term</option>
            <option value="final_exam">Final Exam</option>
            <option value="assignment">Assignment</option>
            <option value="practical">Practical</option>
          </Select>
          <Select
            label="Section"
            required
            value={examDefForm.section_id}
            onChange={(e) => setExamDefForm({ ...examDefForm, section_id: e.target.value })}
          >
            <option value="">Select section...</option>
            {uniqueSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Max Marks"
              type="number"
              required
              value={examDefForm.max_marks}
              onChange={(e) => setExamDefForm({ ...examDefForm, max_marks: e.target.value })}
              placeholder="50"
            />
            <Input
              label="Exam Date"
              type="date"
              required
              value={examDefForm.date}
              onChange={(e) => setExamDefForm({ ...examDefForm, date: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteExamId}
        onClose={() => setDeleteExamId(null)}
        onConfirm={handleDeleteExam}
        title="Delete Exam"
        message="This will delete all marks for this exam. This action cannot be undone."
        confirmText="Delete Exam"
        variant="danger"
      />
    </DashboardLayout>
  );
}
