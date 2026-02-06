/**
 * Audit Logging Service
 * 
 * Provides comprehensive audit logging for sensitive operations.
 * Logs are stored with timestamps, operation types, user info, and change details.
 */

import { SERVER_CONFIG, AuditOperation } from '../config/app.config';

/**
 * Audit log entry structure
 */
interface AuditLogEntry {
  /** Unique log ID */
  id: string;
  /** Timestamp of the operation */
  timestamp: Date;
  /** Type of operation performed */
  operation: AuditOperation;
  /** Entity type (e.g., 'payment', 'invoice', 'batch') */
  entityType: string;
  /** Entity ID being operated on */
  entityId: string;
  /** User who performed the operation (if available) */
  userId?: string;
  /** User's IP address */
  ipAddress?: string;
  /** Previous state (for updates/deletes) */
  previousState?: Record<string, any>;
  /** New state (for creates/updates) */
  newState?: Record<string, any>;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Human-readable description */
  description: string;
}

/**
 * In-memory audit log storage
 * In production, this should be replaced with database storage
 */
const auditLogs: AuditLogEntry[] = [];
const MAX_LOG_SIZE = 10000;

/**
 * Generate a unique ID for audit logs
 */
function generateAuditId(): string {
  return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an audit log entry
 */
export function createAuditLog(params: {
  operation: AuditOperation;
  entityType: string;
  entityId: string;
  userId?: string;
  ipAddress?: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  metadata?: Record<string, any>;
  description: string;
}): AuditLogEntry | null {
  if (!SERVER_CONFIG.audit.enabled) {
    return null;
  }

  const entry: AuditLogEntry = {
    id: generateAuditId(),
    timestamp: new Date(),
    operation: params.operation,
    entityType: params.entityType,
    entityId: params.entityId,
    userId: params.userId,
    ipAddress: params.ipAddress,
    previousState: params.previousState,
    newState: params.newState,
    metadata: params.metadata,
    description: params.description,
  };

  // Add to in-memory storage
  auditLogs.push(entry);

  // Trim logs if exceeding max size
  if (auditLogs.length > MAX_LOG_SIZE) {
    auditLogs.splice(0, auditLogs.length - MAX_LOG_SIZE);
  }

  // Log to console in development
  if (SERVER_CONFIG.server.env === 'development') {
    console.log(`📝 AUDIT: ${entry.operation} | ${entry.entityType}:${entry.entityId} | ${entry.description}`);
  }

  return entry;
}

/**
 * Audit helper for payment operations
 */
export const auditPayment = {
  created: (paymentId: string, amount: number, supplierId: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'PAYMENT_CREATED',
      entityType: 'payment',
      entityId: paymentId,
      ipAddress,
      newState: { amount, supplierId },
      description: `Payment of ₹${amount.toLocaleString()} created for supplier ${supplierId}`,
    });
  },

  reversed: (paymentId: string, amount: number, reason: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'PAYMENT_REVERSED',
      entityType: 'payment',
      entityId: paymentId,
      ipAddress,
      metadata: { reason },
      description: `Payment of ₹${amount.toLocaleString()} reversed. Reason: ${reason}`,
    });
  },
};

/**
 * Audit helper for receipt operations
 */
export const auditReceipt = {
  created: (receiptId: string, amount: number, customerId: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'RECEIPT_CREATED',
      entityType: 'receipt',
      entityId: receiptId,
      ipAddress,
      newState: { amount, customerId },
      description: `Receipt of ₹${amount.toLocaleString()} created from customer ${customerId}`,
    });
  },

  reversed: (receiptId: string, amount: number, reason: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'RECEIPT_REVERSED',
      entityType: 'receipt',
      entityId: receiptId,
      ipAddress,
      metadata: { reason },
      description: `Receipt of ₹${amount.toLocaleString()} reversed. Reason: ${reason}`,
    });
  },
};

/**
 * Audit helper for invoice operations
 */
export const auditInvoice = {
  created: (invoiceId: string, invoiceCode: string, grandTotal: number, customerId: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'INVOICE_CREATED',
      entityType: 'invoice',
      entityId: invoiceId,
      ipAddress,
      newState: { invoiceCode, grandTotal, customerId },
      description: `Invoice ${invoiceCode} created for ₹${grandTotal.toLocaleString()}`,
    });
  },

  cancelled: (invoiceId: string, invoiceCode: string, reason: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'INVOICE_CANCELLED',
      entityType: 'invoice',
      entityId: invoiceId,
      ipAddress,
      metadata: { reason },
      description: `Invoice ${invoiceCode} cancelled. Reason: ${reason}`,
    });
  },
};

/**
 * Audit helper for purchase bill operations
 */
export const auditBill = {
  created: (billId: string, billCode: string, grandTotal: number, supplierId: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'BILL_CREATED',
      entityType: 'purchaseBill',
      entityId: billId,
      ipAddress,
      newState: { billCode, grandTotal, supplierId },
      description: `Purchase bill ${billCode} created for ₹${grandTotal.toLocaleString()}`,
    });
  },

  cancelled: (billId: string, billCode: string, reason: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'BILL_CANCELLED',
      entityType: 'purchaseBill',
      entityId: billId,
      ipAddress,
      metadata: { reason },
      description: `Purchase bill ${billCode} cancelled. Reason: ${reason}`,
    });
  },
};

/**
 * Audit helper for production batch operations
 */
export const auditBatch = {
  completed: (
    batchId: string,
    batchCode: string,
    inputQty: number,
    outputQty: number,
    lossPercent: number,
    ipAddress?: string
  ) => {
    return createAuditLog({
      operation: 'BATCH_COMPLETED',
      entityType: 'productionBatch',
      entityId: batchId,
      ipAddress,
      newState: { inputQty, outputQty, lossPercent },
      description: `Batch ${batchCode} completed. Input: ${inputQty}kg, Output: ${outputQty}kg, Loss: ${lossPercent.toFixed(2)}%`,
    });
  },
};

/**
 * Audit helper for stock adjustments
 */
export const auditStock = {
  adjusted: (
    itemType: 'rawMaterial' | 'finishedProduct',
    itemId: string,
    itemName: string,
    previousQty: number,
    newQty: number,
    reason: string,
    ipAddress?: string
  ) => {
    return createAuditLog({
      operation: 'STOCK_ADJUSTED',
      entityType: itemType,
      entityId: itemId,
      ipAddress,
      previousState: { quantity: previousQty },
      newState: { quantity: newQty },
      metadata: { reason, itemName },
      description: `Stock adjusted for ${itemName}: ${previousQty} → ${newQty}. Reason: ${reason}`,
    });
  },
};

/**
 * Audit helper for expense operations
 */
export const auditExpense = {
  created: (expenseId: string, amount: number, expenseHead: string, ipAddress?: string) => {
    return createAuditLog({
      operation: 'EXPENSE_CREATED',
      entityType: 'expense',
      entityId: expenseId,
      ipAddress,
      newState: { amount, expenseHead },
      description: `Expense of ₹${amount.toLocaleString()} recorded under ${expenseHead}`,
    });
  },
};

/**
 * Query audit logs
 */
export function queryAuditLogs(params: {
  operation?: AuditOperation;
  entityType?: string;
  entityId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}): AuditLogEntry[] {
  let filtered = [...auditLogs];

  if (params.operation) {
    filtered = filtered.filter(log => log.operation === params.operation);
  }

  if (params.entityType) {
    filtered = filtered.filter(log => log.entityType === params.entityType);
  }

  if (params.entityId) {
    filtered = filtered.filter(log => log.entityId === params.entityId);
  }

  if (params.fromDate) {
    filtered = filtered.filter(log => log.timestamp >= params.fromDate!);
  }

  if (params.toDate) {
    filtered = filtered.filter(log => log.timestamp <= params.toDate!);
  }

  // Sort by timestamp descending (newest first)
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply limit
  if (params.limit) {
    filtered = filtered.slice(0, params.limit);
  }

  return filtered;
}

/**
 * Get recent audit logs
 */
export function getRecentAuditLogs(limit: number = 100): AuditLogEntry[] {
  return queryAuditLogs({ limit });
}

/**
 * Get audit logs for a specific entity
 */
export function getEntityAuditLogs(entityType: string, entityId: string): AuditLogEntry[] {
  return queryAuditLogs({ entityType, entityId });
}

/**
 * Clear all audit logs (use with caution, mainly for testing)
 */
export function clearAuditLogs(): void {
  auditLogs.length = 0;
}

/**
 * Get audit log statistics
 */
export function getAuditStats(): Record<AuditOperation, number> {
  const stats = {} as Record<AuditOperation, number>;

  for (const log of auditLogs) {
    stats[log.operation] = (stats[log.operation] || 0) + 1;
  }

  return stats;
}

export default {
  createAuditLog,
  auditPayment,
  auditReceipt,
  auditInvoice,
  auditBill,
  auditBatch,
  auditStock,
  auditExpense,
  queryAuditLogs,
  getRecentAuditLogs,
  getEntityAuditLogs,
  clearAuditLogs,
  getAuditStats,
};
