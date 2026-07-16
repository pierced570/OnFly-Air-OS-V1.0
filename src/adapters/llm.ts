export type ExtractedRequest = {
  pieces_text?: string
  origin_text?: string
  destination_text?: string
  ready_local?: string
  deadline_local?: string
  hazmat?: boolean
  pax_count?: number
  payload_kind?: 'cargo' | 'pax' | 'both'
  notes?: string
  raw: string
}

export interface LlmAdapter {
  extractTripRequest(rawText: string): Promise<ExtractedRequest>
}

export class MockLlmAdapter implements LlmAdapter {
  async extractTripRequest(rawText: string): Promise<ExtractedRequest> {
    // Canned extraction for demos / tests
    return {
      pieces_text: '3 skids 48x40x60 @ 800ea',
      origin_text: 'Akron, OH',
      destination_text: 'Chicago, IL',
      ready_local: '2026-07-15T09:00',
      payload_kind: 'cargo',
      hazmat: false,
      notes: 'mock extraction',
      raw: rawText,
    }
  }
}

export function createLlmAdapter(): LlmAdapter {
  return new MockLlmAdapter()
}
