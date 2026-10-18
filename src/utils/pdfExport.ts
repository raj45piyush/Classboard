import { jsPDF } from "jspdf";
import { BOARD_WIDTH, BOARD_HEIGHT } from "@/constants/board";

export interface ExportablePage {
  dataUrl: string;
}

/** Combines rendered page images (board snapshots) into a single downloadable PDF. */
export function exportPagesToPdf(pages: ExportablePage[], fileName: string) {
  if (pages.length === 0) return;
  const orientation = BOARD_WIDTH >= BOARD_HEIGHT ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [BOARD_WIDTH, BOARD_HEIGHT] });

  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([BOARD_WIDTH, BOARD_HEIGHT], orientation);
    pdf.addImage(page.dataUrl, "PNG", 0, 0, BOARD_WIDTH, BOARD_HEIGHT, undefined, "FAST");
  });

  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
