// The travelling speed profile now lives in `@caller/core`, beside the rest of
// the kinematics the figure layer shares — both this package's pair figures and
// the library in `../figures/` walk on it. It is re-exported here under the name
// the pair figures have always imported, so nothing about their behaviour, or
// about the G1 goldens, depends on where the two functions are written.
export { trapezoid, trapezoidSpeed } from "@caller/core";
