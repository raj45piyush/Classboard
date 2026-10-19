import { Circle, Ellipse, Group, IText, Line, Polygon, Rect, Triangle, type FabricObject } from "fabric";

export const SHAPE_PRESETS = [
  "double-arrow", "rounded-rectangle", "square", "oval", "triangle", "right-triangle", "diamond",
  "parallelogram", "trapezoid", "pentagon", "hexagon", "octagon", "star", "polygon",
  "angle", "parallel-lines", "perpendicular-lines", "axes", "grid", "number-line",
  "protractor", "cube", "cuboid", "cylinder", "cone", "sphere", "venn", "flowchart", "flowchart-process", "flowchart-terminator",
  "brace", "bracket",
] as const;
export type ShapePreset = typeof SHAPE_PRESETS[number];

export const SHAPE_LABELS: Record<ShapePreset, string> = {
  "double-arrow": "Double arrow", "rounded-rectangle": "Rounded rectangle", square: "Square", oval: "Oval",
  triangle: "Triangle", "right-triangle": "Right triangle", diamond: "Diamond", parallelogram: "Parallelogram", trapezoid: "Trapezoid",
  pentagon: "Pentagon", hexagon: "Hexagon", octagon: "Octagon", star: "Star", polygon: "Polygon",
  angle: "Angle", "parallel-lines": "Parallel lines", "perpendicular-lines": "Perpendicular lines", axes: "Coordinate axes",
  grid: "Grid / graph paper", "number-line": "Number line", protractor: "Protractor guide", cube: "Cube",
  cuboid: "Cuboid", cylinder: "Cylinder", cone: "Cone", sphere: "Sphere", venn: "Venn diagram",
  flowchart: "Flowchart decision", "flowchart-process": "Flowchart process", "flowchart-terminator": "Flowchart terminator", brace: "Brace", bracket: "Bracket",
};

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 140;

function polygonPoints(kind: ShapePreset, width: number, height: number): { x: number; y: number }[] {
  const w = width, h = height;
  switch (kind) {
    case "square": return [{ x: 0, y: 0 }, { x: h, y: 0 }, { x: h, y: h }, { x: 0, y: h }];
    case "triangle": return [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case "right-triangle": return [{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case "diamond": return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }];
    case "parallelogram": return [{ x: w * .22, y: 0 }, { x: w, y: 0 }, { x: w * .78, y: h }, { x: 0, y: h }];
    case "trapezoid": return [{ x: w * .2, y: 0 }, { x: w * .8, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case "pentagon": case "hexagon": case "octagon": case "polygon": {
      const sides = kind === "pentagon" ? 5 : kind === "hexagon" ? 6 : kind === "octagon" ? 8 : 7;
      return Array.from({ length: sides }, (_, i) => ({ x: w / 2 + Math.cos(i * 2 * Math.PI / sides - Math.PI / 2) * w / 2, y: h / 2 + Math.sin(i * 2 * Math.PI / sides - Math.PI / 2) * h / 2 }));
    }
    case "star": return Array.from({ length: 10 }, (_, i) => {
      const radius = i % 2 === 0 ? 1 : .43;
      return { x: w / 2 + Math.cos(i * Math.PI / 5 - Math.PI / 2) * w / 2 * radius, y: h / 2 + Math.sin(i * Math.PI / 5 - Math.PI / 2) * h / 2 * radius };
    });
    default: return [];
  }
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  return new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width, fill: "", selectable: false, evented: false });
}

function composite(kind: ShapePreset, color: string, width: number): FabricObject[] {
  const items: FabricObject[] = [];
  const addLine = (x1: number, y1: number, x2: number, y2: number) => items.push(line(x1, y1, x2, y2, color, width));
  if (kind === "double-arrow") {
    addLine(10, 70, 210, 70); items.push(new Triangle({ left: 10, top: 70, width: 14, height: 14, originX: "center", originY: "center", angle: -90, fill: color, stroke: color })); items.push(new Triangle({ left: 210, top: 70, width: 14, height: 14, originX: "center", originY: "center", angle: 90, fill: color, stroke: color }));
  } else if (kind === "angle") {
    addLine(24, 128, 115, 128); addLine(24, 128, 92, 40); items.push(new IText("θ", { left: 48, top: 87, fontSize: 24, fill: color }));
  } else if (kind === "parallel-lines") {
    addLine(20, 45, 200, 45); addLine(20, 105, 200, 105); addLine(80, 130, 125, 20); items.push(new IText("∥", { left: 28, top: 56, fontSize: 22, fill: color }));
  } else if (kind === "perpendicular-lines") {
    addLine(25, 100, 195, 100); addLine(110, 22, 110, 130); addLine(110, 83, 127, 83); addLine(127, 83, 127, 100);
  } else if (kind === "axes" || kind === "number-line") {
    const horizontalY = kind === "axes" ? 118 : 72; addLine(18, horizontalY, 208, horizontalY);
    if (kind === "axes") addLine(54, 132, 54, 18);
    for (let x = 35; x <= 190; x += 31) { addLine(x, horizontalY - 6, x, horizontalY + 6); if (kind === "number-line") items.push(new IText(String(Math.round((x - 112) / 31)), { left: x - 4, top: horizontalY + 10, fontSize: 12, fill: color })); }
    if (kind === "axes") { items.push(new IText("x", { left: 205, top: 112, fontSize: 16, fill: color })); items.push(new IText("y", { left: 57, top: 12, fontSize: 16, fill: color })); }
  } else if (kind === "grid") {
    for (let x = 5; x <= 215; x += 20) addLine(x, 5, x, 135);
    for (let y = 5; y <= 135; y += 20) addLine(5, y, 215, y);
  } else if (kind === "protractor") {
    items.push(new Ellipse({ left: 20, top: 0, rx: 90, ry: 90, startAngle: 180, endAngle: 360, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    addLine(20, 90, 200, 90);
    for (let degree = 0; degree <= 180; degree += 15) { const radians = Math.PI - degree * Math.PI / 180; const inner = degree % 30 === 0 ? 74 : 81; addLine(110 + Math.cos(radians) * inner, 90 - Math.sin(radians) * inner, 110 + Math.cos(radians) * 90, 90 - Math.sin(radians) * 90); }
  } else if (kind === "cube" || kind === "cuboid") {
    const dx = 45, dy = -30; items.push(new Rect({ left: 20, top: 45, width: 130, height: 85, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new Polygon([{ x: 20, y: 45 }, { x: 20 + dx, y: 45 + dy }, { x: 150 + dx, y: 45 + dy }, { x: 150, y: 45 }], { fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new Polygon([{ x: 150, y: 45 }, { x: 150 + dx, y: 45 + dy }, { x: 150 + dx, y: 130 + dy }, { x: 150, y: 130 }], { fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    addLine(20, 130, 20 + dx, 130 + dy); addLine(20 + dx, 45 + dy, 20 + dx, 130 + dy); addLine(20 + dx, 130 + dy, 150 + dx, 130 + dy);
  } else if (kind === "cylinder") {
    items.push(new Rect({ left: 30, top: 30, width: 160, height: 80, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new Ellipse({ left: 30, top: 10, rx: 80, ry: 20, fill: "white", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new Ellipse({ left: 30, top: 90, rx: 80, ry: 20, fill: "transparent", stroke: color, strokeWidth: width, strokeDashArray: [5, 4], selectable: false, evented: false }));
  } else if (kind === "cone" || kind === "sphere") {
    if (kind === "cone") { items.push(new Triangle({ left: 42, top: 10, width: 140, height: 125, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false })); items.push(new Ellipse({ left: 42, top: 112, rx: 70, ry: 18, fill: "white", stroke: color, strokeWidth: width, selectable: false, evented: false })); }
    else { items.push(new Circle({ left: 40, top: 0, radius: 68, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false })); items.push(new Ellipse({ left: 45, top: 42, rx: 63, ry: 25, fill: "transparent", stroke: color, strokeWidth: width, strokeDashArray: [5, 4], selectable: false, evented: false })); }
  } else if (kind === "venn") {
    items.push(new Circle({ left: 5, top: 28, radius: 52, fill: "rgba(80,120,180,0.12)", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new Circle({ left: 95, top: 28, radius: 52, fill: "rgba(80,120,180,0.12)", stroke: color, strokeWidth: width, selectable: false, evented: false }));
  } else if (kind === "flowchart") {
    items.push(new Polygon([{ x: 55, y: 5 }, { x: 165, y: 5 }, { x: 215, y: 70 }, { x: 165, y: 135 }, { x: 55, y: 135 }, { x: 5, y: 70 }], { fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new IText("Condition", { left: 58, top: 58, fontSize: 16, fill: color, selectable: false, evented: false }));
  } else if (kind === "flowchart-process") {
    items.push(new Rect({ left: 10, top: 15, width: 200, height: 110, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new IText("Process", { left: 70, top: 55, fontSize: 18, fill: color, selectable: false, evented: false }));
  } else if (kind === "flowchart-terminator") {
    items.push(new Rect({ left: 10, top: 25, width: 200, height: 90, rx: 42, ry: 42, fill: "transparent", stroke: color, strokeWidth: width, selectable: false, evented: false }));
    items.push(new IText("Start / End", { left: 62, top: 57, fontSize: 17, fill: color, selectable: false, evented: false }));
  } else if (kind === "brace" || kind === "bracket") {
    if (kind === "bracket") { addLine(55, 5, 25, 5); addLine(25, 5, 25, 135); addLine(25, 135, 55, 135); }
    else { addLine(25, 5, 80, 5); addLine(80, 5, 110, 30); addLine(110, 30, 140, 5); addLine(140, 5, 195, 5); addLine(195, 5, 160, 70); addLine(160, 70, 195, 135); addLine(195, 135, 140, 135); addLine(140, 135, 110, 110); addLine(110, 110, 80, 135); addLine(80, 135, 25, 135); addLine(25, 135, 60, 70); addLine(60, 70, 25, 5); }
  }
  return items;
}

export function createShapeObject(preset: ShapePreset, options: { left: number; top: number; color: string; fill?: string; strokeWidth: number }): FabricObject {
  const { left, top, color, strokeWidth, fill = "transparent" } = options;
  const common = { stroke: color, strokeWidth, fill, left, top };
  if (preset === "rounded-rectangle") return new Rect({ ...common, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, rx: 14, ry: 14 });
  if (preset === "oval") return new Ellipse({ ...common, rx: DEFAULT_WIDTH / 2, ry: DEFAULT_HEIGHT / 2 });
  const points = polygonPoints(preset, DEFAULT_WIDTH, DEFAULT_HEIGHT);
  if (points.length) return new Polygon(points, common);
  const parts = composite(preset, color, strokeWidth);
  if (parts.length) return new Group(parts, { left, top, subTargetCheck: true, interactive: true });
  return new Rect({ ...common, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
}

export function createTableObject(rows: number, columns: number, options: { left: number; top: number; color: string }): Group {
  const safeRows = Math.max(1, Math.min(12, Math.floor(rows)));
  const safeColumns = Math.max(1, Math.min(10, Math.floor(columns)));
  const cellWidth = 120, cellHeight = 48;
  const objects: FabricObject[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const left = options.left + column * cellWidth;
      const top = options.top + row * cellHeight;
      objects.push(new Rect({ left, top, width: cellWidth, height: cellHeight, fill: "#FFFFFF", stroke: options.color, strokeWidth: 1, selectable: false, evented: false }));
      objects.push(new IText("", { left: left + 7, top: top + 9, width: cellWidth - 14, fontSize: 18, fill: "#303238", selectable: false, evented: true, editable: true }));
    }
  }
  return new Group(objects, { left: options.left, top: options.top, subTargetCheck: true, interactive: true });
}

