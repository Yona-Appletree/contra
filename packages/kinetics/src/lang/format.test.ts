import { describe, expect, it } from "vitest";
import { format } from "./format.js";

const SCRAPPY = `enum   Role {Lark,Robin,}
// a couple
formation couple( ) {
place lark   role Lark;   // the lark
  place robin role Robin at translate( y=0.4m ) ;
  provide $partner :Place= other( me ) ;
  // trailing thought
}
dance d($partner:Place,beats:Beats=8){title "D";repeat(2){if($time==1){a();}else if($role is Robin){b(x=1+2*3,y=(1+2)*3);}else{c();}}
repeat (i in 3) group minor-set() at translate(y = 1.6m*i);
}
`;

const TIDY = `enum Role { Lark, Robin }

// a couple
formation couple() {
  place lark role Lark; // the lark
  place robin role Robin at translate(y = 0.4m);
  provide $partner: Place = other(me);
  // trailing thought
}

dance d($partner: Place, beats: Beats = 8) {
  title "D";
  repeat (2) {
    if ($time == 1) {
      a();
    } else if ($role is Robin) {
      b(x = 1 + 2 * 3, y = (1 + 2) * 3);
    } else {
      c();
    }
  }
  repeat (i in 3) group minor-set() at translate(y = 1.6m * i);
}
`;

describe("the formatter", () => {
  it("prints the one way a file looks, keeping every comment", () => {
    expect(format(SCRAPPY)).toBe(TIDY);
  });

  it("is idempotent", () => {
    expect(format(TIDY)).toBe(TIDY);
    expect(format(format(SCRAPPY))).toBe(format(SCRAPPY));
  });

  it("parenthesises only where the tree needs it", () => {
    const out = format(
      "formation f() { let k = (1 + 2) * 3 - (4 - 5) + -(6) / 7; let n = not (a and b) or c; }",
    );
    expect(out).toContain("let k = (1 + 2) * 3 - (4 - 5) + -6 / 7;");
    expect(out).toContain("let n = not (a and b) or c;");
  });
});
