# @caller/ui-design

Design tokens and theme: `theme.css` imports Tailwind 4 and defines the CSS
custom properties (a warm grange palette) that `@caller/ui-base` primitives
and the apps consume. No components, no behaviour.

## Allowed imports

`@caller/ui-design` imports nothing from this workspace. It is the base of
the UI side of the dependency graph (`ui-design ← ui-base`).
