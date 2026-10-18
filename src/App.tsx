import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ConfigGate } from "@/components/layout/ConfigGate";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";

import Home from "@/pages/Home";
import TeacherAuthPage from "@/pages/TeacherAuthPage";
import ForgotPassword from "@/pages/ForgotPassword";
import AdminLogin from "@/pages/AdminLogin";
import JoinClassroom from "@/pages/JoinClassroom";
import StudentClassroom from "@/pages/StudentClassroom";
import Unauthorized from "@/pages/Unauthorized";
import NotFound from "@/pages/NotFound";

import TeacherDashboard from "@/pages/teacher/TeacherDashboard";
import TeacherLessons from "@/pages/teacher/TeacherLessons";
import ClassroomDetail from "@/pages/teacher/ClassroomDetail";
import WhiteboardEditor from "@/pages/teacher/WhiteboardEditor";

import AdminOverview from "@/pages/admin/AdminOverview";
import AdminTeachers from "@/pages/admin/AdminTeachers";
import AdminClassrooms from "@/pages/admin/AdminClassrooms";
import AdminActivity from "@/pages/admin/AdminActivity";

export default function App() {
  return (
    <ConfigGate>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/auth/teacher" element={<TeacherAuthPage />} />
              <Route path="/login/teacher" element={<Navigate to="/auth/teacher?mode=signin" replace />} />
              <Route path="/register/teacher" element={<Navigate to="/auth/teacher?mode=register" replace />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/login/admin" element={<AdminLogin />} />
              <Route path="/join" element={<JoinClassroom />} />
            </Route>
            <Route path="/student/:classId" element={<StudentClassroom />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            <Route element={<ProtectedRoute allow={["teacher"]} />}>
              <Route element={<AppLayout />}>
                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/teacher/lessons" element={<TeacherLessons />} />
                <Route path="/teacher/class/:classroomId" element={<ClassroomDetail />} />
              </Route>
              <Route path="/teacher/class/:classroomId/board/:lessonId" element={<WhiteboardEditor />} />
            </Route>

            <Route element={<ProtectedRoute allow={["admin"]} />}>
              <Route element={<AppLayout />}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/teachers" element={<AdminTeachers />} />
                <Route path="/admin/classrooms" element={<AdminClassrooms />} />
                <Route path="/admin/activity" element={<AdminActivity />} />
              </Route>
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigGate>
  );
}
