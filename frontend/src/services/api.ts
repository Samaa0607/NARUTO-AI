// REST calls to the Python backend (same origin; the Vite dev server proxies them).
import type { Catalog, Credits } from '../types/catalog'
import type { ServerInfo } from '../types/protocol'

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('The SHINOBI AI server cannot be reached. Is it running?', null)
  }
  if (!response.ok) throw new ApiError(`${path} answered ${response.status}`, response.status)
  return (await response.json()) as T
}

export const api = {
  info: (signal?: AbortSignal) => getJSON<ServerInfo>('/api/info', signal),
  catalog: (signal?: AbortSignal) => getJSON<Catalog>('/api/jutsu', signal),
  credits: (signal?: AbortSignal) => getJSON<Credits>('/api/credits', signal),
}

/** ws:// or wss:// URL of the session endpoint on the current origin. */
export function sessionUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws`
}
