import crypto from 'crypto';
import assert from 'assert';
import { postgresDb } from '../src/server/db/postgres';
import { db } from '../src/server/db';
import { paymentService } from '../src/server/services/paymentService';
import { config } from '../src/server/config/config';
import { User, Order } from '../src/types';

async function runPaymentAndSecurityVerification() {
  console.log('================================================================');
  console.log('💳 VERIFYING PAYMENTS, WEBHOOKS & SECURITY HARDENING');
  console.log('================================================================\n');

  await postgresDb.initialize();

  // Test Customer & Order Setup
  const createdUser = await db.createUser({
    name: 'Payment Test Customer',
    email: `paytest_${Date.now()}@example.com`,
    phone: '+91 98765 43210',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    password: '$2b$10$vI8aWBnW3fID.ZQ4/zo1G.q1q3Y7VvJ3h1zK8f.QkZ2u3b5zY8b8q'
  });

  const menuItems = await db.getMenuItems();
  const sampleMenuItem = menuItems[0] || { id: 'item_1', name: 'Mutton Biryani', price: 320, isVeg: false };

  const testOrder: any = {
    id: `ord_pay_test_${Date.now()}`,
    orderNumber: `HK-TEST-${Date.now().toString().slice(-6)}`,
    customerId: createdUser.id,
    customerName: createdUser.name,
    customerPhone: createdUser.phone,
    items: [
      {
        menuItemId: sampleMenuItem.id,
        name: sampleMenuItem.name,
        quantity: 2,
        unitPrice: 320,
        totalPrice: 640,
        isVeg: sampleMenuItem.isVeg || false,
        customizations: [],
        addons: []
      }
    ],
    itemCount: 2,
    subtotal: 640,
    taxes: 32,
    deliveryFee: 40,
    discount: 0,
    grandTotal: 712,
    paymentMethod: 'ONLINE',
    paymentStatus: 'PENDING',
    status: 'PLACED',
    deliveryAddress: {
      id: 'addr_1',
      label: 'Home',
      street: '123 Cross Cut Road',
      area: 'Gandhipuram',
      city: 'Coimbatore',
      pincode: '641012',
      isDefault: true
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const createdOrder = await db.createOrder(testOrder);
  console.log(`✓ Created initial test online order ${createdOrder.id} with PENDING status`);
  assert.strictEqual(createdOrder.paymentStatus, 'PENDING');

  // 1. Gateway Order Creation (Integer Paise)
  console.log('\n👉 [TEST 1] Gateway Order Creation & Integer Paise Calculation');
  const gatewayOrder = await paymentService.createGatewayOrder(createdOrder.id, createdUser);
  assert.strictEqual(gatewayOrder.amountPaise, 71200, '712 INR must equal 71200 integer paise');
  assert.strictEqual(gatewayOrder.currency, 'INR');
  assert(gatewayOrder.gatewayOrderId.length > 0);
  console.log(`  ✓ Gateway Order created: ${gatewayOrder.gatewayOrderId} (${gatewayOrder.amountPaise} paise)`);

  const paymentRecord = await postgresDb.query(
    'SELECT * FROM payments WHERE order_id = $1 LIMIT 1',
    [createdOrder.id]
  );
  assert.strictEqual(paymentRecord.rows.length, 1);
  assert.strictEqual(Number(paymentRecord.rows[0].amount_paise), 71200);
  assert.strictEqual(paymentRecord.rows[0].status, 'CREATED');
  console.log('  ✓ Persisted payment row with CREATED status in database');

  // 2. Webhook HMAC-SHA256 Verification & Replay Protection
  console.log('\n👉 [TEST 2] Webhook HMAC Verification & Replay Defense');
  const webhookSecret = config.webhookSecret;
  const eventId = `evt_test_${Date.now()}`;
  const gatewayPaymentId = `pay_rzp_mock_${Date.now()}`;

  const webhookPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: gatewayOrder.gatewayOrderId,
          amount: 71200,
          currency: 'INR',
          status: 'captured',
          notes: {
            orderId: createdOrder.id
          }
        }
      }
    }
  });

  const rawBuffer = Buffer.from(webhookPayload, 'utf-8');
  const validSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBuffer)
    .digest('hex');

  // 2a. Reject forged signature
  const fakeSignature = 'a'.repeat(64);
  const forgedResult = await paymentService.processWebhook(
    rawBuffer,
    fakeSignature,
    eventId,
    'req_forged',
    '1.2.3.4'
  );
  assert.strictEqual(forgedResult.received, false);
  assert.strictEqual(forgedResult.reason, 'INVALID_SIGNATURE');
  console.log('  ✓ Forged webhook signature correctly rejected');

  // 2b. Reject underpayment fraud (e.g. paying 100 paise instead of 71200)
  const underpaidPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_under_${Date.now()}`,
          order_id: gatewayOrder.gatewayOrderId,
          amount: 100, // Underpayment!
          currency: 'INR',
          status: 'captured',
          notes: { orderId: createdOrder.id }
        }
      }
    }
  });
  const underpaidBuf = Buffer.from(underpaidPayload, 'utf-8');
  const underpaidSig = crypto.createHmac('sha256', webhookSecret).update(underpaidBuf).digest('hex');
  const underpaidResult = await paymentService.processWebhook(
    underpaidBuf,
    underpaidSig,
    `evt_under_${Date.now()}`,
    'req_under',
    '1.2.3.4'
  );
  assert.strictEqual(underpaidResult.reason, 'AMOUNT_MISMATCH');
  console.log('  ✓ Underpayment fraud attempt (100 paise vs 71200) blocked');

  // 2c. Process legitimate webhook
  const legitimateResult = await paymentService.processWebhook(
    rawBuffer,
    validSignature,
    eventId,
    'req_valid',
    '127.0.0.1'
  );
  assert.strictEqual(legitimateResult.received, true);
  assert.strictEqual(legitimateResult.processed, true);
  console.log('  ✓ Legitimate webhook successfully captured payment and updated order');

  // Verify order transitioned to ACCEPTED and VERIFIED
  const updatedOrder = await db.getOrderById(createdOrder.id);
  assert.strictEqual(updatedOrder?.paymentStatus, 'VERIFIED');
  assert.strictEqual(updatedOrder?.status, 'ACCEPTED');
  console.log('  ✓ Order status is now ACCEPTED and paymentStatus is VERIFIED');

  // 2d. Replay protection
  const replayResult = await paymentService.processWebhook(
    rawBuffer,
    validSignature,
    eventId, // Same event ID!
    'req_replay',
    '127.0.0.1'
  );
  assert.strictEqual(replayResult.received, true);
  assert.strictEqual(replayResult.processed, false);
  assert.strictEqual(replayResult.reason, 'ALREADY_PROCESSED');
  console.log('  ✓ Duplicate webhook event replayed was safely ignored');

  console.log('\n================================================================');
  console.log('🎉 ALL PAYMENT & SECURITY VERIFICATION TESTS PASSED 100%!');
  console.log('================================================================');
  await postgresDb.close();
}

runPaymentAndSecurityVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
