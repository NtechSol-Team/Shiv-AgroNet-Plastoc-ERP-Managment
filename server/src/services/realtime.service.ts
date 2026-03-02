/**
 * Real-time SSE (Server-Sent Events) Service
 *
 * Maintains a registry of connected browser clients and broadcasts
 * typed events when data mutations occur across the ERP.
 *
 * Events are emitted by route handlers after successful mutations so
 * every connected tab receives an instant update signal.
 */

import { Response } from 'express';

// ============================================================
// EVENT TYPES
// ============================================================

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
    /** Optional payload — entity name for masters_updated, etc. */
    entity?: string;
    timestamp: string;
}

// ============================================================
// SSE CLIENT REGISTRY
// ============================================================

class RealtimeService {
    private clients: Set<Response> = new Set();

    /**
     * Register an SSE client (Express Response object).
     * Sets the correct SSE headers and sends a welcome event.
     */
    subscribe(res: Response): void {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable NGINX buffering
        res.flushHeaders();

        this.clients.add(res);
        console.log(`📡 SSE client connected. Total clients: ${this.clients.size}`);

        // Send initial connection confirmation
        this.sendToClient(res, { type: 'ping', timestamp: new Date().toISOString() });

        // Setup keepalive ping every 30 seconds
        const keepalive = setInterval(() => {
            if (!res.writableEnded) {
                this.sendToClient(res, { type: 'ping', timestamp: new Date().toISOString() });
            } else {
                clearInterval(keepalive);
            }
        }, 30_000);

        // Clean up on client disconnect
        res.on('close', () => {
            clearInterval(keepalive);
            this.unsubscribe(res);
        });

        res.on('error', () => {
            clearInterval(keepalive);
            this.unsubscribe(res);
        });
    }

    /**
     * Remove a client from the registry.
     */
    unsubscribe(res: Response): void {
        this.clients.delete(res);
        console.log(`📡 SSE client disconnected. Total clients: ${this.clients.size}`);
    }

    /**
     * Broadcast an event to all connected clients.
     */
    emit(type: RealtimeEventType, entity?: string): void {
        if (this.clients.size === 0) return;

        const event: RealtimeEvent = {
            type,
            entity,
            timestamp: new Date().toISOString(),
        };

        let disconnected = 0;
        for (const client of this.clients) {
            if (client.writableEnded) {
                this.clients.delete(client);
                disconnected++;
            } else {
                this.sendToClient(client, event);
            }
        }

        if (disconnected > 0) {
            console.log(`📡 Cleaned up ${disconnected} stale SSE clients.`);
        }

        console.log(`📡 SSE broadcast: ${type}${entity ? ` (${entity})` : ''} → ${this.clients.size} clients`);
    }

    /**
     * Get count of connected clients.
     */
    get clientCount(): number {
        return this.clients.size;
    }

    // --------------------------------------------------------
    // Private helpers
    // --------------------------------------------------------

    private sendToClient(res: Response, event: RealtimeEvent): void {
        try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            // Client may have disconnected between the check and write
            this.clients.delete(res);
        }
    }
}

// Singleton instance shared across all route handlers
export const realtimeService = new RealtimeService();
