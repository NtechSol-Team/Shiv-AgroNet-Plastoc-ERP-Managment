// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

// Helper function for API calls
async function fetchApi<T>(
    endpoint: string,
    options?: RequestInit
): Promise<{ data: T | null; error: string | null; warning?: string }> {
    const method = options?.method || 'GET';
    console.log(`\n🌐 API Request: ${method} ${endpoint}`);
    if (options?.body) {
        console.log('Request body:', options.body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
            ...options,
        });

        const result = await response.json();

        console.log(`📨 API Response: ${method} ${endpoint}`);
        console.log('  Status:', response.status);
        console.log('  Success:', result.success);
        if (result.error) {
            console.log('  Error:', result.error);
        }
        if (result.data) {
            console.log('  Data keys:', Object.keys(result.data));
            if (Array.isArray(result.data)) {
                console.log('  Array length:', result.data.length);
            }
        }

        if (!response.ok || !result.success) {
            console.log('❌ API Error:', result.error?.message || 'An error occurred');
            return { data: null, error: result.error?.message || 'An error occurred' };
        }

        console.log('✓ API Success\n');
        return { data: result.data, error: null, warning: result.warning };
    } catch (error) {
        console.log('❌ Network Error:', error);
        return { data: null, error: 'Network error. Please check your connection.' };
    }
}

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
};

// ==================== PURCHASE API ====================
export const purchaseApi = {
    getBills: (page = 1, limit = 20) => fetchApi<any>(`/purchase/bills?page=${page}&limit=${limit}`),
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
    getOutstandingBills: (supplierId: string) => fetchApi<any[]>(`/purchase/outstanding/${supplierId}`),
    createPayment: (data: any) =>
        fetchApi<any>('/purchase/payments', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    reversePayment: (id: string, reason: string) =>
        fetchApi<any>(`/purchase/payments/${id}/reverse`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
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
    completeBatch: (id: string, data: any) =>
        fetchApi<any>(`/production/batches/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
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
    reverseReceipt: (id: string, reason: string) =>
        fetchApi<any>(`/sales/receipts/${id}/reverse`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        }),
    getAvailableBells: () => fetchApi<any[]>('/sales/available-bells'),
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
    getPartyStats: (id: string) => fetchApi<any>(`/finance/entities/${id}/stats`),
    getTransactions: () => fetchApi<any[]>('/finance/transactions'),
    createTransaction: (data: any) =>
        fetchApi<any>('/finance/transactions', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};
