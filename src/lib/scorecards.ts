export type OperatorScorecard = {
  name: string
  response_rate_pct: number
  median_response_min: number
  trips_completed: number
  on_time_pct: number
  percentile_response: number
}

export type ScorecardsFile = {
  operators: OperatorScorecard[]
}

import raw from '@/fixtures/scorecards.json'

export const scorecards = raw as ScorecardsFile
