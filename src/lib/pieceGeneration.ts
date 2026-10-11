// Standalone single-piece image generation (keyframe / subject modal
// "Generate" button) + on-disk piece history.
//
// Mirrors the per-pipe `start_generation` flow's spec resolution (the
// frontend resolves the image-model spec from the catalog and hands it to
// Rust as a wire-safe mirror; Rust owns the HTTP + secrets + download).
// Unlike the full-pipe run, this fires ONE image POST and writes the
// artifact into the piece's OWN append-only history tree
// (`<session>/<pipe>/pieces/<kind>/<refId>/`), so regenerating never
// erases a previous generation.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { resolveModelSpec } from '$lib/settings';
import { getProfileId } from '$lib/settings/store';
import type { ModelSpec } from '$types';

export type PieceKind = 'keyframe' | 'subject';

/** One on-disk generation of a piece (newest last in the manifest). */
export interface PieceHistoryEntry {
  ts: number;
  model: string;
  seed?: number | null;
  prompt?: string | null;
  localPath: string;
  remoteUrl?: string | null;
}

export interface PieceGenerationResult {
  localPath: string;
  remoteUrl: string | null;
  historyPath: string;
  pieceDir: string;
}

export interface PieceGenerationInput {
  sessionId: string;
  pipeId: string;
  /** The piece's stable reference id (keyframe id / subject ref id). */
  refId: string;
  kind: PieceKind;
  /** Piece image preset: "txt2img" | "img2img" (the modal's mode). */
  imageType?: string;
  prompt: string;
  referenceUrl?: string;
  seed?: number | null;
  /** This-run image-model override. Absent = the profile's default. */
  imageModel?: string;
}

/**
 * Generate one piece's image standalone. Resolves the image-model spec on the
 * frontend (same catalog the generate modal uses), then invokes the backend
 * command which shapes the request, downloads the artifact into the piece's
 * append-only history tree, and appends a manifest line.
 */
export async function generatePiece(input: PieceGenerationInput): Promise<PieceGenerationResult> {
  const spec = resolveModelSpec('image', input.imageModel);
  const imageSpec: ModelSpec | undefined = spec?.spec;
  const raw = await invoke('generate_piece_image', {
    input: {
      sessionId: input.sessionId,
      pipeId: input.pipeId,
      refId: input.refId,
      kind: input.kind,
      imageType: input.imageType ?? null,
      prompt: input.prompt,
      referenceUrl: input.referenceUrl ?? null,
      seed: input.seed ?? null,
      profileId: getProfileId() ?? null,
      imageSpec: imageSpec ?? null,
    },
  }) as unknown as PieceGenerationResult;
  return raw;
}

/** List a piece's on-disk generation history, newest first. */
export async function listPieceHistory(
  sessionId: string,
  pipeId: string,
  refId: string,
  kind: PieceKind,
): Promise<PieceHistoryEntry[]> {
  if (!isTauri()) return [];
  const raw = await invoke('list_piece_history', {
    input: { sessionId, pipeId, refId, kind },
  });
  return Array.isArray(raw) ? (raw as PieceHistoryEntry[]) : [];
}
