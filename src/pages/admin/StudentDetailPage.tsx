import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, ClipboardList, IndianRupee, FileText, Megaphone, BookOpen, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchStudentById, fetchAttendance, fetchStudentRecords, fetchRemarks, fetchFees } from '@/services/api';
import type { Student, Attendance, StudentRecord, Remark, Fee } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

type Tab = 'overview' | 'academic' | 'attendance' | 'fees' | 'remarks' | 'class' | 'parent';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, a, r, rm, f] = await Promise.all([
        fetchStudentById(id),
        fetchAttendance({ studentId: id }),
        fetchStudentRecords({ studentId: id }),
        fetchRemarks({ studentId: id }),
        fetchFees({ studentId: id }),
      ]);
      setStudent(s);
      setAttendance(a);
      setRecords(r);
      setRemarks(rm);
      setFees(f);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'academic', label: 'Academic Records', icon: FileText },
    { key: 'attendance', label: 'Attendance', icon: ClipboardList },
    { key: 'fees', label: 'Fees', icon: IndianRupee },
    { key: 'remarks', label: 'Remarks', icon: Megaphone },
    { key: 'class', label: 'Class Info', icon: BookOpen },
    { key: 'parent', label: 'Parent Info', icon: Users },
  ];

  if (loading) return <DashboardLayout title="Student Profile"><LoadingSpinner /></DashboardLayout>;
  if (!student) return (
    <DashboardLayout title="Student Profile">
      <Card className="p-8 text-center"><p className="text-gray-500">Student not found</p></Card>
    </DashboardLayout>
  );

  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const totalFees = fees.reduce((sum, f) => sum + Number(f.amount), 0);
  const totalPaid = fees.reduce((sum, f) => sum + Number(f.paid_amount), 0);

  return (
    <DashboardLayout title="Student Profile">
      <div className="space-y-6">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/admin/students')}>Back to Students</Button>

        {/* Header */}
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700 overflow-hidden">
              {student.avatar_url ? (
                <img src={student.avatar_url} alt={student.full_name} className="h-full w-full rounded-full object-cover" />
              ) : (
                student.full_name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{student.full_name}</h2>
              <p className="text-sm text-gray-500">{student.admission_number} &middot; {student.class?.name} - {student.section?.name}</p>
              <div className="mt-1"><StatusBadge status={student.status} /></div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4"><p className="text-sm text-gray-500">Attendance Rate</p><p className="text-2xl font-bold text-emerald-600">{attendanceRate}%</p></Card>
            <Card className="p-4"><p className="text-sm text-gray-500">Total Fees</p><p className="text-2xl font-bold text-gray-900">{formatCurrency(totalFees, '₹')}</p></Card>
            <Card className="p-4"><p className="text-sm text-gray-500">Total Paid</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid, '₹')}</p></Card>
            <Card className="p-4"><p className="text-sm text-gray-500">Academic Records</p><p className="text-2xl font-bold text-blue-600">{records.length}</p></Card>
          </div>
        )}

        {tab === 'academic' && (
          <Card className="p-4">
            {records.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No academic records</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200"><tr>
                    <th className="px-3 py-2 font-semibold text-gray-600">Subject</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Exam</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Marks</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.subject_name}</td>
                        <td className="px-3 py-2 text-gray-700 capitalize">{r.exam_name}</td>
                        <td className="px-3 py-2 text-gray-700">{r.marks}/{r.max_marks}</td>
                        <td className="px-3 py-2 text-gray-700">{r.grade || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{formatDate(r.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'attendance' && (
          <Card className="p-4">
            {attendance.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No attendance records</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200"><tr>
                    <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Notes</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendance.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{formatDate(a.attendance_date)}</td>
                        <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                        <td className="px-3 py-2 text-gray-500">{a.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'fees' && (
          <Card className="p-4">
            {fees.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No fee records</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200"><tr>
                    <th className="px-3 py-2 font-semibold text-gray-600">Fee Type</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Paid</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Due Date</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {fees.map((f) => (
                      <tr key={f.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{f.fee_type}</td>
                        <td className="px-3 py-2 text-gray-700">{formatCurrency(f.amount, '₹')}</td>
                        <td className="px-3 py-2 text-gray-700">{formatCurrency(f.paid_amount, '₹')}</td>
                        <td className="px-3 py-2 text-gray-700">{formatDate(f.due_date)}</td>
                        <td className="px-3 py-2"><StatusBadge status={f.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {tab === 'remarks' && (
          <Card className="p-4">
            {remarks.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No remarks</p> : (
              <div className="space-y-3">
                {remarks.map((r) => (
                  <div key={r.id} className="rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 capitalize">{r.category}</span>
                      <span className="text-xs text-gray-400">&middot; {formatDate(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700">{r.remark}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === 'class' && (
          <Card className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><p className="text-sm text-gray-500">Class</p><p className="font-medium text-gray-900">{student.class?.name || '—'}</p></div>
              <div><p className="text-sm text-gray-500">Section</p><p className="font-medium text-gray-900">{student.section?.name || '—'}</p></div>
              <div><p className="text-sm text-gray-500">Roll Number</p><p className="font-medium text-gray-900">{student.roll_number || '—'}</p></div>
              <div><p className="text-sm text-gray-500">Section Capacity</p><p className="font-medium text-gray-900">{student.section?.capacity || '—'}</p></div>
            </div>
          </Card>
        )}

        {tab === 'parent' && (
          <Card className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><p className="text-sm text-gray-500">Date of Birth</p><p className="font-medium text-gray-900">{formatDate(student.date_of_birth)}</p></div>
              <div><p className="text-sm text-gray-500">Gender</p><p className="font-medium text-gray-900 capitalize">{student.gender || '—'}</p></div>
              <div><p className="text-sm text-gray-500">Father's Name</p><p className="font-medium text-gray-900">{student.father_name || '—'}</p></div>
              <div><p className="text-sm text-gray-500">Admission Date</p><p className="font-medium text-gray-900">{formatDate(student.admission_date)}</p></div>
              <div><p className="text-sm text-gray-500">Address</p><p className="font-medium text-gray-900">{student.address || '—'}</p></div>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
