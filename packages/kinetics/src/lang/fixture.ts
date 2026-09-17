/**
 * The program the whole vertical stack is built on, verbatim from the user
 * (the plan's Goal): forty beats, two figures, one binding, one definition and
 * one repeat — small enough to read in the debugger, big enough to need every
 * layer.
 *
 * Every phase from here up runs this text: the parser, the compiler, the
 * scheduler, the executor, the solver and the debugger's six panes.
 */
export const FIXTURE_PROGRAM = `partner = select(across)

bow(partner)
repeat(2) { dance() }
bow(partner)

dance {
  do-si-do(partner)
  allemande(partner, right)
}
`;
