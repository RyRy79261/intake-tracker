// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// The OS's two faces, as camp-404 loads them: Inter for body text, Silkscreen
// (the pixel face) for chrome, titles and labels. Their CSS variables are put
// on <html> while a variant is mounted (os-kit.tsx), so the Radix dialogs the
// cards portal into <body> get them too.

import { Inter, Silkscreen } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
  display: "swap",
});
