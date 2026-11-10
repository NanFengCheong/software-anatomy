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

// Authored presentation metadata; events and snapshots remain replay truth.
checkout.presentation = {
  symbols: { browser: 'window', 'orders-api': 'receipt', 'inventory-api': 'stock', 'payments-api': 'card', provider: 'bank', reconciler: 'clock' },
  overview: ['inventory-api', 'payments-api', 'orders-api']
};
checkout.scenarios.success.presentation = {
  intro: { title: 'One purchase. More than one promise.', caption: 'Follow a $129 checkout: hold the item, establish payment, then confirm the order. Every scene shows the records behind the promise.' },
  scenes: [
    ['submit', 'Start with a durable order.', 'The storefront submits one checkout key. The order exists before payment begins.'],
    ['reserve', 'Hold the item. Keep the promise open.', 'Inventory reserves one item for this order. Held stock is not yet committed stock.'],
    ['attempt', 'Record intent before moving money.', 'Create the payment attempt first. Its provider key follows this attempt through the capture request.'],
    ['capture', 'Ask the provider to capture $129.', 'A request crosses the application boundary. Sending it does not establish that payment succeeded.'],
    ['accepted', 'Accepted is not captured.', 'The provider acknowledges the request. The attempt is processing; the order still waits.'],
    ['webhook', 'Now there is capture evidence.', 'A verified webhook records the captured payment and its unique provider event ID.'],
    ['paid', 'Let the order learn what happened.', 'The payment service reports capture. Only now does the order become paid.'],
    ['commit', 'Turn the hold into a commitment.', 'Inventory commits the reservation after payment is recorded. The item cannot be released by this flow.'],
    ['confirm', 'One confirmed order. Consistent records.', 'Payment is captured, inventory is committed, and the storefront receives confirmation. This is a simulated outcome.']
  ].map(([eventId, title, caption]) => ({ eventId, title, caption, duration: 4300 }))
};
checkout.scenarios.timeout.presentation = {
  intro: { title: 'What if the response never arrives?', caption: 'The same $129 purchase takes an uncertain path. A timeout tells us what we observed—not what happened to the money.' },
  scenes: [
    ...checkout.scenarios.success.presentation.scenes.slice(0, 3).map(scene => ({ ...scene })),
    { eventId: 'capture', title: 'The request leaves. Certainty does not return.', caption: 'The provider may capture the payment even if its response never reaches us. Keep the original provider key.', duration: 4600 },
    { eventId: 'deadline', title: 'A timeout is an unknown outcome.', caption: 'The response deadline expires. Mark the attempt unknown; do not call it declined and do not assume a refund is due.', duration: 5500 },
    { eventId: 'pending', title: 'Keep the order pending. Keep stock held.', caption: 'There is no new capture attempt. The order and reservation retain their previous state while payment remains uncertain.', duration: 5000 },
    { eventId: 'reconcile', title: 'Queue a lookup, not a second charge.', caption: 'Reconciliation will look up the original provider key. Queuing this work proves no payment resolution.', duration: 5000 },
    { eventId: 'notify', title: 'Tell the customer what is known.', caption: 'Show pending payment. This example ends before any lookup result or later webhook: capture, release and refund remain unproved.', duration: 5500 }
  ]
};

// Scene art direction: only the current exchange and evidence needed to explain it.
const checkoutSceneNotes = {
  submit: ['THE ORDER', 'Create one order', 'POST /checkout', ['orders'], 'The checkout key identifies this purchase.'],
  reserve: ['STOCK CUSTODY', 'Hold one item', 'SKU-FIELD-01 × 1', ['orders', 'reservations'], 'Held is a promise to wait. Committed is a promise to fulfil.'],
  attempt: ['PAYMENT INTENT', 'Persist the attempt', 'pay_ord_1042_1', ['payment_attempts', 'orders'], 'The provider key belongs to this attempt.'],
  capture: ['ACROSS THE BOUNDARY', 'Capture USD 129.00', 'POST /captures', ['payment_attempts'], 'A request is not evidence of capture.'],
  accepted: ['ACKNOWLEDGEMENT', 'Request accepted', '202 Accepted', ['payment_attempts'], 'Processing is still an intermediate state.'],
  webhook: ['CAPTURE EVIDENCE', 'Capture recorded', 'payment.captured / evt_501', ['payment_attempts', 'webhook_events'], 'One verified provider event establishes capture in this example.'],
  paid: ['ORDER STATE', 'Record payment', 'ord_1042', ['orders', 'payment_attempts'], 'The order can now move forward.'],
  commit: ['STOCK CUSTODY', 'Commit the item', 'res_801', ['reservations', 'orders'], 'The reservation is no longer releasable in this flow.'],
  confirm: ['THE CUSTOMER PROMISE', 'Order confirmed', 'ord_1042 / USD 129.00', ['orders', 'payment_attempts', 'reservations'], 'Three records support one customer promise.'],
  deadline: ['UNCERTAINTY', 'No response observed', 'Response deadline / 5,000 ms', ['payment_attempts', 'reservations'], 'A deadline is a local observation. Capture may still have happened.'],
  pending: ['PRESERVE CUSTODY', 'Keep the order pending', 'No new capture attempt', ['orders', 'payment_attempts', 'reservations'], 'Neither a stock release nor a refund is justified by timeout alone.'],
  reconcile: ['RECOVERY WORK', 'Queue a provider lookup', 'Reuse pay_ord_1042_1', ['payment_attempts', 'reservations'], 'Queued work is not a resolved payment.'],
  notify: ['THE CUSTOMER PROMISE', 'Payment pending', 'Resolution remains open', ['orders', 'payment_attempts', 'reservations'], 'This story ends with uncertainty—not an invented recovery.']
};
for (const scenario of Object.values(checkout.scenarios)) {
  Object.assign(scenario.presentation.intro, { evidence: [], chapter: 'ONE PURCHASE / THREE RESPONSIBILITIES' });
  for (const scene of scenario.presentation.scenes) {
    const [chapter, message, protocol, evidence, note] = checkoutSceneNotes[scene.eventId];
    Object.assign(scene, { chapter, message, protocol, evidence, note });
  }
}

const checkoutSceneTitles = {
  submit: 'Create the order.', reserve: 'Reserve one item.', attempt: 'Write the payment attempt.',
  capture: 'Send the capture request.', accepted: 'Accepted. Still waiting.', webhook: 'Record the captured payment.',
  paid: 'Mark the order paid.', commit: 'Commit the reservation.', confirm: 'Confirm the purchase.',
  deadline: 'No response. No verdict.', pending: 'Hold the order and the item.',
  reconcile: 'Look up the original payment.', notify: 'Show payment pending.'
};
checkout.scenarios.success.presentation.intro.title = 'What makes a checkout complete?';
checkout.scenarios.timeout.presentation.intro.title = 'The payment may have gone through.';
for (const scenario of Object.values(checkout.scenarios)) {
  for (const scene of scenario.presentation.scenes) scene.title = checkoutSceneTitles[scene.eventId];
}

checkout.scenarios.success.presentation.intro.question = 'When is it safe to tell the customer their order is confirmed?';
checkout.scenarios.timeout.presentation.intro.question = 'What can we safely promise when payment is uncertain?';
for (const scenario of Object.values(checkout.scenarios)) scenario.presentation.intro.note = 'One item. USD 129.00. Two possible outcomes.';
