# Backend API spec — payments

Two endpoints the app calls, and the Cashfree calls each one makes server-side.
The app talks **only** to your backend; your backend holds the Cashfree
**secret** key and is the sole authority on whether an order is paid.

- Cashfree API version header: `x-api-version: 2023-08-01`
- Base URL: `https://sandbox.cashfree.com/pg` (sandbox) / `https://api.cashfree.com/pg` (production)
- Auth to Cashfree (server→server): headers `x-client-id`, `x-client-secret`
- Auth app→backend: `Authorization: Bearer <session token>` (see `Session`)

### Units gotcha
The app sends **minor units** (`amountMinor`, e.g. paise). Cashfree's
`order_amount` is **major units** with decimals (e.g. `1.00`). Convert in the
backend: `order_amount = amountMinor / 100`.

---

## 1) `POST /payments/orders`

Create a Cashfree order for the authenticated user.

### Request (app → backend)
```json
{
  "amount": 100,
  "currency": "INR",
  "metadata": { "payee": "merchant@upi" }
}
```
| Field | Type | Notes |
|---|---|---|
| `amount` | int | Minor units (paise). Validate > 0 and within limits. |
| `currency` | string | ISO 4217. Default `INR`. |
| `metadata` | object? | Optional; your own context. Do not trust for pricing. |

### What the backend does
1. Resolve the customer from the bearer token (never from the request body).
2. Generate a unique `order_id` (your own, idempotent per attempt).
3. Call Cashfree **Create Order**:
   ```
   POST {base}/orders
   x-client-id, x-client-secret, x-api-version: 2023-08-01
   {
     "order_id": "ord_abc123",
     "order_amount": 1.00,
     "order_currency": "INR",
     "customer_details": {
       "customer_id": "usr_42",
       "customer_phone": "9999999999"
     },
     "order_meta": {
       "notify_url": "https://api.yourbackend.com/webhooks/cashfree"
     }
   }
   ```
4. Persist the order as `CREATED` with amount + customer, for later reconciliation.

### Response (backend → app)
```json
{
  "order_id": "ord_abc123",
  "payment_session_id": "session_xxxxxxxxxxxx"
}
```
The app passes `payment_session_id` straight to the Cashfree SDK.

### Errors
| HTTP | Body | When |
|---|---|---|
| 400 | `{ "error": "invalid_amount" }` | amount ≤ 0 / over cap |
| 401 | `{ "error": "unauthorized" }` | missing/expired token |
| 502 | `{ "error": "psp_unavailable" }` | Cashfree create-order failed |

---

## 2) `POST /payments/confirm`

Confirm the real status of an order. Called from the app's verify callback —
but the **truth comes from Cashfree**, not the app.

### Request (app → backend)
```json
{ "order_id": "ord_abc123" }
```

### What the backend does
1. Check the order belongs to the authenticated user.
2. Call Cashfree **Get Order**:
   ```
   GET {base}/orders/ord_abc123
   x-client-id, x-client-secret, x-api-version: 2023-08-01
   ```
3. Read `order_status` from Cashfree and update your record. Do **not** mark
   paid based on the client call alone — the webhook (below) is the durable
   source of truth; this endpoint is the fast-path read.

### Response (backend → app)
```json
{
  "order_id": "ord_abc123",
  "status": "PAID",
  "amount": 100
}
```
`status` is passed through from Cashfree's `order_status`. The app maps it:

| Cashfree `order_status` | App `PaymentStatus` |
|---|---|
| `PAID` | success |
| `ACTIVE` | pending (checkout not completed) |
| `EXPIRED`, `TERMINATED`, `TERMINATION_REQUESTED` | failed |

> `amount` is echoed in minor units for the UI; optional.

### Errors
| HTTP | Body | When |
|---|---|---|
| 401 | `{ "error": "unauthorized" }` | bad token |
| 403 | `{ "error": "not_owner" }` | order belongs to another user |
| 404 | `{ "error": "unknown_order" }` | no such order |

---

## 3) `POST /webhooks/cashfree` (required for correctness)

Not called by the app — Cashfree calls it. This is your **authoritative**
paid/failed signal, resilient to the user closing the app mid-payment.

1. Verify the webhook signature using your Cashfree secret (per Cashfree's
   webhook signature docs) — reject if it doesn't match.
2. On `PAYMENT_SUCCESS_WEBHOOK`, mark the order paid **idempotently** (ignore
   duplicates; webhooks can be redelivered).
3. Trigger downstream effects (ledger entry, receipt, push) from here, not from
   the client confirm call.

---

## Security checklist for these endpoints
- Secret key only in backend env/secrets manager — never returned to the app.
- Amount and customer come from the server session, never trusted from the client.
- Idempotency keys on order creation and webhook handling.
- Rate-limit `/payments/orders` per user.
- Log order state transitions for dispute/audit.
