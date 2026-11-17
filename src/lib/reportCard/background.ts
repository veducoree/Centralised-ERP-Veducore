// Turns an uploaded blank report card (PDF or image) into one print-quality
// JPEG: first page only, at most ~300 dpi on A4, white behind transparency.

const MAX_LONG_SIDE = 3508; // A4 long side at 300 dpi

export interface PreparedBackground {
  blob: Blob;
  width: number;
  height: number;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image'))), 'image/jpeg', 0.9);
  });
}

function blankCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function fromPdf(file: File): Promise<PreparedBackground> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_LONG_SIDE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const { canvas, ctx } = blankCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { blob: await toJpeg(canvas), width: canvas.width, height: canvas.height };
  } finally {
    void doc.destroy();
  }
}

async function fromImage(file: File): Promise<PreparedBackground> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const { canvas, ctx } = blankCanvas(bitmap.width * scale, bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { blob: await toJpeg(canvas), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export async function prepareBackground(file: File): Promise<PreparedBackground> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) return fromPdf(file);
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('Upload a PDF, PNG, JPG or WEBP file');
  return fromImage(file);
}
