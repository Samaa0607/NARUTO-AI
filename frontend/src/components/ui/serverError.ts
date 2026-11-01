// Turns the raw ApiError text (e.g. "/api/jutsu answered 502") into a sentence for people.

export function describeServerError(error: string | null | undefined): string {
  if (!error) return 'The SHINOBI AI server cannot be reached.'
  const status = /answered (\d{3})/.exec(error)?.[1]
  if (!status) return error
  if (status.startsWith('5')) return `The SHINOBI AI server is not answering (HTTP ${status}). Is it running?`
  if (status === '404') return 'This server does not provide the SHINOBI AI API (HTTP 404).'
  return `The SHINOBI AI server answered with an error (HTTP ${status}).`
}

export const START_SERVER_HINT = 'Start it from the project folder with: python -m shinobi.server'
