// Reports configuration presence only. Never return secret values to the client.
// Live processing remains unavailable until a provider adapter and verified
// transaction/webhook lifecycle have been implemented and tested.
const providers = {
  paystack: { label: 'Paystack', required: ['PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_WEBHOOK_SECRET'] },
  payfast: { label: 'PayFast', required: ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE'] },
};

export function paymentReadiness(env = {}) {
  const requested = String(env.HRC_PAYMENT_PROVIDER || '').trim().toLowerCase();
  const selected = providers[requested] ? requested : null;
  const provider = selected ? providers[selected] : null;
  const configured = provider ? provider.required.filter(name => typeof env[name] === 'string' && env[name].trim()) : [];
  const missing = provider ? provider.required.filter(name => !configured.includes(name)) : [];
  const demoPaymentsEnabled = env.HRC_SIMULATED_PAYMENTS_ENABLED === 'true';
  return {
    mode: demoPaymentsEnabled ? 'Demo payments enabled' : 'Demo payments disabled',
    demoPaymentsEnabled,
    livePaymentsEnabled: false,
    liveReady: false,
    provider: provider?.label || null,
    configuredCredentialCount: configured.length,
    requiredCredentialCount: provider?.required.length || 0,
    missingCredentialNames: missing,
    checks: [
      { id: 'demo', state: demoPaymentsEnabled ? 'Ready' : 'Check', detail: demoPaymentsEnabled ? 'Simulated outcomes remain available; they do not collect money.' : 'Demo payment mode is disabled in this environment.' },
      { id: 'provider', state: selected ? (missing.length ? 'Blocked' : 'Configured') : 'Not selected', detail: selected ? (missing.length ? `Selected provider credentials are incomplete (${configured.length}/${provider.required.length} present).` : 'Credential names are present; secret values are never displayed.') : 'Choose a payment provider before setting up live credentials.' },
      { id: 'adapter', state: 'Blocked', detail: 'No live payment-provider adapter is implemented. Credentials alone cannot enable live charging.' },
      { id: 'verification', state: 'Blocked', detail: 'Server-side transaction and amount verification, idempotent fulfilment, and signed webhook handling must be implemented and tested.' },
      { id: 'settlement', state: 'Blocked', detail: 'Merchant-of-record, settlement, refunds, chargebacks, and reconciliation are not configured.' },
      { id: 'launch review', state: 'Blocked', detail: 'Operational, security, and applicable healthcare/legal reviews are outstanding.' },
    ],
  };
}
