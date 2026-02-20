const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

export const normalizeRoomCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/I/g, '1')
    .replace(/O/g, '0')

export const generateRoomCode = (len: number = 6): string => {
  let out = ''
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}
