// The X/Twitter card reuses the Open Graph card verbatim (1200×630 renders fine
// as a summary_large_image). Re-exporting the whole module — including `size` —
// keeps the reported dimensions in sync with what's actually rendered.
export { default, alt, size, contentType } from "@/app/opengraph-image";
