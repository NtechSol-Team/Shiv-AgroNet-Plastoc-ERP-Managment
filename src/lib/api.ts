// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Request deduplication cache - prevents duplicate in-flight requests
const pendingRequests = new Map<string, Promise<any>>();
const DEDUP_TTL_MS = 100; // Dedupe same requests within 100ms

// Generic API response types
interface ApiResponse<T> {
    success: true;
    data: T;
    warning?: string;
}

interface ApiError {
    success: false;
    error: {
        code: string;
        message: string;
    };
}

// Helper function for API calls with deduplication
async function fetchApi<T>(
    endpoint: string,
    options?: RequestInit
): Promise<{ data: T | null; error: string | null; warning?: string }> {
    const method = options?.method || 'GET';

    // Only deduplicate GET requests
    const requestKey = method === 'GET' ? `${method}:${endpoint}` : null;

    // Check for pending identical request
    if (requestKey && pendingRequests.has(requestKey)) {
        console.log(`🔄 Dedup: Reusing pending request for ${endpoint}`);
        return pendingRequests.get(requestKey);
    }

    const executeRequest = async () => {
        console.log(`🌐 API: ${method} ${endpoint}`);

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    ...options?.headers,
                },
                ...options,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                console.log(`❌ API Error: ${endpoint}`, result.error?.message);
                return { data: null, error: result.error?.message || 'An error occurred' };
            }

            console.log(`✓ API: ${endpoint} (${Array.isArray(result.data) ? result.data.length + ' items' : 'ok'})`);
            return { data: result.data, error: null, warning: result.warning };
        } catch (error) {
            console.log('❌ Network Error:', error);
            return { data: null, error: 'Network error. Please check your connection.' };
        }
    };

    // Create promise and store it for deduplication
    const promise = executeRequest();

    if (requestKey) {
        pendingRequests.set(requestKey, promise);
        // Clean up after TTL
        promise.finally(() => {
            setTimeout(() => pendingRequests.delete(requestKey), DEDUP_TTL_MS);
        });
    }

    return promise;
}

// ==================== GST API ====================
export const gstApi = {
    search: (gstin: string) => fetchApi<any>(`/gst/search?gstin=${gstin}`),
};

// ==================== MASTERS API ====================
export const mastersApi = {
    // Raw Materials
    getRawMaterials: () => fetchApi<any[]>('/masters/raw-materials'),
    createRawMaterial: (data: any) =>
        fetchApi<any>('/masters/raw-materials', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateRawMaterial: (id: string, data: any) =>
        fetchApi<any>(`/masters/raw-materials/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteRawMaterial: (id: string) =>
        fetchApi<any>(`/masters/raw-materials/${id}`, { method: 'DELETE' }),

    // Finished Products
    getFinishedProducts: () => fetchApi<any[]>('/masters/finished-products'),
    createFinishedProduct: (data: any) =>
        fetchApi<any>('/masters/finished-products', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateFinishedProduct: (id: string, data: any) =>
        fetchApi<any>(`/masters/finished-products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteFinishedProduct: (id: string) =>
        fetchApi<any>(`/masters/finished-products/${id}`, { method: 'DELETE' }),

    // Machines
    getMachines: () => fetchApi<any[]>('/masters/machines'),
    createMachine: (data: any) =>
        fetchApi<any>('/masters/machines', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateMachine: (id: string, data: any) =>
        fetchApi<any>(`/masters/machines/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteMachine: (id: string) =>
        fetchApi<any>(`/masters/machines/${id}`, { method: 'DELETE' }),

    // Customers
    getCustomers: () => fetchApi<any[]>('/masters/customers'),
    createCustomer: (data: any) =>
        fetchApi<any>('/masters/customers', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateCustomer: (id: string, data: any) =>
        fetchApi<any>(`/masters/customers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteCustomer: (id: string) =>
        fetchApi<any>(`/masters/customers/${id}`, { method: 'DELETE' }),

    // Suppliers
    getSuppliers: () => fetchApi<any[]>('/masters/suppliers'),
    createSupplier: (data: any) =>
        fetchApi<any>('/masters/suppliers', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateSupplier: (id: string, data: any) =>
        fetchApi<any>(`/masters/suppliers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteSupplier: (id: string) =>
        fetchApi<any>(`/masters/suppliers/${id}`, { method: 'DELETE' }),

    // Expense Heads
    getExpenseHeads: () => fetchApi<any[]>('/masters/expense-heads'),
    createExpenseHead: (data: any) =>
        fetchApi<any>('/masters/expense-heads', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateExpenseHead: (id: string, data: any) =>
        fetchApi<any>(`/masters/expense-heads/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteExpenseHead: (id: string) =>
        fetchApi<any>(`/masters/expense-heads/${id}`, { method: 'DELETE' }),

    // Bank/Cash Accounts
    getAccounts: () => fetchApi<any[]>('/masters/accounts'),
    createAccount: (data: any) =>
        fetchApi<any>('/masters/accounts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateAccount: (id: string, data: any) =>
        fetchApi<any>(`/masters/accounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteAccount: (id: string) =>
        fetchApi<any>(`/masters/accounts/${id}`, { method: 'DELETE' }),

    // CC Accounts
    getCCAccounts: () => fetchApi<any[]>('/cc-accounts'),
    createCCAccount: (data: any) =>
        fetchApi<any>('/cc-accounts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateCCAccount: (id: string, data: any) =>
        fetchApi<any>(`/cc-accounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteCCAccount: (id: string) =>
        fetchApi<any>(`/masters/cc-accounts/${id}`, { method: 'DELETE' }),
    getCCAccountStatus: (id: string) => fetchApi<any>(`/cc-accounts/${id}/status`),
    postCCInterest: (id: string, month: string) => fetchApi<any>(`/cc-accounts/${id}/interest/post`, {
        method: 'POST',
        body: JSON.stringify({ month }),
    }),
    getCCInterestLogs: () => fetchApi<any[]>('/cc-accounts/interest-logs'),

    // Employees
    getEmployees: () => fetchApi<any[]>('/masters/employees'),
    createEmployee: (data: any) =>
        fetchApi<any>('/masters/employees', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateEmployee: (id: string, data: any) =>
        fetchApi<any>(`/masters/employees/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteEmployee: (id: string) =>
        fetchApi<any>(`/masters/employees/${id}`, { method: 'DELETE' }),

    // General Items
    getGeneralItems: () => fetchApi<any[]>('/masters/general-items'),
    createGeneralItem: (data: any) =>
        fetchApi<any>('/masters/general-items', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateGeneralItem: (id: string, data: any) =>
        fetchApi<any>(`/masters/general-items/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteGeneralItem: (id: string) =>
        fetchApi<any>(`/masters/general-items/${id}`, { method: 'DELETE' }),
};

// ==================== PURCHASE API ====================
export const purchaseApi = {
    getBills: (page = 1, limit = 20, params?: any) => {
        const query = new URLSearchParams({ page: String(page), limit: String(limit), ...params }).toString();
        return fetchApi<any>(`/purchase/bills?${query}`);
    },
    createBill: (data: any) =>
        fetchApi<any>('/purchase/bills', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateBill: (id: string, data: any) =>
        fetchApi<any>(`/purchase/bills/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    getSummary: () => fetchApi<any>('/purchase/summary'),
    getOutstandingBills: (supplierId: string) => fetchApi<any[]>(`/purchase/outstanding/${supplierId}`),    // Payments
    createPayment: (data: any) =>
        fetchApi<any>('/purchase/payments', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getPayment: (id: string) => fetchApi<any>(`/purchase/payments/${id}`),
    updatePayment: (id: string, data: any) =>
        fetchApi<any>(`/purchase/payments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deletePayment: (id: string) =>
        fetchApi<any>(`/purchase/payments/${id}`, { method: 'DELETE' }),
    deleteBill: (id: string) =>
        fetchApi<any>(`/purchase/bills/${id}`, { method: 'DELETE' }),

    // Roll Management
    getRolls: (billId: string) => fetchApi<any>(`/purchase/bills/${billId}/rolls`),
    addRolls: (billId: string, rolls: any[]) =>
        fetchApi<any>(`/purchase/bills/${billId}/rolls`, {
            method: 'POST',
            body: JSON.stringify({ rolls }),
        }),
    deleteRoll: (billId: string, rollId: string) =>
        fetchApi<any>(`/purchase/bills/${billId}/rolls/${rollId}`, { method: 'DELETE' }),
    updateRoll: (billId: string, rollId: string, data: { netWeight: number; width: number }) =>
        fetchApi<any>(`/purchase/bills/${billId}/rolls/${rollId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    getNextRollSeq: () => fetchApi<any>('/purchase/next-roll-seq'),

    // Pending Quantity Management
    getPendingQuantity: (supplierId: string, rawMaterialId: string) =>
        fetchApi<any[]>(`/purchase/pending-qty?supplierId=${supplierId}&rawMaterialId=${rawMaterialId}`),
    adjustPendingQuantity: (data: any) =>
        fetchApi<any>('/purchase/adjust-qty', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ==================== PRODUCTION API ====================
export const productionApi = {
    getBatches: (status?: string) =>
        fetchApi<any[]>(`/production/batches${status ? `?status=${status}` : ''}`),
    createBatch: (data: any) =>
        fetchApi<any>('/production/batches', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateBatch: (id: string, data: any) =>
        fetchApi<any>(`/production/batches/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    completeBatch: (id: string, data: any) =>
        fetchApi<any>(`/production/batches/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    quickComplete: (data: { batchId: string; finishedProductId: string; outputWeight: number; weightLossGrams: number }) =>
        fetchApi<any>('/production/quick-complete', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    deleteBatch: (id: string) =>
        fetchApi<any>(`/production/batches/${id}`, { method: 'DELETE' }),
    getStats: () => fetchApi<any>('/production/stats'),
};

// ==================== SALES API ====================
export const salesApi = {
    getInvoices: (page = 1, limit = 20) => fetchApi<any>(`/sales/invoices?page=${page}&limit=${limit}`),
    getInvoice: (id: string) => fetchApi<any>(`/sales/invoices/${id}`),
    createInvoice: (data: any) =>
        fetchApi<any>('/sales/invoices', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateInvoice: (id: string, data: any) =>
        fetchApi<any>(`/sales/invoices/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    getInvoiceForPrint: (id: string) => fetchApi<any>(`/sales/invoices/${id}/print`),
    getSummary: () => fetchApi<any>('/sales/summary'),
    getOutstandingInvoices: (customerId: string) => fetchApi<any[]>(`/sales/outstanding/${customerId}`),
    createReceipt: (data: any) =>
        fetchApi<any>('/sales/receipts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    deleteReceipt: (id: string) =>
        fetchApi<any>(`/sales/receipts/${id}`, { method: 'DELETE' }),
    getAvailableBells: () => fetchApi<any[]>('/sales/available-bells'),
    deleteInvoice: (id: string) =>
        fetchApi<any>(`/sales/invoices/${id}`, { method: 'DELETE' }),
};

// ==================== ACCOUNTS API ====================
// ==================== ACCOUNTS API ====================
export const accountsApi = {
    getTransactions: (filters: any = {}, page = 1, limit = 20) => {
        const query = new URLSearchParams(filters).toString();
        // Append pagination
        const separator = query ? '&' : '';
        const pager = `page=${page}&limit=${limit}`;
        return fetchApi<any>(`/accounts/transactions?${query}${separator}${pager}`);
    },
    createTransaction: (data: any) =>
        fetchApi<any>('/accounts/transactions', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getLedger: (accountId: string) => fetchApi<any>(`/accounts/ledger/${accountId}`),
    getCashLedger: () => fetchApi<any>('/accounts/cash-ledger'),
    getBankLedger: () => fetchApi<any>('/accounts/bank-ledger'),
    getCustomerLedger: (customerId?: string) =>
        fetchApi<any>(`/accounts/customer-ledger${customerId ? `?customerId=${customerId}` : ''}`),
    getSupplierLedger: (supplierId?: string) =>
        fetchApi<any>(`/accounts/supplier-ledger${supplierId ? `?supplierId=${supplierId}` : ''}`),
    getExpenses: () => fetchApi<any[]>('/accounts/expenses'),
    createExpense: (data: any) =>
        fetchApi<any>('/accounts/expenses', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateExpense: (id: string, data: any) =>
        fetchApi<any>(`/accounts/expenses/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteExpense: (id: string) =>
        fetchApi<any>(`/accounts/expenses/${id}`, { method: 'DELETE' }),
    getSummary: () => fetchApi<any>('/accounts/summary'),
    getPartyAdvances: (partyId: string) => fetchApi<any[]>(`/accounts/advances/${partyId}`),
    adjustAdvance: (data: any) =>
        fetchApi<any>('/accounts/adjust-advance', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ==================== INVENTORY API ====================
export const inventoryApi = {
    getFinishedGoods: () => fetchApi<any[]>('/inventory/finished-goods'),
    getRawMaterials: () => fetchApi<any[]>('/inventory/raw-materials'),
    getMovements: (params?: { itemType?: string; type?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return fetchApi<any[]>(`/inventory/movements${query ? `?${query}` : ''}`);
    },
    getSummary: () => fetchApi<any>('/inventory/summary'),
    getAvailableBatches: (rawMaterialId: string) => fetchApi<any[]>(`/inventory/raw-materials/${rawMaterialId}/batches`),
    getRollsByMaterial: (rawMaterialId: string) => fetchApi<any[]>(`/inventory/raw-materials/${rawMaterialId}/rolls`),
    adjustStock: (data: { itemType: 'raw_material' | 'finished_product', itemId: string, quantity: number, reason: string }) =>
        fetchApi<any>('/inventory/adjust', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ==================== BELL INVENTORY API ====================
export const bellInventoryApi = {
    getBells: () => fetchApi<any[]>('/bell-inventory'),
    createBell: (data: any) =>
        fetchApi<any>('/bell-inventory', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateBell: (id: string, data: any) =>
        fetchApi<any>(`/bell-inventory/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteBell: (id: string) =>
        fetchApi<any>(`/bell-inventory/${id}`, { method: 'DELETE' }),
    deleteBaleItem: (id: string) =>
        fetchApi<any>(`/bell-inventory/items/${id}`, { method: 'DELETE' }),
};

// ==================== REPORTS API ====================
export const reportsApi = {
    getProductionLoss: () => fetchApi<any>('/reports/production-loss'),
    getSales: () => fetchApi<any>('/reports/sales'),
    getPurchases: () => fetchApi<any>('/reports/purchases'),
    getStockValuation: () => fetchApi<any>('/reports/stock-valuation'),
    getExpenses: () => fetchApi<any>('/reports/expenses'),
};

// ==================== DASHBOARD API ====================
export const dashboardApi = {
    getKpis: () => fetchApi<any>('/dashboard/kpis'),
    getAlerts: () => fetchApi<any>('/dashboard/alerts'),
    getMachineEfficiency: () => fetchApi<any[]>('/dashboard/machine-efficiency'),
};

// ==================== FINANCE API ====================
export const financeApi = {
    getEntities: () => fetchApi<any[]>('/finance/entities'),
    createEntity: (data: any) =>
        fetchApi<any>('/finance/entities', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    updateEntity: (id: string, data: any) =>
        fetchApi<any>(`/finance/entities/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    deleteEntity: (id: string) => fetchApi<any>(`/finance/entities/${id}`, { method: 'DELETE' }),
    getPartyStats: (id: string) => fetchApi<any>(`/finance/entities/${id}/stats`),
    getTransactions: (page = 1, limit = 20) => fetchApi<any>(`/finance/transactions?page=${page}&limit=${limit}`),
    createTransaction: (data: any) =>
        fetchApi<any>('/finance/transactions', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    deleteTransaction: (id: string) => fetchApi<any>(`/finance/transactions/${id}`, { method: 'DELETE' }),
    updateTransaction: (id: string, data: any) =>
        fetchApi<any>(`/finance/transactions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    getDashboardStats: () => fetchApi<any>('/finance/dashboard-stats'),
    recalculateLedgers: () => fetchApi<any>('/finance/recalculate-ledgers', { method: 'POST' }),
};

// ==================== SAMPLES API ====================
export const samplesApi = {
    getAll: () => fetchApi<any[]>('/samples'),
    create: (data: any) =>
        fetchApi<any>('/samples', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: string, data: any) =>
        fetchApi<any>(`/samples/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    delete: (id: string) => fetchApi<any>(`/samples/${id}`, { method: 'DELETE' }),
};
