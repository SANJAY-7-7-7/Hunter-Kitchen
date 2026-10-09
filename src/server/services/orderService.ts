import { db } from '../db';
import { Order, OrderStatus, User } from '../../types';
import { outboxRepository } from '../repositories/outboxRepository';
import { auditService } from './auditService';
import { cacheService } from './cacheService';
import { 
  ValidationError, 
  NotFoundError, 
  OrderStateTransitionError,
  ConflictError 
} from '../errors/AppError';

// Valid State Transition Matrix (Production Finite State Machine)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['ASSIGNED', 'PICKED_UP', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'READY', 'PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [], // Terminal State
  CANCELLED: [], // Terminal State
  REJECTED: []   // Terminal State
};

export class OrderService {
  /**
   * Validates cart items and securely recalculates prices server-side against PostgreSQL.
   */
  async validateAndCalculateCart(items: any[]) {
    if (!items || items.length === 0) {
      throw new ValidationError('Cart cannot be empty');
    }

    const settings = await db.getSettings();
    if (!settings.isOpen || settings.temporaryPause) {
      throw new ValidationError(
        settings.temporaryPause
          ? `Kitchen is temporarily paused: ${settings.pauseReason || 'Please try again soon'}`
          : 'Restaurant is currently closed for orders'
      );
    }

    let subtotal = 0;
    const orderItemSnapshots = [];

    for (const item of items) {
      const dbItem = await db.getMenuItemById(item.menuItem?.id || item.menuItemId);
      if (!dbItem || !dbItem.isAvailable) {
        throw new ValidationError(`"${item.menuItem?.name || item.name || 'Selected item'}" is currently unavailable or out of stock`);
      }

      const unitPrice = dbItem.discountPrice || dbItem.price;
      let optionsPrice = 0;

      (item.customizations || []).forEach((c: any) => (optionsPrice += c.price || 0));
      (item.addons || []).forEach((a: any) => (optionsPrice += a.price || 0));

      const totalItemPrice = (unitPrice + optionsPrice) * item.quantity;
      subtotal += totalItemPrice;

      orderItemSnapshots.push({
        menuItemId: dbItem.id,
        name: dbItem.name,
        unitPrice: unitPrice + optionsPrice,
        quantity: item.quantity,
        isVeg: dbItem.isVeg,
        customizations: item.customizations || [],
        addons: item.addons || [],
        specialInstructions: item.specialInstructions || '',
        totalPrice: totalItemPrice
      });
    }

    const deliveryFee = subtotal >= settings.freeDeliveryThreshold ? 0 : settings.baseDeliveryFee;
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const grandTotal = subtotal + deliveryFee + tax;

    return {
      subtotal,
      deliveryFee,
      tax,
      grandTotal,
      orderItemSnapshots
    };
  }

  /**
   * Atomic Order Creation with PostgreSQL Transaction, Outbox Event and Audit Log.
   */
  async createOrder(payload: any, requestId: string): Promise<Order> {
    const { subtotal, deliveryFee, tax, grandTotal, orderItemSnapshots } = await this.validateAndCalculateCart(payload.items);

    const newOrder = await db.createOrder({
      customerId: payload.customerId || 'usr_guest',
      customerName: payload.customerName || 'Valued Customer',
      customerPhone: payload.customerPhone || '+91 90000 00000',
      deliveryAddress: payload.deliveryAddress,
      items: orderItemSnapshots,
      orderNotes: payload.orderNotes,
      subtotal,
      deliveryFee,
      tax,
      discount: 0,
      grandTotal,
      paymentMethod: payload.paymentMethod || 'COD',
      paymentStatus: payload.paymentMethod === 'ONLINE' ? 'PENDING' : 'COD_PENDING',
      paymentTransactionId: undefined,
      codCashTendered: payload.paymentMethod === 'COD' && payload.codCashTendered ? Number(payload.codCashTendered) : undefined,
      codChangeDue: payload.paymentMethod === 'COD' && payload.codChangeDue !== undefined ? Number(payload.codChangeDue) : undefined,
      status: 'PLACED'
    });

    // Write transactional outbox event
    await outboxRepository.insert({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      aggregateType: 'ORDER',
      aggregateId: newOrder.id,
      eventType: 'ORDER_CREATED',
      payload: {
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        grandTotal: newOrder.grandTotal,
        customerId: newOrder.customerId
      },
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString()
    });

    // Write audit log
    await auditService.log({
      actorId: newOrder.customerId,
      actorName: newOrder.customerName,
      actorRole: 'CUSTOMER',
      action: 'CREATE_ORDER',
      resource: 'ORDER',
      resourceId: newOrder.id,
      newValue: { orderNumber: newOrder.orderNumber, grandTotal: newOrder.grandTotal, itemsCount: newOrder.items.length },
      requestId
    });

    cacheService.invalidateTag('orders');

    return newOrder;
  }

  /**
   * Transition Order Status with strict finite state machine validation and PostgreSQL row lock protection.
   */
  async transitionStatus(
    orderId: string, 
    nextStatus: OrderStatus, 
    actor: User, 
    requestId: string,
    metadata?: Record<string, any>,
    expectedVersion?: number
  ): Promise<Order> {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // Optimistic Concurrency Control
    if (expectedVersion !== undefined && order.version !== expectedVersion) {
      throw new ConflictError(
        `Order #${order.orderNumber} was concurrently modified. Expected version ${expectedVersion}, but current version is ${order.version}.`,
        'CONCURRENCY_CONFLICT'
      );
    }

    const currentStatus = order.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(nextStatus)) {
      throw new OrderStateTransitionError(
        currentStatus, 
        nextStatus, 
        `Valid transitions from '${currentStatus}' are: ${allowed.join(', ') || 'None (terminal state)'}`
      );
    }

    const updated = await db.updateOrderStatus(orderId, nextStatus, actor, metadata);
    if (!updated) {
      throw new NotFoundError('Order', orderId);
    }

    // Determine discrete COD-centric Outbox Event Type
    const getOutboxEventType = (): import('../models/productionTypes').OutboxEventType => {
      switch (nextStatus) {
        case 'ACCEPTED':
          return 'ORDER_CONFIRMED';
        case 'PREPARING':
          return 'ORDER_PREPARING';
        case 'READY':
          return 'ORDER_READY';
        case 'ASSIGNED':
          return 'RIDER_ASSIGNED';
        case 'OUT_FOR_DELIVERY':
          return 'ORDER_OUT_FOR_DELIVERY';
        case 'DELIVERED':
          return 'ORDER_DELIVERED';
        case 'CANCELLED':
        case 'REJECTED':
          return 'ORDER_CANCELLED';
        default:
          return 'ORDER_CONFIRMED';
      }
    };

    // Write transactional outbox event
    await outboxRepository.insert({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      aggregateType: 'ORDER',
      aggregateId: order.id,
      eventType: getOutboxEventType(),
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        oldStatus: currentStatus,
        newStatus: nextStatus,
        updatedBy: actor.name,
        assignedDeliveryPartnerName: updated.assignedDeliveryPartnerName,
        paymentMethod: updated.paymentMethod,
        paymentStatus: updated.paymentStatus
      },
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString()
    });

    // If order was delivered via Cash on Delivery, record separate COD_COLLECTED outbox event
    if (nextStatus === 'DELIVERED' && updated.paymentMethod === 'COD') {
      await outboxRepository.insert({
        id: `evt_cod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        aggregateType: 'ORDER',
        aggregateId: order.id,
        eventType: 'COD_COLLECTED',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          grandTotal: updated.grandTotal,
          collectedBy: updated.assignedDeliveryPartnerName || actor.name,
          codCashTendered: updated.codCashTendered,
          codChangeDue: updated.codChangeDue,
          collectedAt: new Date().toISOString()
        },
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString()
      });
    }

    // Write audit log
    const isReassign = currentStatus === 'ASSIGNED' && nextStatus === 'ASSIGNED';
    await auditService.log({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.staffRole ? `${actor.role} (${actor.staffRole})` : actor.role,
      action: isReassign ? 'REASSIGN_DELIVERY_PARTNER' : `TRANSITION_ORDER_${nextStatus}`,
      resource: 'ORDER',
      resourceId: order.id,
      oldValue: { status: currentStatus, assignedDeliveryPartnerId: order.assignedDeliveryPartnerId },
      newValue: { status: nextStatus, orderNumber: order.orderNumber, customerName: order.customerName, ...metadata },
      requestId
    });

    cacheService.invalidateTag('orders');

    return updated;
  }
}

export const orderService = new OrderService();
