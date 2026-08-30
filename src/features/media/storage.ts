import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";
import type { ProcessedImage } from "@/features/media/process-image";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type UploadedMedia = {
  storagePath: string;
  mimeType: ProcessedImage["mimeType"];
  sizeBytes: number;
  width: number;
  height: number;
};

export async function uploadStagedMedia(
  stageId: string,
  image: ProcessedImage,
): Promise<UploadedMedia> {
  const user = await ensureAnonymousAuth();
  const storagePath = `${user.id}/${stageId}/${crypto.randomUUID()}.${image.extension}`;
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.storage
    .from("sighting-media")
    .upload(storagePath, image.blob, {
      contentType: image.mimeType,
      upsert: false,
    });
  if (error) throw new Error("The processed photo could not be uploaded.");

  return {
    storagePath,
    mimeType: image.mimeType,
    sizeBytes: image.blob.size,
    width: image.width,
    height: image.height,
  };
}

export async function deleteStagedMedia(media: UploadedMedia | null) {
  if (!media) return;
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.storage
    .from("sighting-media")
    .remove([media.storagePath]);
  if (error) throw new Error("The staged photo could not be removed.");
}
