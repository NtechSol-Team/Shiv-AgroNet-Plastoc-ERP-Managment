/**
 * RealtimeContext
 *
 * Provides a single SSE connection for the entire app so that multiple
 * components don't each open their own EventSource.
 *
 * Usage:
 *   // In a component
 *   const { lastEvent } = useRealtimeContext();
 *   useRealtimeEvent(lastEvent, 'sales_updated', () => fetchInvoices());
 */

import React, { createContext, useContext } from 'react';
import { useRealtime } from '../hooks/useRealtime';
import type { RealtimeEvent } from '../types/realtime';

interface RealtimeContextValue {
    lastEvent: RealtimeEvent | null;
    isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({
    lastEvent: null,
    isConnected: false,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    const realtime = useRealtime();

    return (
        <RealtimeContext.Provider value={realtime}>
            {children}
        </RealtimeContext.Provider>
    );
}

export function useRealtimeContext(): RealtimeContextValue {
    return useContext(RealtimeContext);
}
