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

/** Three 0–255 channels to `#rrggbb`. */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `#rrggbb` to `[hue 0–360, saturation 0–1, lightness 0–1]`.
 *
 * HSL is the space the role-colour rule is written in: "never blue-ish for a
 * lark, never pink-ish for a robin" is a statement about hue, and a per-person
 * shade-and-saturation spread is a statement about the other two. Doing it in
 * RGB — which is all `shade` can do — would drift the hue as soon as a channel
 * clamps.
 */
export function hexToHsl(hex: string): [number, number, number] {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : // max === b
          (r - g) / d + 4;
  return [(((h * 60) % 360) + 360) % 360, s, l];
}

/** `[hue 0–360, saturation 0–1, lightness 0–1]` to `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector] ?? [0, 0, 0];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
