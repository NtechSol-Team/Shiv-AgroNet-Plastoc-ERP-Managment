/**
 * useRealtime — SSE event hook
 *
 * Opens a single EventSource connection to /api/events and makes
 * the latest received event available via `lastEvent`.
 *
 * Features:
 * - Automatic reconnect with exponential back-off on error
 * - Cleans up connection on unmount
 * - Uses the VITE_API_URL env var (same as the rest of the app)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeEvent, RealtimeEventType } from '../types/realtime';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SSE_URL = `${API_BASE}/api/events`;

// Exponential back-off config
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export interface UseRealtimeReturn {
    lastEvent: RealtimeEvent | null;
    isConnected: boolean;
}

export function useRealtime(): UseRealtimeReturn {
    const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const retryDelay = useRef(INITIAL_RETRY_MS);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unmounted = useRef(false);

    const connect = useCallback(() => {
        if (unmounted.current) return;

        const es = new EventSource(SSE_URL);
        esRef.current = es;

        es.onopen = () => {
            setIsConnected(true);
            retryDelay.current = INITIAL_RETRY_MS; // Reset back-off on successful connect
        };

        es.onmessage = (e: MessageEvent) => {
            try {
                const event = JSON.parse(e.data) as RealtimeEvent;
                if (event.type !== 'ping') {
                    setLastEvent(event);
                }
            } catch {
                // Malformed payload — ignore
            }
        };

        es.onerror = () => {
            setIsConnected(false);
            es.close();
            esRef.current = null;

            if (!unmounted.current) {
                // Exponential back-off — cap at MAX_RETRY_MS
                const delay = Math.min(retryDelay.current, MAX_RETRY_MS);
                retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS);
                retryTimer.current = setTimeout(connect, delay);
            }
        };
    }, []);

    useEffect(() => {
        unmounted.current = false;
        connect();

        return () => {
            unmounted.current = true;
            if (retryTimer.current) clearTimeout(retryTimer.current);
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
        };
    }, [connect]);

    return { lastEvent, isConnected };
}

/**
 * Helper — subscribe to a specific event type.
 * Calls `callback` whenever an event of the given type is received.
 */
export function useRealtimeEvent(
    lastEvent: RealtimeEvent | null,
    type: RealtimeEventType | RealtimeEventType[],
    callback: (event: RealtimeEvent) => void
) {
    const types = Array.isArray(type) ? type : [type];
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!lastEvent) return;
        if (types.includes(lastEvent.type)) {
            callbackRef.current(lastEvent);
        }
    }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps
}
