// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { extractExifLocation } from "@/features/media/extract-exif-location";
import { processImage } from "@/features/media/process-image";
import { createExifGpsJpeg } from "@/test/fixtures/exif-gps-jpeg";

describe("browser media processing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extracts GPS coordinates from the original EXIF block", async () => {
    const file = new File([createExifGpsJpeg()], "gps.jpg", { type: "image/jpeg" });
    await expect(extractExifLocation(file)).resolves.toEqual({
      latitude: 42.36,
      longitude: -71.06,
    });
  });

  it("uploads a canvas-encoded blob with no residual EXIF GPS", async () => {
    const file = new File([createExifGpsJpeg()], "gps.jpg", { type: "image/jpeg" });
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 3000, height: 1500, close }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" })),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const processed = await processImage(file);
    expect(processed.width).toBe(2048);
    expect(processed.height).toBe(1024);
    expect(processed.blob.size).toBeLessThanOrEqual(3 * 1024 * 1024);
    await expect(extractExifLocation(processed.blob)).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
