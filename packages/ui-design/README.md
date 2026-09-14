# @caller/ui-design

Design tokens and theme: `theme.css` imports Tailwind 4 and defines the CSS
custom properties that `@caller/ui-base` primitives and the apps consume. No
components, no behaviour.

## Allowed imports

`@caller/ui-design` imports nothing from this workspace. It is the base of
the UI side of the dependency graph (`ui-design ← ui-base`).

## Tokens

U2 rewrote the palette as "the hall after dark": every colour is
`@caller/hall`'s own `HALL_THEMES.grange`, converted to oklch, so the page a
dancer's canvas sits on is made of the same timber as the room inside it.
`--background` / `--foreground` are the page ground and ink (a dark walnut and
the snack table's cloth); `--primary` / `--primary-foreground` are a lit floor
board; `--secondary`, `--muted` and `--accent` (each with its own
`-foreground`) step down the wall's shade; `--border`, `--input` and `--ring`
share the wall colour and the lit board. `--card`, `--card-foreground` and
`--card-accent` are the one thing that does not go dark — U1's paper note
card, which keeps its own light stock, dark ink and warm header band rather
than reading the page's now-inverted tokens. `--wood-pitch`, `--wood-seam` and
`--wood-lit` are the board-seam stripe `body`'s own `background-image` reads
directly (they are not part of the `@theme inline` block Tailwind consumes).

There is no light mode: `color-scheme: dark` is set unconditionally and
`prefers-color-scheme` is never consulted, so the browser's own scrollbars and
range sliders come up dark too.
