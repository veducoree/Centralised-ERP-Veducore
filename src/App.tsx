import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import { CenteredLoader } from '@/components/ui/Skeleton';

// Dead-centered Veducore text-fill loading fallback for route transitions
const PageLoader = () => (
  <CenteredLoader size="lg" fullScreen />
);

// Management portal
const VeducoreManagement = lazy(() => import('@/pages/management/VeducoreManagement'));

// Admin pages
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminStudents = lazy(() => import('@/pages/admin/AdminStudents'));
const AdminTeachers = lazy(() => import('@/pages/admin/AdminTeachers'));
const AdminParents = lazy(() => import('@/pages/admin/AdminParents'));
const AdminClasses = lazy(() => import('@/pages/admin/AdminClasses'));
const AdminAttendance = lazy(() => import('@/pages/admin/AdminAttendance'));
const AdminFees = lazy(() => import('@/pages/admin/AdminFees'));
const AdminAssignments = lazy(() => import('@/pages/admin/AdminAssignments'));
const AdminTracking = lazy(() => import('@/pages/admin/AdminTracking'));
const AdminNotifications = lazy(() => import('@/pages/admin/AdminNotifications'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminIDCard = lazy(() => import('@/pages/admin/AdminIDCard'));
const AdminDocuments = lazy(() => import('@/pages/admin/AdminDocuments'));
const AdminHolidays = lazy(() => import('@/pages/admin/AdminHolidays'));
const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'));
const StudentDetailPage = lazy(() => import('@/pages/admin/StudentDetailPage'));
const NewAdmissionPage = lazy(() => import('@/pages/admin/NewAdmissionPage'));

// Teacher pages
const TeacherDashboard = lazy(() => import('@/pages/teacher/TeacherDashboard'));
const TeacherClasses = lazy(() => import('@/pages/teacher/TeacherClasses'));
const TeacherAssignments = lazy(() => import('@/pages/teacher/TeacherAssignments'));
const TeacherSubjects = lazy(() => import('@/pages/teacher/TeacherSubjects'));
const TeacherStudents = lazy(() => import('@/pages/teacher/TeacherStudents'));
const TeacherAddStudent = lazy(() => import('@/pages/teacher/TeacherAddStudent'));
const TeacherNewAdmission = lazy(() => import('@/pages/teacher/TeacherNewAdmission'));
const TeacherAttendance = lazy(() => import('@/pages/teacher/TeacherAttendance'));
const TeacherExamMarks = lazy(() => import('@/pages/teacher/TeacherExamMarks'));
const TeacherRecords = lazy(() => import('@/pages/teacher/TeacherRecords'));
const TeacherRemarks = lazy(() => import('@/pages/teacher/TeacherRemarks'));
const TeacherSchedule = lazy(() => import('@/pages/teacher/TeacherSchedule'));

// Parent pages
const ParentDashboard = lazy(() => import('@/pages/parent/ParentDashboard'));
const ParentChild = lazy(() => import('@/pages/parent/ParentChild'));
const ParentAttendance = lazy(() => import('@/pages/parent/ParentAttendance'));
const ParentFees = lazy(() => import('@/pages/parent/ParentFees'));
const ParentRecords = lazy(() => import('@/pages/parent/ParentRecords'));
const ParentRemarks = lazy(() => import('@/pages/parent/ParentRemarks'));

function RoutePrefetcher() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.role) return;
    const timer = window.setTimeout(() => {
      if (profile.role === 'admin') {
        import('@/pages/admin/AdminDashboard');
        import('@/pages/admin/AdminStudents');
        import('@/pages/admin/AdminTeachers');
        import('@/pages/admin/AdminParents');
        import('@/pages/admin/AdminClasses');
        import('@/pages/admin/AdminAttendance');
        import('@/pages/admin/AdminFees');
        import('@/pages/admin/AdminSettings');
        import('@/pages/shared/ProfilePage');
      } else if (profile.role === 'teacher') {
        import('@/pages/teacher/TeacherDashboard');
        import('@/pages/teacher/TeacherClasses');
        import('@/pages/teacher/TeacherStudents');
        import('@/pages/teacher/TeacherAttendance');
        import('@/pages/teacher/TeacherExamMarks');
        import('@/pages/teacher/TeacherRecords');
        import('@/pages/shared/ProfilePage');
      } else if (profile.role === 'parent') {
        import('@/pages/parent/ParentDashboard');
        import('@/pages/parent/ParentChild');
        import('@/pages/parent/ParentAttendance');
        import('@/pages/parent/ParentFees');
        import('@/pages/parent/ParentRecords');
        import('@/pages/shared/ProfilePage');
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [profile?.role]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <RoutePrefetcher />
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Root Section Redirects */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/teacher" element={<Navigate to="/teacher/dashboard" replace />} />
            <Route path="/parent" element={<Navigate to="/parent/dashboard" replace />} />
            <Route path="/management" element={<Navigate to="/veducore/management" replace />} />
            <Route path="/veducore" element={<Navigate to="/veducore/management" replace />} />

            {/* Admin routes */}
            <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute allowedRoles={['admin']}><AdminStudents /></ProtectedRoute>} />
            <Route path="/admin/students/:id" element={<ProtectedRoute allowedRoles={['admin']}><StudentDetailPage /></ProtectedRoute>} />
            <Route path="/admin/new-admission" element={<ProtectedRoute allowedRoles={['admin']}><NewAdmissionPage /></ProtectedRoute>} />
            <Route path="/admin/teachers" element={<ProtectedRoute allowedRoles={['admin']}><AdminTeachers /></ProtectedRoute>} />
            <Route path="/admin/parents" element={<ProtectedRoute allowedRoles={['admin']}><AdminParents /></ProtectedRoute>} />
            <Route path="/admin/classes" element={<ProtectedRoute allowedRoles={['admin']}><AdminClasses /></ProtectedRoute>} />
            <Route path="/admin/attendance" element={<ProtectedRoute allowedRoles={['admin']}><AdminAttendance /></ProtectedRoute>} />
            <Route path="/admin/fees" element={<ProtectedRoute allowedRoles={['admin']}><AdminFees /></ProtectedRoute>} />
            <Route path="/admin/assignments" element={<ProtectedRoute allowedRoles={['admin']}><AdminAssignments /></ProtectedRoute>} />
            <Route path="/admin/tracking" element={<ProtectedRoute allowedRoles={['admin']}><AdminTracking /></ProtectedRoute>} />
            <Route path="/admin/id-cards" element={<ProtectedRoute allowedRoles={['admin']}><AdminIDCard /></ProtectedRoute>} />
            <Route path="/admin/id-cards/generate" element={<Navigate to="/admin/id-cards" replace />} />
            <Route path="/admin/documents" element={<ProtectedRoute allowedRoles={['admin']}><AdminDocuments /></ProtectedRoute>} />
            <Route path="/admin/holidays" element={<ProtectedRoute allowedRoles={['admin']}><AdminHolidays /></ProtectedRoute>} />
            <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={['admin']}><AdminNotifications /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/profile" element={<ProtectedRoute allowedRoles={['admin']}><ProfilePage /></ProtectedRoute>} />

            {/* Teacher routes */}
            <Route path="/teacher/dashboard" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/teacher/classes" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherClasses /></ProtectedRoute>} />
            <Route path="/teacher/assignments" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherAssignments /></ProtectedRoute>} />
            <Route path="/teacher/subjects" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherSubjects /></ProtectedRoute>} />
            <Route path="/teacher/students" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherStudents /></ProtectedRoute>} />
            <Route path="/teacher/add-student" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherAddStudent /></ProtectedRoute>} />
            <Route path="/teacher/new-admission" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherNewAdmission /></ProtectedRoute>} />
            <Route path="/teacher/attendance" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherAttendance /></ProtectedRoute>} />
            <Route path="/teacher/exam-marks" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherExamMarks /></ProtectedRoute>} />
            <Route path="/teacher/records" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherRecords /></ProtectedRoute>} />
            <Route path="/teacher/remarks" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherRemarks /></ProtectedRoute>} />
            <Route path="/teacher/schedule" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherSchedule /></ProtectedRoute>} />
            <Route path="/teacher/profile" element={<ProtectedRoute allowedRoles={['teacher']}><ProfilePage /></ProtectedRoute>} />

            {/* Parent routes */}
            <Route path="/parent/dashboard" element={<ProtectedRoute allowedRoles={['parent']}><ParentDashboard /></ProtectedRoute>} />
            <Route path="/parent/child" element={<ProtectedRoute allowedRoles={['parent']}><ParentChild /></ProtectedRoute>} />
            <Route path="/parent/attendance" element={<ProtectedRoute allowedRoles={['parent']}><ParentAttendance /></ProtectedRoute>} />
            <Route path="/parent/fees" element={<ProtectedRoute allowedRoles={['parent']}><ParentFees /></ProtectedRoute>} />
            <Route path="/parent/records" element={<ProtectedRoute allowedRoles={['parent']}><ParentRecords /></ProtectedRoute>} />
            <Route path="/parent/remarks" element={<ProtectedRoute allowedRoles={['parent']}><ParentRemarks /></ProtectedRoute>} />
            <Route path="/parent/profile" element={<ProtectedRoute allowedRoles={['parent']}><ProfilePage /></ProtectedRoute>} />

            <Route path="/veducore/management" element={<VeducoreManagement />} />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
