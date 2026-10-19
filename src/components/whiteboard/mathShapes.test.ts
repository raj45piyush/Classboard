import { describe, expect, it } from "vitest";
import { Canvas, Group, IText } from "fabric";
import { createShapeObject, createTableObject, SHAPE_PRESETS } from "./mathShapes";
import { parseBoardSnapshot, serializeBoard } from "@/utils/boardSerialization";
import { shouldCommitCanvasChange } from "./CanvasBoard";

describe("mathematical whiteboard objects", () => {
  it("creates selectable Fabric objects for the geometry presets", () => {
    for (const preset of SHAPE_PRESETS) {
      const object = createShapeObject(preset, { left: 20, top: 30, color: "#303238", strokeWidth: 3 });
      expect(object.selectable, preset).toBe(true);
      expect(object.evented, preset).toBe(true);
    }
  });

  it("creates a table with editable text in each cell", () => {
    const table = createTableObject(2, 3, { left: 10, top: 20, color: "#303238" });
    expect(table).toBeInstanceOf(Group);
    expect(table.getObjects().filter((object) => object instanceof IText)).toHaveLength(6);
    expect(table.getObjects().filter((object) => object instanceof IText).every((object) => object.editable)).toBe(true);
  });

  it("preserves geometry and table contents through Fabric JSON restoration", async () => {
    const canvas = new Canvas(undefined, { width: 600, height: 400 });
    const shape = createShapeObject("hexagon", { left: 20, top: 30, color: "#303238", strokeWidth: 2 });
    const table = createTableObject(2, 2, { left: 300, top: 60, color: "#303238" });
    table.getObjects().filter((object) => object instanceof IText)[0]?.set("text", "x² + y²");
    canvas.add(shape, table);
    const json = serializeBoard(canvas);
    const restored = parseBoardSnapshot(json);
    const secondCanvas = new Canvas(undefined, { width: 600, height: 400 });
    await secondCanvas.loadFromJSON(restored);
    expect(secondCanvas.getObjects()).toHaveLength(2);
    expect(secondCanvas.getObjects().some((object) => object instanceof Group)).toBe(true);
    const restoredTable = secondCanvas.getObjects().find((object) => object instanceof Group) as Group;
    expect(restoredTable.getObjects().some((object) => object instanceof IText && object.text === "x² + y²")).toBe(true);
    await canvas.dispose();
    await secondCanvas.dispose();
  });

  it("does not commit student-side canvas changes", () => {
    expect(shouldCommitCanvasChange(true, false)).toBe(false);
    expect(shouldCommitCanvasChange(false, false)).toBe(true);
    expect(shouldCommitCanvasChange(false, true)).toBe(false);
  });
});
