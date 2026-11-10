const component = (id, name, kind, index, description) => ({ id, name, kind, icon: kind === 'EXTERNAL' ? '◎' : kind === 'CLIENT' ? '▤' : '◇', x: (index % 4) * 240, y: Math.floor(index / 4) * 160, description });
const table = (id, owner, fields, description, index) => ({ id, name: id, owner, fields, description, x: (index % 3) * 360, y: Math.floor(index / 3) * 250 });
const event = (id, phase, from, to, label, detail, writes = {}, warning = false) => ({ id, phase, from, to, label, detail, writes, ...(warning ? { tone: 'warning' } : {}) });
const timed = events => events.map((item, index) => ({ ...item, at: index < 12 ? index * 40 : 500 + (index - 12) * 120 }));
const common = [
  event('request', 'intake', 'portal', 'edge', 'Submit tenant order', 'POST /orders · tenant=tenant_demo · request_key=req_8201. Illustrative data only.'),
  event('authenticate', 'intake', 'edge', 'identity', 'Validate identity', 'Validate token audience, tenant membership and order-write permission.'),
  event('authorized', 'intake', 'identity', 'edge', 'Return scoped principal', 'Return tenant-scoped principal; authorization is not inferred from a client tenant field.'),
  event('create-order', 'intake', 'edge', 'orders-api', 'Create pending order', 'Unique tenant/request key prevents the same submission creating a second order.', { orders: { id: 'ord_8201', tenant_id: 'tenant_demo', request_key: 'req_8201', total_cents: 12900, status: 'pending' } }),
  event('risk-check', 'intake', 'orders-api', 'risk', 'Evaluate order risk', 'Apply an illustrative allow decision; this is not a real fraud-provider result.'),
  event('risk-allowed', 'intake', 'risk', 'orders-api', 'Allow orchestration', 'Risk decision permits the workflow; payment and stock are not yet committed.'),
  event('outbox-write', 'dispatch', 'orders-api', 'outbox', 'Persist order-start event', 'Model the order/outbox producer boundary explicitly. No distributed transaction is claimed.', { outbox_messages: { id: 'msg_8201', order_id: 'ord_8201', event_key: 'order_start_ord_8201', status: 'pending' } }),
  event('outbox-dispatch', 'dispatch', 'outbox', 'bus', 'Publish order-start event', 'At-least-once delivery: consumers identify the logical event by its stable event key.', { outbox_messages: { status: 'published' } }),
  event('start-workflow', 'dispatch', 'bus', 'orchestrator', 'Start order workflow', 'Workflow key is order ID; replaying the same start event must address the same workflow.', { workflows: { id: 'wf_8201', order_id: 'ord_8201', phase: 'reserve', status: 'running' } }),
  event('reserve', 'payment', 'orchestrator', 'inventory', 'Hold inventory', 'Hold one unit before capture. Expiry/release requires an explicit subsequent business decision.', { reservations: { id: 'res_8201', order_id: 'ord_8201', sku: 'SKU-ENTERPRISE-01', status: 'held' } }),
  event('payment-attempt', 'payment', 'orchestrator', 'payments', 'Create capture attempt', 'Persist one attempt with a stable provider key; this walkthrough does not create a new charge on retry.', { orders: { status: 'payment_pending' }, payment_attempts: { id: 'pa_8201', order_id: 'ord_8201', provider_key: 'capture_ord_8201_1', capture_status: 'initiated', refund_status: 'not_requested', status: 'initiated', provider_ref: null } }),
  event('capture-request', 'payment', 'payments', 'provider', 'Request capture', 'POST /captures · Idempotency-Key: capture_ord_8201_1 · USD 129.00.')
];
const captured = [
  event('capture-accepted', 'payment', 'provider', 'payments', 'Capture accepted', 'Accepted response includes a provider reference; await capture evidence.', { payment_attempts: { status: 'processing', capture_status: 'processing', provider_ref: 'ch_8201' } }),
  event('capture-webhook', 'payment', 'provider', 'payments', 'Apply capture webhook', 'Illustrative verified event evt_8201 is stored by a unique provider event key. No live signature verification occurs.', { payment_attempts: { capture_status: 'captured', status: 'captured' }, inbox_events: { id: 'in_8201', payment_id: 'pa_8201', provider_event_id: 'evt_8201', status: 'processed' } }),
  event('ledger-post', 'payment', 'payments', 'ledger', 'Post captured payment', 'Deterministic ledger entry key addresses this capture once; no cross-service atomic commit is assumed.', { ledger_entries: { id: 'le_8201', order_id: 'ord_8201', payment_id: 'pa_8201', amount_cents: 12900, status: 'posted' } }),
  event('payment-accounted', 'payment', 'ledger', 'orchestrator', 'Acknowledge accounting', 'Workflow advances only after captured payment and ledger acknowledgement.', { workflows: { phase: 'fulfillment' }, orders: { status: 'paid' } })
];
const fulfill = [
  event('request-fulfillment', 'fulfillment', 'orchestrator', 'warehouse', 'Request warehouse fulfillment', 'Warehouse receives the same order/workflow keys for deduplication.', { shipments: { id: 'ship_8201', order_id: 'ord_8201', status: 'queued' } }),
  event('commit-stock', 'fulfillment', 'orchestrator', 'inventory', 'Commit held inventory', 'Commit reservation after warehouse acceptance; compensation is a separate business process.', { reservations: { status: 'committed' } }),
  event('dispatch-shipment', 'fulfillment', 'warehouse', 'notifications', 'Dispatch shipment notification', 'The representative shipment is dispatched and a notification job is queued.', { shipments: { status: 'dispatched' }, notification_jobs: { id: 'nj_8201', order_id: 'ord_8201', status: 'queued' } }),
  event('deliver-notification', 'fulfillment', 'notifications', 'portal', 'Notify customer', 'Notification delivery is separate from payment and ledger state.', { notification_jobs: { status: 'delivered' } }),
  event('complete-order', 'fulfillment', 'orchestrator', 'orders-api', 'Complete order workflow', 'All shown business acknowledgements have completed.', { orders: { status: 'fulfilled' }, workflows: { phase: 'complete', status: 'completed' } }),
  event('audit-success', 'resolution', 'orders-api', 'audit', 'Record fulfillment outcome', 'This is one representative audit row, not an append-only audit storage implementation.', { audit_records: { id: 'audit_8201', order_id: 'ord_8201', status: 'recorded', decision: 'fulfilled' } })
];

/** An authored enterprise fixture; every provider, queue and persistence event is simulated. */
export const enterprise = {
  title: 'Enterprise order orchestration',
  subtitle: 'Trust boundaries, asynchronous delivery, reconciliation and compensation.',
  description: 'Simulated tenant-scoped order. Representative records and authored event order; no live identity, gateway, queue, warehouse or database proof.',
  components: [
    component('portal', 'Tenant portal', 'CLIENT', 0, 'Untrusted tenant-facing client; server-side authorization binds the request to a tenant.'),
    component('edge', 'API gateway', 'SERVICE', 1, 'Authenticates ingress and forwards a scoped principal; does not own order persistence.'),
    component('identity', 'Identity service', 'SERVICE', 2, 'Validates token audience and tenant-scoped access.'),
    component('risk', 'Risk policy', 'SERVICE', 3, 'Produces an explicit risk decision; illustrative allow policy here.'),
    component('orders-api', 'Order service', 'SERVICE', 4, 'Owns order state and submission idempotency within a tenant.'),
    component('orchestrator', 'Order workflow', 'WORKER', 5, 'Coordinates acknowledgements and compensation; not a distributed database transaction.'),
    component('inventory', 'Inventory service', 'SERVICE', 6, 'Owns held, committed and quarantined stock reservations.'),
    component('payments', 'Payment service', 'SERVICE', 7, 'Owns capture/refund attempts, provider keys and webhook inbox deduplication.'),
    component('provider', 'Payment provider', 'EXTERNAL', 8, 'External provider; a request timeout does not prove capture or refund failure.'),
    component('outbox', 'Outbox relay', 'WORKER', 9, 'Publishes persisted logical events with stable event keys; delivery can repeat.'),
    component('bus', 'Event broker', 'SERVICE', 10, 'At-least-once transport; does not itself provide business exactly-once semantics.'),
    component('ledger', 'Accounting ledger', 'SERVICE', 11, 'Owns the representative capture ledger entry; deterministic keys support deduplication.'),
    component('warehouse', 'Warehouse', 'SERVICE', 12, 'Accepts or rejects fulfillment independently of payment capture.'),
    component('notifications', 'Notifications', 'WORKER', 13, 'Delivers customer communication separately from financial state.'),
    component('audit', 'Audit service', 'SERVICE', 14, 'Records the illustrated final business decision; storage durability is not exercised.'),
    component('support', 'Operations review', 'SERVICE', 15, 'Owns unresolved compensation cases; no automatic refund-success assumption.')
  ],
  boundaries: [
    { name: 'External parties', members: ['portal', 'provider'] },
    { name: 'Access control', members: ['edge', 'identity', 'risk'] },
    { name: 'Commerce services', members: ['orders-api', 'orchestrator', 'inventory', 'payments', 'outbox', 'bus', 'ledger'] },
    { name: 'Operations domain', members: ['warehouse', 'notifications', 'audit', 'support'] }
  ],
  tables: [
    table('orders', 'orders-api', ['id', 'tenant_id', 'request_key', 'total_cents', 'status'], 'One representative tenant order; request key is scoped by tenant.', 0),
    table('workflows', 'orchestrator', ['id', 'order_id', 'phase', 'status'], 'One durable-workflow snapshot; execution is illustrative.', 1),
    table('reservations', 'inventory', ['id', 'order_id', 'sku', 'status'], 'Stock reservation persists while payment/refund outcome is unresolved.', 2),
    table('payment_attempts', 'payments', ['id', 'order_id', 'provider_key', 'capture_status', 'refund_status', 'provider_ref', 'status'], 'Capture and refund outcomes are separate; retries retain the capture provider key.', 3),
    table('outbox_messages', 'outbox', ['id', 'order_id', 'event_key', 'status'], 'One representative outbox message; a later reconciliation lookup is a distinct logical event.', 4),
    table('ledger_entries', 'ledger', ['id', 'order_id', 'payment_id', 'amount_cents', 'status'], 'Representative captured-payment entry; not a complete double-entry accounting model.', 5),
    table('inbox_events', 'payments', ['id', 'payment_id', 'provider_event_id', 'status'], 'Representative provider event keyed for deduplication.', 6),
    table('shipments', 'warehouse', ['id', 'order_id', 'status'], 'One representative warehouse shipment.', 7),
    table('notification_jobs', 'notifications', ['id', 'order_id', 'status'], 'Communication job with lifecycle independent of payment.', 8),
    table('audit_records', 'audit', ['id', 'order_id', 'decision', 'status'], 'Representative audit record, not a multi-row append log.', 9),
    table('manual_cases', 'support', ['id', 'order_id', 'reason', 'status'], 'Explicit unresolved operational decision.', 10)
  ],
  relations: [
    ...['workflows', 'reservations', 'payment_attempts', 'outbox_messages', 'ledger_entries', 'shipments', 'notification_jobs', 'audit_records', 'manual_cases'].map(from => ({ from, to: 'orders', field: 'order_id', targetField: 'id', label: '1 order · 0..N records' })),
    ...['ledger_entries', 'inbox_events'].map(from => ({ from, to: 'payment_attempts', field: 'payment_id', targetField: 'id', label: '1 payment · 0..N records' }))
  ],
  scenarios: {
    success: { name: 'Fulfilled enterprise order', short: 'Success', outcome: 'Order fulfilled and accounted', description: 'Capture evidence, accounting and warehouse acceptance precede completion.', events: timed([...common, ...captured, ...fulfill]) },
    timeout: { name: 'Timeout then reconciliation', short: 'Reconcile', outcome: 'Reconciled capture; order fulfilled', description: 'An unknown capture outcome is reconciled using a read-only lookup and the original provider key.', events: timed([
      ...common,
      event('capture-timeout', 'payment', 'provider', 'payments', 'Capture response times out', 'No response observed at the deadline. Capture outcome is unknown; do not create another charge.', { payment_attempts: { capture_status: 'unknown', status: 'unknown' } }, true),
      event('mark-awaiting', 'reconciliation', 'payments', 'orchestrator', 'Pause workflow for reconciliation', 'Keep the order pending and stock held.', { workflows: { phase: 'reconciliation', status: 'awaiting_reconciliation' } }, true),
      event('queue-lookup', 'reconciliation', 'payments', 'outbox', 'Queue capture status lookup', 'Distinct logical message requests a read-only provider lookup, not a second capture.', {}, true),
      event('dispatch-lookup', 'reconciliation', 'outbox', 'bus', 'Publish reconciliation lookup', 'At-least-once dispatch retains the original order and payment identity.', {}, true),
      event('consume-lookup', 'reconciliation', 'bus', 'payments', 'Consume reconciliation request', 'Duplicate delivery addresses the same payment attempt and provider key.', {}, true),
      event('provider-lookup', 'reconciliation', 'payments', 'provider', 'Read original capture status', 'GET capture status using capture_ord_8201_1. This is a lookup, not another capture request.', {}, true),
      event('lookup-captured', 'reconciliation', 'provider', 'payments', 'Observe captured payment', 'Illustrative provider lookup resolves the unknown outcome as captured.', { payment_attempts: { capture_status: 'captured', status: 'captured', provider_ref: 'ch_8201' } }),
      event('reconciled-ledger', 'reconciliation', 'payments', 'ledger', 'Post reconciled capture', 'Use the same deterministic capture ledger key as the success path.', { ledger_entries: { id: 'le_8201', order_id: 'ord_8201', payment_id: 'pa_8201', amount_cents: 12900, status: 'posted' } }),
      event('reconciled-ack', 'reconciliation', 'ledger', 'orchestrator', 'Resume accounted workflow', 'Capture and accounting are known. No webhook delivery is invented.', { workflows: { phase: 'fulfillment', status: 'running' }, orders: { status: 'paid' } }),
      ...fulfill
    ]) },
    compensation: { name: 'Fulfillment rejected; refund unknown', short: 'Manual review', outcome: 'Manual review; refund outcome unknown', description: 'Captured payment meets a warehouse rejection. Compensation is attempted; refund timeout remains unresolved.', events: timed([
      ...common, ...captured,
      event('request-fulfillment', 'fulfillment', 'orchestrator', 'warehouse', 'Request warehouse fulfillment', 'Warehouse receives the same order/workflow keys.', { shipments: { id: 'ship_8201', order_id: 'ord_8201', status: 'requested' } }),
      event('warehouse-reject', 'fulfillment', 'warehouse', 'orchestrator', 'Reject fulfillment', 'Illustrative warehouse capacity rejection after capture. No stock commit has occurred.', { shipments: { status: 'rejected' }, workflows: { phase: 'compensation', status: 'compensating' } }, true),
      event('request-refund', 'resolution', 'orchestrator', 'payments', 'Request compensating refund', 'Refund is a separate provider operation; capture remains captured.', { payment_attempts: { refund_status: 'requested', status: 'refund_pending' } }, true),
      event('provider-refund', 'resolution', 'payments', 'provider', 'Send refund request', 'POST /refunds · refund_key=refund_ord_8201_1 · capture=ch_8201. No automatic second attempt is shown.', {}, true),
      event('refund-timeout', 'resolution', 'provider', 'payments', 'Refund response times out', 'The provider may have refunded. Preserve unknown refund outcome; do not claim rollback succeeded.', { payment_attempts: { refund_status: 'unknown', status: 'refund_unknown' } }, true),
      event('open-manual-case', 'resolution', 'payments', 'support', 'Open operations case', 'A human decision/provider lookup is still required. The order is not labelled cancelled or refunded.', { manual_cases: { id: 'case_8201', order_id: 'ord_8201', reason: 'refund_timeout_after_warehouse_rejection', status: 'open' }, orders: { status: 'manual_review' }, workflows: { phase: 'manual_review', status: 'manual_review' } }, true),
      event('quarantine-stock', 'resolution', 'orchestrator', 'inventory', 'Quarantine unresolved reservation', 'Keep explicit stock custody while compensation is unresolved; no silent release is assumed.', { reservations: { status: 'quarantined' } }, true),
      event('audit-manual', 'resolution', 'support', 'audit', 'Record unresolved compensation', 'Example stops at manual review. No real refund, release or case resolution has been proved.', { audit_records: { id: 'audit_8201', order_id: 'ord_8201', decision: 'manual_review_refund_unknown', status: 'recorded' } }, true)
    ]) }
  },
  panels: {
    architecture: [
      { id: 'access', name: 'Access and order intake', description: 'Tenant authentication, risk decision and order ownership.', components: ['portal', 'edge', 'identity', 'risk', 'orders-api'] },
      { id: 'commerce', name: 'Commerce and orchestration', description: 'At-least-once dispatch, inventory, payment provider and accounting.', components: ['orchestrator', 'inventory', 'payments', 'provider', 'outbox', 'bus', 'ledger'] },
      { id: 'operations', name: 'Fulfillment and operations', description: 'Warehouse, notifications, audit and unresolved manual decisions.', components: ['warehouse', 'notifications', 'audit', 'support'] }
    ],
    sequence: [
      { id: 'intake', phase: 'intake', name: '01 · Tenant intake', description: 'Authenticate, authorize, create order and evaluate risk.' },
      { id: 'dispatch', phase: 'dispatch', name: '02 · Reliable dispatch', description: 'Persist an outbox message, publish and begin the workflow.' },
      { id: 'payment', phase: 'payment', name: '03 · Capture and accounting', description: 'Hold inventory and establish payment/accounting evidence.' },
      { id: 'reconciliation', phase: 'reconciliation', name: '04 · Reconciliation', description: 'Resolve an unknown capture using the same provider identity.' },
      { id: 'fulfillment', phase: 'fulfillment', name: '05 · Fulfillment', description: 'Warehouse acceptance or explicit rejection.' },
      { id: 'resolution', phase: 'resolution', name: '06 · Outcome and review', description: 'Audit completion or retain an unresolved compensation case.' }
    ],
    erd: [
      { id: 'order-data', name: 'Order and dispatch data', description: 'Order, workflow, reservations and outbox ownership.', tables: ['orders', 'workflows', 'reservations', 'outbox_messages'] },
      { id: 'payment-data', name: 'Payment and accounting data', description: 'Capture, provider inbox and accounting records with parent-order context.', tables: ['payment_attempts', 'ledger_entries', 'inbox_events'] },
      { id: 'operations-data', name: 'Fulfillment and review data', description: 'Shipment, notification, audit and manual case with parent-order context.', tables: ['shipments', 'notification_jobs', 'audit_records', 'manual_cases'] }
    ]
  }
};
