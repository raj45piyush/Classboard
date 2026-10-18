// Headless fabric.js rendering used for (1) building the initial snapshot of
// a freshly uploaded slide and (2) rasterizing saved pages for PDF export —
// in both cases we never touch the visible editor canvas.

import { StaticCanvas, FabricImage } from "fabric";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@/constants/board";

export async function buildSlideSnapshot(imageUrl: string): Promise<string> {
  const canvasEl = document.createElement("canvas");
  const canvas = new StaticCanvas(canvasEl, {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    backgroundColor: "#ffffff",
  });
  const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });
  const scale = Math.min(BOARD_WIDTH / (img.width || BOARD_WIDTH), BOARD_HEIGHT / (img.height || BOARD_HEIGHT));
  img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
  canvas.backgroundImage = img;
  canvas.renderAll();
  const json = JSON.stringify(canvas.toJSON());
  canvas.dispose();
  return json;
}

export async function renderSnapshotToDataUrl(snapshotJson: string | null): Promise<string> {
  const canvasEl = document.createElement("canvas");
  const canvas = new StaticCanvas(canvasEl, {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    backgroundColor: "#ffffff",
  });
  if (snapshotJson) {
    try {
      await canvas.loadFromJSON(JSON.parse(snapshotJson));
    } catch {
      // fall through with a blank page rather than failing the whole export
    }
  }
  canvas.renderAll();
  const dataUrl = canvas.toDataURL({ format: "png", quality: 1, multiplier: 1 });
  canvas.dispose();
  return dataUrl;
}
