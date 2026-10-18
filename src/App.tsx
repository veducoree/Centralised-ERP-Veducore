import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { MockAuthProvider } from '@/auth/MockAuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === 'true';
const ActiveAuthProvider = isMockAuth ? MockAuthProvider : AuthProvider;

// Management portal
import VeducoreManagement from '@/pages/management/VeducoreManagement';

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminStudents from '@/pages/admin/AdminStudents';
import AdminTeachers from '@/pages/admin/AdminTeachers';
import AdminParents from '@/pages/admin/AdminParents';
import AdminClasses from '@/pages/admin/AdminClasses';
import AdminAttendance from '@/pages/admin/AdminAttendance';
import AdminFees from '@/pages/admin/AdminFees';
import AdminAssignments from '@/pages/admin/AdminAssignments';
import AdminTracking from '@/pages/admin/AdminTracking';
import AdminNotifications from '@/pages/admin/AdminNotifications';
import AdminSettings from '@/pages/admin/AdminSettings';
import AdminIDCard from '@/pages/admin/AdminIDCard';
import AdminIDCardGenerator from '@/pages/admin/AdminIDCardGenerator';
import AdminDocuments from '@/pages/admin/AdminDocuments';
import AdminDocumentGenerator from '@/pages/admin/AdminDocumentGenerator';
import AdminHolidays from '@/pages/admin/AdminHolidays';
import ProfilePage from '@/pages/shared/ProfilePage';
import StudentDetailPage from '@/pages/admin/StudentDetailPage';
import NewAdmissionPage from '@/pages/admin/NewAdmissionPage';

// Teacher pages
import TeacherDashboard from '@/pages/teacher/TeacherDashboard';
import TeacherClasses from '@/pages/teacher/TeacherClasses';
import TeacherAssignments from '@/pages/teacher/TeacherAssignments';
import TeacherSubjects from '@/pages/teacher/TeacherSubjects';
import TeacherStudents from '@/pages/teacher/TeacherStudents';
import TeacherAddStudent from '@/pages/teacher/TeacherAddStudent';
import TeacherNewAdmission from '@/pages/teacher/TeacherNewAdmission';
import TeacherAttendance from '@/pages/teacher/TeacherAttendance';
import TeacherExamMarks from '@/pages/teacher/TeacherExamMarks';
import TeacherRecords from '@/pages/teacher/TeacherRecords';
import TeacherRemarks from '@/pages/teacher/TeacherRemarks';
import TeacherSchedule from '@/pages/teacher/TeacherSchedule';

// Parent pages
import ParentDashboard from '@/pages/parent/ParentDashboard';
import ParentChild from '@/pages/parent/ParentChild';
import ParentAttendance from '@/pages/parent/ParentAttendance';
import ParentFees from '@/pages/parent/ParentFees';
import ParentRecords from '@/pages/parent/ParentRecords';
import ParentRemarks from '@/pages/parent/ParentRemarks';

function App() {
  return (
    <ActiveAuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

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
            <Route path="/admin/id-cards/generate" element={<ProtectedRoute allowedRoles={['admin']}><AdminIDCardGenerator /></ProtectedRoute>} />
            <Route path="/admin/documents" element={<ProtectedRoute allowedRoles={['admin']}><AdminDocuments /></ProtectedRoute>} />
            <Route path="/admin/documents/generate" element={<ProtectedRoute allowedRoles={['admin']}><AdminDocumentGenerator /></ProtectedRoute>} />
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
        </BrowserRouter>
      </ToastProvider>
    </ActiveAuthProvider>
  );
}

export default App;
