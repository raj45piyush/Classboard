import { Navigate } from "react-router-dom";

/** Backwards-compatible route; the unified authentication page owns the UI. */
export default function TeacherLogin() {
  return <Navigate to="/auth/teacher?mode=signin" replace />;
}
