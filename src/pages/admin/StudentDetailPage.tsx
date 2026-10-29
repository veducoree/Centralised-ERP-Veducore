import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, ClipboardList, IndianRupee, FileText, Megaphone, BookOpen, Users, Copy, Eye, EyeOff, CheckCircle, KeyRound } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { fetchStudentById, fetchAttendance, fetchStudentRecords, fetchRemarks, fetchFees, ensureParentForStudent } from '@/services/api';
import type { Student, Attendance, StudentRecord, Remark, Fee } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';

type Tab = 'overview' | 'academic' | 'attendance' | 'fees' | 'remarks' | 'class' | 'parent';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  // Parent credentials & account state
  const [parentData, setParentData] = useState<{ parent: any; relationship: string } | null>(null);
  const [parentPwVisible, setParentPwVisible] = useState(false);
  const [parentCopied, setParentCopied] = useState(false);
  const [provisioningParent, setProvisioningParent] = useState(false);

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

      // Fetch linked parent and credentials
      try {
        const { data: parentLinks } = await supabase
          .from('parent_students')
          .select('*, parent:parents(*)')
          .eq('student_id', id);

        if (parentLinks && parentLinks.length > 0 && parentLinks[0].parent) {
          setParentData({
            parent: parentLinks[0].parent,
            relationship: parentLinks[0].relationship || 'Parent',
          });
        } else {
          setParentData(null);
        }
      } catch (pErr) {
        console.error('Error fetching parent in StudentDetailPage:', pErr);
      }
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

  if (loading) return <DashboardLayout title="Student Profile"><LoadingSpinner variant="profile" /></DashboardLayout>;
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
          <div className="space-y-6">
            {/* Parent Account Credentials Card */}
            <Card className="p-6 border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Parent Portal Credentials</h3>
                    <p className="text-xs text-gray-500">Login credentials for the parent portal & mobile app</p>
                  </div>
                </div>
                {parentData && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-2xs"
                    onClick={() => {
                      const text = `Parent Login Credentials\nStudent: ${student.full_name} (${student.admission_number})\nParent: ${parentData.parent.full_name}\nUsername: ${parentData.parent.email}\nPassword: ${parentData.parent.password || ''}\nPortal: Veducore Parent App / Web`;
                      navigator.clipboard.writeText(text);
                      toast('Parent credentials copied to clipboard', 'success');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy All Credentials
                  </Button>
                )}
              </div>

              {parentData ? (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-1.5">
                    <p className="text-xs font-medium text-gray-500">Parent / Guardian Name</p>
                    <p className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                      {parentData.parent.full_name}
                      <span className="text-xs font-normal text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full capitalize">
                        {parentData.relationship}
                      </span>
                    </p>
                    {parentData.parent.phone && (
                      <p className="text-xs text-gray-500">Phone: {parentData.parent.phone}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3.5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-cyan-800">Login Username:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-white px-2 py-0.5 font-mono font-semibold text-cyan-900 border border-cyan-200 text-xs">
                          {parentData.parent.email}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(parentData.parent.email);
                            toast('Username copied', 'success');
                          }}
                          className="rounded p-1 text-cyan-600 hover:bg-white hover:text-cyan-800 transition-colors"
                          title="Copy username"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-cyan-800">Portal Password:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-white px-2 py-0.5 font-mono font-semibold text-gray-900 border border-cyan-200 text-xs">
                          {parentPwVisible ? (parentData.parent.password || '(not set)') : '••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => setParentPwVisible((v) => !v)}
                          className="rounded p-1 text-cyan-600 hover:bg-white hover:text-cyan-800 transition-colors"
                          title={parentPwVisible ? 'Hide password' : 'Show password'}
                        >
                          {parentPwVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(parentData.parent.password || '');
                            setParentCopied(true);
                            toast('Password copied', 'success');
                            setTimeout(() => setParentCopied(false), 1500);
                          }}
                          className="rounded p-1 text-cyan-600 hover:bg-white hover:text-cyan-800 transition-colors"
                          title="Copy password"
                        >
                          {parentCopied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between rounded-xl bg-amber-50 border border-amber-200 p-4 gap-3">
                  <div className="text-xs text-amber-800">
                    <p className="font-semibold mb-0.5">No parent account linked yet</p>
                    <p>Click below to automatically generate a parent portal account for this student.</p>
                  </div>
                  <Button
                    size="sm"
                    loading={provisioningParent}
                    onClick={async () => {
                      setProvisioningParent(true);
                      try {
                        await ensureParentForStudent(student);
                        toast('Parent account created and linked successfully!', 'success');
                        await loadData();
                      } catch (err) {
                        toast('Failed to provision parent account', 'error');
                      } finally {
                        setProvisioningParent(false);
                      }
                    }}
                  >
                    Auto-Provision Parent Account
                  </Button>
                </div>
              )}
            </Card>

            {/* General Profile Info */}
            <Card className="p-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Student & Family Information</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><p className="text-sm text-gray-500">Father's Name</p><p className="font-medium text-gray-900">{student.father_name || '—'}</p></div>
                <div><p className="text-sm text-gray-500">Mother's Name</p><p className="font-medium text-gray-900">{(student as any).mother_name || '—'}</p></div>
                <div><p className="text-sm text-gray-500">Date of Birth</p><p className="font-medium text-gray-900">{formatDate(student.date_of_birth)}</p></div>
                <div><p className="text-sm text-gray-500">Gender</p><p className="font-medium text-gray-900 capitalize">{student.gender || '—'}</p></div>
                <div><p className="text-sm text-gray-500">Admission Date</p><p className="font-medium text-gray-900">{formatDate(student.admission_date)}</p></div>
                <div><p className="text-sm text-gray-500">Emergency Contact</p><p className="font-medium text-gray-900">{(student as any).emergency_contact || '—'}</p></div>
                <div className="sm:col-span-2"><p className="text-sm text-gray-500">Address</p><p className="font-medium text-gray-900">{student.address || '—'}</p></div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
