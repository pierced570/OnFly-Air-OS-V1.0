import { describe, expect, it } from 'vitest'
import { emptyVendorPacketDraft } from '@/domain/vendorPacket'
import { getMockSentEmails } from '@/adapters/email'
import {
  defaultVendorPacketTemplate,
  renderVendorPacketEmailHtml,
  sendVendorPacketInvite,
} from '@/lib/vendorPacketEmail'
import {
  acceptVendorPacket,
  listPendingVendorPackets,
  listVendorPackets,
  submitVendorPacket,
} from '@/lib/vendorPacketStore'
import { listOpenNeedsInfo } from '@/lib/needsInfoStore'

function validDraft() {
  return {
    ...emptyVendorPacketDraft(),
    legal_name: 'Sonrise Aviation LLC',
    tax_classification: 'llc' as const,
    llc_classification: 's_corp' as const,
    address: {
      street: '100 Ramp Way',
      city: 'Fort Wayne',
      state: 'IN',
      zip: '46809',
    },
    tin_type: 'ein' as const,
    tin: '12-3456789',
    ap_email: 'ap@sonrise.example',
    bank_routing: '021000021',
    bank_account: '123456789',
    certified: true,
    signer_name: 'Alex Pilot',
  }
}

describe('vendorPacketStore + email', () => {
  it('listPendingVendorPackets returns a stable snapshot when unchanged', () => {
    expect(listPendingVendorPackets()).toBe(listPendingVendorPackets())
    expect(listVendorPackets()).toBe(listVendorPackets())
  })

  it('acceptVendorPacket replaces the pending snapshot reference', () => {
    const row = submitVendorPacket(validDraft())
    const pendingBefore = listPendingVendorPackets()
    expect(pendingBefore.some((r) => r.id === row.id)).toBe(true)
    acceptVendorPacket(row.id)
    const pendingAfter = listPendingVendorPackets()
    expect(pendingAfter).not.toBe(pendingBefore)
    expect(pendingAfter.some((r) => r.id === row.id)).toBe(false)
    expect(listPendingVendorPackets()).toBe(pendingAfter)
  })

  it('submits packet and opens NEEDS-INFO review task', () => {
    const before = listPendingVendorPackets().length
    const row = submitVendorPacket(validDraft())
    expect(row.status).toBe('pending_review')
    expect(row.tin_display).toBe('12-3456789')
    expect(listPendingVendorPackets().length).toBe(before + 1)
    const tasks = listOpenNeedsInfo().filter((t) => t.entity_id === row.id)
    expect(tasks.some((t) => t.field === 'vendor_packet_review')).toBe(true)
    expect(tasks.some((t) => t.field === 'w9_file')).toBe(true)
  })

  it('sends invite email with /vendor CTA', async () => {
    const tpl = defaultVendorPacketTemplate({
      packetUrl: 'https://app.onflyair.com/vendor',
    })
    const html = renderVendorPacketEmailHtml(tpl, 'Acme Air')
    expect(html).toContain('W-9')
    expect(html).toContain('https://app.onflyair.com/vendor')
    expect(html).toContain('Acme Air')

    const before = getMockSentEmails().length
    const result = await sendVendorPacketInvite({
      to: 'ap@acme.example',
      companyName: 'Acme Air',
      template: tpl,
    })
    expect(result.to).toBe('ap@acme.example')
    expect(getMockSentEmails().length).toBe(before + 1)
  })
})
