import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, ChevronRight, Save, ArrowLeft, Lock } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentsBySection,
  createStudentRecord,
  deleteStudentRecord,
  fetchSubjects,
  fetchExamDefs,
  fetchExamScheduleFor,
  fetchRecordsForExamSubject,
  fetchExamStatuses,
  fetchRecordsForSections,
} from '@/services/api';
import type { Teacher, ClassAssignment, Student, StudentRecord, Subject, ExamDef, RecordType, ExamScheduleRow } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

type View = 'list' | 'enter-marks';

export default function TeacherExamMarks() {
  const { profile } = useAuth();
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allRecords, setAllRecords] = useState<StudentRecord[]>([]);
  const [examDefs, setExamDefs] = useState<ExamDef[]>([]);
  const [examStatus, setExamStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Enter marks view
  const [view, setView] = useState<View>('list');
  const [selectedExamDef, setSelectedExamDef] = useState<ExamDef | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [sectionStudents, setSectionStudents] = useState<Student[]>([]);
  const [marksInput, setMarksInput] = useState<Record<string, string>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [submittingMarks, setSubmittingMarks] = useState(false);

  const [schedule, setSchedule] = useState<ExamScheduleRow[]>([]);
  const [selectedMax, setSelectedMax] = useState(100);

  const loadData = useCallback(async () => {
    if (!profile?.id || !profile?.school_id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const [a, s, defs] = await Promise.all([
          fetchTeacherAssignments(t.id),
          fetchSubjects(profile.school_id),
          fetchExamDefs({ schoolId: profile.school_id }),
        ]);
        setAssignments(a);
        setSubjects(s);
        setExamDefs(defs);
        // Marks for the teacher's sections, whoever entered them (admin, co-teacher).
        const sectionIds = new Set(a.map((x) => x.section_id));
        setAllRecords(await fetchRecordsForSections([...sectionIds]));
        const ids = [...new Set(defs.map((d) => d.exam_id).filter(Boolean))] as string[];
        const [st, sch] = await Promise.all([fetchExamStatuses(ids).catch(() => ({})), fetchExamScheduleFor(ids).catch(() => [])]);
        setExamStatus(st);
        setSchedule(sch);
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

  const isLocked = (d: ExamDef | null) => !!d?.exam_id && examStatus[d.exam_id] === 'published';

  // ── Derived ────────────────────────────────────────────────────────────────


  const assignedSectionIds = new Set(assignments.map((a) => a.section_id));
  // Exams are scheduled by the office; teachers only enter marks.
  const visibleExamDefs = examDefs
    .filter((d) => d.exam_id && assignedSectionIds.has(d.section_id))
    .sort((a, b) => b.date.localeCompare(a.date));

  // ── Helpers ────────────────────────────────────────────────────────────────

  function sectionLabelFor(sectionId: string): string {
    const a = assignments.find((x) => x.section_id === sectionId);
    return a ? `${a.class?.name ?? ''} - ${a.section?.name ?? ''}` : sectionId;
  }

  function classIdOf(sectionId: string) {
    return assignments.find((a) => a.section_id === sectionId)?.class_id;
  }

  function scheduleRow(examDef: ExamDef, subjectId: string) {
    const classId = classIdOf(examDef.section_id);
    return schedule.find((r) => r.exam_id === examDef.exam_id && r.class_id === classId && r.subject_id === subjectId);
  }

  /** Class teacher: every subject of the section. Subject teacher: only their subjects. Limited to the datesheet. */
  function getSubjectsForExam(examDef: ExamDef): Subject[] {
    const isClassTeacher = assignments.some((a) => a.section_id === examDef.section_id && !a.subject_id);
    const mine = isClassTeacher
      ? subjects.filter((sub) => sub.section_ids.includes(examDef.section_id))
      : subjects.filter((sub) => assignments.some((a) => a.section_id === examDef.section_id && a.subject_id === sub.id));
    const classId = classIdOf(examDef.section_id);
    const scheduled = schedule.filter((r) => r.exam_id === examDef.exam_id && r.class_id === classId);
    return scheduled.length ? mine.filter((sub) => scheduled.some((r) => r.subject_id === sub.id)) : mine;
  }

  function maxFor(examDef: ExamDef, subjectId: string) {
    return Number(scheduleRow(examDef, subjectId)?.max_marks ?? examDef.max_marks);
  }

  function countMarked(examDef: ExamDef, subject: Subject): number {
    return allRecords.filter(
      (r) => r.exam_name.toLowerCase() === examDef.exam_name.toLowerCase()
        && r.subject_id === subject.id
        && r.student?.section_id === examDef.section_id
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

  async function openEnterMarks(examDef: ExamDef, subject: Subject) {
    setSelectedExamDef(examDef);
    setSelectedSubject(subject);
    setSelectedMax(maxFor(examDef, subject.id));
    setView('enter-marks');
    const students = await fetchStudentsBySection(examDef.section_id);
    setSectionStudents(students);
    const existing = await fetchRecordsForExamSubject(examDef.exam_name, subject.id, students.map((s) => s.id));
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
      // Only this section's marks for this exam + subject are replaced.
      const existing = await fetchRecordsForExamSubject(
        selectedExamDef.exam_name, selectedSubject.id, sectionStudents.map((s) => s.id));
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
          max_marks: selectedMax,
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
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Exams
            </button>
          </div>

          <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{selectedExamDef.exam_name}</h2>
                <p className="text-sm text-slate-500">
                  {selectedSubject.name} &middot; {sectionLabelFor(selectedExamDef.section_id)} &middot;{' '}
                  {getRecordTypeLabel(selectedExamDef.record_type)}
                </p>
                <p className="text-sm text-slate-500">
                  Max Marks: {selectedMax} &middot; Date: {formatDate(selectedExamDef.date)}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-3 sm:mt-0">
                <span className="text-sm text-slate-500">
                  {filled}/{totalStudents} filled
                </span>
                <Button
                  onClick={handleSaveMarks}
                  disabled={isLocked(selectedExamDef)}
                  loading={submittingMarks}
                  icon={<Save className="h-4 w-4" />}
                >
                  Save Marks
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-600 w-8">#</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Student Name</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Adm. No.</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 w-32">
                    Marks{' '}
                    <span className="font-normal text-slate-400">/ {selectedMax}</span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Comment (optional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sectionStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{student.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{student.admission_number}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={selectedMax}
                        value={marksInput[student.id] || ''}
                        onChange={(e) =>
                          setMarksInput({ ...marksInput, [student.id]: e.target.value })
                        }
                        className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        placeholder="Optional comment..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-slate-100 px-4 py-3">
              <Button
                onClick={handleSaveMarks}
                disabled={isLocked(selectedExamDef)}
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
          description="Exams are scheduled by the office. Class teachers enter marks for every subject of their class; subject teachers for their own subjects."
        />

        {loading ? (
          <LoadingSpinner />
        ) : visibleExamDefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center">
            <ClipboardList className="h-12 w-12 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600">No exams scheduled yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Exams appear here once the office adds them with a datesheet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleExamDefs.map((def) => {
              const subjectsForExam = getSubjectsForExam(def);
              return (
                <div
                  key={def.id}
                  className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(91,110,232,0.08)] overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{def.exam_name}</p>
                      <Badge variant="info">{getRecordTypeLabel(def.record_type)}</Badge>
                      <span className="text-xs text-slate-500">{sectionLabelFor(def.section_id)}</span>
                      <span className="text-xs text-slate-400">&middot; {formatDate(def.date)}</span>
                      {def.exam_id && <Badge variant="default">School exam</Badge>}
                      {isLocked(def) && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Lock className="h-3 w-3" /> Results published</span>}
                    </div>
                  </div>

                  {/* Subject rows */}
                  {subjectsForExam.length === 0 ? (
                    <div className="px-5 py-3 text-xs text-slate-400">
                      No subjects assigned for this section.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {subjectsForExam.map((sub) => {
                        const marked = countMarked(def, sub);
                        return (
                          <div
                            key={sub.id}
                            className="flex items-center gap-4 px-5 py-3 hover:bg-brand-50/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-800">{sub.name}</span>
                            </div>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {marked} student{marked !== 1 ? 's' : ''} marked
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<ChevronRight className="h-3.5 w-3.5" />}
                              onClick={() => openEnterMarks(def, sub)}
                            >
                              {isLocked(def) ? 'View Marks' : 'Enter Marks'}
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
    </DashboardLayout>
  );
}
