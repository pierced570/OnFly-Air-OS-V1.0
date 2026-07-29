import { describe, expect, it } from 'vitest'
import { messageFromEdgeInvoke } from '@/lib/edgeFunctionError'

describe('messageFromEdgeInvoke', () => {
  it('prefers JSON body detail over generic FunctionsHttpError message', async () => {
    const msg = await messageFromEdgeInvoke({
      data: {
        error: 'RingCentral SMS failed',
        detail:
          'application needs to have [SMS] permission',
      },
      error: { message: 'Edge Function returned a non-2xx status code' },
      fallback: 'SMS failed',
    })
    expect(msg).toMatch(/RingCentral SMS failed/)
    expect(msg).toMatch(/\[SMS\] permission/)
  })

  it('reads JSON from error.context Response', async () => {
    const msg = await messageFromEdgeInvoke({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'Resend failed',
            detail: 'Domain not verified',
          }),
        },
      },
      fallback: 'Email failed',
    })
    expect(msg).toBe('Resend failed: Domain not verified')
  })
})
