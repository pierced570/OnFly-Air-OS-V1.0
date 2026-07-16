export interface WxAdapter {
  brief(icao: string): Promise<{ summary: string; hardFlags: string[] }>
}

export class MockWxAdapter implements WxAdapter {
  async brief(icao: string) {
    return {
      summary: `${icao}: mock METAR — VFR, winds light. NOTAMs unavailable (apply for FAA API).`,
      hardFlags: [] as string[],
    }
  }
}

export function createWxAdapter(): WxAdapter {
  return new MockWxAdapter()
}
