export type GtActionName = 'stand' | 'hit' | 'double'

export type GtOutcome = {
  delta: number
  prob: number
}

export type GtActionMetrics = {
  allowed: boolean
  ev: number | null
  utility_score: number | null
  security_score: number | null
  variance: number | null
  outcomes: GtOutcome[]
}

export type GtRecommendations = {
  ev_maximizer: GtActionName | null
  risk_averse: GtActionName | null
  security_level: GtActionName | null
}

export type GtResponse = {
  inputs: {
    player_total: number
    player_soft_aces: number
    dealer_upcard: 'A' | number
    bet: number
    bankroll: number
    rule: 'S17' | 'H17'
    can_double: boolean
    risk_lambda: number
  }
  dealer_distribution: {
    17: number
    18: number
    19: number
    20: number
    21: number
    bust: number
  }
  actions: Record<GtActionName, GtActionMetrics>
  recommendations: GtRecommendations
}

