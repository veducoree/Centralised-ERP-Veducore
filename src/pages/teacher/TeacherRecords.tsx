import { useEffect, useState, useCallback } from 'react';
import { FileText, TrendingUp, CheckCircle, ArrowUpCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchTeacherByUserId,
  fetchTeacherAssignments,
  fetchStudentRecords,
  fetchStudentsBySection,
  fetchClasses,
  updateStudent,
} from '@/services/api';
import type { Teacher, ClassAssignment, StudentRecord, Student, Class, Section } from '@/types';

export default function TeacherRecords() {
  const { profile } = useAuth();
  const toast = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<(Class & { sections: Section[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [confirmPromoteOpen, setConfirmPromoteOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (t) {
        setTeacher(t);
        const a = await fetchTeacherAssignments(t.id);
        setAssignments(a);
        const firstSection = a.length > 0 ? a[0].section_id : '';
        setSelectedSection(prev => prev || firstSection);
        const r = await fetchStudentRecords({ teacherId: t.id });
        setRecords(r);
        const cls = await fetchClasses(t.school_id);
        setAllClasses(cls);
        if (firstSection) {
          const sts = await fetchStudentsBySection(firstSection);
          setStudents(sts);
        }
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch students when selected section changes
  useEffect(() => {
    if (!selectedSection) return;
    fetchStudentsBySection(selectedSection).then(setStudents).catch(() => {});
  }, [selectedSection]);

  const uniqueSections = assignments.reduce((acc: { id: string; label: string }[], a) => {
    if (!acc.find((x) => x.id === a.section_id))
      acc.push({ id: a.section_id, label: `${a.class?.name} - ${a.section?.name}` });
    return acc;
  }, []);

  // Records for the selected section
  const filteredRecords = selectedSection
    ? records.filter((r) => r.student && (r.student as Student).section_id === selectedSection)
    : records;

  // Unique exams ordered by date ascending
  const uniqueExams: { exam_name: string; record_type: string; date: string }[] = [];
  for (const r of filteredRecords) {
    if (!uniqueExams.find(e => e.exam_name === r.exam_name)) {
      uniqueExams.push({ exam_name: r.exam_name, record_type: r.record_type, date: r.date });
    }
  }
  uniqueExams.sort((a, b) => a.date.localeCompare(b.date));

  // Find the class_id for the currently selected section
  const sectionAssignment = assignments.find(a => a.section_id === selectedSection);
  const sectionClassId = sectionAssignment?.class_id ?? '';

  // Per-student row data
  type StudentRow = {
    student: Student;
    examMarks: Record<string, { marks: number; maxMarks: number } | null>;
    overallPct: number | null;
    result: 'Pass' | 'Fail' | null;
    isPromoted: boolean;
  };

  const studentRows: StudentRow[] = students.map(s => {
    const sRecords = filteredRecords.filter(r => r.student_id === s.id);
    const examMarks: Record<string, { marks: number; maxMarks: number } | null> = {};
    for (const exam of uniqueExams) {
      const matches = sRecords.filter(r => r.exam_name === exam.exam_name);
      if (matches.length === 0) {
        examMarks[exam.exam_name] = null;
      } else {
        examMarks[exam.exam_name] = {
          marks: matches.reduce((sum, r) => sum + r.marks, 0),
          maxMarks: matches.reduce((sum, r) => sum + r.max_marks, 0),
        };
      }
    }
    const allMarks = sRecords.reduce((sum, r) => sum + r.marks, 0);
    const allMaxMarks = sRecords.reduce((sum, r) => sum + r.max_marks, 0);
    const overallPct = allMaxMarks > 0 ? Math.round((allMarks / allMaxMarks) * 1000) / 10 : null;
    const result: 'Pass' | 'Fail' | null = overallPct === null ? null : overallPct >= 33 ? 'Pass' : 'Fail';
    const isPromoted = sectionClassId !== '' && s.class_id !== sectionClassId;
    return { student: s, examMarks, overallPct, result, isPromoted };
  });

  // Promote All button conditions
  const hasFinalExam = filteredRecords.some(r => r.record_type === 'final_exam');
  const allPromoted = studentRows.length > 0 && studentRows.every(row => row.isPromoted);

  function overallPctPill(pct: number | null): string {
    if (pct === null) return 'bg-gray-100 text-gray-500';
    if (pct >= 75) return 'bg-emerald-100 text-emerald-700';
    if (pct >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  }

  function getSectionLabel(): string {
    const a = assignments.find(x => x.section_id === selectedSection);
    return a ? `${a.class?.name} - ${a.section?.name}` : '';
  }

  function getTypeLabel(rt: string) {
    const m: Record<string, string> = {
      unit_test: 'Unit Test',
      mid_term: 'Mid Term',
      final_exam: 'Final Exam',
      assignment: 'Assignment',
      practical: 'Practical',
    };
    return m[rt] || rt;
  }

  async function handlePromoteAll() {
    if (!sectionClassId) {
      toast('Cannot determine current class', 'error');
      return;
    }
    const currentClass = allClasses.find(c => c.id === sectionClassId);
    if (!currentClass) {
      toast('Current class not found', 'error');
      return;
    }
    const sortedClasses = [...allClasses].sort((a, b) => (a.grade_level ?? 0) - (b.grade_level ?? 0));
    const nextClass = sortedClasses.find(c => (c.grade_level ?? 0) > (currentClass.grade_level ?? 0));
    if (!nextClass) {
      toast('No next class found', 'error');
      return;
    }
    if (!nextClass.sections || nextClass.sections.length === 0) {
      toast(`No sections in ${nextClass.name}`, 'error');
      return;
    }
    const targetSection = nextClass.sections[0];
    setPromoting(true);
    try {
      const nonPromoted = studentRows.filter(row => !row.isPromoted);
      await Promise.all(
        nonPromoted.map(row =>
          updateStudent(row.student.id, { class_id: nextClass.id, section_id: targetSection.id })
        )
      );
      await loadData();
      toast(`All students promoted to ${nextClass.name}`, 'success');
    } catch {
      toast('Failed to promote students', 'error');
    } finally {
      setPromoting(false);
    }
  }

  const nonPromotedCount = studentRows.filter(r => !r.isPromoted).length;

  const promoteBtn = (
    <Button
      variant="primary"
      size="sm"
      disabled={!hasFinalExam || allPromoted || promoting || studentRows.length === 0}
      loading={promoting}
      onClick={() => setConfirmPromoteOpen(true)}
    >
      <ArrowUpCircle className="h-4 w-4 mr-1.5" />
      {allPromoted ? 'All Promoted ✓' : 'Promote All to Next Class'}
    </Button>
  );

  return (
    <DashboardLayout title="Student Records">
      <div className="space-y-6">
        <PageHeader
          title="Academic Records"
          description="Records are created automatically when you save marks in Exam Marks"
          action={promoteBtn}
        />

        {uniqueSections.length > 0 && (
          <Card className="p-4">
            <Select
              label="Filter by Section"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              <option value="">All Sections</option>
              {uniqueSections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Card>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <FileText className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No academic records yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Go to <span className="font-medium text-blue-600">Exam Marks</span> → Create Exam → Save Marks to generate records automatically
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Student</th>
                  {uniqueExams.map(exam => (
                    <th key={exam.exam_name} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                      <div>{exam.exam_name}</div>
                      <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {getTypeLabel(exam.record_type)}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Overall %</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Result</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {studentRows.map(row => (
                  <tr key={row.student.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.student.full_name}</div>
                      <div className="text-xs text-gray-400">Roll {row.student.roll_number ?? '—'}</div>
                    </td>
                    {uniqueExams.map(exam => {
                      const m = row.examMarks[exam.exam_name];
                      const pct = m && m.maxMarks > 0 ? Math.round((m.marks / m.maxMarks) * 100) : null;
                      return (
                        <td key={exam.exam_name} className="px-4 py-3 text-gray-700">
                          {m === null ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span>
                              <span className="font-medium text-gray-900">{m.marks}</span>
                              <span className="text-gray-400">/{m.maxMarks}</span>
                              <span className="ml-1 text-xs text-gray-400">({pct}%)</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      {row.overallPct === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${overallPctPill(row.overallPct)}`}>
                          {row.overallPct}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.result === null ? (
                        <span className="text-gray-300">—</span>
                      ) : row.result === 'Pass' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle className="h-3 w-3" /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          Fail
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.isPromoted && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          <TrendingUp className="h-3 w-3" /> Promoted ↑
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Promote All confirmation */}
      <ConfirmDialog
        open={confirmPromoteOpen}
        onClose={() => setConfirmPromoteOpen(false)}
        onConfirm={handlePromoteAll}
        title="Promote All Students"
        message={`Promote all ${nonPromotedCount} students in ${getSectionLabel()} to next class?`}
        confirmText="Promote All"
        variant="default"
      />
    </DashboardLayout>
  );
}
