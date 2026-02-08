/**
 * MasterDataContext
 * 
 * Global state provider for master data.
 * Loads all masters once at app initialization and provides them to all components.
 * Eliminates redundant API calls across navigation.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { mastersApi, accountsApi } from '../lib/api';

// Type definitions for master data
export interface Customer {
    id: string;
    code: string;
    name: string;
    gstNo?: string;
    stateCode?: string;
    email?: string;
    phone?: string;
    address?: string;
    outstanding?: string;
}

export interface Supplier {
    id: string;
    code: string;
    name: string;
    gstNo?: string;
    stateCode?: string;
    contact?: string;
    address?: string;
    outstanding?: string;
}

export interface Account {
    id: string;
    name: string;
    type: string;
    balance?: string;
}

export interface RawMaterial {
    id: string;
    code: string;
    name: string;
    size?: string;
    color?: string;
    unit: string;
    stock?: string;
    reorderLevel?: string;
}

export interface FinishedProduct {
    id: string;
    code: string;
    name: string;
    length?: string;
    width?: string;
    gsm?: string;
    unit: string;
    stock?: string;
}

export interface ExpenseHead {
    id: string;
    name: string;
    code: string;
}

export interface Machine {
    id: string;
    code: string;
    name: string;
    type?: string;
    capacity?: string;
    status?: string;
}

interface MasterData {
    customers: Customer[];
    suppliers: Supplier[];
    accounts: Account[];
    rawMaterials: RawMaterial[];
    finishedProducts: FinishedProduct[];
    expenseHeads: ExpenseHead[];
    machines: Machine[];
}

interface MasterDataContextType extends MasterData {
    isLoading: boolean;
    error: string | null;
    refreshMasters: () => Promise<void>;
    refreshCustomers: () => Promise<void>;
    refreshSuppliers: () => Promise<void>;
    refreshAccounts: () => Promise<void>;
    refreshRawMaterials: () => Promise<void>;
    refreshFinishedProducts: () => Promise<void>;
    lastUpdated: Date | null;
}

const defaultState: MasterData = {
    customers: [],
    suppliers: [],
    accounts: [],
    rawMaterials: [],
    finishedProducts: [],
    expenseHeads: [],
    machines: [],
};

const MasterDataContext = createContext<MasterDataContextType | null>(null);

interface MasterDataProviderProps {
    children: ReactNode;
}

export function MasterDataProvider({ children }: MasterDataProviderProps) {
    const [data, setData] = useState<MasterData>(defaultState);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Load all masters in parallel
    const loadAllMasters = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const [
                customersRes,
                suppliersRes,
                accountsRes,
                rawMaterialsRes,
                finishedProductsRes,
                expenseHeadsRes,
                machinesRes
            ] = await Promise.all([
                mastersApi.getCustomers(),
                mastersApi.getSuppliers(),
                mastersApi.getAccounts(),
                mastersApi.getRawMaterials(),
                mastersApi.getFinishedProducts(),
                mastersApi.getExpenseHeads(),
                mastersApi.getMachines()
            ]);

            setData({
                customers: customersRes.data || [],
                suppliers: suppliersRes.data || [],
                accounts: accountsRes.data || [],
                rawMaterials: rawMaterialsRes.data || [],
                finishedProducts: finishedProductsRes.data || [],
                expenseHeads: expenseHeadsRes.data || [],
                machines: machinesRes.data || []
            });
            setLastUpdated(new Date());
            console.log('✅ Master data loaded globally');
        } catch (err: any) {
            console.error('Failed to load master data:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Individual refresh functions for after mutations
    const refreshCustomers = useCallback(async () => {
        try {
            const res = await mastersApi.getCustomers();
            setData(prev => ({ ...prev, customers: res.data || [] }));
        } catch (err) {
            console.error('Failed to refresh customers:', err);
        }
    }, []);

    const refreshSuppliers = useCallback(async () => {
        try {
            const res = await mastersApi.getSuppliers();
            setData(prev => ({ ...prev, suppliers: res.data || [] }));
        } catch (err) {
            console.error('Failed to refresh suppliers:', err);
        }
    }, []);

    const refreshAccounts = useCallback(async () => {
        try {
            const res = await mastersApi.getAccounts();
            setData(prev => ({ ...prev, accounts: res.data || [] }));
        } catch (err) {
            console.error('Failed to refresh accounts:', err);
        }
    }, []);

    const refreshRawMaterials = useCallback(async () => {
        try {
            const res = await mastersApi.getRawMaterials();
            setData(prev => ({ ...prev, rawMaterials: res.data || [] }));
        } catch (err) {
            console.error('Failed to refresh raw materials:', err);
        }
    }, []);

    const refreshFinishedProducts = useCallback(async () => {
        try {
            const res = await mastersApi.getFinishedProducts();
            setData(prev => ({ ...prev, finishedProducts: res.data || [] }));
        } catch (err) {
            console.error('Failed to refresh finished products:', err);
        }
    }, []);

    // Load on mount
    useEffect(() => {
        loadAllMasters();
    }, [loadAllMasters]);

    const value: MasterDataContextType = {
        ...data,
        isLoading,
        error,
        refreshMasters: loadAllMasters,
        refreshCustomers,
        refreshSuppliers,
        refreshAccounts,
        refreshRawMaterials,
        refreshFinishedProducts,
        lastUpdated
    };

    return (
        <MasterDataContext.Provider value={value}>
            {children}
        </MasterDataContext.Provider>
    );
}

/**
 * Hook to access master data from any component
 */
export function useMasterData() {
    const context = useContext(MasterDataContext);
    if (!context) {
        throw new Error('useMasterData must be used within a MasterDataProvider');
    }
    return context;
}

// Export convenience hooks for specific data types
export function useCustomers() {
    const { customers, isLoading, refreshCustomers } = useMasterData();
    return { customers, isLoading, refresh: refreshCustomers };
}

export function useSuppliers() {
    const { suppliers, isLoading, refreshSuppliers } = useMasterData();
    return { suppliers, isLoading, refresh: refreshSuppliers };
}

export function useAccounts() {
    const { accounts, isLoading, refreshAccounts } = useMasterData();
    return { accounts, isLoading, refresh: refreshAccounts };
}

export function useRawMaterials() {
    const { rawMaterials, isLoading, refreshRawMaterials } = useMasterData();
    return { rawMaterials, isLoading, refresh: refreshRawMaterials };
}

export function useFinishedProducts() {
    const { finishedProducts, isLoading, refreshFinishedProducts } = useMasterData();
    return { finishedProducts, isLoading, refresh: refreshFinishedProducts };
}

export function useExpenseHeads() {
    const { expenseHeads, isLoading } = useMasterData();
    return { expenseHeads, isLoading };
}

export function useMachines() {
    const { machines, isLoading } = useMasterData();
    return { machines, isLoading };
}
