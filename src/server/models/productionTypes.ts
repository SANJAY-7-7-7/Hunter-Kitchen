/**
 * Production Architecture Data Models
 * 
 * Standard schemas for Outbox Events, Audit Logs, Idempotency, and Data Reconciliation.
 */

export type OutboxEventStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';

export type OutboxEventType =
  | 'ORDER_CREATED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'RIDER_ASSIGNED'
  | 'ORDER_OUT_FOR_DELIVERY'
  | 'COD_COLLECTED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'ORDER_PAYMENT_VERIFIED'
  | 'MENU_ITEM_UPDATED'
  | 'SYSTEM_ALERT';

export interface OutboxEvent {
  id: string;
  aggregateType: 'ORDER' | 'USER' | 'MENU' | 'DELIVERY_BATCH' | 'SETTINGS';
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Record<string, any>;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  processingStartedAt?: string;
  createdAt: string;
  processedAt?: string;
  nextRetryAt?: string;
}

export interface AuditLogEntry {
  sequenceNumber: number;
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  oldValue?: any;
  newValue?: any;
  requestId: string;
  ipAddress?: string;
  timestamp: string;
  previousHash: string;
  hash: string;
}

export interface IdempotencyRecord {
  key: string;
  requestPath: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  responseStatus?: number;
  responseBody?: any;
  createdAt: string;
  expiresAt: string;
}

export type AnomalyType =
  | 'UNCOLLECTED_COD'
  | 'ASSIGNED_WITHOUT_RIDER'
  | 'OUT_FOR_DELIVERY_WITHOUT_RIDER'
  | 'CANCELLED_BUT_DELIVERED'
  | 'CANCELLED_BUT_COD_COLLECTED'
  | 'DUPLICATE_ORDER_ITEMS'
  | 'NEGATIVE_ORDER_TOTAL'
  | 'PRICE_MISMATCH'
  | 'INVALID_STATUS_TRANSITION'
  | 'STALE_PENDING_ORDER'
  | 'STALE_ASSIGNED_ORDER';

export interface AnomalyReport {
  timestamp: string;
  totalOrdersAudited: number;
  anomaliesDetected: number;
  issues: Array<{
    type: AnomalyType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    orderId: string;
    description: string;
    suggestedAction: string;
  }>;
}
