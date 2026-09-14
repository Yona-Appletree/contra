#!/bin/zsh
# Headless captures of the two-dancers spike, for gate crops.
#
#   spikes/two-dancers/shot.sh <name> "<query>" [outdir]
#
# Needs a static server on port 8765 serving the repo root, e.g. from the repo root:
#   python3 -m http.server 8765 --bind 127.0.0.1
# (the .claude/launch.json "spikes" preview does the same).
#
# The query is the spike's URL params:
#   b=<beat>          pause at this beat (0..64)           z=<int>   display zoom
#   strip=<b0>,<b1>,<n>  n frames from b0 to b1 side by side  aa=0|1   anti-alias
#   s=<px>            hold spacing                          seed=<n>  another pair
#   shot=1            hide the page chrome so the canvas sits at the top left
#
# Writes <outdir>/<name>.png (full page) and, when shot=1 is in the query,
# <outdir>/<name>-crop.png with just the canvas.
#
#   shot.sh hold  "shot=1&z=8&b=3.6"
#   shot.sh take  "shot=1&z=6&strip=1.8,3.6,4"
set -e
name=${1:?name}; query=${2:?query}; out=${3:-${TMPDIR:-/tmp}/two-dancers-shots}
mkdir -p "$out"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,3000 \
  --screenshot="$out/$name.png" "http://127.0.0.1:8765/spikes/two-dancers/?$query" >/dev/null 2>&1
if [[ "$query" == *shot=1* ]]; then
  # canvas is at (13,13): section padding 6 + wrap padding 6 + border 1
  z=$(echo "$query" | sed -n 's/.*z=\([0-9]*\).*/\1/p'); z=${z:-6}
  if [[ "$query" == *strip=* ]]; then
    n=$(echo "$query" | sed -n 's/.*strip=[^,]*,[^,]*,\([0-9]*\).*/\1/p'); w=$((44*n*z)); h=$((40*z))
  else
    w=$((128*z)); h=$((88*z))
  fi
  sips -c $h $w --cropOffset 13 13 "$out/$name.png" --out "$out/$name-crop.png" >/dev/null
fi
echo "$out/$name.png"
