import { el, type Pane } from "../view.js";

/**
 * Figure mode, before there is a figure language: the shape of what it will
 * be and nothing else. A row of empty cards where the figure's rigs — the
 * contexts its text declares it must look right in — will each be one card
 * at 2×, and the 3d of the clicked one below. The language session decides
 * what a figure file says; this pane only holds its place (M9, D6).
 */
export function figurePane(): Pane {
  const section = el("section", "figure-placeholder");
  section.dataset.pane = "figure";
  const cards = el("div", "ghost-cards");
  for (const label of [
    "middle of the set",
    "an end",
    "the other side",
    "out of a chain",
    "into a hey",
    "shorter",
  ]) {
    cards.append(el("div", "ghost-card", label));
  }
  const view3d = el("div", "ghost-3d", "the clicked rig, in 3d");
  const note = el(
    "p",
    "ghost-note",
    "A figure will be its own .dance file: the body, then one rig line per context — a card each. " +
      "That file is the language session's to design; the dance mode beside is the instrument until then.",
  );
  section.append(cards, view3d, note);
  return {
    el: section,
    setRun() {
      // Nothing to draw until figures are text.
    },
    setBeat() {
      // Nothing moves.
    },
  };
}
