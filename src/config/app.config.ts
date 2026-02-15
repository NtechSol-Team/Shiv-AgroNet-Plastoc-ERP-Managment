/**
 * Application Configuration
 * 
 * Centralized configuration for all business rules and constants.
 * This eliminates hardcoded values throughout the codebase.
 */

export const APP_CONFIG = {
  /**
   * Company Information (Update these with your actual business details)
   */
  company: {
    /** Company/Business name */
    name: 'SHIV AGRONET',
    /** Company tagline/description */
    tagline: 'Manufacturers of Quality HDPE/PP Woven Products',
    /** Legal name (for invoices) */
    legalName: 'SHIV AGRONET',
    /** Company state code for GST calculations (Maharashtra = 27, Gujarat = 24) */
    stateCode: '24',
    /** State name */
    stateName: 'Gujarat',
    /** Company GSTIN (15 digit) */
    gstin: '24AABCS1234A1Z5',
    /** PAN Number */
    pan: 'AABCS1234A',
    /** CIN (if applicable) */
    cin: '',
    /** Udyam Registration Number */
    udyamRegistration: 'UDYAM-GJ-22-0510332',
    /** Address Line 1 */
    address1: '93, V.S. Krishna Industrial Park, Pipodara Road',
    /** Address Line 2 */
    address2: 'Ahmedabad–Mumbai Highway, Palod, Kim',
    /** City */
    city: 'Surat',
    /** District */
    district: 'Surat',
    /** State */
    state: 'Gujarat',
    /** PIN Code */
    pincode: '394110',
    /** Country */
    country: 'India',
    /** Phone Numbers */
    phone: '+91 96248 55526',
    /** Mobile */
    mobile: '+91 96248 55526',
    /** Email */
    email: 'info@shivagronet.com',
    /** Website */
    website: 'www.shivagronet.com',
    /** Default currency */
    currency: 'INR',
    /** Currency locale for formatting */
    currencyLocale: 'en-IN',
    /** Bank Details for Payment */
    bankDetails: {
      bankName: 'Canara Bank',
      branchName: 'Simada Naka, Sarthana, Surat',
      accountHolder: 'SHIV AGRONET',
      accountNumber: '125009110096',
      accountType: 'Current Account',
      ifscCode: 'CNRB0007368',
      /** UPI ID (if available) */
      upiId: '', // Removed as not provided
    },
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
  },

  /**
   * Inventory Configuration
   */
  inventory: {
    /** Low stock warning threshold multiplier (stock < reorderLevel * multiplier) */
    lowStockMultiplier: 1.5,
    /** Critical stock threshold (percentage of reorder level) */
    criticalStockPercent: 50,
    /** Default unit for raw materials */
    defaultRawMaterialUnit: 'kg',
    /** Default unit for finished products */
    defaultFinishedProductUnit: 'kg',
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
    /** State codes that are considered local (same state) */
    localStateCodes: ['24'], // Gujarat
  },

  /**
   * Pagination Configuration
   */
  pagination: {
    /** Default number of items per page */
    defaultPageSize: 20,
    /** Available page size options */
    pageSizeOptions: [10, 20, 50, 100] as const,
    /** Maximum page size allowed */
    maxPageSize: 100,
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
  },

  /**
   * Invoice Configuration
   */
  invoice: {
    /** Invoice types */
    types: ['B2B', 'B2C'] as const,
    /** Default invoice type */
    defaultType: 'B2B' as const,
    /** Invoice status options */
    statuses: ['Draft', 'Confirmed', 'Cancelled'] as const,
    /** Default status for new invoices */
    defaultStatus: 'Confirmed' as const,
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
   * Dashboard Configuration
   */
  dashboard: {
    /** Number of recent activities to show */
    recentActivityCount: 10,
    /** Cache TTL for KPIs in seconds */
    kpiCacheTtl: 300,
    /** Alert types */
    alertTypes: ['low_stock', 'loss_exceeded', 'overdue_payment'] as const,
  },

  /**
   * Date/Time Configuration
   */
  dateTime: {
    /** Default date format for display */
    displayFormat: 'DD/MM/YYYY',
    /** Date format for API */
    apiFormat: 'YYYY-MM-DD',
    /** Timezone */
    timezone: 'Asia/Kolkata',
  },

  /**
   * UI Configuration
   */
  ui: {
    /** Toast/notification duration in ms */
    toastDuration: 3000,
    /** Debounce delay for search inputs in ms */
    searchDebounceMs: 300,
    /** Auto-save delay in ms */
    autoSaveDelayMs: 1000,
  },
} as const;

/**
 * Type exports for type safety
 */
export type GstRate = typeof APP_CONFIG.gst.rates[number];
export type PaymentMode = typeof APP_CONFIG.payment.modes[number];
export type PaymentStatus = typeof APP_CONFIG.payment.statuses[number];
export type InvoiceType = typeof APP_CONFIG.invoice.types[number];
export type InvoiceStatus = typeof APP_CONFIG.invoice.statuses[number];
export type FinanceTransactionType = typeof APP_CONFIG.finance.transactionTypes[number];
export type FinanceEntityType = typeof APP_CONFIG.finance.entityTypes[number];
export type AlertType = typeof APP_CONFIG.dashboard.alertTypes[number];

/**
 * Helper functions
 */

/**
 * Check if a state code is local (same state as company)
 */
export function isLocalState(stateCode: string): boolean {
  return (APP_CONFIG.gst.localStateCodes as readonly string[]).includes(stateCode);
}

/**
 * Check if loss percentage exceeds threshold
 */
export function isLossExceeded(lossPercent: number): boolean {
  return lossPercent > APP_CONFIG.production.lossThresholdPercent;
}

/**
 * Check if stock is low
 */
export function isLowStock(currentStock: number, reorderLevel: number): boolean {
  return currentStock < reorderLevel * APP_CONFIG.inventory.lowStockMultiplier;
}

/**
 * Check if stock is critical
 */
export function isCriticalStock(currentStock: number, reorderLevel: number): boolean {
  return currentStock < (reorderLevel * APP_CONFIG.inventory.criticalStockPercent) / 100;
}

/**
 * Format currency in Indian format
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_CONFIG.company.currencyLocale, {
    style: 'currency',
    currency: APP_CONFIG.company.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number in Indian format
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat(APP_CONFIG.company.currencyLocale).format(num);
}

export default APP_CONFIG;
