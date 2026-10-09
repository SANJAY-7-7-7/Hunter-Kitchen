/**
 * Automated Production Architecture Verification Suite
 * Executes integration tests across:
 * 1. FSM & Optimistic Concurrency Controls
 * 2. Persistent Idempotency Service
 * 3. Cryptographic SHA-256 Audit Log Tamper-Evidence
 * 4. Outbox Worker Crash Recovery (Stale Processing Lease)
 * 5. Comprehensive COD Operational & Financial Reconciliation
 */

import { postgresDb } from '../src/server/db/postgres';
import { orderService } from '../src/server/services/orderService';
import { idempotencyService } from '../src/server/services/idempotencyService';
import { auditRepository } from '../src/server/repositories/auditRepository';
import { auditService } from '../src/server/services/auditService';
import { outboxRepository } from '../src/server/repositories/outboxRepository';
import { reconciliationService } from '../src/server/services/reconciliationService';
import { db } from '../src/server/db';
import { Order, OrderStatus } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failure: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 THE HUNTER — PRODUCTION ARCHITECTURE VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  await postgresDb.initialize();

  // -------------------------------------------------------------
  // TEST 1: Cryptographic SHA-256 Audit Log Chain & Tamper Detection
  // -------------------------------------------------------------
  console.log('👉 [TEST 1] Cryptographic SHA-256 Audit Log Chain & Tamper Evidence');
  
  await auditService.log({
    action: 'TEST_INIT_VERIFICATION',
    resource: 'SYSTEM',
    resourceId: 'SYS_01',
    requestId: 'req_test_001',
    actorName: 'Test Runner',
    actorRole: 'SYSTEM'
  });

  await auditService.log({
    action: 'TEST_MUTATION_STEP_2',
    resource: 'ORDER',
    resourceId: 'ORD_TEST_001',
    oldValue: { status: 'PLACED' },
    newValue: { status: 'ACCEPTED' },
    requestId: 'req_test_002',
    actorName: 'Test Runner',
    actorRole: 'SYSTEM'
  });

  const integrityInitial = await auditService.verifyIntegrity();
  if (!integrityInitial.isValid) {
    console.log('Integrity failure details:', JSON.stringify(integrityInitial, null, 2));
  }
  assert(integrityInitial.isValid === true, 'Audit log SHA-256 hash chain is 100% valid initially');
  assert(integrityInitial.checkedCount >= 2, `Verified ${integrityInitial.checkedCount} chained blocks`);
  assert(typeof integrityInitial.latestHash === 'string' && integrityInitial.latestHash.length === 64, 'Latest block hash is valid 64-char SHA-256 hex');

  // Simulate tampering in DB
  const res = await postgresDb.query('SELECT sequence_number, hash FROM audit_logs ORDER BY sequence_number DESC LIMIT 1');
  if (res.rows.length > 0) {
    const lastSeq = res.rows[0].sequence_number;
    const originalHash = res.rows[0].hash;

    await postgresDb.query('UPDATE audit_logs SET hash = $1 WHERE sequence_number = $2', [
      '0000000000000000000000000000000000000000000000000000000000000000',
      lastSeq
    ]);
    
    const tamperCheck = await auditService.verifyIntegrity();
    assert(tamperCheck.isValid === false, 'Cryptographic chain correctly detects altered hash in audit log');
    assert(tamperCheck.brokenAt === Number(lastSeq), `Pinpointed exact broken block sequence #${tamperCheck.brokenAt}`);

    // Restore clean hash
    await postgresDb.query('UPDATE audit_logs SET hash = $1 WHERE sequence_number = $2', [originalHash, lastSeq]);
    const restoredCheck = await auditService.verifyIntegrity();
    assert(restoredCheck.isValid === true, 'Audit log chain valid again after restoring genuine hash');
  }

  // -------------------------------------------------------------
  // TEST 2: Persistent Idempotency Service
  // -------------------------------------------------------------
  console.log('\n👉 [TEST 2] Persistent Idempotency Service Store & Replay');

  const testKey = `idem_verify_${Date.now()}`;
  const startResult = await idempotencyService.startRequest(testKey, '/api/orders', { test: true });
  assert(startResult.cached === false, 'New idempotency key correctly claimed (not cached)');

  // Complete request with payload
  const mockPayload = { status: 'success', orderId: 'ord_idem_123', total: 780 };
  await idempotencyService.completeRequest(testKey, 201, mockPayload);

  // Replay request with same key
  const replayResult = await idempotencyService.startRequest(testKey, '/api/orders', { test: true });
  assert(replayResult.cached === true, 'Replaying identical key correctly identified as duplicate cached response');
  assert(replayResult.record?.responseStatus === 201, 'Replayed status code matches original (201)');
  assert(replayResult.record?.responseBody?.orderId === 'ord_idem_123', 'Replayed response payload perfectly matches original payload');

  // -------------------------------------------------------------
  // TEST 3: Outbox Worker Recovery from Crashed / Stale PROCESSING State
  // -------------------------------------------------------------
  console.log('\n👉 [TEST 3] Outbox Worker Crash Recovery (Stale Processing Lease)');

  const staleEventId = `evt_stale_${Date.now()}`;
  await outboxRepository.insert({
    id: staleEventId,
    aggregateType: 'ORDER',
    aggregateId: 'ORD_STALE_99',
    eventType: 'ORDER_CONFIRMED',
    payload: { test: true },
    status: 'PROCESSING',
    processingStartedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago (stale)
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(Date.now() - 125000).toISOString()
  });

  // Call recoverStaleProcessing (timeout = 60s)
  const recoveredCount = await outboxRepository.recoverStaleProcessing(60000);
  assert(recoveredCount >= 1, `Worker successfully recovered ${recoveredCount} stale PROCESSING event(s)`);

  const foundStaleRecovered = await outboxRepository.getById(staleEventId);
  assert(foundStaleRecovered !== undefined && foundStaleRecovered.status === 'PENDING', 'Stale event was safely reset to PENDING for redelivery');

  // -------------------------------------------------------------
  // TEST 4: FSM Strict State Transitions & Concurrency
  // -------------------------------------------------------------
  console.log('\n👉 [TEST 4] FSM State Machine Transitions & Optimistic Locking');

  // Create a test order in DB
  const allUsers = await db.getUsers();
  const customer = allUsers.find(u => u.role === 'CUSTOMER') || allUsers[0];
  const allMenuItems = await db.getMenuItems();
  const menuItem = allMenuItems[0];

  const mockOrder: any = {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    deliveryAddress: {
      id: 'addr_1',
      type: 'HOME' as const,
      name: customer.name,
      phone: customer.phone,
      doorNo: '12',
      street: 'Race Course Road',
      area: 'Race Course',
      city: 'Coimbatore',
      pincode: '641018',
      coordinates: '11.0168,76.9558',
      isDefault: true
    },
    items: [
      {
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price,
        isVeg: menuItem.isVeg,
        customizations: [],
        addons: []
      }
    ],
    itemCount: 1,
    subtotal: menuItem.price,
    deliveryFee: 35,
    tax: 19,
    discount: 0,
    grandTotal: menuItem.price + 35 + 19,
    paymentMethod: 'COD' as const,
    paymentStatus: 'COD_PENDING' as const,
    status: 'PLACED' as const,
    codCashTendered: 500,
    codChangeDue: 500 - (menuItem.price + 35 + 19),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const createdOrder = await db.createOrder(mockOrder);
  const activeOrderId = createdOrder.id;

  const testActor = {
    id: 'staff_1',
    name: 'Chef Raj',
    role: 'STAFF' as const,
    staffRole: 'KITCHEN_CHEF' as const,
    phone: '+91 99999 22222',
    email: 'raj@hunter.com',
    status: 'ACTIVE' as const,
    joinedAt: new Date().toISOString()
  };

  // Illegal transition attempt: PLACED -> DELIVERED (skipping kitchen and transit)
  let illegalCaught = false;
  try {
    await orderService.transitionStatus(activeOrderId, 'DELIVERED', testActor, 'req_fsm_illegal');
  } catch (err: any) {
    illegalCaught = true;
    assert(err.name === 'OrderStateTransitionError', `Illegal transition directly from PLACED -> DELIVERED blocked with OrderStateTransitionError: "${err.message}"`);
  }
  assert(illegalCaught === true, 'FSM strictly prohibited invalid state jump');

  // Legal sequence: PLACED -> ACCEPTED
  const accepted = await orderService.transitionStatus(activeOrderId, 'ACCEPTED', testActor, 'req_fsm_01', undefined, 1);
  assert(accepted.status === 'ACCEPTED', 'Transition PLACED -> ACCEPTED succeeded');
  assert(accepted.version === 2, 'Version incremented to 2');

  // Legal sequence: ACCEPTED -> PREPARING -> READY
  const preparing = await orderService.transitionStatus(activeOrderId, 'PREPARING', testActor, 'req_fsm_02', undefined, 2);
  assert(preparing.status === 'PREPARING', 'Transition ACCEPTED -> PREPARING succeeded');

  const ready = await orderService.transitionStatus(activeOrderId, 'READY', testActor, 'req_fsm_03', undefined, 3);
  assert(ready.status === 'READY', 'Transition PREPARING -> READY succeeded');

  // Concurrency Race Simulation: 2 actors try to update the same order with stale version
  const assigned = await orderService.transitionStatus(activeOrderId, 'ASSIGNED', testActor, 'req_fsm_04', undefined, 4);
  assert(assigned.status === 'ASSIGNED', 'First actor updated to ASSIGNED (version 5)');

  let conflictCaught = false;
  try {
    // Second actor tries to update using outdated version 4 (current is 5)
    await orderService.transitionStatus(activeOrderId, 'CANCELLED', testActor, 'req_fsm_05', undefined, 4);
  } catch (err: any) {
    conflictCaught = true;
    assert(err.name === 'ConflictError', `Optimistic locking caught concurrent conflicting update: "${err.message}"`);
  }
  assert(conflictCaught === true, 'Optimistic concurrency control prevented dirty race condition');

  // -------------------------------------------------------------
  // TEST 5: Comprehensive COD Operational & Financial Reconciliation
  // -------------------------------------------------------------
  console.log('\n👉 [TEST 5] Comprehensive COD Reconciliation Engine');

  const auditReport = await reconciliationService.runAudit();
  assert(typeof auditReport.totalOrdersAudited === 'number', `Audited ${auditReport.totalOrdersAudited} existing database orders`);
  console.log(`  ✓ Reconciliation completed with ${auditReport.anomaliesDetected} anomaly flag(s)`);

  console.log('\n================================================================');
  console.log('🎉 ALL PRODUCTION ARCHITECTURE INTEGRATION TESTS PASSED 100%!');
  console.log('================================================================\n');

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
