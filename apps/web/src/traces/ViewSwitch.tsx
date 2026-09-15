import type { JSX } from "react";
import type { RowTraceView } from "./traceDrawings.js";

/**
 * The small plot &middot; march &middot; seismo switch (T4), factored out of
 * `FigureTraces` so the dance page's own switchable shapes (U3) can use the
 * same three buttons rather than a second copy of them.
 *
 * Three short labels, not the full word "seismograph" — a 136 px Moves row
 * column has no room for it — but every button's `aria-label` and `title`
 * still say the whole name. `testIdPrefix` keeps the two call sites' buttons
 * addressable apart (`moves-view-plot` beside a row, `dance-view-plot` on the
 * dance page).
 */
export function ViewSwitch({
  view,
  onChange,
  testIdPrefix = "moves-view",
}: {
  view: RowTraceView;
  onChange: (view: RowTraceView) => void;
  testIdPrefix?: string;
}): JSX.Element {
  return (
    <div
      className="moves-view-switch"
      role="group"
      aria-label="Trace view"
      data-testid={`${testIdPrefix}-switch`}
    >
      {VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={view === opt.key}
          aria-label={`${opt.name} view`}
          title={opt.name}
          data-testid={`${testIdPrefix}-${opt.key}`}
          className={view === opt.key ? "moves-view-active" : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** The three options the switch offers, and the short label each button shows. */
const VIEW_OPTIONS: ReadonlyArray<{ key: RowTraceView; label: string; name: string }> = [
  { key: "plot", label: "plot", name: "pen plot" },
  { key: "march", label: "march", name: "march" },
  { key: "seismograph", label: "seismo", name: "seismograph" },
];
