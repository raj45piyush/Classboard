const LABELS: Record<string, string> = {
  classroom_created: "created a classroom",
  teacher_registered: "created a teacher account",
  teacher_invited: "created a pending teacher account",
  member_removed: "removed a student's classroom access",
  lesson_created: "created a lesson",
  student_joined: "joined a classroom",
  teacher_activated: "was activated",
  teacher_deactivated: "was deactivated",
};

export function describeActivity(action: string): string {
  return LABELS[action] ?? action.replace(/_/g, " ");
}
