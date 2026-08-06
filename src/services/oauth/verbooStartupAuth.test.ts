import { expect, test } from 'bun:test'

import { getCLIEntitlementDeniedMessage } from './cliEntitlement.js'

test('explains each denied CLI entitlement without referring to router models', () => {
  expect(getCLIEntitlementDeniedMessage('past_due')).toContain(
    'pagamento pendente',
  )
  expect(getCLIEntitlementDeniedMessage('expired')).toContain('expirou')
  expect(getCLIEntitlementDeniedMessage('subscription_required')).toContain(
    'assinatura Verboo Code ativa',
  )
})
