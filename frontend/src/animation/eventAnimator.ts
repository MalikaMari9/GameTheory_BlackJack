import type { EventMessage } from '../types/messages'

export type AnimationCommand =
  | { kind: 'noop' }
  | { kind: 'card_dealt'; to: 'player' | 'dealer'; seat?: number; card?: string; faceDown?: boolean }
  | { kind: 'chip_move'; seat: number; amount: number }
  | { kind: 'highlight_turn'; seat: number }

export const eventToAnimationCommands = (event: EventMessage): AnimationCommand[] => {
  void event
  return [{ kind: 'noop' }]
}

