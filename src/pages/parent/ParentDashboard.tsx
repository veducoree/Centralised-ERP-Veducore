import { useEffect, useState, useCallback } from 'react';
import { Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { LoadingSpinner } from '@/components/ui/Primitives';
import { useAuth } from '@/auth/AuthContext';
import { fetchParentByUserId, fetchParentStudents, fetchAttendance, fetchFees, fetchStudentRecords, fetchRemarks } from '@/services/api';
import type { Parent, Student, Attendance, Fee, StudentRecord, Remark } from '@/types';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/Badge';

export default function ParentDashboard() {
  const { profile } = useAuth();
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const p = await fetchParentByUserId(profile.id);
      if (p) {
        setParent(p);
        const links = await fetchParentStudents(p.id);
        const kids = links.map((l) => l.student).filter(Boolean) as Student[];
        setChildren(kids);
        if (kids.length > 0 && !selectedChildId) setSelectedChildId(kids[0].id);
      }
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [profile?.id, selectedChildId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadChildData = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      const [a, f, r, rm] = await Promise.all([
        fetchAttendance({ studentId: selectedChildId }),
        fetchFees({ studentId: selectedChildId }),
        fetchStudentRecords({ studentId: selectedChildId }),
        fetchRemarks({ studentId: selectedChildId }),
      ]);
      setAttendance(a);
      setFees(f);
      setRecords(r);
      setRemarks(rm);
    } catch { /* handled */ }
  }, [selectedChildId]);

  useEffect(() => { loadChildData(); }, [loadChildData]);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const presentCount = attendance.filter((a) => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const pendingFees = fees.filter((f) => f.status !== 'paid').length;
  const latestRecord = records[0];
  const latestRemark = remarks[0];

  // Attendance ring chart values
  const ringRadius = 50;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringFill = (attendanceRate / 100) * ringCircumference;
  const ringColor = attendanceRate >= 85 ? '#10b981' : attendanceRate >= 70 ? '#f59e0b' : '#ef4444';
  const ringTextColor = attendanceRate >= 85 ? 'text-emerald-600' : attendanceRate >= 70 ? 'text-amber-600' : 'text-red-600';

  if (loading) return <DashboardLayout title="Dashboard"><LoadingSpinner /></DashboardLayout>;

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Child selector for multiple children */}
        {children.length > 1 && (
          <Card className="p-4">
            <Select label="Select Child" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name} - {c.class?.name}</option>)}
            </Select>
          </Card>
        )}

        {selectedChild ? (
          <>
            {/* Child profile header card */}
            <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-md">
                  {getInitials(selectedChild.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 truncate">{selectedChild.full_name}</h2>
                  <p className="text-sm text-gray-500">{selectedChild.class?.name} – Section {selectedChild.section?.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Adm: {selectedChild.admission_number}</p>
                </div>
              </div>
              {/* Quick stat pills */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">📊 {attendanceRate}% Attendance</span>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">💰 {pendingFees} Pending</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">📝 {remarks.length} Remarks</span>
              </div>
            </div>

            {/* Two column grid: attendance ring + recent results */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Attendance ring chart */}
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Attendance</h3>
                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                      <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="#f3f4f6" strokeWidth="12" />
                      <circle
                        cx="60" cy="60" r={ringRadius} fill="none"
                        stroke={ringColor} strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${ringFill} ${ringCircumference - ringFill}`}
                        strokeDashoffset="0"
                        style={{ transition: 'stroke-dasharray 1.2s ease-out' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-2xl font-bold ${ringTextColor}`}>{attendanceRate}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{presentCount} days present</p>
                    <p className="text-xs text-gray-400">out of {attendance.length} total days</p>
                  </div>
                </div>
              </Card>

              {/* Recent results mini-chart */}
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Results</h3>
                {records.length === 0 ? (
                  <p className="text-sm text-gray-400">No results available</p>
                ) : (
                  <div className="space-y-2.5">
                    {records.slice(0, 5).map((rec) => {
                      const pct = rec.max_marks > 0 ? Math.round((rec.marks / rec.max_marks) * 100) : 0;
                      const barColor = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
                      return (
                        <div key={rec.id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700 truncate max-w-[140px]">{rec.subject_name}</span>
                            <span className="text-gray-500 font-semibold ml-2">{rec.marks}/{rec.max_marks}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Fee Summary with progress bars */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Fee Summary</h3>
              {fees.length === 0 ? (
                <p className="text-sm text-gray-400">No fee records</p>
              ) : (
                <div className="space-y-3">
                  {fees.slice(0, 5).map((f) => {
                    const pct = f.amount > 0 ? Math.min((f.paid_amount / f.amount) * 100, 100) : 0;
                    const isOverdue = f.status === 'overdue';
                    const barColor = f.status === 'paid' ? 'bg-emerald-500' : f.status === 'partially_paid' ? 'bg-amber-400' : 'bg-red-400';
                    return (
                      <div key={f.id} className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-medium text-gray-900">{f.fee_type}</p>
                          <StatusBadge status={f.status} />
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
                          <span>Paid: {formatCurrency(f.paid_amount, '₹')} of {formatCurrency(f.amount, '₹')}</span>
                          <span className={isOverdue ? 'text-red-500 font-medium' : ''}>Due: {formatDate(f.due_date)} {isOverdue ? '⚠️' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Latest Remark */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Latest Remark</h3>
              {latestRemark ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      latestRemark.category === 'academic' ? 'bg-blue-100 text-blue-700' :
                      latestRemark.category === 'behaviour' ? 'bg-orange-100 text-orange-700' :
                      latestRemark.category === 'attendance' ? 'bg-red-100 text-red-700' :
                      latestRemark.category === 'performance' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{latestRemark.category}</span>
                    {latestRemark.teacher && (
                      <span className="text-xs text-gray-400">by {latestRemark.teacher.full_name}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{latestRemark.remark}</p>
                  <p className="mt-2 text-xs text-gray-400">{formatDate(latestRemark.created_at)}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No remarks available</p>
              )}
            </Card>
          </>
        ) : (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <Users className="h-8 w-8 text-blue-200" />
            </div>
            <p className="font-medium text-gray-600">No child linked to your account</p>
            <p className="mt-1 text-sm text-gray-400">Please contact the school administrator</p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
