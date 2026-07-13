import { ImageResponse } from "next/og";
import { Droplet, DomainDots, COLORS, SANS } from "@/app/_brand/brand";
import { loadOgFonts } from "@/app/_fonts/load";

export const alt =
  "Intake Tracker — a private, offline-first tracker for hydration, nutrition, vitals, and medications.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const fonts = await loadOgFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          fontFamily: SANS,
          backgroundImage: `linear-gradient(135deg, ${COLORS.bg}, ${COLORS.bgTo})`,
        }}
      >
        <Droplet size={168} />
        <div
          style={{
            display: "flex",
            fontWeight: 600,
            fontSize: 78,
            letterSpacing: -1,
            color: COLORS.fg,
          }}
        >
          Intake Tracker
        </div>
        <div
          style={{
            display: "flex",
            fontWeight: 400,
            fontSize: 31,
            lineHeight: 1.35,
            color: COLORS.muted,
            maxWidth: 840,
            textAlign: "center",
          }}
        >
          Hydration, nutrition, vitals &amp; medications — one private,
          offline-first tracker.
        </div>
        <div style={{ position: "absolute", bottom: 46, display: "flex" }}>
          <DomainDots size={16} gap={20} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
