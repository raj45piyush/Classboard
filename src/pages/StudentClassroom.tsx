import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  WifiOff,
  Wifi,
  LogOut,
  Radio,
  NotebookText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { subscribeClassroom } from "@/services/classrooms";
import { subscribeLessons } from "@/services/lessons";
import { subscribePages } from "@/services/pages";
import { subscribePublishedSlides, type PublishedSlide } from "@/services/publishedSlides";
import { leaveClassroom } from "@/services/members";
import { subscribeLiveSnapshot, subscribeSession } from "@/services/live";
import type { Classroom, Lesson, LessonPage, LiveSessionState } from "@/types";
import { CanvasBoard, type CanvasBoardHandle } from "@/components/whiteboard/CanvasBoard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clearStudentOfflineBundle, getStudentOfflineBundle, saveStudentOfflineBundle, type StudentOfflineBundle } from "@/services/studentOfflineCache";
import { formatTimestamp } from "@/utils/format";

type ViewMode = "live" | "notes";
type NotesSource = "slides" | "lessons";

export default function StudentClassroom() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { firebaseUser, profile, loading } = useAuth();

  const [classroom, setClassroom] = useState<Classroom | null | undefined>(undefined);
  const [classroomLoadError, setClassroomLoadError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [session, setSessionState] = useState<LiveSessionState | null>(null);
  const [liveJson, setLiveJson] = useState<string | null>(null);
  const [livePageId, setLivePageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [presentationExpanded, setPresentationExpanded] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [publishedSlides, setPublishedSlides] = useState<PublishedSlide[]>([]);
  const [publishedSlidesServerConfirmed, setPublishedSlidesServerConfirmed] = useState(false);
  const [selectedPublishedSlideId, setSelectedPublishedSlideId] = useState<string | null>(null);
  const [notesSource, setNotesSource] = useState<NotesSource>("slides");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [pages, setPages] = useState<LessonPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineViewing, setOfflineViewing] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheAvailable, setCacheAvailable] = useState(true);
  const [classroomServerConfirmed, setClassroomServerConfirmed] = useState(false);
  const [memberServerConfirmed, setMemberServerConfirmed] = useState(false);
  const [lessonsServerConfirmed, setLessonsServerConfirmed] = useState(false);
  const [pagesServerConfirmed, setPagesServerConfirmed] = useState(false);
  const [offlineBundle, setOfflineBundle] = useState<StudentOfflineBundle | null>(null);

  const boardRef = useRef<CanvasBoardHandle>(null);
  const lastLiveSnapshotRef = useRef<{ key: string; seq: number; json: string | null }>({ key: "", seq: -1, json: null });

  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      setOfflineViewing(false);
      setConnected(false);
      setClassroomServerConfirmed(false);
      setMemberServerConfirmed(false);
      setLessonsServerConfirmed(false);
      setPagesServerConfirmed(false);
      setPublishedSlidesServerConfirmed(false);
    };
    const offline = () => { setIsOnline(false); setOfflineViewing(true); setConnected(false); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  useEffect(() => {
    if (!firebaseUser || !classId) { setCacheReady(true); return; }
    let cancelled = false;
    getStudentOfflineBundle(firebaseUser.uid, classId).then((bundle) => {
      if (cancelled || !bundle) return;
      setOfflineBundle(bundle);
      if (!navigator.onLine) {
        setOfflineViewing(true);
        setClassroom(bundle.classroom);
        setLessons(bundle.lessons);
        setPublishedSlides(bundle.publishedSlides ?? []);
        setSelectedPublishedSlideId(bundle.publishedSlides?.[0]?.id ?? null);
        const lessonId = bundle.lessons[0]?.id ?? null;
        setSelectedLessonId(lessonId);
        setPages(lessonId ? bundle.pagesByLesson[lessonId] ?? [] : []);
        setLiveJson(bundle.liveJson);
        setLivePageId(bundle.session?.activePageId ?? null);
        setSessionState(bundle.session);
        setIsMember(true); // local display only; Firestore remains the authorization boundary for network access
        setSessionReady(true);
      }
    }).catch(() => setCacheAvailable(false)).finally(() => { if (!cancelled) setCacheReady(true); });
    return () => { cancelled = true; };
  }, [firebaseUser?.uid, classId]);

  useEffect(() => {
    if (!classId) return;
    if (offlineViewing || !isOnline) return;
    return subscribeClassroom(classId, (value, serverConfirmed) => {
      setClassroom(value);
      setClassroomServerConfirmed(Boolean(serverConfirmed));
      if (serverConfirmed && (!value || value.status !== "active") && firebaseUser) {
        void clearStudentOfflineBundle(firebaseUser.uid, classId);
        setOfflineBundle(null);
      }
    }, (error) => {
      setClassroomLoadError(firebaseErrorCode(error) === "permission-denied"
        ? "Firestore denied this classroom read. Confirm that your membership is active and the classroom is open."
        : "The classroom could not be loaded. Check your connection and retry.");
    });
  }, [classId, firebaseUser?.uid, offlineViewing, isOnline]);

  // Confirm this anonymous/teacher user is actually a member of this classroom.
  useEffect(() => {
    if (!classId || !firebaseUser) return;
    const ref2 = doc(db, "classrooms", classId, "members", firebaseUser.uid);
    if (offlineViewing || !isOnline) return;
    return onSnapshot(
      ref2,
      { includeMetadataChanges: true },
      (snap) => {
        setIsMember(snap.exists() && snap.data().accessStatus === "active");
        setMemberServerConfirmed(!snap.metadata.fromCache);
        if (!snap.metadata.fromCache && (!snap.exists() || snap.data().accessStatus !== "active")) {
          void clearStudentOfflineBundle(firebaseUser.uid, classId);
          setOfflineBundle(null);
        }
      },
      (error) => {
        setMembershipError(firebaseErrorCode(error) === "permission-denied"
          ? "Firestore denied the membership check. Rejoin with the current classroom code."
          : "Your classroom membership could not be checked. Check your connection and retry.");
      }
    );
  }, [classId, firebaseUser, offlineViewing, isOnline]);

  useEffect(() => {
    if (!classId || !isMember || offlineViewing || !isOnline) return;
    return subscribeSession(classId, (value, serverConfirmed) => {
      setSessionState(value);
      setConnected(serverConfirmed);
      setSessionReady(true);
      if (serverConfirmed) setContentError(null);
    }, (error) => {
      setConnected(false);
      setSessionReady(true);
      setContentError(firebaseErrorCode(error) === "permission-denied"
        ? "You are not authorized to read this classroom's live session. Rejoin with the current classroom code."
        : "The live-session connection was interrupted. Check your connection and retry.");
    });
  }, [classId, isMember, offlineViewing, isOnline]);

  useEffect(() => {
    if (!session?.sharing) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [session?.sharing]);

  useEffect(() => {
    if (!classId || !session?.sharing || !session.activePageId || offlineViewing || !isOnline) {
      return;
    }
    const snapshotKey = `${classId}:${session.activePageId}`;
    if (lastLiveSnapshotRef.current.key !== snapshotKey) {
      lastLiveSnapshotRef.current = { key: snapshotKey, seq: -1, json: null };
    }
    return subscribeLiveSnapshot(classId, session.activePageId, (json, serverConfirmed, seq) => {
      if (serverConfirmed) {
        setConnected(true);
        setContentError(null);
      }
      const previous = lastLiveSnapshotRef.current;
      if (previous.key === snapshotKey && (seq < previous.seq || (seq === previous.seq && json === previous.json))) return;
      lastLiveSnapshotRef.current = { key: snapshotKey, seq, json };
      setLiveJson(json);
      setLivePageId(session.activePageId);
    }, (error) => {
      setContentError(firebaseErrorCode(error) === "permission-denied"
        ? "You are not authorized to read this live board. Check that you joined this classroom."
        : "Could not receive the teacher's live board. Check your connection and retry.");
    });
  }, [classId, session?.sharing, session?.activePageId, offlineViewing, isOnline]);

  useEffect(() => {
    if (viewMode === "live") {
      boardRef.current?.loadFromJSON(livePageId === session?.activePageId ? liveJson : null);
    }
  }, [liveJson, livePageId, viewMode, session?.activePageId]);

  useEffect(() => {
    if (!classId || !isMember) return;
    if (offlineViewing || !isOnline) return;
    return subscribeLessons(classId, (values, serverConfirmed) => {
      setLessons(values);
      setLessonsServerConfirmed(Boolean(serverConfirmed));
    }, () => setContentError("Could not load published lessons. Check your membership and Firestore rules."), true);
  }, [classId, isMember, offlineViewing, isOnline]);

  useEffect(() => {
    if (!classId || !isMember || offlineViewing || !isOnline) return;
    return subscribePublishedSlides(classId, (values, serverConfirmed) => {
      setPublishedSlides(values);
      setPublishedSlidesServerConfirmed(serverConfirmed);
      setSelectedPublishedSlideId((current) => values.some((slide) => slide.id === current) ? current : values[0]?.id ?? null);
      if (serverConfirmed) setContentError(null);
    }, (error) => {
      setPublishedSlidesServerConfirmed(false);
      setContentError(firebaseErrorCode(error) === "permission-denied"
        ? "You are not authorized to read published slides in this classroom. Rejoin with the current classroom code."
        : "Published slides could not be loaded. Check your connection and retry.");
    });
  }, [classId, isMember, offlineViewing, isOnline]);

  useEffect(() => {
    if (!classId || !selectedLessonId) {
      setPages([]);
      return;
    }
    if (offlineViewing || !isOnline) return;
    return subscribePages(classId, selectedLessonId, (values, serverConfirmed) => {
      setPages(values);
      setPagesServerConfirmed(Boolean(serverConfirmed));
    }, () => setContentError("Could not load these lesson pages. Check your membership and Firestore rules."));
  }, [classId, selectedLessonId, offlineViewing, isOnline]);

  useEffect(() => {
    if (!firebaseUser || !classId || !classroom || classroom.status !== "active" || !classroomServerConfirmed || !memberServerConfirmed || !lessonsServerConfirmed || !publishedSlidesServerConfirmed || !isMember || offlineViewing) return;
    const publishedLessonIds = new Set(lessons.map((lesson) => lesson.id));
    const pagesByLesson = Object.fromEntries(Object.entries(offlineBundle?.pagesByLesson ?? [])
      .filter(([lessonId]) => publishedLessonIds.has(lessonId)));
    if (selectedLessonId && pagesServerConfirmed) pagesByLesson[selectedLessonId] = pages;
    const bundle: StudentOfflineBundle = {
      uid: firebaseUser.uid,
      classroomId: classId,
      classroom,
      lessons,
      pagesByLesson,
      publishedSlides,
      liveJson,
      session,
      cachedAt: Date.now(),
      authorized: true,
    };
    saveStudentOfflineBundle(bundle).then(() => {
      setOfflineBundle(bundle);
      setCacheAvailable(true);
    }).catch(() => setCacheAvailable(false));
  }, [firebaseUser?.uid, classId, classroom, classroomServerConfirmed, memberServerConfirmed, lessonsServerConfirmed, publishedSlidesServerConfirmed, isMember, offlineViewing, selectedLessonId, pages, pagesServerConfirmed, lessons, publishedSlides, liveJson, session]);

  useEffect(() => {
    if (viewMode !== "notes") return;
    if (notesSource === "slides") {
      const selected = publishedSlides.find((slide) => slide.id === selectedPublishedSlideId);
      boardRef.current?.loadFromJSON(selected?.boardSnapshot ?? null);
      return;
    }
    const page = pages[pageIndex];
    boardRef.current?.loadFromJSON(page?.boardSnapshot ?? null);
  }, [viewMode, notesSource, publishedSlides, selectedPublishedSlideId, pages, pageIndex]);

  if (loading || !cacheReady) return <Spinner label="Checking your session…" />;
  if (!classId) return <Navigate to="/join" replace />;
  if (!firebaseUser || (!profile && !offlineViewing)) return <Navigate to="/join" replace />;
  if (!isOnline && !offlineBundle && !classroom) return <div className="p-4"><Alert tone="info">This classroom has no previously cached content on this device. Reconnect and open published lesson slides to save them for offline reading.</Alert></div>;
  if ((classroomLoadError || membershipError) && !offlineViewing) return <div className="p-4"><Alert tone="error">{classroomLoadError || membershipError}</Alert></div>;
  if (classroom === null && !offlineViewing) return <EmptyState title="Classroom not found" description="This classroom may have been deleted." />;
  if (isMember === false && !offlineViewing) return <Navigate to="/join" replace />;
  if (!classroom || isMember === null) return <Spinner label="Loading classroom…" />;

  if (classroom.status !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] p-6">
        <EmptyState title="This classroom is closed" description="Ask your teacher to reopen it, or check back later." />
      </div>
    );
  }

  async function handleLeave() {
    try {
      if (classId && firebaseUser) await leaveClassroom(classId);
      if (classId && firebaseUser) await clearStudentOfflineBundle(firebaseUser.uid, classId);
      navigate("/join");
    } catch {
      setContentError("Could not leave the classroom right now. Check your connection and retry.");
    }
  }

  return (
    <div className={presentationExpanded ? "fixed inset-0 z-[60] flex h-dvh flex-col overflow-hidden bg-[#F5F5F5]" : "flex h-dvh flex-col bg-[#F5F5F5]"}>
      {!presentationExpanded && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DADD] bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[#303238]">{classroom.title}</span>
          {classroom.subject && <span className="text-sm text-[#747780]">· {classroom.subject}</span>}
          {!sessionReady ? (
            <Badge tone="neutral"><Wifi className="h-3 w-3" /> Connecting</Badge>
          ) : connected && session?.sharing && clockNow - session.updatedAt < 60_000 ? (
            <Badge tone="success">
              <Wifi className="h-3 w-3" /> Live
            </Badge>
          ) : connected && !session?.sharing ? (
            <Badge tone="neutral"><Wifi className="h-3 w-3" /> Connected</Badge>
          ) : (
            <Badge tone="warning">
              <WifiOff className="h-3 w-3" /> {session?.sharing ? "Reconnecting…" : "Offline"}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLeave}>
          <LogOut className="h-4 w-4" />
          Leave classroom
        </Button>
      </div>}

      {(!isOnline || offlineViewing) && !presentationExpanded && <div className="px-4 pt-2"><Alert tone="info">Offline · showing previously cached classroom content{offlineBundle ? ` from ${formatTimestamp(offlineBundle.cachedAt)}` : ""}. This content may be stale.</Alert></div>}
      {isOnline && !cacheAvailable && !presentationExpanded && <div className="px-4 pt-2"><Alert tone="info">Offline reading is unavailable in this browser because local storage could not be opened.</Alert></div>}
      {isOnline && !offlineViewing && viewMode === "notes" && notesSource === "slides" && selectedPublishedSlideId && classroomServerConfirmed && memberServerConfirmed && publishedSlidesServerConfirmed && <p className="px-4 pt-2 text-xs text-[#747780]">Current · classroom membership and published slide were confirmed by Firebase{offlineBundle ? `; offline copy last saved ${formatTimestamp(offlineBundle.cachedAt)}` : "; offline copy is being prepared"}.</p>}

      <div className="flex flex-wrap items-center gap-2 border-b border-[#D9DADD] bg-white px-4 py-2">
        <button
          onClick={() => setViewMode("live")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            viewMode === "live" ? "bg-[#303238] text-white" : "text-[#747780] hover:bg-[#EEEEF0]"
          }`}
        >
          <Radio className="h-4 w-4" />
          Live board
        </button>
        <button
          onClick={() => setViewMode("notes")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            viewMode === "notes" ? "bg-[#303238] text-white" : "text-[#747780] hover:bg-[#EEEEF0]"
          }`}
        >
          <NotebookText className="h-4 w-4" />
          Lesson notes
        </button>

        {viewMode === "live" && sessionReady && !session?.sharing && (
          <span className="text-xs text-[#747780]">The teacher isn't sharing the board right now.</span>
        )}
        {viewMode === "live" && session?.sharing && clockNow - session.updatedAt >= 60_000 && (
          <span className="text-xs text-[#747780]">The live session heartbeat is stale. Showing the last received board while reconnecting.</span>
        )}

        {viewMode === "notes" && (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Button variant={notesSource === "slides" ? "primary" : "ghost"} size="sm" onClick={() => setNotesSource("slides")}>Published slides</Button>
            {lessons.length > 0 && <Button variant={notesSource === "lessons" ? "primary" : "ghost"} size="sm" onClick={() => setNotesSource("lessons")}>Published lessons</Button>}
            {notesSource === "slides" && <>
              <select
                aria-label="Published slide"
                value={selectedPublishedSlideId ?? ""}
                onChange={(event) => setSelectedPublishedSlideId(event.target.value || null)}
                className="max-w-72 rounded-md border border-[#D9DADD] px-2 py-1 text-sm"
              >
                <option value="">Select a published slide…</option>
                {publishedSlides.map((slide, index) => (
                  <option key={slide.id} value={slide.id}>{slide.lessonTitle} · {slide.title} (slide {slide.order || index + 1})</option>
                ))}
              </select>
              {publishedSlides.length > 0 && <>
                <Button variant="ghost" size="sm" aria-label="Previous published slide" disabled={publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId) <= 0} onClick={() => {
                  const index = publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId);
                  if (index > 0) setSelectedPublishedSlideId(publishedSlides[index - 1].id);
                }}><ChevronLeft className="h-4 w-4" />Previous</Button>
                <span className="text-xs text-[#747780]">{Math.max(0, publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId) + 1)} of {publishedSlides.length}</span>
                <Button variant="ghost" size="sm" aria-label="Next published slide" disabled={publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId) < 0 || publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId) >= publishedSlides.length - 1} onClick={() => {
                  const index = publishedSlides.findIndex((slide) => slide.id === selectedPublishedSlideId);
                  if (index >= 0 && index < publishedSlides.length - 1) setSelectedPublishedSlideId(publishedSlides[index + 1].id);
                }}>Next<ChevronRight className="h-4 w-4" /></Button>
              </>}
            </>}
            {notesSource === "lessons" && <>
            <select
              value={selectedLessonId ?? ""}
              onChange={(e) => {
                const nextLessonId = e.target.value || null;
                setSelectedLessonId(nextLessonId);
                setPageIndex(0);
                if (offlineViewing) setPages(nextLessonId ? offlineBundle?.pagesByLesson[nextLessonId] ?? [] : []);
              }}
              className="rounded-md border border-[#D9DADD] px-2 py-1 text-sm"
            >
              <option value="">Select a lesson…</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.pageCount} slides
                </option>
              ))}
            </select>
            {pages.length > 0 && (
              <>
                <Button variant="ghost" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex((i) => i - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-[#747780]">
                  Page {pageIndex + 1} of {pages.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageIndex >= pages.length - 1}
                  onClick={() => setPageIndex((i) => i + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            </>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => boardRef.current?.zoomOut()}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => boardRef.current?.fitToScreen()}>
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => boardRef.current?.zoomIn()}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" aria-label={presentationExpanded ? "Restore presentation" : "Expand presentation"} title={presentationExpanded ? "Restore presentation" : "Expand presentation"} onClick={() => setPresentationExpanded((expanded) => !expanded)}>
            {presentationExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{presentationExpanded ? "Restore" : "Expand"}</span>
          </Button>
        </div>
      </div>

      {contentError && <div className="px-4 pt-2"><Alert tone="error">{contentError}</Alert></div>}

      {viewMode === "notes" && notesSource === "slides" && publishedSlides.length === 0 && !offlineViewing && (
        <div className="p-4">
          <Alert tone="info">No published slides yet. The teacher can publish the selected slide or the complete presentation at any time.</Alert>
        </div>
      )}
      {viewMode === "notes" && notesSource === "slides" && selectedPublishedSlideId && (() => {
        const slide = publishedSlides.find((entry) => entry.id === selectedPublishedSlideId);
        return slide ? <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs text-[#747780]">
          <span>{slide.lessonTitle}</span>
          <span>{slide.title} · Slide {slide.order}</span>
          <span>Teacher: {slide.teacherName || classroom?.teacherName || "Classroom teacher"}</span>
          <span>Published {formatTimestamp(slide.publishedAt)}</span>
        </div> : null;
      })()}
      {viewMode === "notes" && notesSource === "lessons" && lessons.length === 0 && (
        <div className="p-4"><Alert tone="info">No published lessons are available.</Alert></div>
      )}
      {viewMode === "notes" && notesSource === "lessons" && selectedLessonId && <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs text-[#747780]">
        <span>Teacher: {classroom?.teacherName || "Classroom teacher"}</span>
        <span>Lesson updated: {formatTimestamp(lessons.find((lesson) => lesson.id === selectedLessonId)?.updatedAt)}</span>
        {lessons.find((lesson) => lesson.id === selectedLessonId)?.description && <span>{lessons.find((lesson) => lesson.id === selectedLessonId)?.description}</span>}
        <span>{pages.length} saved slide{pages.length === 1 ? "" : "s"}</span>
        {offlineViewing && pages.length === 0 && <span>This lesson’s slides have not been cached on this device.</span>}
      </div>}

      <div className="min-h-0 flex-1">
        <CanvasBoard
          ref={boardRef}
          tool="select"
          color="#303238"
          strokeWidth={3}
          readOnly
          pageKey={viewMode === "live" ? `live-${session?.activePageId ?? "none"}` : notesSource === "slides" ? selectedPublishedSlideId ?? "published-empty" : pages[pageIndex]?.id ?? "notes-empty"}
        />
      </div>
    </div>
  );
}

function firebaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : undefined;
}
