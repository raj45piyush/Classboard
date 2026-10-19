import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { LessonPage } from "@/types";
import type { ReactNode } from "react";

export type BoardSaveState = "idle" | "saving" | "saved" | "error";

interface BoardDetailsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  page: LessonPage | null;
  pageNumber: number;
  pageCount: number;
  saveState: BoardSaveState;
}

export function BoardDetailsPanel({ collapsed, onToggle, page, pageNumber, pageCount, saveState }: BoardDetailsPanelProps) {
  const toggleLabel = collapsed ? "Expand right sidebar" : "Collapse right sidebar";
  const saveLabel = saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Not changed";

  return (
    <aside
      aria-label="Slide details sidebar"
      className={`relative h-full shrink-0 overflow-hidden border-l border-[#D9DADD] bg-white transition-[width] duration-200 ease-in-out ${collapsed ? "w-9" : "w-40 md:w-56"}`}
      data-testid="board-details-sidebar"
    >
      {collapsed ? (
        <div className="flex h-full w-9 justify-center pt-2">
          <SidebarToggle collapsed onClick={onToggle} label={toggleLabel}>
            <PanelRightOpen className="h-4 w-4" />
          </SidebarToggle>
        </div>
      ) : (
        <div className="flex h-full w-40 flex-col md:w-56">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#D9DADD] px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#747780]">Slide details</h2>
            <SidebarToggle collapsed={false} onClick={onToggle} label={toggleLabel}>
              <PanelRightClose className="h-4 w-4" />
            </SidebarToggle>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs">
            {page ? (
              <>
                <Detail label="Slide" value={`${pageNumber} of ${pageCount}`} />
                <Detail label="Title" value={page.title || `Slide ${pageNumber}`} />
                <Detail label="Slide ID" value={page.id} mono />
                <Detail label="Canvas" value="1280 × 2160" />
                <Detail label="Save status" value={saveLabel} />
              </>
            ) : <p className="text-[#747780]">Select a slide to view its details.</p>}
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarToggle({ collapsed, onClick, label, children }: { collapsed: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#303238] hover:bg-[#EEEEF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]"
    >
      {children}
    </button>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#747780]">{label}</p>
      <p className={`break-all text-[#303238] ${mono ? "font-mono text-[10px]" : "text-xs"}`}>{value}</p>
    </div>
  );
}
