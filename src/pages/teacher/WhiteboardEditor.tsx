import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Copy,
  Maximize2,
  Minimize2,
  PanelTopClose,
  PanelTopOpen,
  PanelLeftOpen,
  Plus,
  Link2,
  Loader2,
  Radio,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { rotateJoinCode, subscribeClassroom, subscribeClassroomJoinCode } from "@/services/classrooms";
import { subscribeLesson, renameLesson, setLessonPageCount } from "@/services/lessons";
import {
  subscribePages,
  createPage,
  duplicatePage,
  deletePage,
  reorderPages,
  savePageSnapshot,
  getAllPagesOnce,
  saveSlideTitle,
  MAX_BOARD_SNAPSHOT_BYTES,
  getNextPageNumber,
} from "@/services/pages";
import { setSession, subscribeConnectionState, subscribeSession, writeLiveSnapshot } from "@/services/live";
import { validateUploadFile } from "@/utils/validation";
import { processPdfPagesToImages, compressImageDataUrl } from "@/lib/pdfjs";
import { buildSlideSnapshot, renderSnapshotToDataUrl } from "@/utils/offscreenRender";
import { exportPagesToPdf } from "@/utils/pdfExport";
import { getUploadErrorMessage } from "@/utils/uploadErrors";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import type { Classroom, Lesson, LessonPage, LiveSessionState } from "@/types";
import { CanvasBoard, type CanvasBoardHandle, type ToolName } from "@/components/whiteboard/CanvasBoard";
import { Toolbar } from "@/components/whiteboard/Toolbar";
import type { ShapePreset } from "@/components/whiteboard/mathShapes";
import { PageList } from "@/components/whiteboard/PageList";
import { ToolsPanel } from "@/components/whiteboard/ToolsPanel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { DEFAULT_STROKE_COLOR, DEFAULT_STROKE_WIDTH } from "@/constants/board";
import { getPublishedSlidesOnce, isBlankSlideSnapshot, publishSlides } from "@/services/publishedSlides";
import { initialWhiteboardLayout, whiteboardLayoutReducer } from "@/pages/teacher/whiteboardLayout";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type PublishScope = "slide" | "presentation";

function initialEditorLayout() {
  const smallViewport = typeof window !== "undefined"
    && window.matchMedia?.("(max-width: 640px)").matches;
  return smallViewport
    ? { ...initialWhiteboardLayout, pagesCollapsed: true, toolsCollapsed: true }
    : initialWhiteboardLayout;
}

export default function WhiteboardEditor() {
  const { classroomId, lessonId } = useParams<{ classroomId: string; lessonId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [workspaceLayout, dispatchLayout] = useReducer(whiteboardLayoutReducer, undefined, initialEditorLayout);

  const [classroom, setClassroom] = useState<Classroom | null | undefined>(undefined);
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined);
  const [pages, setPages] = useState<LessonPage[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [pageOperationError, setPageOperationError] = useState<string | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string | null | undefined>(undefined);
  const [shareCodeError, setShareCodeError] = useState<string | null>(null);
  const [shareCodeFeedback, setShareCodeFeedback] = useState<string | null>(null);
  const [rotatingCode, setRotatingCode] = useState(false);
  const [confirmRotateCode, setConfirmRotateCode] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());

  const [tool, setTool] = useState<ToolName>("select");
  const [color, setColor] = useState(DEFAULT_STROKE_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [liveSession, setLiveSession] = useState<LiveSessionState | null>(null);
  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const sharing = liveSession?.sharing === true;
  const [sharingBusy, setSharingBusy] = useState(false);
  const [publishScope, setPublishScope] = useState<PublishScope>("slide");
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishSucceeded, setPublishSucceeded] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishConfirmation, setPublishConfirmation] = useState<{ pages: LessonPage[]; updating: boolean; blank: boolean } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeletePage, setConfirmDeletePage] = useState<LessonPage | null>(null);
  const [uploadState, setUploadState] = useState<{ busy: boolean; message: string; error?: string; progress?: number }>({
    busy: false,
    message: "",
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [slideTitleDraft, setSlideTitleDraft] = useState("");

  const boardRef = useRef<CanvasBoardHandle>(null);
  const activePageIdRef = useRef<string | null>(null);
  const pagesRef = useRef<LessonPage[]>([]);
  const sharingRef = useRef(false);
  const pageVersionsRef = useRef(new Map<string, number>());
  const dirtyRevisionRef = useRef(new Map<string, number>());
  const conflictedPagesRef = useRef(new Set<string>());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const didInitPages = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const addingPageRef = useRef(false);
  const liveSequenceRef = useRef(0);

  const nextLiveSequence = () => {
    liveSequenceRef.current = Math.max(Date.now(), liveSequenceRef.current + 1);
    return liveSequenceRef.current;
  };

  pagesRef.current = pages;
  sharingRef.current = sharing;
  activePageIdRef.current = activePageId;

  const flushSaveRef = useRef<(...args: [string, string, number, string, string, number]) => Promise<boolean>>(async () => true);

  useEffect(() => {
    setClassroom(undefined);
    setLesson(undefined);
    setPages([]);
    setPagesLoaded(false);
    setActivePageId(null);
    setLoadError(null);
    setPageLoadError(null);
    setPageOperationError(null);
    setSaveError(null);
    setSaveStatus("idle");
    pageVersionsRef.current.clear();
    dirtyRevisionRef.current.clear();
    conflictedPagesRef.current.clear();
    didInitPages.current = false;
    return () => {
      const pageId = activePageIdRef.current;
      const revision = pageId ? dirtyRevisionRef.current.get(pageId) : undefined;
      const json = boardRef.current?.exportJSON();
      if (pageId && revision !== undefined && json) {
        flushSaveRef.current(json, pageId, revision, classroomId ?? "", lessonId ?? "", pageVersionsRef.current.get(pageId) ?? 0);
      }
    };
  }, [classroomId, lessonId]);

  useEffect(() => {
    if (!sharing) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [sharing]);

  useEffect(() => {
    if (!classroomId) return;
    return subscribeClassroom(classroomId, setClassroom, (error) => {
      setLoadError(firebaseErrorCode(error) === "permission-denied"
        ? "Firestore denied access to this classroom. Confirm your active teacher profile owns it and deploy the current firestore.rules."
        : "The classroom could not be loaded. Check your connection and retry.");
    });
  }, [classroomId]);

  useEffect(() => {
    setShareCode(undefined);
    setShareCodeError(null);
    setShareCodeFeedback(null);
    if (!classroomId || !profile?.uid || !classroom || classroom.teacherUid !== profile.uid) return;
    return subscribeClassroomJoinCode(classroomId, (code) => {
      setShareCode(code);
      setShareCodeError(null);
    }, (error) => {
      setShareCode(null);
      setShareCodeError(firebaseErrorCode(error) === "permission-denied"
        ? "Only the active classroom owner can retrieve this join code."
        : "The classroom join code could not be loaded. Check your connection and retry.");
    }, classroom.joinCodeHash || undefined);
  }, [classroomId, classroom?.teacherUid, classroom?.joinCodeHash, profile?.uid]);

  useEffect(() => {
    if (!classroomId || !lessonId) return;
    return subscribeLesson(classroomId, lessonId, setLesson, (error) => {
      setLoadError(firebaseErrorCode(error) === "permission-denied"
        ? "Firestore denied access to this lesson. Confirm it belongs to your classroom and deploy the current firestore.rules."
        : "The lesson could not be loaded. Check your connection and retry.");
    });
  }, [classroomId, lessonId]);

  useEffect(() => {
    if (!classroomId || !lessonId) return;
    return subscribePages(
      classroomId,
      lessonId,
      (list) => {
        setPages(list);
        for (const page of list) {
          if (!dirtyRevisionRef.current.has(page.id)) pageVersionsRef.current.set(page.id, page.version);
        }
        setPagesLoaded(true);
      },
      (error) => {
        setPageLoadError(firebaseErrorCode(error) === "permission-denied"
          ? "Firestore denied access to this lesson's pages. Confirm classroom ownership and deploy the current firestore.rules."
          : "Lesson pages could not be loaded. Check your connection and retry.");
      }
    );
  }, [classroomId, lessonId]);

  // Auto-create a first page for a brand-new lesson.
  useEffect(() => {
    if (!classroomId || !lessonId || !pagesLoaded || pageLoadError || didInitPages.current) return;
    if (pages.length === 0) {
      didInitPages.current = true;
      createPage(classroomId, lessonId, { pageNumber: 1, pageType: "board" }).then((id) => {
        setActivePageId(id);
        pageVersionsRef.current.set(id, 0);
        return setLessonPageCount(classroomId, lessonId, 1);
      }).catch((error) => {
        setPageOperationError(accessibleBoardError("creating the first slide", error));
      });
    } else if (!activePageId) {
      didInitPages.current = true;
      setActivePageId(pages[0].id);
      pageVersionsRef.current.set(pages[0].id, pages[0].version);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesLoaded, pages, classroomId, lessonId, pageLoadError]);

  // Load the selected page's saved content into the canvas whenever the page changes.
  useEffect(() => {
    if (!activePageId) return;
    const page = pagesRef.current.find((p) => p.id === activePageId);
    if (page) pageVersionsRef.current.set(page.id, page.version);
    setSaveStatus("idle");
    setSaveError(null);
    boardRef.current?.loadFromJSON(page?.boardSnapshot ?? null).catch(() => {
      setPageLoadError("This slide could not be restored because its saved board data is invalid or an image could not be loaded.");
    });
  }, [activePageId]);

  // Firestore validates session reads against this classroom's owner/members.
  useEffect(() => {
    if (!classroomId || !profile) return;
    return subscribeSession(classroomId, (session, confirmed) => {
      setLiveSession(session);
      setSessionConfirmed(confirmed);
      if (confirmed) setLiveError(null);
    }, (error) => {
      setSessionConfirmed(false);
      setLiveError(firebaseErrorCode(error) === "permission-denied"
        ? "Firestore denied live-session access. Confirm you own this classroom and deploy the current firestore.rules."
        : "The live-session connection was interrupted. Check your connection and retry.");
    });
  }, [classroomId, profile?.uid]);

  useEffect(() => subscribeConnectionState(setNetworkOnline), []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRevisionRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  // Refresh the server timestamp while teaching so viewers can distinguish a
  // live session from a stale one after a browser crash or lost connection.
  useEffect(() => {
    if (!sharing || !classroomId || !profile) return;
    const heartbeat = window.setInterval(() => {
      setSession(classroomId, { sharing: true }, profile.uid).catch(() => {
        setLiveError("Live teaching could not refresh its connection. Check the network and current Firestore rules.");
      });
    }, 20_000);
    return () => window.clearInterval(heartbeat);
  }, [sharing, classroomId, profile?.uid]);

  useEffect(() => {
    if (!classroomId || !profile) return;
    return () => {
      if (sharingRef.current) {
        setSession(classroomId, { sharing: false }, profile.uid).catch((error) => {
          console.error("Could not stop the live classroom session", error?.code ?? "unknown");
        });
      }
    };
  }, [classroomId, profile?.uid]);

  useEffect(() => {
    if (lesson) setTitleDraft(lesson.title);
  }, [lesson]);

  const activePage = pages.find((page) => page.id === activePageId) ?? null;
  const activePageIndex = pages.findIndex((page) => page.id === activePageId);
  useEffect(() => {
    if (activePage) setSlideTitleDraft(activePage.title);
  }, [activePage?.id, activePage?.title]);

  const { debounced: debouncedSave, flushNow: flushSaveNow } = useDebouncedCallback(
    async (json: string, pageId: string, revision: number, saveClassroomId: string, saveLessonId: string, scheduledVersion: number): Promise<boolean> => {
      if (conflictedPagesRef.current.has(pageId)) return false;
      if (pageId === activePageId) {
        setSaveStatus("saving");
        setSaveError(null);
      }
      const save = saveQueueRef.current.then(async () => {
        const expectedVersion = Math.max(
          pageVersionsRef.current.get(pageId) ?? 0,
          scheduledVersion
        );
        return savePageSnapshot(saveClassroomId, saveLessonId, pageId, json, expectedVersion);
      });
      saveQueueRef.current = save.then(() => undefined, () => undefined);
      try {
        const nextVersion = await save;
        pageVersionsRef.current.set(pageId, nextVersion);
        if (dirtyRevisionRef.current.get(pageId) === revision) dirtyRevisionRef.current.delete(pageId);
        if (pageId === activePageId) {
          setSaveStatus("saved");
          setSaveError(null);
        }
        return true;
      } catch (error) {
        const stale = error instanceof Error && error.message === "STALE_VERSION";
        if (stale) conflictedPagesRef.current.add(pageId);
        if (pageId === activePageId) {
          setSaveStatus("error");
          setSaveError(error instanceof Error && error.message === "BOARD_SNAPSHOT_TOO_LARGE"
            ? "This slide is too large to save. Remove large content or import images as Storage-backed slides."
            : stale
              ? "A newer version of this slide exists. Reload the saved version before continuing to save."
              : accessibleBoardError("saving this slide", error));
        }
        return false;
      }
    },
    1200
  );

  const { debounced: debouncedLivePush, flushNow: flushLivePush } = useDebouncedCallback((json: string, pageId: string, liveClassroomId: string, liveLessonId: string) => {
    return writeLiveSnapshot(liveClassroomId, liveLessonId, pageId, json, nextLiveSequence())
      .then(() => setLiveError(null))
      .catch((error) => setLiveError(firebaseErrorCode(error) === "permission-denied"
        ? "Live board write was denied. Confirm classroom ownership and deploy the current Firestore rules."
        : "The live snapshot could not be sent. Check the connection and try sharing again."));
  }, 180);

  const handleContentChange = useCallback(
    (json: string) => {
      if (!activePageId) return;
      setPublishSucceeded(false);
      const revision = (dirtyRevisionRef.current.get(activePageId) ?? 0) + 1;
      dirtyRevisionRef.current.set(activePageId, revision);
      if (!classroomId || !lessonId) return;
      const currentVersion = pageVersionsRef.current.get(activePageId)
        ?? pagesRef.current.find((page) => page.id === activePageId)?.version
        ?? 0;
      debouncedSave(json, activePageId, revision, classroomId, lessonId, currentVersion);
      if (sharing && classroomId && lessonId) debouncedLivePush(json, activePageId, classroomId, lessonId);
    },
    [activePageId, classroomId, lessonId, debouncedSave, debouncedLivePush, sharing]
  );

  async function flushCurrentSlide(): Promise<boolean> {
    const pageId = activePageId;
    if (!pageId || !dirtyRevisionRef.current.has(pageId) || !boardRef.current) return true;
    const revision = dirtyRevisionRef.current.get(pageId)!;
    if (!classroomId || !lessonId) return false;
    const expectedVersion = pageVersionsRef.current.get(pageId)
      ?? pagesRef.current.find((page) => page.id === pageId)?.version
      ?? 0;
    return flushSaveNow(boardRef.current.exportJSON(), pageId, revision, classroomId, lessonId, expectedVersion);
  }

  flushSaveRef.current = flushSaveNow;

  async function toggleSharing() {
    if (!classroomId || !profile || sharingBusy) return;
    const next = !sharing;
    setSharingBusy(true);
    setLiveError(null);
    try {
      if (next && !(await flushCurrentSlide())) {
        setLiveError("The slide has not saved yet. Resolve the save error before starting the live class.");
        return;
      }
      if (next && activePageId && lessonId && boardRef.current) {
        await writeLiveSnapshot(classroomId, lessonId, activePageId, boardRef.current.exportJSON(), nextLiveSequence());
      }
      if (!next && activePageId && lessonId && boardRef.current) {
        await flushLivePush(boardRef.current.exportJSON(), activePageId, classroomId, lessonId);
      }
      await setSession(classroomId, {
        sharing: next,
        activeLessonId: next ? lessonId ?? null : liveSession?.activeLessonId ?? null,
        activePageId: next ? activePageId : liveSession?.activePageId ?? null,
      }, profile.uid);
      sharingRef.current = next;
    } catch (error: any) {
      setLiveError(firebaseErrorCode(error) === "permission-denied"
        ? "Firestore denied this session update. Check classroom ownership and deploy the current Firestore rules."
        : "Could not update the live session. Check the connection and try again.");
    } finally {
      setSharingBusy(false);
    }
  }

  async function handleSelectPage(pageId: string) {
    if (pageId === activePageId) return;
    if (!(await flushCurrentSlide())) {
      setPageOperationError("The current slide could not be saved, so it remains open. Retry saving before switching slides.");
      return;
    }
    setActivePageId(pageId);
    setPublishSucceeded(false);
    setPublishError(null);
    pageVersionsRef.current.set(pageId, pagesRef.current.find((page) => page.id === pageId)?.version ?? 0);
    await publishActivePage(pageId);
  }

  async function publishSelection() {
    if (!classroomId || !lessonId || !profile || publishBusy) return;
    setPublishError(null);
    setPublishSucceeded(false);
    if (!(await flushCurrentSlide())) {
      setPublishError("Save the current slide successfully before publishing it.");
      return;
    }
    setPublishBusy(true);
    try {
      const savedPages = await getAllPagesOnce(classroomId, lessonId);
      const targets = publishScope === "slide"
        ? savedPages.filter((page) => page.id === activePageId)
        : savedPages;
      if (targets.length === 0) throw new Error("No saved slides are available to publish.");
      const existing = await getPublishedSlidesOnce(classroomId);
      const targetIds = new Set(targets.map((page) => page.id));
      const updating = existing.some((slide) => targetIds.has(slide.id));
      const blank = targets.some((page) => isBlankSlideSnapshot(page.boardSnapshot));
      if (updating || blank) {
        setPublishConfirmation({ pages: targets, updating, blank });
        return;
      }
      await publishSlides(classroomId, targets, {
        lessonTitle: lesson?.title ?? "Published presentation",
        classroomTitle: classroom?.title ?? "Classroom",
        teacherName: classroom?.teacherName || profile.displayName,
      });
      setPublishSucceeded(true);
    } catch (error) {
      setPublishError(accessibleBoardError("publishing slides", error));
    } finally {
      setPublishBusy(false);
    }
  }

  async function confirmPublish() {
    const confirmation = publishConfirmation;
    if (!confirmation || !classroomId || !profile || publishBusy) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      await publishSlides(classroomId, confirmation.pages, {
        lessonTitle: lesson?.title ?? "Published presentation",
        classroomTitle: classroom?.title ?? "Classroom",
        teacherName: classroom?.teacherName || profile.displayName,
      }, confirmation.blank);
      setPublishSucceeded(true);
      setPublishConfirmation(null);
    } catch (error) {
      setPublishError(accessibleBoardError("publishing slides", error));
    } finally {
      setPublishBusy(false);
    }
  }

  async function copyJoinCode() {
    if (!shareCode || classroom?.status !== "active") return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setShareCodeFeedback("Classroom code copied.");
      window.setTimeout(() => setShareCodeFeedback(null), 2500);
    } catch {
      setShareCodeFeedback("Clipboard access failed. Select and copy the displayed classroom code.");
    }
  }

  async function copyInviteLink() {
    if (!shareCode || classroom?.status !== "active") return;
    const link = new URL("/join", window.location.origin);
    link.searchParams.set("code", shareCode);
    try {
      await navigator.clipboard.writeText(link.toString());
      setShareCodeFeedback("Classroom invite link copied.");
      window.setTimeout(() => setShareCodeFeedback(null), 2500);
    } catch {
      setShareCodeFeedback("Clipboard access failed. Copy the current classroom code into the Join Classroom page.");
    }
  }

  async function createOrRotateJoinCode() {
    if (!classroomId || !classroom || classroom.status !== "active" || !profile || classroom.teacherUid !== profile.uid || rotatingCode) return;
    setRotatingCode(true);
    setShareCodeError(null);
    setShareCodeFeedback(null);
    try {
      const code = await rotateJoinCode(classroomId, classroom.joinCodeHash);
      setShareCode(code);
      setShareCodeFeedback("A new classroom code is ready. The previous code has been revoked.");
      setConfirmRotateCode(false);
    } catch (error) {
      setShareCodeError(firebaseErrorCode(error) === "permission-denied"
        ? "Firebase denied code rotation. Confirm you own this classroom and that the current Firestore rules are deployed."
        : "The classroom code could not be created. Check your connection and try again.");
    } finally {
      setRotatingCode(false);
    }
  }

  async function publishActivePage(pageId: string) {
    if (!sharing || !classroomId || !profile) return;
    try { await setSession(classroomId, { activePageId: pageId }, profile.uid); }
    catch { setLiveError("The live page could not be changed for students. Check the Firestore connection and classroom permissions."); }
  }

  async function handleAddPage() {
    if (!classroomId || !lessonId || addingPageRef.current) return;
    addingPageRef.current = true;
    setAddingPage(true);
    setPageOperationError(null);
    try {
      if (!(await flushCurrentSlide())) {
        setPageOperationError("Save the current slide before adding another slide.");
        return;
      }
      const currentPages = await getAllPagesOnce(classroomId, lessonId);
      const pageNumber = getNextPageNumber(currentPages);
      const id = await createPage(classroomId, lessonId, { pageNumber, pageType: "board" });
      pageVersionsRef.current.set(id, 0);
      setActivePageId(id);
      setPublishSucceeded(false);
      setPublishError(null);
      if (sharing && profile) {
        try {
          await setSession(classroomId, { activePageId: id }, profile.uid);
        } catch {
          setLiveError("The new slide was created, but the live class could not switch to it. Check the connection and classroom permissions.");
        }
      }
      try {
        await setLessonPageCount(classroomId, lessonId, pageNumber);
      } catch (error) {
        setPageOperationError(`Slide ${pageNumber} was saved, but its lesson count could not be updated: ${accessibleBoardError("updating the lesson slide count", error)}`);
      }
    } catch (error) {
      setPageOperationError(accessibleBoardError("adding a slide", error));
    } finally {
      addingPageRef.current = false;
      setAddingPage(false);
    }
  }

  async function handleDuplicatePage(page: LessonPage) {
    if (!classroomId || !lessonId) return;
    setPageOperationError(null);
    if (!(await flushCurrentSlide())) return;
    try {
      const id = await duplicatePage(classroomId, lessonId, page, pages.length + 1);
      pageVersionsRef.current.set(id, 0);
      await setLessonPageCount(classroomId, lessonId, pages.length + 1);
      await handleSelectPage(id);
    } catch (error) {
      setPageOperationError(accessibleBoardError("duplicating a slide", error));
    }
  }

  async function handleDeletePage(page: LessonPage) {
    if (!classroomId || !lessonId || pages.length <= 1) return;
    setPublishSucceeded(false);
    setPageOperationError(null);
    if (activePageId === page.id && !(await flushCurrentSlide())) return;
    try {
      const deleteResult = await deletePage(classroomId, lessonId, page.id);
      const remaining = pages.filter((p) => p.id !== page.id);
      await reorderPages(classroomId, lessonId, remaining.map((p) => p.id));
      await setLessonPageCount(classroomId, lessonId, remaining.length);
      pageVersionsRef.current.delete(page.id);
      dirtyRevisionRef.current.delete(page.id);
      if (activePageId === page.id) {
        const nextPageId = remaining[0]?.id ?? null;
        setActivePageId(nextPageId);
        if (nextPageId) await publishActivePage(nextPageId);
      }
      setConfirmDeletePage(null);
      if (deleteResult.storageCleanupFailed) {
        setPageOperationError("The slide was removed, but its legacy Firebase Storage file could not be deleted. Check Storage permissions and billing; the page itself is no longer referenced.");
      }
    } catch (error) {
      setPageOperationError(accessibleBoardError("deleting this slide", error));
    }
  }

  async function handleMovePage(page: LessonPage, direction: "up" | "down") {
    if (!classroomId || !lessonId) return;
    setPublishSucceeded(false);
    setPageOperationError(null);
    if (!(await flushCurrentSlide())) return;
    const index = pages.findIndex((p) => p.id === page.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= pages.length) return;
    const reordered = [...pages];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    try { await reorderPages(classroomId, lessonId, reordered.map((p) => p.id)); }
    catch (error) { setPageOperationError(accessibleBoardError("reordering slides", error)); }
  }

  async function handleUploadFile(file: File) {
    if (!classroomId || !lessonId) return;
    const validation = validateUploadFile(file);
    if (!validation.ok) {
      setUploadState({ busy: false, message: "", error: validation.error });
      return;
    }
    if (!(await flushCurrentSlide())) {
      setUploadState({ busy: false, message: "", error: "Save the current slide before importing another file." });
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadState({ busy: true, message: "Preparing file locally…", progress: 0 });
    try {
      let pageNumber = pages.length;
      let firstNewId: string | null = null;
      const persistImageSlide = async (dataUrl: string, pageInFile: number, pageCount: number) => {
        if (controller.signal.aborted) throw new DOMException("Import cancelled", "AbortError");
        pageNumber += 1;
        setUploadState({ busy: true, message: `Preparing slide ${pageInFile} of ${pageCount}…`, progress: Math.round(((pageInFile - 1) / pageCount) * 100) });
        const compressed = await compressImageDataUrl(dataUrl);
        const snapshot = await buildSlideSnapshot(compressed);
        if (new TextEncoder().encode(snapshot).byteLength > MAX_BOARD_SNAPSHOT_BYTES) {
          throw new Error("BOARD_SNAPSHOT_TOO_LARGE");
        }
        const pageId = await createPage(classroomId, lessonId, {
          pageNumber,
          pageType: "slide",
          boardSnapshot: snapshot,
          sourceFileName: file.name.slice(0, 200),
          sourceMimeType: validation.mimeType,
          title: validation.kind === "pdf" ? `${file.name} · ${pageInFile}` : file.name,
        });
        await setLessonPageCount(classroomId, lessonId, pageNumber);
        if (!firstNewId) firstNewId = pageId;
      };
      if (validation.kind === "pdf") {
        await processPdfPagesToImages(file, persistImageSlide, 1400, controller.signal, 60);
      } else {
        await persistImageSlide(await fileToDataUrl(file), 1, 1);
      }
      if (firstNewId) await handleSelectPage(firstNewId);
      setUploadState({ busy: false, message: "Import complete. Compressed slide content is saved with the lesson.", progress: 100 });
      setTimeout(() => setUploadState({ busy: false, message: "" }), 3000);
    } catch (err) {
      setUploadState({
        busy: false,
        message: "",
        error: err instanceof DOMException && err.name === "AbortError"
          ? "Import cancelled. Slides completed before cancellation remain saved."
          : getUploadErrorMessage(err),
      });
    } finally {
      uploadAbortRef.current = null;
    }
  }

  async function handleExportPdf(currentOnly: boolean) {
    if (!classroomId || !lessonId || !lesson) return;
    setExporting(true);
    setExportError(null);
    try {
      if (!(await flushCurrentSlide())) throw new Error("SAVE_BEFORE_EXPORT");
      const allPages = currentOnly
        ? activePage ? [activePage] : []
        : await getAllPagesOnce(classroomId, lessonId);
      const images = await Promise.all(allPages.map((page) => renderSnapshotToDataUrl(
        currentOnly && page.id === activePageId && boardRef.current
          ? boardRef.current.exportJSON()
          : page.boardSnapshot
      )));
      exportPagesToPdf(
        images.map((dataUrl) => ({ dataUrl })),
        currentOnly && activePage ? activePage.title : lesson.title
      );
    } catch (error) {
      setExportError(error instanceof Error && error.message === "SAVE_BEFORE_EXPORT"
        ? "Save the current slide before exporting."
        : accessibleBoardError("exporting this PDF", error));
    } finally {
      setExporting(false);
    }
  }

  if (!classroomId || !lessonId) return <Navigate to="/teacher" replace />;
  if (loadError) return <div className="space-y-3 p-4"><Alert tone="error">{loadError}</Alert><Link to={`/teacher/class/${classroomId}`} className="text-sm underline">Back to classroom</Link></div>;
  if (classroom === null || lesson === null) return <Navigate to="/teacher" replace />;
  if (classroom === undefined || lesson === undefined || !profile) {
    return <Spinner label="Loading lesson…" />;
  }
  if (classroom.teacherUid !== profile.uid) return <Navigate to="/unauthorized" replace />;

  return (
    <div className={workspaceLayout.maximized
      ? "fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-[#F5F5F5]"
      : "flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DADD] bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label="Back to classroom" onClick={async () => {
            if (await flushCurrentSlide()) navigate(`/teacher/class/${classroomId}`);
            else if (window.confirm("The latest changes could not be saved. Leave and discard them?")) navigate(`/teacher/class/${classroomId}`);
          }} className="text-[#747780] hover:text-[#303238]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="hidden max-w-40 truncate text-xs text-[#747780] sm:inline">{classroom.title}</span>
          {renaming ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                setRenaming(false);
                if (titleDraft.trim() && titleDraft !== lesson.title) {
                  await renameLesson(classroomId, lessonId, titleDraft.trim());
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="rounded border border-[#D9DADD] px-2 py-1 text-sm"
            />
          ) : (
            <button className="truncate font-medium text-[#303238] hover:underline" onClick={() => setRenaming(true)}>
              {lesson.title}
            </button>
          )}
          <SaveIndicator status={saveStatus} />
          <Button variant="ghost" size="sm" disabled={!activePageId || !dirtyRevisionRef.current.has(activePageId)} loading={saveStatus === "saving"} onClick={() => { void flushCurrentSlide(); }} title="Save current slide now">
            <Save className="h-4 w-4" />Save now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={workspaceLayout.classroomToolbarHidden ? "Show classroom toolbar" : "Hide classroom toolbar"}
            title={workspaceLayout.classroomToolbarHidden ? "Show classroom toolbar" : "Hide classroom toolbar"}
            onClick={() => dispatchLayout({ type: "toggle-classroom-toolbar" })}
          >
            {workspaceLayout.classroomToolbarHidden ? <PanelTopOpen className="h-4 w-4" /> : <PanelTopClose className="h-4 w-4" />}
            <span className="hidden xl:inline">{workspaceLayout.classroomToolbarHidden ? "Show classroom toolbar" : "Hide classroom toolbar"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={workspaceLayout.mainToolbarHidden ? "Show main toolbar" : "Hide main toolbar"}
            title={workspaceLayout.mainToolbarHidden ? "Show main toolbar" : "Hide main toolbar"}
            onClick={() => dispatchLayout({ type: "toggle-main-toolbar" })}
          >
            {workspaceLayout.mainToolbarHidden ? <PanelTopOpen className="h-4 w-4" /> : <PanelTopClose className="h-4 w-4" />}
            <span className="hidden xl:inline">{workspaceLayout.mainToolbarHidden ? "Show main toolbar" : "Hide main toolbar"}</span>
          </Button>
        </div>
      </div>

      {!workspaceLayout.mainToolbarHidden && <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#D9DADD] bg-white px-4 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadFile(file);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => uploadState.busy ? uploadAbortRef.current?.abort() : fileInputRef.current?.click()}>
            {uploadState.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploadState.busy ? "Cancel import" : "Upload PDF / image"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExportPdf(false)} loading={exporting}>
            <Download className="h-4 w-4" />
            Export presentation
          </Button>
          <span className={`text-xs ${networkOnline && sessionConfirmed && sharing && clockNow - (liveSession?.updatedAt ?? 0) < 60_000 ? "text-[#2e6b31]" : "text-[#747780]"}`} aria-live="polite">
            {!networkOnline ? "Offline" : !sessionConfirmed ? "Connecting" : sharing && clockNow - (liveSession?.updatedAt ?? 0) < 60_000 ? "Live" : sharing ? "Reconnecting" : "Offline"}
          </span>
          <select
            aria-label="Slides to publish"
            value={publishScope}
            onChange={(event) => { setPublishScope(event.target.value as PublishScope); setPublishSucceeded(false); setPublishError(null); }}
            className="h-8 rounded border border-[#D9DADD] bg-white px-2 text-xs text-[#303238]"
            disabled={publishBusy}
          >
            <option value="slide">Selected slide</option>
            <option value="presentation">Complete presentation</option>
          </select>
          <Button variant={publishSucceeded ? "secondary" : "primary"} size="sm" onClick={() => { void publishSelection(); }} loading={publishBusy} disabled={!activePageId || pages.length === 0}>
            {publishSucceeded ? "Published" : publishBusy ? "Publishing…" : "Publish"}
          </Button>
          <Button variant="secondary" size="sm" aria-label={workspaceLayout.maximized ? "Restore board" : "Maximize board"} title={workspaceLayout.maximized ? "Restore board" : "Maximize board"} onClick={() => dispatchLayout({ type: "toggle-maximized" })}>
            {workspaceLayout.maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{workspaceLayout.maximized ? "Restore board" : "Maximize board"}</span>
          </Button>
          <Button variant={sharing ? "primary" : "secondary"} size="sm" onClick={toggleSharing} loading={sharingBusy} disabled={!activePageId}>
            <Radio className="h-4 w-4" />
            {sharing ? "End live class" : "Start live class"}
          </Button>
      </div>}

      {!workspaceLayout.classroomToolbarHidden && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DADD] bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#747780]">
          <span className="font-medium text-[#303238]">Classroom Code:</span>
          <code className="select-all rounded border border-[#D9DADD] bg-[#F5F5F5] px-2 py-1 font-mono tracking-widest text-[#303238]">
            {classroom.status !== "active" ? "Unavailable while classroom is closed" : shareCode === undefined ? "Loading…" : shareCode ?? "No active code"}
          </code>
          {classroom.status === "active" && shareCode && <Button variant="secondary" size="sm" onClick={() => { void copyJoinCode(); }}><Copy className="h-3.5 w-3.5" />Copy Code</Button>}
          {classroom.status === "active" && shareCode && <Button variant="ghost" size="sm" onClick={() => { void copyInviteLink(); }}><Link2 className="h-3.5 w-3.5" />Copy Invite Link</Button>}
          {classroom.status === "active" && shareCode === null && !shareCodeError && <Button variant="secondary" size="sm" onClick={() => { void createOrRotateJoinCode(); }} loading={rotatingCode}><RefreshCw className="h-3.5 w-3.5" />Generate Code</Button>}
          {classroom.status === "active" && shareCode && <Button variant="ghost" size="sm" onClick={() => setConfirmRotateCode(true)} disabled={rotatingCode}><RefreshCw className="h-3.5 w-3.5" />Rotate Code</Button>}
        </div>
        {shareCodeFeedback && <span role="status" className={`text-xs ${shareCodeFeedback.startsWith("Clipboard") ? "text-[#a33]" : "text-[#2e6b31]"}`}>{shareCodeFeedback}</span>}
      </div>}

      {uploadState.error && (
        <div className="px-4 pt-2">
          <Alert tone="error">{uploadState.error}</Alert>
        </div>
      )}
      {shareCodeError && <div className="px-4 pt-2"><Alert tone="error">{shareCodeError}</Alert></div>}
      {liveError && <div className="px-4 pt-2"><Alert tone="error">{liveError}</Alert></div>}
      {publishError && <div className="px-4 pt-2"><Alert tone="error">{publishError}</Alert></div>}
      {publishSucceeded && <div className="px-4 pt-2"><Alert tone="success">Published slides are available to authorized students, whether or not the live class is running.</Alert></div>}
      {pageLoadError && <div className="px-4 pt-2"><Alert tone="error">{pageLoadError}</Alert></div>}
      {pageOperationError && <div className="px-4 pt-2"><Alert tone="error">{pageOperationError}</Alert></div>}
      {saveError && <div className="flex items-center justify-between gap-3 px-4 pt-2"><Alert tone="error">{saveError}</Alert><Button size="sm" variant="secondary" onClick={async () => {
        if (!activePageId || !classroomId || !lessonId) return;
        if (conflictedPagesRef.current.has(activePageId)) {
          try {
            const latest = (await getAllPagesOnce(classroomId, lessonId)).find((page) => page.id === activePageId);
            if (!latest) throw new Error("The saved slide no longer exists.");
            conflictedPagesRef.current.delete(activePageId);
            dirtyRevisionRef.current.delete(activePageId);
            pageVersionsRef.current.set(activePageId, latest.version);
            setSaveError(null);
            setSaveStatus("saved");
            await boardRef.current?.loadFromJSON(latest.boardSnapshot);
          } catch (error) { setPageOperationError(accessibleBoardError("reloading the saved slide", error)); }
          return;
        }
        const revision = dirtyRevisionRef.current.get(activePageId);
        if (revision !== undefined && boardRef.current) void flushSaveNow(boardRef.current.exportJSON(), activePageId, revision, classroomId, lessonId, pageVersionsRef.current.get(activePageId) ?? 0);
      }}>{activePageId && conflictedPagesRef.current.has(activePageId) ? "Reload saved slide" : "Retry save"}</Button></div>}
      {exportError && <div className="px-4 pt-2"><Alert tone="error">{exportError}</Alert></div>}
      {uploadState.busy && uploadState.progress !== undefined && <div className="px-4 pt-2"><progress className="h-2 w-full" max={100} value={uploadState.progress} aria-label="Upload progress" /></div>}
      {uploadState.message && (
        <div className="px-4 pt-2">
          <Alert tone="info">{uploadState.message}</Alert>
        </div>
      )}

      <div data-testid="whiteboard-workspace" className="flex min-h-0 w-full min-w-0 flex-1">
        {!workspaceLayout.pagesCollapsed && !workspaceLayout.maximized && <PageList
          key="pages-sidebar"
          pages={pages}
          activePageId={activePageId}
          onSelect={handleSelectPage}
          onAdd={handleAddPage}
          onDuplicate={handleDuplicatePage}
          onDelete={setConfirmDeletePage}
          onMove={handleMovePage}
          onCollapse={() => dispatchLayout({ type: "toggle-pages" })}
          addingPage={addingPage}
        />}
        <div key="board-pane" data-testid="whiteboard-board-pane" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!activePage && workspaceLayout.pagesCollapsed && !workspaceLayout.maximized && <div className="border-b border-[#D9DADD] bg-white px-3 py-2"><button type="button" aria-label="Expand Pages sidebar" onClick={() => dispatchLayout({ type: "toggle-pages" })} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#303238] hover:bg-[#F5F5F5]"><PanelLeftOpen className="h-4 w-4" />Pages</button></div>}
          {activePage && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DADD] bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-[#747780]">
              {workspaceLayout.pagesCollapsed && !workspaceLayout.maximized && <button type="button" aria-label="Expand Pages sidebar" title="Expand Pages sidebar" onClick={() => dispatchLayout({ type: "toggle-pages" })} className="flex h-7 w-7 items-center justify-center rounded border border-[#D9DADD] text-[#303238] hover:bg-[#F5F5F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]"><PanelLeftOpen className="h-4 w-4" /></button>}
              <span>Slide {activePageIndex + 1} of {pages.length}</span>
              <input aria-label="Slide title" value={slideTitleDraft} maxLength={100} onChange={(event) => { setSlideTitleDraft(event.target.value); setPublishSucceeded(false); }} onBlur={() => { if (classroomId && lessonId && activePage && slideTitleDraft.trim() && slideTitleDraft !== activePage.title) void saveSlideTitle(classroomId, lessonId, activePage.id, slideTitleDraft).catch((error) => setPageOperationError(accessibleBoardError("renaming this slide", error))); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-36 rounded border border-[#D9DADD] px-2 py-1 text-xs text-[#303238]" />
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" disabled={activePageIndex <= 0} onClick={() => { if (pages[activePageIndex - 1]) void handleSelectPage(pages[activePageIndex - 1].id); }} aria-label="Previous slide"><ChevronLeft className="h-4 w-4" />Previous</Button>
              <Button size="sm" variant="secondary" disabled={activePageIndex < 0 || activePageIndex >= pages.length - 1} onClick={() => { if (pages[activePageIndex + 1]) void handleSelectPage(pages[activePageIndex + 1].id); }} aria-label="Next slide">Next<ChevronRight className="h-4 w-4" /></Button>
              <Button size="sm" variant="secondary" aria-label="Add new slide" title="Add new slide" onClick={() => { void handleAddPage(); }} loading={addingPage} disabled={!classroomId || !lessonId}>
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">{addingPage ? "Adding…" : "Add slide"}</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void handleExportPdf(true)} loading={exporting}><Download className="h-4 w-4" />Export slide</Button>
            </div>
          </div>}
          {activePageId && (
            <CanvasBoard
              ref={boardRef}
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              pageKey={activePageId}
              onContentChange={handleContentChange}
              onHistoryChange={setHistory}
              onToolConsumed={() => setTool("select")}
            />
          )}
        </div>
        <ToolsPanel
          collapsed={workspaceLayout.toolsCollapsed}
          onToggle={() => dispatchLayout({ type: "toggle-tools" })}
        >
          <Toolbar
            orientation="vertical"
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            strokeWidth={strokeWidth}
            onStrokeWidthChange={setStrokeWidth}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => boardRef.current?.undo()}
            onRedo={() => boardRef.current?.redo()}
            onClear={() => setConfirmClear(true)}
            onZoomIn={() => boardRef.current?.zoomIn()}
            onZoomOut={() => boardRef.current?.zoomOut()}
            onFitToScreen={() => boardRef.current?.fitToScreen()}
            onAddShape={(preset: ShapePreset, fill?: string) => boardRef.current?.addShape(preset, fill)}
            onAddTable={(rows, columns) => boardRef.current?.addTable(rows, columns)}
            onAddMathText={(value) => boardRef.current?.addMathText(value)}
          />
        </ToolsPanel>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this page?"
        description="All drawings on this page will be removed. This can be undone with Undo right after."
        confirmLabel="Clear"
        danger
        onConfirm={() => {
          boardRef.current?.clearCanvas();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        open={confirmDeletePage !== null}
        title="Delete this page?"
        description="This page and its content will be permanently removed."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDeletePage && handleDeletePage(confirmDeletePage)}
        onCancel={() => setConfirmDeletePage(null)}
      />
      <ConfirmDialog
        open={publishConfirmation !== null}
        title={publishConfirmation?.updating ? "Update published slides?" : "Publish blank slide?"}
        description={`${publishConfirmation?.updating ? "Students will see the latest saved version of the existing slide IDs." : "One or more selected slides are blank. Publish them anyway?"}${publishConfirmation?.blank && publishConfirmation?.updating ? " The selection also contains blank slides." : ""}`}
        confirmLabel={publishConfirmation?.updating ? "Update published" : "Publish blank slides"}
        onConfirm={() => { void confirmPublish(); }}
        onCancel={() => setPublishConfirmation(null)}
      />
      <ConfirmDialog
        open={confirmRotateCode}
        title="Rotate classroom code?"
        description="The current 16-character code will stop working immediately. Students who have not joined yet will need the new code."
        confirmLabel="Rotate code"
        onConfirm={() => { void createOrRotateJoinCode(); }}
        onCancel={() => setConfirmRotateCode(false)}
      />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-[#747780]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-[#2e6b31]">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  return <span className="flex items-center gap-1 text-xs text-[#a33]"><CloudOff className="h-3.5 w-3.5" /> Save failed</span>;
}

function accessibleBoardError(action: string, error: unknown): string {
  const code = firebaseErrorCode(error);
  if (code === "permission-denied") return `You do not have permission for ${action}. Confirm this classroom belongs to your account and that the current Firestore rules are deployed.`;
  if (code === "unavailable" || code === "network-request-failed") return `Could not complete ${action} because the service is unavailable. Check your connection and retry.`;
  if (error instanceof Error && error.message && !error.message.startsWith("FirebaseError:")) return `Could not complete ${action}: ${error.message}`;
  return `Could not complete ${action}. Check your connection and try again.`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function firebaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : undefined;
}
