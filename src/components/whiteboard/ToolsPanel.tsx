import type { ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

interface ToolsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function ToolsPanel({ collapsed, onToggle, children }: ToolsPanelProps) {
  const label = collapsed ? "Expand tools sidebar" : "Collapse tools sidebar";
  return (
    <aside
      aria-label="Whiteboard tools sidebar"
      data-testid="whiteboard-tools-sidebar"
      className={`relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[#D9DADD] bg-white transition-[width] duration-200 ease-in-out ${collapsed ? "w-9" : "w-[4.5rem]"}`}
    >
      <div className="flex shrink-0 items-center justify-center border-b border-[#D9DADD] p-1">
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded text-[#303238] hover:bg-[#EEEEF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]"
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
    </aside>
  );
}
