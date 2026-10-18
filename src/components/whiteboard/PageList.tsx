import { Copy, FileImage, Loader2, PanelLeftClose, PenSquare, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/utils/cn";
import type { LessonPage } from "@/types";

interface PageListProps {
  pages: LessonPage[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onDuplicate: (page: LessonPage) => void;
  onDelete: (page: LessonPage) => void;
  onMove: (page: LessonPage, direction: "up" | "down") => void;
  onCollapse: () => void;
  addingPage?: boolean;
}

export function PageList({ pages, activePageId, onSelect, onAdd, onDuplicate, onDelete, onMove, onCollapse, addingPage = false }: PageListProps) {
  return (
    <div className="flex h-full w-56 flex-col border-r border-[#D9DADD] bg-white">
      <div className="flex items-center justify-between border-b border-[#D9DADD] px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#747780]">Pages</span>
          <button type="button" aria-label="Collapse Pages sidebar" title="Collapse Pages sidebar" onClick={onCollapse} className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#EEEEF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]">
            <PanelLeftClose className="h-4 w-4 text-[#303238]" />
          </button>
        </div>
        <button type="button" aria-label="Add new slide" title="Add new slide" disabled={addingPage} onClick={onAdd} className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#EEEEF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238] disabled:cursor-wait disabled:opacity-60">
          {addingPage ? <Loader2 className="h-4 w-4 animate-spin text-[#303238]" /> : <Plus className="h-4 w-4 text-[#303238]" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={cn(
              "group mb-2 cursor-pointer rounded-md border p-2 text-left text-xs transition-colors",
              page.id === activePageId
                ? "border-[#303238] bg-[#EEEEF0]"
                : "border-[#D9DADD] hover:bg-[#F5F5F5]"
            )}
            onClick={() => onSelect(page.id)}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-medium text-[#303238]">
                {page.pageType === "slide" && <FileImage className="h-3.5 w-3.5" />}
                {!page.pageType || page.pageType === "board" ? <PenSquare className="h-3.5 w-3.5" /> : null}
                {page.title || `Slide ${index + 1}`}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-[#747780]" title={`Slide ID: ${page.id}`}>
              Slide ID: {page.id}
            </p>
            <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                title="Move up"
                aria-label="Move page up"
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(page, "up");
                }}
                className="rounded p-1 hover:bg-white disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Move down"
                aria-label="Move page down"
                disabled={index === pages.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(page, "down");
                }}
                className="rounded p-1 hover:bg-white disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Duplicate page"
                aria-label="Duplicate page"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(page);
                }}
                className="rounded p-1 hover:bg-white"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete page"
                aria-label="Delete page"
                disabled={pages.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(page);
                }}
                className="rounded p-1 hover:bg-white disabled:opacity-30"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
