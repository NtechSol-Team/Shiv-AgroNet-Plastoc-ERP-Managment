/**
 * Server Application Configuration
 * 
 * Centralized configuration for all business rules and constants.
 * This eliminates hardcoded values throughout the backend codebase.
 */

export const SERVER_CONFIG = {
  /**
   * Server Configuration
   */
  server: {
    /** Default port */
    port: parseInt(process.env.PORT || '3001', 10),
    /** Environment */
    env: process.env.NODE_ENV || 'development',
    /** API prefix */
    apiPrefix: '/api',
  },

  /**
   * Company Information
   */
  company: {
    name: 'Manufacturing ERP',
    /** Company state code for GST calculations (Maharashtra = 27) */
    stateCode: '27',
    /** Default currency */
    currency: 'INR',
  },

  /**
   * Production Configuration
   */
  production: {
    /** Loss percentage threshold - batches exceeding this are flagged */
    lossThresholdPercent: 5,
    /** Maximum allowed loss percentage before blocking completion */
    maxAllowedLossPercent: 15,
    /** Default batch status on creation */
    defaultBatchStatus: 'in-progress' as const,
    /** Batch status options */
    batchStatuses: ['in-progress', 'completed', 'cancelled'] as const,
  },

  /**
   * Inventory Configuration
   */
  inventory: {
    /** Low stock warning threshold multiplier */
    lowStockMultiplier: 1.5,
    /** Critical stock threshold (percentage of reorder level) */
    criticalStockPercent: 50,
    /** Stock movement types */
    movementTypes: ['RAW_IN', 'RAW_OUT', 'FG_IN', 'FG_OUT', 'ADJUSTMENT'] as const,
    /** Item types */
    itemTypes: ['RAW_MATERIAL', 'FINISHED_PRODUCT'] as const,
  },

  /**
   * GST Configuration (Indian Tax System)
   */
  gst: {
    /** Available GST rates */
    rates: [0, 5, 12, 18, 28] as const,
    /** Default GST rate for new items */
    defaultRate: 18,
    /** Default HSN code for plastics */
    defaultHsnCode: '3901',
    /** State codes considered local (same state as company) */
    localStateCodes: ['27'], // Maharashtra
  },

  /**
   * Pagination Configuration
   */
  pagination: {
    /** Default number of items per page */
    defaultPageSize: 20,
    /** Maximum page size allowed */
    maxPageSize: 100,
    /** Minimum page size allowed */
    minPageSize: 1,
  },

  /**
   * Payment Configuration
   */
  payment: {
    /** Available payment modes */
    modes: ['Bank', 'Cash', 'Cheque', 'UPI'] as const,
    /** Default payment mode */
    defaultMode: 'Bank' as const,
    /** Payment status options */
    statuses: ['Pending', 'Partial', 'Paid'] as const,
    /** Transaction types */
    transactionTypes: ['RECEIPT', 'PAYMENT'] as const,
  },

  /**
   * Invoice Configuration
   */
  invoice: {
    /** Invoice types */
    types: ['B2B', 'B2C'] as const,
    /** Default invoice type */
    defaultType: 'B2B' as const,
    /** Invoice/Bill status options */
    statuses: ['Draft', 'Confirmed', 'Cancelled'] as const,
    /** Default status for new invoices */
    defaultStatus: 'Confirmed' as const,
  },

  /**
   * Ledger Configuration
   */
  ledger: {
    /** Voucher types */
    voucherTypes: ['INVOICE', 'RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA'] as const,
    /** Ledger types */
    ledgerTypes: ['CUSTOMER', 'SUPPLIER', 'BANK', 'CASH', 'INCOME', 'EXPENSE', 'TAX'] as const,
  },

  /**
   * Finance Configuration
   */
  finance: {
    /** Transaction types */
    transactionTypes: [
      'Loan Taken',
      'Loan Given',
      'Investment Received',
      'Investment Made',
      'Borrowing',
      'Repayment',
    ] as const,
    /** Entity types */
    entityTypes: ['Lender', 'Borrower', 'Investor'] as const,
  },

  /**
   * Cache Configuration
   */
  cache: {
    /** Default TTL in seconds */
    defaultTtl: 300, // 5 minutes
    /** KPI cache TTL */
    kpiTtl: 300,
    /** Master data cache TTL */
    masterDataTtl: 600, // 10 minutes
  },

  /**
   * Rate Limiting Configuration
   */
  rateLimit: {
    /** Window size in milliseconds */
    windowMs: 15 * 60 * 1000, // 15 minutes
    /** Maximum requests per window */
    maxRequests: 1000,
    /** Maximum requests for auth endpoints */
    authMaxRequests: 50,
    /** Skip rate limiting in development */
    skipInDev: true,
  },

  /**
   * Security Configuration
   */
  security: {
    /** Enable helmet middleware */
    enableHelmet: true,
    /** Enable XSS protection */
    enableXssProtection: true,
    /** Allowed origins for CORS */
    corsOrigins: ['http://localhost:5173', 'http://localhost:3000'],
  },

  /**
   * Audit Log Configuration
   */
  audit: {
    /** Enable audit logging */
    enabled: true,
    /** Operations to audit */
    auditedOperations: [
      'PAYMENT_CREATED',
      'PAYMENT_REVERSED',
      'RECEIPT_CREATED',
      'RECEIPT_REVERSED',
      'INVOICE_CREATED',
      'INVOICE_CANCELLED',
      'BILL_CREATED',
      'BILL_CANCELLED',
      'BATCH_COMPLETED',
      'STOCK_ADJUSTED',
      'EXPENSE_CREATED',
    ] as const,
    /** Log level */
    logLevel: 'info' as const,
  },

  /**
   * Code Prefixes for Auto-generation
   */
  codePrefixes: {
    rawMaterial: 'RM',
    finishedProduct: 'FP',
    machine: 'MC',
    customer: 'CUST',
    supplier: 'SUPP',
    employee: 'EMP',
    purchaseBill: 'PB',
    salesInvoice: 'INV',
    payment: 'PAY',
    receipt: 'REC',
    productionBatch: 'BATCH',
    expense: 'EXP',
    bellBatch: 'BELL',
  },
} as const;

/**
 * Type exports for type safety
 */
export type GstRate = (typeof SERVER_CONFIG.gst.rates)[number];
export type PaymentMode = (typeof SERVER_CONFIG.payment.modes)[number];
export type PaymentStatus = (typeof SERVER_CONFIG.payment.statuses)[number];
export type PaymentTransactionType = (typeof SERVER_CONFIG.payment.transactionTypes)[number];
export type InvoiceType = (typeof SERVER_CONFIG.invoice.types)[number];
export type InvoiceStatus = (typeof SERVER_CONFIG.invoice.statuses)[number];
export type BatchStatus = (typeof SERVER_CONFIG.production.batchStatuses)[number];
export type MovementType = (typeof SERVER_CONFIG.inventory.movementTypes)[number];
export type ItemType = (typeof SERVER_CONFIG.inventory.itemTypes)[number];
export type VoucherType = (typeof SERVER_CONFIG.ledger.voucherTypes)[number];
export type LedgerType = (typeof SERVER_CONFIG.ledger.ledgerTypes)[number];
export type FinanceTransactionType = (typeof SERVER_CONFIG.finance.transactionTypes)[number];
export type FinanceEntityType = (typeof SERVER_CONFIG.finance.entityTypes)[number];
export type AuditOperation = (typeof SERVER_CONFIG.audit.auditedOperations)[number];
export type CodePrefix = keyof typeof SERVER_CONFIG.codePrefixes;

/**
 * Helper functions
 */

/**
 * Check if a state code is local (same state as company)
 */
export function isLocalState(stateCode: string): boolean {
  return (SERVER_CONFIG.gst.localStateCodes as readonly string[]).includes(stateCode);
}

/**
 * Check if loss percentage exceeds threshold
 */
export function isLossExceeded(lossPercent: number): boolean {
  return lossPercent > SERVER_CONFIG.production.lossThresholdPercent;
}

/**
 * Check if stock is low
 */
export function isLowStock(currentStock: number, reorderLevel: number): boolean {
  return currentStock < reorderLevel * SERVER_CONFIG.inventory.lowStockMultiplier;
}

/**
 * Check if stock is critical
 */
export function isCriticalStock(currentStock: number, reorderLevel: number): boolean {
  return currentStock < (reorderLevel * SERVER_CONFIG.inventory.criticalStockPercent) / 100;
}

/**
 * Get pagination params with defaults and bounds
 */
export function getPaginationParams(page?: number, limit?: number): { page: number; limit: number; offset: number } {
  const { defaultPageSize, maxPageSize, minPageSize } = SERVER_CONFIG.pagination;

  const validPage = Math.max(1, page || 1);
  const validLimit = Math.min(maxPageSize, Math.max(minPageSize, limit || defaultPageSize));
  const offset = (validPage - 1) * validLimit;

  return { page: validPage, limit: validLimit, offset };
}

/**
 * Get code prefix for entity type
 */
export function getCodePrefix(type: CodePrefix): string {
  return SERVER_CONFIG.codePrefixes[type];
}

export default SERVER_CONFIG;
