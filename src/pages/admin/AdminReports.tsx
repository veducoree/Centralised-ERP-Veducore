import { useEffect, useState, useCallback } from 'react';
import { FileText, Printer, Download } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudents, fetchTeachers, fetchClasses, fetchFees, fetchAttendance, fetchStudentRecords } from '@/services/api';
import type { Student, Teacher, Fee, Attendance, StudentRecord } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

type ReportType = 'student' | 'attendance' | 'fee' | 'academic';

export default function AdminReports() {
  const { profile } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('student');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);

  const loadData = useCallback(async () => {
    if (!profile?.school_id) return;
    setLoading(true);
    try {
      const [s, t, f, a, r] = await Promise.all([
        fetchStudents(profile.school_id),
        fetchTeachers(profile.school_id),
        fetchFees({ schoolId: profile.school_id }),
        fetchAttendance({ schoolId: profile.school_id }),
        fetchStudentRecords({ schoolId: profile.school_id }),
      ]);
      setStudents(s);
      setTeachers(t);
      setFees(f);
      setAttendance(a);
      setRecords(r);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.school_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalCollected = fees.reduce((sum, f) => sum + Number(f.paid_amount), 0);
  const totalOutstanding = fees.reduce((sum, f) => sum + Number(f.remaining_amount), 0);
  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

  return (
    <DashboardLayout title="Reports">
      <div className="space-y-6">
        <PageHeader title="Reports" description="Generate and view school-wide reports"
          action={<Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Students" value={students.length} color="blue" />
          <StatCard label="Total Teachers" value={teachers.length} color="emerald" />
          <StatCard label="Attendance Rate" value={`${attendanceRate}%`} color="amber" />
          <StatCard label="Fee Collected" value={formatCurrency(totalCollected, '₹')} color="cyan" />
        </div>

        <Card className="p-4">
          <Select label="Report Type" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="sm:w-64">
            <option value="student">Student Report</option>
            <option value="attendance">Attendance Report</option>
            <option value="fee">Fee Report</option>
            <option value="academic">Academic Performance Report</option>
          </Select>
        </Card>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <Card className="p-5">
            {reportType === 'student' && (
              <>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Student Report</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-gray-600">Adm. No.</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Class</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Gender</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{s.admission_number}</td>
                          <td className="px-3 py-2 text-gray-700">{s.full_name}</td>
                          <td className="px-3 py-2 text-gray-700">{s.class?.name} - {s.section?.name}</td>
                          <td className="px-3 py-2 text-gray-700 capitalize">{s.gender || '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportType === 'attendance' && (
              <>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Attendance Report</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-gray-600">Student</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {attendance.slice(0, 50).map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{a.student?.full_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{formatDate(a.attendance_date)}</td>
                          <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportType === 'fee' && (
              <>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Fee Report</h3>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-600">Collected</p><p className="text-lg font-bold text-emerald-700">{formatCurrency(totalCollected, '₹')}</p></div>
                  <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-600">Outstanding</p><p className="text-lg font-bold text-red-700">{formatCurrency(totalOutstanding, '₹')}</p></div>
                  <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-600">Total Records</p><p className="text-lg font-bold text-blue-700">{fees.length}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-gray-600">Student</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Fee Type</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Amount</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Paid</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {fees.slice(0, 50).map((f) => (
                        <tr key={f.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{f.student?.full_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{f.fee_type}</td>
                          <td className="px-3 py-2 text-gray-700">{formatCurrency(f.amount, '₹')}</td>
                          <td className="px-3 py-2 text-gray-700">{formatCurrency(f.paid_amount, '₹')}</td>
                          <td className="px-3 py-2"><StatusBadge status={f.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportType === 'academic' && (
              <>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Academic Performance Report</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-gray-600">Student</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Subject</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Exam</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Marks</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {records.slice(0, 50).map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{r.student?.full_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{r.subject_name}</td>
                          <td className="px-3 py-2 text-gray-700 capitalize">{r.exam_name}</td>
                          <td className="px-3 py-2 text-gray-700">{r.marks}/{r.max_marks}</td>
                          <td className="px-3 py-2 text-gray-700">{r.grade || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{formatDate(r.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
