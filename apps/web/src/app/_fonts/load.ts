import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Loads the bundled Outfit TTFs for satori (`next/og` ImageResponse). Reads
 * real font buffers off disk — `next/font/google` only emits runtime CSS, which
 * satori cannot use. Fault-tolerant: a missing/unreadable font is skipped so
 * `next build` can never fail over a font (ImageResponse falls back to satori's
 * default). `process.cwd()` is `apps/web` at runtime, hence the `src/app` join.
 */
export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 600;
  style: "normal";
}

const FONT_FILES = [
  { file: "Outfit-400.ttf", name: "Outfit", weight: 400 as const },
  { file: "Outfit-600.ttf", name: "Outfit", weight: 600 as const },
];

const FONT_DIR = path.join(process.cwd(), "src", "app", "_fonts");

export async function loadOgFonts(): Promise<OgFont[]> {
  const fonts: OgFont[] = [];
  for (const f of FONT_FILES) {
    try {
      const data = await readFile(path.join(FONT_DIR, f.file));
      fonts.push({ name: f.name, data, weight: f.weight, style: "normal" });
    } catch {
      // Font missing — skip it; ImageResponse renders in its default font.
    }
  }
  return fonts;
}
