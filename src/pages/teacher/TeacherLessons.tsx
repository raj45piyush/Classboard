import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { subscribeAllLessonsForTeacher, type LessonWithClassroom } from "@/services/lessons";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { formatTimestamp } from "@/utils/format";

export default function TeacherLessons() {
  const { profile } = useAuth();
  const [lessons, setLessons] = useState<LessonWithClassroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    setLessons(null);
    setError(null);
    return subscribeAllLessonsForTeacher(profile.uid, setLessons, (err) => {
      setError(err.message);
      // End the initial loading state even when one classroom subscription is
      // denied. Existing lesson results are preserved if they already loaded.
      setLessons((current) => current ?? []);
    });
  }, [profile?.uid]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[#303238]">All lessons</h1>
        <p className="text-sm text-[#747780]">Every lesson across all of your classrooms, most recently updated first.</p>
      </div>

      {error && (
        <Alert tone="error">
          {error.includes("index")
            ? "This view needs a Firestore index to be created once (see firestore.indexes.json / the link in your browser console)."
            : error}
        </Alert>
      )}

      {lessons === null && <Spinner label="Loading lessons…" />}

      {lessons !== null && lessons.length === 0 && (
        <EmptyState icon={<NotebookPen className="h-6 w-6" />} title="No lessons yet" description="Open a classroom to create your first lesson." />
      )}

      <div className="space-y-2">
        {lessons?.map((lesson) => (
          <Link key={`${lesson.classroomId}-${lesson.id}`} to={`/teacher/class/${lesson.classroomId}/board/${lesson.id}`}>
            <Card className="transition-colors hover:border-[#303238]">
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#303238]">{lesson.title}</p>
                  <p className="text-xs text-[#747780]">{lesson.classroomTitle || "Classroom"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={lesson.published ? "success" : "neutral"}>{lesson.published ? "Published" : "Draft"}</Badge>
                  <span className="text-xs text-[#9a9ca3]">{formatTimestamp(lesson.updatedAt)}</span>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
