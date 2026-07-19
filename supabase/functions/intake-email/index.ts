/**
 * Edge function stub — deploy with supabase functions deploy intake-email.
 * Logic lives in src/domain/intakeEmail.ts for testability.
 */
// Deno edge runtime would import a bundled copy; this file documents the contract.
export const INTAKE_EMAIL_CONTRACT = {
  method: 'POST',
  body: ['from', 'subject', 'text'],
  notes: 'Match from against client_contacts.role=requester, then handleInboundEmail',
}
