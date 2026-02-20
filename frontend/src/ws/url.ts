const makeDefaultWsUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.hostname || '127.0.0.1'
  return `${proto}://${host}:8000/ws/blackjack`
}

const makeDefaultApiBaseUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'https' : 'http'
  const host = window.location.hostname || '127.0.0.1'
  return `${proto}://${host}:8000`
}

const wsToHttpBaseUrl = (wsUrl: string): string | null => {
  try {
    const parsed = new URL(wsUrl)
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export const getWsUrl = (): string => {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined
  return envUrl || makeDefaultWsUrl()
}

export const getApiBaseUrl = (): string => {
  const envApiUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envApiUrl) return envApiUrl.replace(/\/+$/, '')
  const fromWs = wsToHttpBaseUrl(getWsUrl())
  return fromWs || makeDefaultApiBaseUrl()
}
