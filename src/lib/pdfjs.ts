import * as pdfjsLib from "pdfjs-dist";

// Loading the worker from a CDN (pinned to the exact installed version) keeps
// the single-file Vite build simple and avoids bundling a web worker file.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export { pdfjsLib };

/** Renders every page of a PDF file to a PNG data URL at a fixed max width. */
export async function renderPdfPagesToImages(
  file: File,
  maxWidth = 1600,
  signal?: AbortSignal
): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const results: { dataUrl: string; width: number; height: number }[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas context to render the PDF.");

    await page.render({ canvasContext: context, viewport, canvas }).promise;
    results.push({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
  }

  return results;
}

/** Render and consume PDF pages sequentially to keep memory bounded. */
export async function processPdfPagesToImages(
  file: File,
  onPage: (dataUrl: string, pageNumber: number, pageCount: number) => Promise<void>,
  maxWidth = 1400,
  signal?: AbortSignal,
  maxPages = 60
): Promise<number> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > maxPages) throw new Error("PDF_PAGE_LIMIT");
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(maxWidth / base.width, 1) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas context to render the PDF.");
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    await onPage(dataUrl, pageNum, pdf.numPages);
    canvas.width = 1;
    canvas.height = 1;
    page.cleanup();
  }
  return pdf.numPages;
}

/** Compress an imported image to a Firestore-safe inline board asset for Spark projects. */
export async function compressImageDataUrl(
  dataUrl: string,
  maxBytes = 480_000,
  maxDimension = 1400
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the image for this slide.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.78, 0.64, 0.5, 0.38]) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (new TextEncoder().encode(compressed).byteLength <= maxBytes) return compressed;
  }
  throw new Error("IMPORTED_IMAGE_TOO_LARGE");
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}
