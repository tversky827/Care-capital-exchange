/**
 * Test stub for `next/headers`.
 *
 * The acceptance test drives the services directly with constructed actors, so
 * no request-scoped cookie or header store exists. Anything that reaches for
 * one in a test is a bug, and throwing here surfaces it immediately.
 */
export async function cookies(): Promise<never> {
  throw new Error('cookies() is not available outside a request')
}
export async function headers(): Promise<never> {
  throw new Error('headers() is not available outside a request')
}
