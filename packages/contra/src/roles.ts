import type { RoleSet } from "@caller/choreo";

/**
 * The contra role set: lark and robin, with the robin's hand on top.
 *
 * This is the only place in the workspace those two words mean anything.
 * `@caller/core` takes `top` and stacks joined hands by it; `@caller/choreo`
 * takes the whole set and never reads a role name at all. Renaming the roles
 * is a change to this file.
 */
export const CONTRA_ROLES: RoleSet = { roles: ["lark", "robin"], top: "robin" };

/** The role that leads a courtesy turn and stands on the robin's left. */
export const LARK = "lark";
/** The role whose hand stacks on top of the lark's. */
export const ROBIN = "robin";
