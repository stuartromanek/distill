/** Minimal Nitro/H3 shims so server utils run in standalone CLI scripts. */
type CreateErrorInput = { statusCode: number; message: string }

if (typeof (globalThis as { createError?: unknown }).createError !== 'function') {
  ;(globalThis as { createError: (input: CreateErrorInput) => Error }).createError = (
    input: CreateErrorInput,
  ) => {
    const err = new Error(input.message) as Error & { statusCode?: number }
    err.statusCode = input.statusCode
    return err
  }
}
