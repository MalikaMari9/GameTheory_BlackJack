export type StoredIdentity = {
  nickname: string
  reconnectToken: string
  playerId?: string
  tableId?: string
}

const SKEY = {
  nickname: 'bj:nickname',
  reconnectToken: 'bj:reconnect_token',
  playerId: 'bj:player_id',
  remember: 'bj:remember_identity',
  tableId: 'bj:table_id',
} as const

export const loadRememberPreference = (): boolean | null => {
  const stored = localStorage.getItem(SKEY.remember)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return null
}

export const persistRememberPreference = (remember: boolean) => {
  localStorage.setItem(SKEY.remember, remember ? 'true' : 'false')
  if (!remember) {
    localStorage.removeItem(SKEY.nickname)
    localStorage.removeItem(SKEY.reconnectToken)
    localStorage.removeItem(SKEY.playerId)
  }
}

export const loadIdentity = (): StoredIdentity | null => {
  const nickS = sessionStorage.getItem(SKEY.nickname)
  const tokenS = sessionStorage.getItem(SKEY.reconnectToken)
  if (nickS && tokenS) {
    return {
      nickname: nickS,
      reconnectToken: tokenS,
      playerId: sessionStorage.getItem(SKEY.playerId) || undefined,
      tableId: sessionStorage.getItem(SKEY.tableId) || undefined,
    }
  }

  const nickL = localStorage.getItem(SKEY.nickname)
  const tokenL = localStorage.getItem(SKEY.reconnectToken)
  if (nickL && tokenL) {
    return {
      nickname: nickL,
      reconnectToken: tokenL,
      playerId: localStorage.getItem(SKEY.playerId) || undefined,
      tableId: localStorage.getItem(SKEY.tableId) || undefined,
    }
  }

  return null
}

export const persistIdentity = (
  data: { nickname: string; reconnectToken: string; playerId: string; tableId?: string },
  remember: boolean
) => {
  sessionStorage.setItem(SKEY.nickname, data.nickname)
  sessionStorage.setItem(SKEY.reconnectToken, data.reconnectToken)
  sessionStorage.setItem(SKEY.playerId, data.playerId)
  if (data.tableId) sessionStorage.setItem(SKEY.tableId, data.tableId)

  if (remember) {
    localStorage.setItem(SKEY.nickname, data.nickname)
    localStorage.setItem(SKEY.reconnectToken, data.reconnectToken)
    localStorage.setItem(SKEY.playerId, data.playerId)
    if (data.tableId) localStorage.setItem(SKEY.tableId, data.tableId)
  }
}

export const clearIdentity = () => {
  sessionStorage.removeItem(SKEY.nickname)
  sessionStorage.removeItem(SKEY.reconnectToken)
  sessionStorage.removeItem(SKEY.playerId)
  sessionStorage.removeItem(SKEY.tableId)
  localStorage.removeItem(SKEY.nickname)
  localStorage.removeItem(SKEY.reconnectToken)
  localStorage.removeItem(SKEY.playerId)
  localStorage.removeItem(SKEY.tableId)
}
