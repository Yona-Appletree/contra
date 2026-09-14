# @caller/music

The audio clock, tunes, medleys, notation cursor and card readout: abcjs
wired to `AudioContext.currentTime` so `@caller/core`'s `Clock` is a linear
function of it. Nothing above reads a wall clock once music plays.

## Allowed imports

`@caller/music` may import `@caller/core`. Nothing else in this workspace.
