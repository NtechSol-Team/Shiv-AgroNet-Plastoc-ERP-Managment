import { db } from '../db/index';
import { sql, desc, like } from 'drizzle-orm';
import * as schema from '../db/schema';

const prefixes: Record<string, string> = {
    'raw-material': 'RM',
    'finished-product': 'FP',
    'machine': 'M',
    'customer': 'C',
    'supplier': 'S',
    'expense-head': 'E',
    'account': 'A',
    'employee': 'EMP',
    'purchase-bill': 'PB',
    'production-batch': 'PA',
    'expense': 'EXP',
    'receipt': 'REC',
    'payment': 'PAY',
    'bell-item': 'BEL',
};

/**
 * Generates the next sequential code for a given type/table.
 * Uses MAX() instead of COUNT() to handle deletions and gaps correctly.
 */
export async function generateCode(type: string, tableName: string, options?: { prefix?: string, padLength?: number }): Promise<string> {
    const prefix = options?.prefix || prefixes[type] || 'ID';
    const padLength = options?.padLength || 3;

    // For many tables, we already have specific logic in routes, 
    // but this utility can be improved to be the single source of truth.

    // We'll use a raw SQL query to find the maximum existing code for flexibility
    const query = sql`SELECT code FROM ${sql.identifier(tableName)} 
                     WHERE code LIKE ${prefix + '-%'} 
                     ORDER BY code DESC LIMIT 1`;

    const result = await db.execute(query);
    const lastCode = (result as any)[0]?.code;

    let lastNum = 0;
    if (lastCode) {
        const parts = lastCode.split('-');
        lastNum = parseInt(parts[parts.length - 1] || '0');
    }

    return `${prefix}-${String(lastNum + 1).padStart(padLength, '0')}`;
}

/**
 * Specifically for transactions that share a table (REC vs PAY)
 */
export async function getNextTransactionCode(type: 'RECEIPT' | 'PAYMENT'): Promise<string> {
    const prefix = type === 'RECEIPT' ? 'REC' : 'PAY';
    const lastItem = await db.query.paymentTransactions.findFirst({
        where: (table, { like }) => like(table.code, `${prefix}-%`),
        orderBy: (table, { desc }) => [desc(table.code)]
    });

    const lastCode = lastItem?.code || `${prefix}-0000`;
    const lastNum = parseInt(lastCode.split('-')[1] || '0');
    return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

export async function getNextExpenseCode(): Promise<string> {
    const lastItem = await db.query.expenses.findFirst({
        orderBy: (table, { desc }) => [desc(table.code)]
    });

    const lastCode = lastItem?.code || 'EXP-0000';
    const lastNum = parseInt(lastCode.split('-')[1] || '0');
    return `EXP-${String(lastNum + 1).padStart(4, '0')}`;
}

export async function getNextProductionBatchCode(): Promise<string> {
    // Note: Found discrepancy in production.ts using PB-, but prefixes says PA-
    // We'll prioritize the current logic in production.ts but fix the sequencing
    const lastItem = await db.query.productionBatches.findFirst({
        orderBy: (table, { desc }) => [desc(table.code)]
    });

    const lastCode = lastItem?.code || 'PB-000';
    const lastNum = parseInt(lastCode.split('-')[1] || '0');
    return `PB-${String(lastNum + 1).padStart(3, '0')}`;
}
