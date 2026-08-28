/**
 * Serialises async work against a key.
 *
 * Two writes against one balance in the same tick would otherwise both read it
 * before either wrote, and both would pass a check the pair of them fails.
 * This is the in-process half of that guarantee; the durable half is the
 * database's own locking, which the Postgres driver takes out separately.
 */
const chains = new Map<string, Promise<unknown>>()

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  chains.set(key, run.then(() => undefined, () => undefined))
  try {
    return await run
  } finally {
    if (chains.get(key) === undefined) chains.delete(key)
  }
}
