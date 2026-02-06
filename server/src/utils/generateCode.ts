import { db } from '../db/index';
import { sql } from 'drizzle-orm';

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
    'sales-invoice': 'INV',
    'expense': 'EXP',
};

export async function generateCode(type: string, tableName: string): Promise<string> {
    const prefix = prefixes[type] || 'ID';

    // Get count from database
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}`);
    const count = Number((result as any)[0]?.count || 0) + 1;

    return `${prefix}-${String(count).padStart(3, '0')}`;
}

// Simple version without database query for initial setup
export function generateCodeSync(type: string, count: number): string {
    const prefix = prefixes[type] || 'ID';
    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}
