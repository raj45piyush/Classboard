import { useState } from "react";
import {
  MousePointer2,
  Pencil,
  Eraser,
  Type,
  Minus,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  Shapes,
  Table2,
  Sigma,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { PALETTE } from "@/constants/board";
import type { ToolName } from "./CanvasBoard";
import { SHAPE_LABELS, SHAPE_PRESETS, type ShapePreset } from "./mathShapes";

interface ToolbarProps {
  tool: ToolName;
  onToolChange: (tool: ToolName) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onAddShape: (preset: ShapePreset, fill?: string) => void;
  onAddTable: (rows: number, columns: number) => void;
  onAddMathText: (value: string) => void;
}

const TOOLS: { id: ToolName; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pen", label: "Write", icon: Pencil },
  { id: "move", label: "Move", icon: Move },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "text", label: "Text", icon: Type },
  { id: "line", label: "Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: CircleIcon },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
];

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border text-[#303238] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#303238]",
        active ? "border-[#303238] bg-[#303238] text-white" : "border-transparent hover:bg-[#EEEEF0]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  const {
    tool,
    onToolChange,
    color,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClear,
    onZoomIn,
    onZoomOut,
    onFitToScreen,
    onAddShape,
    onAddTable,
    onAddMathText,
  } = props;
  const [menu, setMenu] = useState<"shapes" | "table" | "symbols" | null>(null);
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [filled, setFilled] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#D9DADD] bg-white px-3 py-2">
      <div className="flex items-center gap-1 border-r border-[#D9DADD] pr-2">
        {TOOLS.map((t) => (
          <ToolbarButton key={t.id} active={tool === t.id} label={t.label} onClick={() => onToolChange(t.id)}>
            <t.icon className="h-4 w-4" />
          </ToolbarButton>
        ))}
      </div>

      <div className="flex items-center gap-1 border-r border-[#D9DADD] pr-2">
        <div className="relative">
          <ToolbarButton label="Mathematical shapes" active={menu === "shapes"} onClick={() => setMenu(menu === "shapes" ? null : "shapes")}>
            <Shapes className="h-4 w-4" />
          </ToolbarButton>
          {menu === "shapes" && <div role="group" aria-label="Mathematical shapes" className="absolute left-0 top-9 z-30 grid max-h-[65vh] w-72 grid-cols-2 gap-1 overflow-auto rounded-md border border-[#D9DADD] bg-white p-2 shadow-lg">
            <label className="col-span-2 flex items-center gap-2 px-2 py-1 text-xs text-[#747780]"><input type="checkbox" checked={filled} onChange={(event) => setFilled(event.target.checked)} />Fill shapes with selected colour</label>
            {SHAPE_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => { onAddShape(preset, filled ? color : "transparent"); setMenu(null); }} className="rounded px-2 py-1.5 text-left text-xs text-[#303238] hover:bg-[#F5F5F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]">{SHAPE_LABELS[preset]}</button>)}
          </div>}
        </div>
        <div className="relative">
          <ToolbarButton label="Insert table" active={menu === "table"} onClick={() => setMenu(menu === "table" ? null : "table")}>
            <Table2 className="h-4 w-4" />
          </ToolbarButton>
          {menu === "table" && <form aria-label="Insert table" className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-md border border-[#D9DADD] bg-white p-3 shadow-lg" onSubmit={(event) => { event.preventDefault(); onAddTable(rows, columns); setMenu(null); }}>
            <p className="text-xs font-medium text-[#303238]">Editable table</p>
            <div className="flex gap-2 text-xs text-[#747780]">
              <label className="flex items-center gap-1">Rows<input aria-label="Table rows" type="number" min={1} max={12} value={rows} onChange={(event) => setRows(Number(event.target.value))} className="w-14 rounded border border-[#D9DADD] px-1.5 py-1 text-[#303238]" /></label>
              <label className="flex items-center gap-1">Columns<input aria-label="Table columns" type="number" min={1} max={10} value={columns} onChange={(event) => setColumns(Number(event.target.value))} className="w-14 rounded border border-[#D9DADD] px-1.5 py-1 text-[#303238]" /></label>
            </div>
            <button type="submit" className="rounded bg-[#303238] px-3 py-1.5 text-xs text-white">Insert table</button>
          </form>}
        </div>
        <div className="relative">
          <ToolbarButton label="Math symbols" active={menu === "symbols"} onClick={() => setMenu(menu === "symbols" ? null : "symbols")}>
            <Sigma className="h-4 w-4" />
          </ToolbarButton>
          {menu === "symbols" && <div role="group" aria-label="Math symbols" className="absolute left-0 top-9 z-30 grid w-56 grid-cols-4 gap-1 rounded-md border border-[#D9DADD] bg-white p-2 shadow-lg">
            {["π", "θ", "∞", "√", "±", "×", "÷", "≤", "≥", "≠", "∑", "∫", "α", "β", "x²", "a₁", "½", "¼", "⅓", "ⁿ"].map((symbol) => <button key={symbol} type="button" aria-label={`Insert ${symbol}`} onClick={() => { onAddMathText(symbol); setMenu(null); }} className="rounded border border-[#EEEEF0] p-1.5 text-sm text-[#303238] hover:bg-[#F5F5F5]">{symbol}</button>)}
          </div>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-r border-[#D9DADD] pr-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            onClick={() => onColorChange(c)}
            className={cn(
              "h-6 w-6 rounded-full border-2",
              color === c ? "border-[#303238]" : "border-white"
            )}
            style={{ backgroundColor: c, boxShadow: "0 0 0 1px #D9DADD" }}
          />
        ))}
        <input
          type="color"
          aria-label="Custom colour"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-[#D9DADD] bg-transparent p-0"
        />
      </div>

      <div className="flex items-center gap-2 border-r border-[#D9DADD] pr-2">
        <label htmlFor="stroke-width" className="text-xs text-[#747780]">
          Thickness
        </label>
        <input
          id="stroke-width"
          type="range"
          min={1}
          max={16}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="w-20 accent-[#303238]"
        />
      </div>

      <div className="flex items-center gap-1 border-r border-[#D9DADD] pr-2">
        <ToolbarButton label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Clear page" onClick={onClear}>
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1">
        <ToolbarButton label="Zoom out" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Fit to screen" onClick={onFitToScreen}>
          <Maximize className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Zoom in" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}
