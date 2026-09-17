import { describe, expect, it } from "vitest";
import { format } from "./format.js";

const SCRAPPY = `enum   Role {Lark,Robin,}
// a couple
module couple( ) {
place lark   role Lark;   // the lark
  place robin role Robin at right( 0.4m ) ;
  provide $partner :Place= other( me ) ;
  provide progress(){$minor-set=along($minor-set,Up) or out-top;}
  // trailing thought
}
module d(beats:Beats=8){card "D";repeat(2){if($time==1){a();}else if($role is Robin){b(x=1+2*3,y=(1+2)*3);}else{c();}}
for i in 0..3 { group minor-set() at translate(y = 1.6m*i); }
match($role){Lark=>a(); Robin=>{b();c();} _=>d();}
phrase(A1){swing($partner);}
assert($beat==16,"A1");
}
`;

const TIDY = `enum Role { Lark, Robin }

// a couple
module couple() {
  place lark role Lark; // the lark
  place robin role Robin at right(0.4m);
  provide $partner: Place = other(me);
  provide progress() {
    $minor-set = along($minor-set, Up) or out-top;
  }
  // trailing thought
}

module d(beats: Beats = 8) {
  card "D";
  repeat (2) {
    if ($time == 1) {
      a();
    } else if ($role is Robin) {
      b(x = 1 + 2 * 3, y = (1 + 2) * 3);
    } else {
      c();
    }
  }
  for i in 0..3 {
    group minor-set() at translate(y = 1.6m * i);
  }
  match ($role) {
    Lark => a();
    Robin => {
      b();
      c();
    }
    _ => d();
  }
  phrase(A1) {
    swing($partner);
  }
  assert($beat == 16, "A1");
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
      "module f() { let k = (1 + 2) * 3 - (4 - 5) + -(6) / 7; let n = not (a and b) or c; }",
    );
    expect(out).toContain("let k = (1 + 2) * 3 - (4 - 5) + -6 / 7;");
    expect(out).toContain("let n = not (a and b) or c;");
  });
});
