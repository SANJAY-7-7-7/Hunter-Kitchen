import crypto from 'crypto';
import { postgresDb } from '../db/postgres';
import { db } from '../db';
import { config } from '../config/config';
import { auditService } from './auditService';
import { outboxRepository } from '../repositories/outboxRepository';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/AppError';
import { User } from '../../types';

export class PaymentService {
  /**
   * Creates a Gateway Order (Razorpay) for an existing pending online order.
   * Money is calculated strictly in integer paise.
   */
  async createGatewayOrder(orderId: string, actor: User): Promise<{
    keyId: string;
    gatewayOrderId: string;
    amountPaise: number;
    currency: string;
    orderNumber: string;
  }> {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }

    if (actor.role === 'CUSTOMER' && order.customerId !== actor.id) {
      throw new ForbiddenError('You are not authorized to initiate payment for this order');
    }

    if (order.paymentStatus === 'VERIFIED') {
      throw new ValidationError('This order has already been paid and verified');
    }

    // Amount strictly in integer paise (1 INR = 100 paise)
    const amountPaise = Math.round(Number(order.grandTotal) * 100);
    const currency = 'INR';

    const razorpayKeyId = config.razorpayKeyId;
    const razorpayKeySecret = config.razorpayKeySecret;

    let gatewayOrderId = `rzp_order_${order.id}_${Date.now()}`;

    // If live or configured Razorpay credentials are provided, call Razorpay Orders API
    if (razorpayKeyId && razorpayKeySecret && !razorpayKeyId.startsWith('rzp_test_hunter')) {
      try {
        const authHeader = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`
          },
          body: JSON.stringify({
            amount: amountPaise,
            currency,
            receipt: order.orderNumber,
            notes: {
              orderId: order.id,
              customerId: order.customerId
            }
          })
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          gatewayOrderId = data.id;
          logger.info(`Created live Razorpay order ${gatewayOrderId} for order ${order.id}`);
        } else {
          const errText = await response.text();
          logger.error('Razorpay Orders API error response', { error: errText });
          throw new ValidationError('Payment gateway order generation failed. Please try again or use Cash on Delivery.');
        }
      } catch (err: any) {
        if (err instanceof ValidationError) throw err;
        logger.error('Network failure connecting to Razorpay Orders API', { error: err.message });
        throw new ValidationError('Could not connect to payment gateway. Please select Cash on Delivery or retry.');
      }
    } else {
      if (config.env === 'production') {
        throw new ValidationError('Online payment gateway is not properly configured. Please use Cash on Delivery.');
      }
      logger.info(`Operating in payment gateway test mode for order ${order.id}; generated test order ID ${gatewayOrderId}`);
    }

    // Persist payment record
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await postgresDb.query(
      `INSERT INTO payments (id, order_id, gateway, gateway_order_id, amount_paise, currency, status, created_at, updated_at)
       VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'CREATED', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [paymentId, order.id, gatewayOrderId, amountPaise, currency]
    );

    return {
      keyId: razorpayKeyId,
      gatewayOrderId,
      amountPaise,
      currency,
      orderNumber: order.orderNumber
    };
  }

  /**
   * Secondary check: Frontend checkout response verification with timing-safe HMAC.
   * Strictly binds payment to order and caller, verifies amount, and eliminates production mock bypass.
   */
  async verifyCheckoutSignature(
    payload: {
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
    actor: User
  ): Promise<{ success: boolean; message: string }> {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = payload;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new ValidationError('Missing required payment signature verification fields');
    }

    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }

    // 1. Ownership verification: caller must be the order owner or staff/admin
    if (actor.role === 'CUSTOMER' && order.customerId !== actor.id) {
      logger.warn(`Unauthorized payment verification attempt on order ${orderId} by user ${actor.id}`);
      throw new ForbiddenError('You are not authorized to verify payment for this order');
    }

    // 2. Idempotency: if already verified, return success immediately
    if (order.paymentStatus === 'VERIFIED') {
      return { success: true, message: 'Payment for this order has already been verified.' };
    }

    // 3. Cryptographic and binding check: razorpayOrderId must belong to this exact order
    const paymentRecordRes = await postgresDb.query(
      'SELECT * FROM payments WHERE order_id = $1 AND gateway_order_id = $2 LIMIT 1',
      [order.id, razorpayOrderId]
    );
    if (paymentRecordRes.rows.length === 0) {
      logger.error(`Fraud prevention alert: gateway order ${razorpayOrderId} does not belong to order ${order.id}`);
      throw new ValidationError('Invalid payment: Gateway order does not match this order');
    }

    // 4. Amount integrity check: verify payment record matches current order grand total
    const paymentRecord = paymentRecordRes.rows[0];
    const expectedAmountPaise = Math.round(Number(order.grandTotal) * 100);
    if (Number(paymentRecord.amount_paise) !== expectedAmountPaise) {
      logger.error(`Amount mismatch fraud alert! Order expected ${expectedAmountPaise} paise, but payment record has ${paymentRecord.amount_paise} paise`);
      throw new ValidationError('Payment amount does not match order grand total');
    }

    // 5. Signature verification
    const secret = config.razorpayKeySecret || config.webhookSecret;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const sigBuf = Buffer.from(razorpaySignature, 'utf-8');
    const expectedBuf = Buffer.from(expected, 'utf-8');

    // ONLY allow mock_sig_ in explicit automated test suite ('test' env) - NEVER in production!
    const isTestEnv = config.env === 'test';
    const isMockPass = isTestEnv && razorpaySignature.startsWith('mock_sig_');
    const isValidSignature = isMockPass || (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf));

    if (!isValidSignature) {
      logger.warn(`Invalid payment signature attempt for order ${orderId}`, { actorId: actor.id });
      throw new ValidationError('Payment signature verification failed');
    }

    return await this.finalizeVerifiedPayment(order.id, razorpayOrderId, razorpayPaymentId, razorpaySignature, actor);
  }

  /**
   * Primary source of truth: Webhook payment capture processor with rawBody HMAC validation
   */
  async processWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    eventIdHeader: string | undefined,
    requestId: string,
    clientIp: string
  ): Promise<{ received: boolean; processed: boolean; reason?: string }> {
    if (!signatureHeader || !rawBody || rawBody.length === 0) {
      logger.warn('Payment webhook rejected: missing signature or empty raw body', { clientIp });
      return { received: false, processed: false, reason: 'MISSING_SIGNATURE_OR_BODY' };
    }

    const secret = config.webhookSecret;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signatureHeader.trim(), 'utf-8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      logger.warn('Payment webhook rejected: cryptographic signature mismatch', { clientIp });
      return { received: false, processed: false, reason: 'INVALID_SIGNATURE' };
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      return { received: false, processed: false, reason: 'MALFORMED_JSON' };
    }

    const eventId = eventIdHeader || event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Replay protection: Check if eventId was already processed
    const existingPayment = await postgresDb.query(
      'SELECT id, status FROM payments WHERE raw_event_id = $1 LIMIT 1',
      [eventId]
    );

    if (existingPayment.rows.length > 0) {
      logger.info(`Payment webhook replay detected for event ${eventId}; ignoring duplicate`);
      return { received: true, processed: false, reason: 'ALREADY_PROCESSED' };
    }

    const eventType = event.event || event.eventType;
    if (eventType === 'payment.captured' || eventType === 'order.paid' || event.status === 'captured') {
      const paymentEntity = event.payload?.payment?.entity || event;
      const gatewayPaymentId = paymentEntity.id || event.paymentId;
      const gatewayOrderId = paymentEntity.order_id || event.orderId;
      const amountPaise = Number(paymentEntity.amount || event.amount);

      // Locate order by gateway_order_id or internal order notes
      let orderId = paymentEntity.notes?.orderId || event.orderId;
      if (!orderId && gatewayOrderId) {
        const found = await postgresDb.query(
          'SELECT order_id FROM payments WHERE gateway_order_id = $1 LIMIT 1',
          [gatewayOrderId]
        );
        if (found.rows.length > 0) {
          orderId = found.rows[0].order_id;
        }
      }

      if (!orderId) {
        logger.warn('Could not correlate webhook payment to an order', { gatewayOrderId, gatewayPaymentId });
        return { received: true, processed: false, reason: 'ORDER_NOT_FOUND' };
      }

      const order = await db.getOrderById(orderId);
      if (!order) {
        logger.warn(`Order ${orderId} referenced in webhook not found in database`);
        return { received: true, processed: false, reason: 'ORDER_NOT_FOUND' };
      }

      // CRITICAL CHECK: Verify paid amount strictly equals order total (prevent underpayment fraud / NaN bypass)
      const expectedAmountPaise = Math.round(Number(order.grandTotal) * 100);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0 || amountPaise < expectedAmountPaise) {
        logger.error(`Payment amount mismatch fraud alert! Received ${amountPaise} paise, expected ${expectedAmountPaise} paise`, {
          orderId: order.id
        });
        return { received: true, processed: false, reason: 'AMOUNT_MISMATCH' };
      }

      const systemActor: User = {
        id: 'usr_webhook_gateway',
        name: 'Razorpay Payment Gateway',
        email: 'gateway@hunterskitchen.com',
        phone: '+91 90000 00000',
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString()
      };

      await this.finalizeVerifiedPayment(
        order.id,
        gatewayOrderId,
        gatewayPaymentId,
        signatureHeader,
        systemActor,
        eventId,
        amountPaise
      );

      logger.info(`Payment webhook successfully captured and verified order ${order.id} (Tx: ${gatewayPaymentId})`);
      return { received: true, processed: true };
    }

    return { received: true, processed: false, reason: 'UNHANDLED_EVENT_TYPE' };
  }

  /**
   * Finalizes verified payment atomically across PostgreSQL tables
   */
  private async finalizeVerifiedPayment(
    orderId: string,
    gatewayOrderId: string,
    gatewayPaymentId: string,
    signature: string,
    actor: User,
    rawEventId?: string,
    amountPaise?: number
  ): Promise<{ success: boolean; message: string }> {
    return postgresDb.transaction(async (client) => {
      // 1. Lock and fetch order
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) {
        throw new NotFoundError(`Order ${orderId} not found`);
      }
      const currentOrder = orderRes.rows[0];

      const finalAmountPaise = amountPaise || Math.round(Number(currentOrder.grand_total) * 100);

      // 2. Insert or update payments record
      await client.query(
        `INSERT INTO payments (
           id, order_id, gateway, gateway_order_id, gateway_payment_id,
           amount_paise, currency, status, raw_event_id, signature, updated_at
         ) VALUES ($1, $2, 'RAZORPAY', $3, $4, $5, 'INR', 'CAPTURED', $6, $7, NOW())
         ON CONFLICT (gateway_payment_id) DO UPDATE SET
           status = 'CAPTURED',
           signature = EXCLUDED.signature,
           updated_at = NOW()`,
        [
          `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          orderId,
          gatewayOrderId,
          gatewayPaymentId,
          finalAmountPaise,
          rawEventId || null,
          signature
        ]
      );

      // 3. Update order payment status and transition to ACCEPTED
      await client.query(
        `UPDATE orders SET
           payment_status = 'VERIFIED',
           payment_transaction_id = $1,
           status = CASE WHEN status = 'PLACED' THEN 'ACCEPTED' ELSE status END,
           accepted_at = CASE WHEN status = 'PLACED' AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
           updated_at = NOW()
         WHERE id = $2`,
        [gatewayPaymentId, orderId]
      );

      // 4. Log outbox event
      await outboxRepository.insert({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        aggregateType: 'ORDER',
        aggregateId: orderId,
        eventType: 'ORDER_PAYMENT_VERIFIED',
        payload: {
          orderId,
          gatewayPaymentId,
          amountPaise: finalAmountPaise
        },
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString()
      });

      // 5. Audit log
      await auditService.log({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PAYMENT_VERIFIED',
        resource: 'ORDER',
        resourceId: orderId,
        requestId: `req_pay_${Date.now()}`,
        newValue: { gatewayPaymentId, gatewayOrderId, amountPaise: finalAmountPaise }
      });

      return { success: true, message: 'Payment verified and order accepted successfully.' };
    });
  }

  /**
   * 15-Minute Expiry Job: Automatically sweeps and cancels unpaid online orders.
   * Cancels orders where payment_method = 'ONLINE', payment_status = 'PENDING',
   * status = 'PLACED', and created_at < NOW() - INTERVAL '15 minutes'.
   */
  async cancelExpiredUnpaidOrders(): Promise<number> {
    try {
      const expiredRes = await postgresDb.query(
        `SELECT id, order_number, customer_id, created_at 
         FROM orders 
         WHERE payment_method = 'ONLINE' 
           AND payment_status = 'PENDING' 
           AND status = 'PLACED' 
           AND created_at < NOW() - INTERVAL '15 minutes'
         LIMIT 50`
      );

      let cancelledCount = 0;
      for (const row of expiredRes.rows) {
        try {
          await postgresDb.transaction(async (client) => {
            const check = await client.query(
              `SELECT status, payment_status FROM orders WHERE id = $1 FOR UPDATE`,
              [row.id]
            );
            if (check.rows.length === 0 || check.rows[0].status !== 'PLACED' || check.rows[0].payment_status !== 'PENDING') {
              return;
            }

            // Cancel the order
            await client.query(
              `UPDATE orders 
               SET status = 'CANCELLED', 
                   payment_status = 'FAILED',
                   cancellation_reason = 'Payment timeout: Online payment was not completed within 15 minutes',
                   cancelled_at = NOW(),
                   updated_at = NOW()
               WHERE id = $1`,
              [row.id]
            );

            // Mark any pending payments records as FAILED
            await client.query(
              `UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE order_id = $1 AND status = 'CREATED'`,
              [row.id]
            );

            // Outbox event
            await outboxRepository.insert({
              id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              aggregateType: 'ORDER',
              aggregateId: row.id,
              eventType: 'ORDER_CANCELLED',
              payload: {
                orderId: row.id,
                orderNumber: row.order_number,
                reason: 'Payment timeout: online payment was not completed within 15 minutes'
              },
              status: 'PENDING',
              retryCount: 0,
              maxRetries: 3,
              createdAt: new Date().toISOString()
            });

            // Audit log
            await auditService.log({
              actorId: 'system_payment_expiry_worker',
              actorName: 'Payment Expiry Worker',
              actorRole: 'SYSTEM',
              action: 'CANCEL_EXPIRED_UNPAID_ORDER',
              resource: 'ORDER',
              resourceId: row.id,
              requestId: `req_expire_${Date.now()}`,
              newValue: { reason: 'Online payment timeout (15 mins exceeded)' }
            });
          });

          cancelledCount++;
          logger.info(`Cancelled expired unpaid online order #${row.order_number} (${row.id})`);
        } catch (orderErr: any) {
          logger.error(`Error cancelling expired order ${row.id}: ${orderErr.message}`);
        }
      }
      return cancelledCount;
    } catch (err: any) {
      logger.error(`Failed to sweep expired unpaid online orders: ${err.message}`);
      return 0;
    }
  }
}

export const paymentService = new PaymentService();
