/**
 * Stub for the `server-only` package under vitest.
 *
 * `server-only` exists to make a build fail if a server module is pulled into
 * a client bundle, which it does by throwing on import outside a server
 * environment. vitest is neither, so importing it aborts the suite and the
 * modules most worth testing — the ones that touch the database — become the
 * ones that cannot be tested at all.
 *
 * Aliasing it to nothing in vitest.config.ts keeps the real guard in the real
 * build and lets the tests import those modules directly.
 */
export {};
