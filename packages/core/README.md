# @caller/core

Form-neutral time and kinematics: the `Clock` that maps audio time to beats
and phrases, `PoseSample`, the arm solver, hand stacking, seam easing, quiet
motion, and per-dancer `Style`. Knows nothing about dancing, figures, or any
particular dance form.

## Allowed imports

`@caller/core` imports nothing from this workspace. It is the base of the
dependency graph (`core ← choreo ← contra`, `core ← hall`, `core ← music`).
