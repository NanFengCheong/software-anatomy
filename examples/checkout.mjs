export const checkout = {
  title: 'Checkout anatomy',
  subtitle: 'One purchase. Three perspectives. Every state connected.',
  description: 'An illustrative single-item checkout. USD 129.00. All times, payloads and records are simulated; no external services are called.',
  boundaries: [{ name: 'APPLICATION BOUNDARY', x: 280, y: 5, width: 530, height: 455, members: ['orders-api', 'inventory-api', 'payments-api', 'reconciler'] }],
  components: [
    { id: 'browser', name: 'Storefront', kind: 'CLIENT', icon: '▤', x: 40, y: 172, description: 'Submits checkout and displays the order result. Retrying uses the same checkout key.' },
    { id: 'orders-api', name: 'Order service', kind: 'SERVICE', icon: '◇', x: 310, y: 172, description: 'Owns the order lifecycle. Coordinates inventory and payment, then confirms only after a captured payment.' },
    { id: 'inventory-api', name: 'Inventory', kind: 'SERVICE', icon: '▦', x: 310, y: 22, description: 'Holds one item during payment. A provider timeout keeps the reservation held pending reconciliation.' },
    { id: 'payments-api', name: 'Payment service', kind: 'SERVICE', icon: '↗', x: 580, y: 172, description: 'Owns payment attempts and webhook deduplication. A transport timeout leaves the provider outcome unknown.' },
    { id: 'provider', name: 'Payment provider', kind: 'EXTERNAL', icon: '◎', x: 850, y: 172, description: 'Captures the payment and sends an asynchronous signed webhook. Transport failure does not prove rejection.' },
    { id: 'reconciler', name: 'Reconciliation', kind: 'WORKER', icon: '↻', x: 580, y: 340, description: 'Queues a provider status lookup. This example ends before that lookup; resolution remains pending.' }
  ],
  tables: [
    { id: 'orders', name: 'orders', owner: 'orders-api', x: 40, y: 80, fields: ['id', 'checkout_key', 'status', 'total_cents'], description: 'One order per checkout key. Confirmation follows payment capture, never a client-side assumption.' },
    { id: 'payment_attempts', name: 'payment_attempts', owner: 'payments-api', x: 430, y: 80, fields: ['id', 'order_id', 'provider_key', 'status', 'provider_ref'], description: 'Each attempt references an order. The provider key is reused during reconciliation to avoid a second charge.' },
    { id: 'reservations', name: 'reservations', owner: 'inventory-api', x: 40, y: 330, fields: ['id', 'order_id', 'sku', 'quantity', 'status'], description: 'Inventory remains held when the payment outcome is unknown. The success path commits it.' },
    { id: 'webhook_events', name: 'webhook_events', owner: 'payments-api', x: 820, y: 330, fields: ['id', 'attempt_id', 'type', 'status'], description: 'Provider event IDs are unique deduplication keys. This walkthrough shows one accepted delivery, not a duplicate delivery test.' }
  ],
  relations: [
    { from: 'payment_attempts', to: 'orders', field: 'order_id', targetField: 'id', label: '1 order · 0..N attempts' },
    { from: 'reservations', to: 'orders', field: 'order_id', targetField: 'id', label: '1 order · 0..N reservations' },
    { from: 'webhook_events', to: 'payment_attempts', field: 'attempt_id', targetField: 'id', label: '1 attempt · 0..N events' }
  ],
  scenarios: {
    success: { name: 'Successful payment', short: 'Success', outcome: 'Order confirmed', description: 'Capture succeeds. A webhook records payment before the order and inventory are committed.', events: [
      { id: 'submit', at: 0, from: 'browser', to: 'orders-api', label: 'Submit checkout', detail: 'POST /checkout · checkout_key=chk_1042 · total=12900 USD cents', writes: { orders: { id: 'ord_1042', checkout_key: 'chk_1042', status: 'pending', total_cents: 12900 } } },
      { id: 'reserve', at: 35, from: 'orders-api', to: 'inventory-api', label: 'Reserve one item', detail: 'Hold 1 × SKU-FIELD-01 for ord_1042.', writes: { reservations: { id: 'res_801', order_id: 'ord_1042', sku: 'SKU-FIELD-01', quantity: 1, status: 'held' } } },
      { id: 'attempt', at: 60, from: 'orders-api', to: 'payments-api', label: 'Create payment attempt', detail: 'Persist attempt before contacting provider; provider_key=pay_ord_1042_1.', writes: { payment_attempts: { id: 'pa_201', order_id: 'ord_1042', provider_key: 'pay_ord_1042_1', status: 'initiated', provider_ref: null }, orders: { status: 'payment_pending' } } },
      { id: 'capture', at: 90, from: 'payments-api', to: 'provider', label: 'Request payment capture', detail: 'POST /captures · idempotency-key: pay_ord_1042_1 · USD 129.00', writes: {} },
      { id: 'accepted', at: 420, from: 'provider', to: 'payments-api', label: 'Capture accepted', detail: '202 Accepted · provider_ref=ch_901. Await authoritative webhook.', writes: { payment_attempts: { status: 'processing', provider_ref: 'ch_901' } } },
      { id: 'webhook', at: 680, from: 'provider', to: 'payments-api', label: 'Receive capture webhook', detail: 'Signature verified · evt_501 · payment.captured · ch_901. Store unique event and capture state.', writes: { webhook_events: { id: 'evt_501', attempt_id: 'pa_201', type: 'payment.captured', status: 'processed' }, payment_attempts: { status: 'captured' } } },
      { id: 'paid', at: 710, from: 'payments-api', to: 'orders-api', label: 'Apply captured payment', detail: 'Order service records that ord_1042 is paid.', writes: { orders: { status: 'paid' } } },
      { id: 'commit', at: 735, from: 'orders-api', to: 'inventory-api', label: 'Commit inventory', detail: 'Reservation res_801 becomes committed; item cannot be released.', writes: { reservations: { status: 'committed' } } },
      { id: 'confirm', at: 760, from: 'orders-api', to: 'browser', label: 'Confirm order', detail: 'Checkout result: confirmed · ord_1042 · USD 129.00.', writes: { orders: { status: 'confirmed' } } }
    ] },
    timeout: { name: 'Provider timeout', short: 'Timeout', outcome: 'Awaiting reconciliation', description: 'The response deadline expires. Payment remains unknown; the order stays pending and inventory stays held.', events: [
      { id: 'submit', at: 0, from: 'browser', to: 'orders-api', label: 'Submit checkout', detail: 'POST /checkout · checkout_key=chk_1042 · total=12900 USD cents', writes: { orders: { id: 'ord_1042', checkout_key: 'chk_1042', status: 'pending', total_cents: 12900 } } },
      { id: 'reserve', at: 35, from: 'orders-api', to: 'inventory-api', label: 'Reserve one item', detail: 'Hold 1 × SKU-FIELD-01 for ord_1042.', writes: { reservations: { id: 'res_801', order_id: 'ord_1042', sku: 'SKU-FIELD-01', quantity: 1, status: 'held' } } },
      { id: 'attempt', at: 60, from: 'orders-api', to: 'payments-api', label: 'Create payment attempt', detail: 'Persist attempt before contacting provider; provider_key=pay_ord_1042_1.', writes: { payment_attempts: { id: 'pa_201', order_id: 'ord_1042', provider_key: 'pay_ord_1042_1', status: 'initiated', provider_ref: null }, orders: { status: 'payment_pending' } } },
      { id: 'capture', at: 90, from: 'payments-api', to: 'provider', label: 'Request payment capture', detail: 'POST /captures · same provider key; the provider may have captured payment.', writes: {} },
      { id: 'deadline', at: 5090, from: 'provider', to: 'payments-api', label: 'Response deadline expires', detail: 'No response observed after 5,000 ms. Provider outcome is unknown, not declined.', tone: 'warning', writes: { payment_attempts: { status: 'unknown' } } },
      { id: 'pending', at: 5100, from: 'payments-api', to: 'orders-api', label: 'Preserve pending order', detail: 'Keep order payment_pending and reservation held. Do not create another capture attempt.', tone: 'warning', writes: {} },
      { id: 'reconcile', at: 5120, from: 'payments-api', to: 'reconciler', label: 'Queue reconciliation', detail: 'Enqueue lookup by pay_ord_1042_1. Queue state is illustrative; no reconciliation result is assumed.', tone: 'warning', writes: {} },
      { id: 'notify', at: 5140, from: 'orders-api', to: 'browser', label: 'Show pending payment', detail: 'Checkout result: pending. This scenario ends here; a later webhook or lookup must resolve payment.', tone: 'warning', writes: {} }
    ] }
  }
};
