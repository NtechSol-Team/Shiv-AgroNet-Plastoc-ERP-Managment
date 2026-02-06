import { SERVER_CONFIG, isLossExceeded as configIsLossExceeded } from '../config/app.config';

/**
 * Calculate production loss percentage
 * @param input - Input quantity in kg
 * @param output - Output quantity in kg  
 * @returns Loss percentage rounded to 2 decimal places
 */
export function calculateLossPercentage(input: number, output: number): number {
    if (input <= 0) return 0;
    const loss = ((input - output) / input) * 100;
    return Math.round(loss * 100) / 100;
}

/**
 * Check if production loss exceeds the configured threshold
 * @param lossPercentage - Calculated loss percentage
 * @returns true if loss exceeds threshold (configured in SERVER_CONFIG.production.lossThresholdPercent)
 */
export function isLossExceeded(lossPercentage: number): boolean {
    return configIsLossExceeded(lossPercentage);
}

/**
 * Get the loss threshold percentage from config
 */
export function getLossThreshold(): number {
    return SERVER_CONFIG.production.lossThresholdPercent;
}

/**
 * Calculate GST components based on place of supply
 * @param taxableAmount - Amount before tax
 * @param taxPercent - GST percentage (e.g., 18)
 * @param isInterState - true if interstate supply
 */
export function calculateGST(
    taxableAmount: number,
    taxPercent: number,
    isInterState: boolean
): { cgst: number; sgst: number; igst: number; total: number } {
    const taxAmount = (taxableAmount * taxPercent) / 100;

    if (isInterState) {
        return {
            cgst: 0,
            sgst: 0,
            igst: Math.round(taxAmount * 100) / 100,
            total: Math.round((taxableAmount + taxAmount) * 100) / 100,
        };
    }

    const halfTax = Math.round((taxAmount / 2) * 100) / 100;
    return {
        cgst: halfTax,
        sgst: halfTax,
        igst: 0,
        total: Math.round((taxableAmount + taxAmount) * 100) / 100,
    };
}

/**
 * Calculate invoice item amount
 */
export function calculateItemAmount(
    quantity: number,
    rate: number,
    discountPercent: number,
    taxPercent: number
): { subtotal: number; discountAmount: number; taxableAmount: number; taxAmount: number; amount: number } {
    const subtotal = quantity * rate;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * taxPercent) / 100;
    const amount = taxableAmount + taxAmount;

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        amount: Math.round(amount * 100) / 100,
    };
}
