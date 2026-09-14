/**
 * Multiply a `#rrggbb` colour's channels by `factor`, clamped. The spikes build
 * every shadow and highlight this way, so a palette entry is one colour and the
 * body's shading falls out of it.
 */
export function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** `#rrggbb` to three 0–255 channels. */
export function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`hall: expected a #rrggbb colour, got ${hex}`);
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
