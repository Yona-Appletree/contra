# @caller/ui-base

Primitive components with no app knowledge: shadcn/ui generated over Radix
primitives (`Button`, `Select`, `Slider` so far), styled with the tokens
from `@caller/ui-design`. A component here never imports app state or knows
what a dancer, figure or dance is.

## Allowed imports

`@caller/ui-base` may import `@caller/ui-design`. Nothing else in this
workspace.
