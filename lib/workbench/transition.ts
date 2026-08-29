export async function runReversibleTransition<T>({
  signal,
  prepare,
  apply,
  rollback,
}: {
  signal?: AbortSignal;
  prepare: () => Promise<T>;
  apply: () => void;
  rollback: () => void;
}) {
  signal?.throwIfAborted();
  const pending = prepare();
  apply();

  try {
    const result = await pending;
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
