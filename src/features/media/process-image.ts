export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
export const MAX_LONG_EDGE = 2048;

export type ProcessedImage = {
  blob: Blob;
  mimeType: "image/jpeg" | "image/webp";
  extension: "jpg" | "webp";
  width: number;
  height: number;
};

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImageProcessingError("The browser could not encode this image."));
    }, mimeType, quality);
  });
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new ImageProcessingError("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new ImageProcessingError("The original photo must be under 15 MB.");
  }

  const source = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(source.width, source.height));
    let width = Math.max(1, Math.round(source.width * scale));
    let height = Math.max(1, Math.round(source.height * scale));
    const mimeType: ProcessedImage["mimeType"] =
      file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const extension = mimeType === "image/jpeg" ? "jpg" : "webp";
    let quality = 0.9;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new ImageProcessingError("Canvas image processing is unavailable.");
      }
      if (mimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(source, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, mimeType, quality);
      if (blob.size <= MAX_OUTPUT_BYTES) {
        return { blob, mimeType, extension, width, height };
      }

      if (quality > 0.55) quality -= 0.1;
      else {
        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
      }
    }
  } finally {
    source.close();
  }

  throw new ImageProcessingError("The processed photo could not be reduced below 3 MB.");
}
