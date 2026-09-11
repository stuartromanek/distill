export type H3Event = {
  req?: {
    url?: string
    headers?: Headers | Record<string, string | undefined>
  }
  node?: {
    req?: {
      url?: string
      headers?: Record<string, string | undefined>
    }
  }
}

function header(event: H3Event, name: string): string | undefined {
  const headers = event.req?.headers ?? event.node?.req?.headers
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  return headers?.[name]
}

export function getRequestURL(
  event: H3Event,
  opts: { xForwardedHost?: boolean; xForwardedProto?: boolean } = {},
): URL {
  const rawUrl = event.req?.url ?? event.node?.req?.url ?? 'http://localhost/'
  const url = new URL(rawUrl)
  const forwardedProto = opts.xForwardedProto ? header(event, 'x-forwarded-proto') : undefined
  const forwardedHost = opts.xForwardedHost ? header(event, 'x-forwarded-host') : undefined

  if (forwardedProto) url.protocol = `${forwardedProto.replace(/:$/, '')}:`
  if (forwardedHost) {
    url.host = forwardedHost
    if (!/:\d+$/.test(forwardedHost)) url.port = ''
  }

  return url
}
