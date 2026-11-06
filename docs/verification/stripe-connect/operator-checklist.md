# Stripe Connect operator checklist

Stripe payment UI is hidden unless `/api/healthz` reports the Stripe capability as `available`. The capability is available only when payments are explicitly enabled and the server can construct a usable real or local-mock runtime. An incomplete configuration fails closed without preventing the API from starting.

## Configuration names

- `STRIPE_PAYMENTS_ENABLED` — must be exactly `true` to enable the capability.
- `STRIPE_MOCK_MODE` — local deterministic verification only; never production.
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_WEBHOOK_SECRET`
- `STRIPE_PLATFORM_FEE_BPS` — defaults to `400`.
- `STRIPE_PLATFORM_FEE_FIXED_CENTS` — defaults to `30`.
- `APP_URL` — must be a localhost URL when mock mode is enabled.

Do not put secret values in source control, screenshots, issue comments, logs, or this document.

## Webhook registration

- Your account endpoint: `POST /api/stripe/webhooks/platform`
- Connected accounts endpoint: `POST /api/stripe/webhooks/connect`

The current handler processes these event names:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `account.updated`

Other verified event types are acknowledged without changing invoice or connected-account state.

## Verification boundary

Local mock mode can deterministically exercise onboarding, payment-link creation, mock Checkout, webhook settlement, receipt creation, and the Stripe Clearing journal without credentials. It is not evidence of real Stripe test-mode onboarding, hosted Checkout, webhook delivery, payouts, or production readiness. Real test-mode evidence remains a separate operator task after the configuration above is supplied through the deployment environment.
