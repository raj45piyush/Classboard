import { useState } from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2,
  Pencil,
  Eraser,
  Type,
  Minus,
  Square,
  Circle as CircleIcon,
  ArrowUpRight,
  Trash2,
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
  orientation?: "horizontal" | "vertical";
  tool: ToolName;
  onToolChange: (tool: ToolName) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  zoomPercent: number;
  onAddShape: (preset: ShapePreset, fill?: string) => void;
  onAddTable: (rows: number, columns: number) => void;
  onAddMathText: (value: string) => void;
}

const TOOLS: { id: ToolName; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pen", label: "Pen", icon: Pencil },
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
  vertical = false,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  vertical?: boolean;
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
        `flex h-8 ${vertical ? "w-full" : "w-8"} items-center justify-center rounded-md border text-[#303238] transition-colors`,
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
    orientation = "horizontal",
    tool,
    onToolChange,
    color,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    eraserSize,
    onEraserSizeChange,
    onClear,
    onZoomIn,
    onZoomOut,
    onFitToScreen,
    zoomPercent,
    onAddShape,
    onAddTable,
    onAddMathText,
  } = props;
  const [menu, setMenu] = useState<"shapes" | "table" | "symbols" | null>(null);
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [filled, setFilled] = useState(false);
  const vertical = orientation === "vertical";
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const toggleMenu = (name: "shapes" | "table" | "symbols", button: HTMLButtonElement) => {
    if (menu === name) {
      setMenu(null);
      setMenuPosition(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = name === "shapes" ? 288 : name === "table" ? 256 : 224;
    const height = name === "shapes" ? Math.min(window.innerHeight * .65, 460) : name === "table" ? 170 : 240;
    const left = vertical
      ? Math.max(8, rect.left - width - 8)
      : Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = vertical
      ? Math.max(8, Math.min(rect.top - 8, window.innerHeight - height - 8))
      : Math.max(8, rect.bottom + 6);
    setMenu(name);
    setMenuPosition({ left, top });
  };

  return (
    <div role="toolbar" aria-label="Whiteboard tools" aria-orientation={vertical ? "vertical" : "horizontal"} className={vertical
      ? "flex w-full flex-col items-stretch gap-2 bg-white px-2 py-2"
      : "flex flex-wrap items-center gap-2 border-b border-[#D9DADD] bg-white px-3 py-2"}>
      <div className={vertical ? "flex flex-col items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-1 border-r border-[#D9DADD] pr-2"}>
        {TOOLS.map((t) => (
          <ToolbarButton key={t.id} vertical={vertical} active={tool === t.id} label={t.label} onClick={() => onToolChange(t.id)}>
            <t.icon className="h-4 w-4" />
          </ToolbarButton>
        ))}
      </div>

      <div className={vertical ? "flex flex-col items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-1 border-r border-[#D9DADD] pr-2"}>
        <div>
          <ToolbarButton vertical={vertical} label="Mathematical shapes" active={menu === "shapes"} onClick={(event) => toggleMenu("shapes", event.currentTarget)}>
            <Shapes className="h-4 w-4" />
          </ToolbarButton>
        </div>
        <div>
          <ToolbarButton vertical={vertical} label="Insert table" active={menu === "table"} onClick={(event) => toggleMenu("table", event.currentTarget)}>
            <Table2 className="h-4 w-4" />
          </ToolbarButton>
        </div>
        <div>
          <ToolbarButton vertical={vertical} label="Math symbols" active={menu === "symbols"} onClick={(event) => toggleMenu("symbols", event.currentTarget)}>
            <Sigma className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      <div className={vertical ? "grid grid-cols-2 justify-items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-1.5 border-r border-[#D9DADD] pr-2"}>
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

      <div className={vertical ? "flex flex-col items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-2 border-r border-[#D9DADD] pr-2"}>
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
          className={vertical ? "h-20 w-4 accent-[#303238] [writing-mode:vertical-lr]" : "w-20 accent-[#303238]"}
          style={vertical ? { direction: "rtl" } : undefined}
        />
      </div>

      {tool === "eraser" && <div className={vertical ? "flex flex-col items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-2 border-r border-[#D9DADD] pr-2"}>
        <label htmlFor="eraser-size" className="text-[10px] leading-tight text-[#747780]">Eraser {eraserSize}px</label>
        <input
          id="eraser-size"
          type="range"
          min={10}
          max={60}
          step={10}
          value={eraserSize}
          onChange={(e) => onEraserSizeChange(Number(e.target.value))}
          className={vertical ? "h-20 w-4 accent-[#303238] [writing-mode:vertical-lr]" : "w-24 accent-[#303238]"}
          style={vertical ? { direction: "rtl" } : undefined}
        />
      </div>}

      <div className={vertical ? "flex flex-col items-center gap-1 border-b border-[#D9DADD] pb-2" : "flex items-center gap-1 border-r border-[#D9DADD] pr-2"}>
        <ToolbarButton vertical={vertical} label="Clear page" onClick={onClear}>
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div className={vertical ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}>
        <ToolbarButton vertical={vertical} label="Zoom out" onClick={onZoomOut}>
          <span aria-hidden="true" className="text-lg leading-none">−</span>
        </ToolbarButton>
        <span aria-label={`Zoom ${zoomPercent}%`} className="min-w-10 text-center text-[11px] tabular-nums text-[#747780]">{zoomPercent}%</span>
        <ToolbarButton vertical={vertical} label="Fit to screen" onClick={onFitToScreen}>
          <Maximize className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton vertical={vertical} label="Zoom in" onClick={onZoomIn}>
          <span aria-hidden="true" className="text-lg leading-none">+</span>
        </ToolbarButton>
      </div>

      {menu && menuPosition && createPortal(
        <div
          style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top }}
          className="z-[100] max-h-[65vh] overflow-auto rounded-md border border-[#D9DADD] bg-white p-2 shadow-lg"
        >
          {menu === "shapes" && <div role="group" aria-label="Mathematical shapes" className="grid w-72 grid-cols-2 gap-1">
            <label className="col-span-2 flex items-center gap-2 px-2 py-1 text-xs text-[#747780]"><input type="checkbox" checked={filled} onChange={(event) => setFilled(event.target.checked)} />Fill shapes with selected colour</label>
            {SHAPE_PRESETS.map((preset) => <button key={preset} type="button" onClick={() => { onAddShape(preset, filled ? color : "transparent"); setMenu(null); setMenuPosition(null); }} className="rounded px-2 py-1.5 text-left text-xs text-[#303238] hover:bg-[#F5F5F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]">{SHAPE_LABELS[preset]}</button>)}
          </div>}
          {menu === "table" && <form aria-label="Insert table" className="w-60 space-y-2 p-1" onSubmit={(event) => { event.preventDefault(); onAddTable(rows, columns); setMenu(null); setMenuPosition(null); }}>
            <p className="text-xs font-medium text-[#303238]">Editable table</p>
            <div className="flex gap-2 text-xs text-[#747780]">
              <label className="flex items-center gap-1">Rows<input aria-label="Table rows" type="number" min={1} max={12} value={rows} onChange={(event) => setRows(Number(event.target.value))} className="w-14 rounded border border-[#D9DADD] px-1.5 py-1 text-[#303238]" /></label>
              <label className="flex items-center gap-1">Columns<input aria-label="Table columns" type="number" min={1} max={10} value={columns} onChange={(event) => setColumns(Number(event.target.value))} className="w-14 rounded border border-[#D9DADD] px-1.5 py-1 text-[#303238]" /></label>
            </div>
            <button type="submit" className="rounded bg-[#303238] px-3 py-1.5 text-xs text-white">Insert table</button>
          </form>}
          {menu === "symbols" && <div role="group" aria-label="Math symbols" className="grid w-56 grid-cols-4 gap-1">
            {["π", "θ", "∞", "√", "±", "×", "÷", "≤", "≥", "≠", "∑", "∫", "α", "β", "x²", "a₁", "½", "¼", "⅓", "ⁿ"].map((symbol) => <button key={symbol} type="button" aria-label={`Insert ${symbol}`} onClick={() => { onAddMathText(symbol); setMenu(null); setMenuPosition(null); }} className="rounded border border-[#EEEEF0] p-1.5 text-sm text-[#303238] hover:bg-[#F5F5F5]">{symbol}</button>)}
          </div>}
        </div>, document.body
      )}
    </div>
  );
}
