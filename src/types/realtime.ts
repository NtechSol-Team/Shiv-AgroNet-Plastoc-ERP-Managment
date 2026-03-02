/**
 * Shared TypeScript types for the real-time SSE system.
 * Used by both the hook and the context.
 */

export type RealtimeEventType =
    | 'sales_updated'
    | 'purchase_updated'
    | 'inventory_updated'
    | 'accounts_updated'
    | 'dashboard_updated'
    | 'production_updated'
    | 'masters_updated'
    | 'finance_updated'
    | 'ping';

export interface RealtimeEvent {
    type: RealtimeEventType;
    /** Optional — entity name for masters_updated events (e.g. 'customers', 'suppliers') */
    entity?: string;
    timestamp: string;
}
