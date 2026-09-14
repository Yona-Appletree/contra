import { describe, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { BECKET } from "../formation/becket.js";
import { balance, balanceRing } from "./balance.js";
import { circle } from "./circle.js";
import { longLines } from "./long-lines.js";
import { passThrough } from "./pass-through.js";
import { slideLeft } from "./slide-left.js";
import { star } from "./star.js";
import { swing } from "./swing.js";
import { probeFigure, probeGroup } from "./testing.js";
import { allemande } from "./allemande.js";
import { doSiDo } from "./do-si-do.js";
import { petronella } from "./petronella.js";
import { californiaTwirl } from "./california-twirl.js";
import { rollAway } from "./roll-away.js";
import { rightAndLeftThrough } from "./right-and-left-through.js";
import { robinsChain } from "./robins-chain.js";

const show = (name: string, probe: ReturnType<typeof probeFigure>): void => {
  // eslint-disable-next-line no-console
  console.log(
    name.padEnd(34),
    "short",
    probe.maxShort.toFixed(4),
    "join",
    probe.maxJoinGap.toFixed(4),
    "end",
    probe.maxEndError.toExponential(2),
    "start",
    probe.maxStartError.toExponential(2),
    "min",
    probe.minDistance.toFixed(3),
    JSON.stringify(probe.worstShort ?? {}),
    JSON.stringify(probe.worstPair ?? {}),
  );
};

describe("scratch", () => {
  it("probes", () => {
    const di = probeGroup(DUPLE_IMPROPER);
    const be = probeGroup(BECKET);
    show("circle left 3/4 (di)", probeFigure(circle, {}, { group: di }));
    show("circle left 3/4 (becket)", probeFigure(circle, {}, { group: be }));
    show("star right (di)", probeFigure(star, {}, { group: di }));
    show("long lines (di)", probeFigure(longLines, {}, { group: di }));
    show("long lines (becket)", probeFigure(longLines, {}, { group: be }));
    show("pass through across (di)", probeFigure(passThrough, {}, { group: di }));
    show("pass through along (di)", probeFigure(passThrough, { direction: "along" }, { group: di }));
    show("slide left (becket)", probeFigure(slideLeft, {}, { group: be }));
    show("balance neighbours (di)", probeFigure(balance, {}, { group: di }));
    show("balance partners (di)", probeFigure(balance, { pairs: "partners" }, { group: di }));
    show("balance neighbours (becket)", probeFigure(balance, {}, { group: be }));
    show("balance ring (di)", probeFigure(balanceRing, {}, { group: di }));
    show(
      "swing neighbours (di)",
      probeFigure(swing, {}, { group: di, contacts: [["1L", "2R"], ["1R", "2L"]] }),
    );
    show(
      "swing partners (di, down)",
      probeFigure(
        swing,
        { pairs: "partners", endFacing: "down" },
        { group: di, contacts: [["1L", "1R"], ["2L", "2R"]] },
      ),
    );
    show(
      "swing neighbours (becket)",
      probeFigure(
        swing,
        { endFacing: "down" },
        { group: be, contacts: [["1L", "2R"], ["1R", "2L"]] },
      ),
    );
    const P = [["1L", "1R"], ["2L", "2R"]] as const;
    const N = [["1L", "2R"], ["1R", "2L"]] as const;
    show("allemande L neighbours (di)", probeFigure(allemande, {}, { group: di, contacts: N }));
    show(
      "allemande R partners (di)",
      probeFigure(allemande, { pairs: "partners", hand: "R" }, { group: di, contacts: P }),
    );
    show("do-si-do neighbours (di)", probeFigure(doSiDo, {}, { group: di, contacts: N }));
    show(
      "do-si-do partners 1.5 (di)",
      probeFigure(doSiDo, { pairs: "partners", amount: 1.5 }, { group: di, contacts: P }),
    );
    show("petronella (di)", probeFigure(petronella, {}, { group: di }));
    show("california twirl (di)", probeFigure(californiaTwirl, {}, { group: di, contacts: P }));
    show("roll away (di)", probeFigure(rollAway, {}, { group: di, contacts: P }));
    show(
      "right and left through (becket)",
      probeFigure(rightAndLeftThrough, {}, { group: be, contacts: P }),
    );
    show("robins chain (becket)", probeFigure(robinsChain, {}, { group: be, contacts: P }));
  });
});
