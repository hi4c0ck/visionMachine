// User-sourced image assets: locally-picked img2img bases + the extracted
// last frame of a previous pipe's last-gen video.
//
// Both surface a base64 `data:` URI, which the modal stores in the EXISTING
// image fields (keyframe `imageSrc`, img2img `referenceUrl`, subject
// `imageUrl`). The provider engine already accepts `data:` URIs
// (`assert_media_fetchable` whitelists `data:` alongside http(s)), so these
// are provider-ready with zero engine/shaper changes. A durable copy is also
// persisted under the pipe's `user-images/` dir (append-only, keyed by ref /
// task id) so the media tree keeps the bytes independent of the source file.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface ReadUserImageResult {
  dataUri: string;
  mimeType: string;
  /** Durable copy under the pipe's user-images dir (absent when the session
   *  has no resolvable media root — the data URI still carries the image). */
  localPath?: string;
  /** 0012 D4: source image dimensions (absent when the header is
   *  unrecognized — the original bytes are used as-is). */
  imageWidth?: number;
  imageHeight?: number;
  /** 0012 D4: set when the larger side exceeded the API's input cap and the
   *  image was preemptively downscaled; the data URI / persisted copy carry
   *  the RESIZED bytes, and these are the new dims. */
  resizedToWidth?: number;
  resizedToHeight?: number;
}

export interface ExtractLastFrameResult {
  dataUri: string;
  mimeType: string;
  localPath: string;
  /** Human name of the pipe the frame came from (tooltip / toast). */
  sourcePipeName: string;
}

/** Open the native image file picker. Returns the picked path, or null when
 *  the user cancels or we are not in a Tauri context (browser/E2E). */
export async function pickImageFile(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    return typeof selected === 'string' && selected.trim().length > 0 ? selected : null;
  } catch {
    return null;
  }
}

/** Read a picked image file into a base64 `data:` URI (+ a persisted copy). */
export async function readUserImage(
  sessionId: string,
  pipeId: string,
  refId: string,
  filePath: string,
): Promise<ReadUserImageResult> {
  return invoke<ReadUserImageResult>('read_user_image', {
    input: { sessionId, pipeId, refId, filePath },
  });
}

/** Extract the last frame of the PREVIOUS pipe's last-gen video as a data URI. */
export async function extractPipeLastFrame(
  sessionId: string,
  pipeId: string,
): Promise<ExtractLastFrameResult> {
  return invoke<ExtractLastFrameResult>('extract_pipe_last_frame', {
    input: { sessionId, pipeId },
  });
}
