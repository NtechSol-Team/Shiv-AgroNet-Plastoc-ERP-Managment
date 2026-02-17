import React, { useState, useEffect } from 'react';
import {
  Plus, TrendingUp, TrendingDown, X, Loader2, Users, Truck,
  CreditCard, Wallet, FileText, ArrowUpRight, ArrowDownRight, Search, Printer, MessageCircle
} from 'lucide-react';
import { accountsApi, mastersApi } from '../lib/api';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface Account {
  id: string;
  name: string;
  type: 'Bank' | 'Cash' | 'CC';
  balance: string;
}

interface Transaction {
  id: string;
  date: string;
  code: string;
  description: string;
  type: 'RECEIPT' | 'PAYMENT';
  amount: string;
  partyName?: string;
  referenceCode?: string;
  account?: Account;
  remarks?: string;
  accountName?: string;
}

interface Customer {
  id: string;
  name: string;
  code: string;
  outstandingAmount: number;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
  outstandingAmount: number;
}

interface ExpenseHead {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  date: string;
  description: string;
  amount: string;
  expenseHead?: ExpenseHead;
  account?: Account;
}

// ============================================================
// COMPONENT
// ============================================================

export function Accounts() {
  const [activeTab, setActiveTab] = useState<'overview' | 'customer' | 'supplier' | 'expenses'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);

  // Modal States

  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Ledger Filter States
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null); // For Customer/Supplier
  const [accountLedgerData, setAccountLedgerData] = useState<any>(null); // For Bank/Cash Account

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  // Form States


  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    expenseHeadId: '',
    description: '',
    amount: '',
    accountId: ''
  });

  // ============================================================
  // LOAD INITIAL DATA
  // ============================================================

  useEffect(() => {
    fetchInitialData();
  }, [page, limit]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [summaryRes, accountsRes, customersRes, suppliersRes, expensesRes, headsRes] = await Promise.all([
        accountsApi.getSummary(),
        mastersApi.getAccounts(),
        mastersApi.getCustomers(),
        mastersApi.getSuppliers(),
        accountsApi.getExpenses(),
        mastersApi.getExpenseHeads()
      ]);

      if (summaryRes.data) setSummary(summaryRes.data);
      if (accountsRes.data) setAccounts(accountsRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (expensesRes.data) setExpenses(expensesRes.data);
      if (headsRes.data) setExpenseHeads(headsRes.data);

      await fetchTransactions(); // Load initial transactions
    } catch (err) {
      setError('Failed to load accounts data');
    }
    setLoading(false);
  };

  const fetchTransactions = async () => {
    // Only fetch general list if no account selected (or if we want to keep it in background)
    const res = await accountsApi.getTransactions({}, page, limit);
    if (res.data) {
      // Handle paginated response structure
      const isPaginated = !Array.isArray(res.data) && 'data' in res.data;
      const txns = isPaginated ? (res.data as any).data : res.data;
      const meta = isPaginated ? (res.data as any).meta : { totalPages: 1 };

      setTransactions(txns || []);
      setTotalPages(meta.totalPages);
    }
  };

  // ============================================================
  // LEDGER DATA FETCHING
  // ============================================================

  useEffect(() => {
    if (activeTab === 'customer' && selectedCustomerId) {
      loadCustomerLedger(selectedCustomerId);
    } else if (activeTab === 'supplier' && selectedSupplierId) {
      loadSupplierLedger(selectedSupplierId);
    } else {
      setLedgerData(null);
    }
  }, [activeTab, selectedCustomerId, selectedSupplierId]);

  // Effect for Account Ledger
  useEffect(() => {
    if (selectedAccountId) {
      loadAccountLedger(selectedAccountId);
    } else {
      setAccountLedgerData(null);
    }
  }, [selectedAccountId]);

  const loadCustomerLedger = async (id: string) => {
    const res = await accountsApi.getCustomerLedger(id);
    if (res.data) setLedgerData(res.data);
  };

  const loadSupplierLedger = async (id: string) => {
    const res = await accountsApi.getSupplierLedger(id);
    if (res.data) setLedgerData(res.data);
  };

  const loadAccountLedger = async (id: string) => {
    const res = await accountsApi.getLedger(id);
    if (res.data) setAccountLedgerData(res.data);
  };

  // ============================================================
  // HANDLERS
  // ============================================================



  const handleExpenseSubmit = async () => {
    try {
      await accountsApi.createExpense({
        ...expenseForm,
        amount: parseFloat(expenseForm.amount)
      });
      setShowExpenseModal(false);
      fetchInitialData();
      if (selectedAccountId) loadAccountLedger(selectedAccountId); // Refresh ledger if active
    } catch (err) {
      setError('Failed to record expense');
    }
  };

  // Helper to get color for transaction type
  const getTypeColor = (type: string) => {
    return type === 'RECEIPT' ? 'text-green-600' : 'text-red-600';
  };

  // Filter transactions based on selection - REMOVED, using conditional rendering instead

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading accounts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Accounts & Ledger</h1>
          <p className="text-sm text-gray-600 mt-1">Manage cash flow, receivables, and payables</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <TrendingDown className="w-4 h-4 mr-2" />
            Add Expense
          </button>

        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <nav className="flex divide-x divide-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-4 text-sm font-medium ${activeTab === 'overview' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('customer')}
            className={`flex-1 py-4 text-sm font-medium ${activeTab === 'customer' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Customer Ledger (Receivables)
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            className={`flex-1 py-4 text-sm font-medium ${activeTab === 'supplier' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Supplier Ledger (Payables)
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 py-4 text-sm font-medium ${activeTab === 'expenses' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Expenses
          </button>
        </nav>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Bank Balance</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">₹{summary?.accounts?.bankBalance}</p>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Cash In Hand</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">₹{summary?.accounts?.cashBalance}</p>
                </div>
                <div className="p-2 bg-green-50 rounded-lg">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Net Receivables</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">₹{summary?.receivables?.total}</p>
                  <p className="text-xs text-gray-500 mt-1">From {summary?.receivables?.customerCount} customers</p>
                </div>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Net Payables</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">₹{summary?.payables?.total}</p>
                  <p className="text-xs text-gray-500 mt-1">To {summary?.payables?.supplierCount} suppliers</p>
                </div>
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Truck className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* All Accounts Balances */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">All Accounts</h3>
                <p className="text-xs text-gray-500">Click on an account to filter transactions</p>
              </div>
              {selectedAccountId && (
                <button
                  onClick={() => setSelectedAccountId(null)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"
                >
                  <X className="w-4 h-4 mr-1" /> Clear Filter
                </button>
              )}
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccountId(selectedAccountId === acc.id ? null : acc.id)}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-all ${selectedAccountId === acc.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-md transform scale-[1.01]'
                      : 'border-gray-200 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${acc.type === 'Cash' ? 'bg-green-100 text-green-600' : acc.type === 'CC' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                        {acc.type === 'Cash' ? <Wallet className="w-5 h-5" /> : acc.type === 'CC' ? <CreditCard className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className={`font-bold ${selectedAccountId === acc.id ? 'text-blue-800' : 'text-gray-900'}`}>{acc.name}</p>
                        <p className="text-xs text-gray-500 uppercase">{acc.type} Account</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold font-mono ${selectedAccountId === acc.id ? 'text-blue-800' : 'text-gray-900'}`}>₹{parseFloat(acc.balance).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {accounts.length === 0 && (
                  <div className="col-span-full text-center py-4 text-gray-500 italic">No accounts configured.</div>
                )}
              </div>
            </div>
          </div>

          {/* Transaction List or Account Ledger */}
          {selectedAccountId && accountLedgerData ? (
            // ACCOUNT LEDGER VIEW (PASSBOOK STYLE)
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-blue-50">
                <div>
                  <h3 className="text-lg font-bold text-blue-900">
                    {accountLedgerData.account.name} - Statement
                  </h3>
                  <p className="text-xs text-blue-600 mt-1">
                    Current Balance: <span className="font-bold text-lg">₹{parseFloat(accountLedgerData.summary.currentBalance).toLocaleString()}</span>
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>Total Inflow: <span className="text-green-600 font-bold">₹{accountLedgerData.summary.totalInflow}</span></div>
                  <div>Total Outflow: <span className="text-red-600 font-bold">₹{accountLedgerData.summary.totalOutflow}</span></div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Particualrs</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit (Out)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit (In)</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      // Calculate Running Balances
                      // We have 'history' sorted DESC (Newest First)
                      // Final Balance (Latest) is known.
                      // Balance[i-1] (Previous/NextInArray) = Balance[i] - Credit[i] + Debit[i]

                      const history = accountLedgerData.history || [];
                      let currentBal = parseFloat(accountLedgerData.summary.currentBalance);

                      // We need to map running balances. 
                      // Render is Top-Down (Newest First).
                      // So Row 0 Balance = Current Balance.
                      // Row 1 Balance = Row 0 Balance - Row 0 NetChange.

                      const rowsWithBalance = history.map((txn: any) => {
                        const debit = txn.isDebit ? txn.amount : 0;
                        const credit = txn.isCredit ? txn.amount : 0;
                        const bal = currentBal;

                        // Update for NEXT row (older transaction)
                        // Current Balance was achieved AFTER this transaction.
                        // So Balance BEFORE this = Current - Credit + Debit
                        currentBal = currentBal - credit + debit;

                        return { ...txn, balance: bal, debit, credit };
                      });

                      if (rowsWithBalance.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                              No transactions found for this account.
                            </td>
                          </tr>
                        );
                      }

                      return rowsWithBalance.map((txn: any) => (
                        <tr key={txn.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                            {new Date(txn.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="font-medium">{txn.partyName || '-'}</div>
                            <div className="text-xs text-gray-500">{txn.description}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${txn.category === 'Trade' ? 'bg-blue-100 text-blue-800' :
                              txn.category === 'Expense' ? 'bg-orange-100 text-orange-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                              {txn.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-red-600">
                            {txn.debit > 0 ? `₹${txn.debit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-green-600">
                            {txn.credit > 0 ? `₹${txn.credit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold font-mono text-gray-900">
                            ₹{txn.balance.toLocaleString()}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            // DEFAULT RECENT TRANSACTIONS VIEW
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Recent Transactions
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party / Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      // 1. Merge Transactions and Expenses (Legacy Frontend Merge - consider removing if using unified API entirely)
                      // Actually, the new API /accounts/transactions returns unified data if we update logic, 
                      // but currently keeping the merge for safety until we verify API response structure used here.

                      // NOTE: The previous logic manually merged 'transactions' and 'expenses' arrays.
                      // Since we have updated the backend to return unified, we should rely on that?
                      // Checked fetchTransactions: It calls accountsApi.getTransactions.
                      // The backend NOW returns Unified.
                      // BUT fetchTransactions sets 'transactions' state.
                      // 'expenses' state is fetched separately.

                      // If backend returns unified in 'transactions', we shouldn't merge 'expenses' again potentially?
                      // Let's check `fetchInitialData`. It fetches `accountsApi.getExpenses()`.
                      // If `getTransactions` returns everything, we might double count if we merge again.

                      // CHECK Backend accounts.ts: `GET /transactions` returns unified.
                      // CHECK Frontend: `fetchTransactions` sets `transactions`.
                      // So `transactions` already contains expenses!

                      // FIX: Do NOT merge `expenses` state here. Just use `transactions`.

                      const allTransactions = transactions.map(t => ({
                        ...t,
                        uiType: (t as any).uiType || t.type, // Backend might return 'type', logic below uses it.
                        code: t.code || (t as any).id.substring(0, 8), // Fallback
                      }));

                      // Sort by Date Descending
                      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      if (allTransactions.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                              No recent transactions found.
                            </td>
                          </tr>
                        );
                      }

                      return allTransactions.slice(0, 50).map((txn: any, idx) => (
                        <tr key={`${txn.id}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {new Date(txn.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${txn.category === 'Expense' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
                              {txn.code || 'TXN'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="font-medium">{txn.partyName || '-'}</div>
                            {txn.category === 'Expense' && <div className="text-xs text-gray-500">{txn.description}</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {(txn as any).accountName || ((txn as any).mode === 'Adjustment' ? 'Adjustment' : accounts.find(a => a.id === (txn as any).accountId)?.name || (txn as any).account?.name || '-')}
                          </td>
                          <td className={`px-6 py-4 text-sm text-right font-bold ${txn.type === 'RECEIPT' || txn.type === 'LOAN_TAKEN' ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {txn.type === 'RECEIPT' || txn.type === 'LOAN_TAKEN' ? '+' : '-'} ₹{parseFloat(txn.amount).toLocaleString()}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-300 flex items-center justify-between sm:px-6">
                {/* Existing Pagination Logic... */}
                <div className="flex-1 flex justify-between sm:hidden">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Previous</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Next</button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div><p className="text-sm text-gray-700">Showing page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span></p></div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><span className="sr-only">Previous</span>&larr;</button>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><span className="sr-only">Next</span>&rarr;</button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER LEDGER TAB */}
      {activeTab === 'customer' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Customer</label>
              <select
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">-- Select Customer --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            {ledgerData && (
              <div className="flex-1 bg-white p-4 rounded-lg border border-green-200 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Current Outstanding</p>
                  <p className="text-2xl font-bold text-green-700">₹{ledgerData.summary?.totalOutstanding || '0.00'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const customerName = customers.find(c => c.id === selectedCustomerId)?.name || 'Customer';
                      const printContent = `
                        <html>
                          <head>
                            <title>Ledger - ${customerName}</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body class="p-8 bg-white text-gray-900">
                            <div class="max-w-4xl mx-auto border p-8">
                              <h1 class="text-2xl font-bold mb-2">Customer Ledger Statement</h1>
                              <p class="text-lg font-medium text-gray-700 mb-6">${customerName}</p>
                              
                              <div className="mb-6 p-4 bg-gray-50 rounded border">
                                <p class="text-sm text-gray-500">Total Outstanding</p>
                                <p class="text-2xl font-bold text-red-700">₹${ledgerData.summary?.totalOutstanding || '0'}</p>
                              </div>

                              <h2 class="font-bold border-b pb-2 mt-8 mb-4">Unpaid Invoices</h2>
                              <table class="w-full text-sm mb-8">
                                <thead>
                                  <tr class="text-left border-b-2 border-gray-800">
                                    <th class="py-2">Date</th>
                                    <th class="py-2">Invoice #</th>
                                    <th class="py-2 text-right">Total Amount</th>
                                    <th class="py-2 text-right">Balance Due</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${ledgerData.invoices.length === 0 ? '<tr><td colspan="4" class="py-4 text-center text-gray-500">No unpaid invoices</td></tr>' :
                          ledgerData.invoices.map((i: any) => `
                                    <tr class="border-b border-gray-200">
                                      <td class="py-2">${new Date(i.invoiceDate).toLocaleDateString()}</td>
                                      <td class="py-2 font-mono">${i.invoiceNumber}</td>
                                      <td class="py-2 text-right">₹${i.grandTotal}</td>
                                      <td class="py-2 text-right font-bold text-red-600">₹${i.balanceAmount}</td>
                                    </tr>
                                  `).join('')}
                                </tbody>
                              </table>

                              <h2 class="font-bold border-b pb-2 mt-8 mb-4">Recent Payments</h2>
                              <table class="w-full text-sm">
                                <thead>
                                  <tr class="text-left border-b-2 border-gray-800">
                                    <th class="py-2">Date</th>
                                    <th class="py-2">Receipt #</th>
                                    <th class="py-2">Mode</th>
                                    <th class="py-2 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${ledgerData.payments.length === 0 ? '<tr><td colspan="4" class="py-4 text-center text-gray-500">No payments recorded</td></tr>' :
                          ledgerData.payments.map((p: any) => `
                                    <tr class="border-b border-gray-200">
                                      <td class="py-2">${new Date(p.date).toLocaleDateString()}</td>
                                      <td class="py-2 font-mono">${p.code}</td>
                                      <td class="py-2">${p.mode}</td>
                                      <td class="py-2 text-right font-bold text-green-600">₹${p.amount}</td>
                                    </tr>
                                  `).join('')}
                                </tbody>
                              </table>

                              <div class="mt-12 text-center text-xs text-gray-500">
                                <p>Generated on ${new Date().toLocaleDateString()}</p>
                              </div>
                            </div>
                            <script>window.print();</script>
                          </body>
                        </html>
                      `;
                      const win = window.open('', '', 'width=900,height=800');
                      if (win) { win.document.write(printContent); win.document.close(); }
                    }}
                    className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                    title="Print Ledger / Save as PDF"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      const customerName = customers.find(c => c.id === selectedCustomerId)?.name || 'Customer';
                      const text = `Hello ${customerName}, Your current outstanding balance is ₹${ledgerData.summary?.totalOutstanding || '0'}. Please clear your dues at the earliest.`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="p-2 border border-gray-300 rounded hover:bg-green-50 text-green-600"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {ledgerData ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Invoices */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium">Invoices</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Invoice #</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Total</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.invoices?.map((inv: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2 text-sm">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm font-medium">{inv.invoiceNumber}</td>
                        <td className="px-4 py-2 text-sm text-right">₹{inv.grandTotal}</td>
                        <td className="px-4 py-2 text-sm text-right text-red-600 font-medium">₹{inv.balanceAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payments */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium">Payments Received</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Ref #</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Mode</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.payments?.map((pay: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2 text-sm">{new Date(pay.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm">{pay.code}</td>
                        <td className="px-4 py-2 text-sm">{pay.mode}</td>
                        <td className="px-4 py-2 text-sm text-right text-green-600 font-medium">₹{pay.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg dashed-border">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Select a customer to view their ledger</p>
            </div>
          )}
        </div>
      )}

      {/* SUPPLIER LEDGER TAB */}
      {activeTab === 'supplier' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Supplier</label>
              <select
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            {ledgerData && (
              <div className="flex-1 bg-white p-4 rounded-lg border border-red-200 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Current Outstanding</p>
                  <p className="text-2xl font-bold text-red-700">₹{ledgerData.summary?.totalOutstanding || '0.00'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const supplierName = suppliers.find(s => s.id === selectedSupplierId)?.name || 'Supplier';
                      const printContent = `
                        <html>
                          <head>
                            <title>Ledger - ${supplierName}</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body class="p-8 bg-white text-gray-900">
                            <div class="max-w-4xl mx-auto border p-8">
                              <h1 class="text-2xl font-bold mb-2">Supplier Ledger Statement</h1>
                              <p class="text-lg font-medium text-gray-700 mb-6">${supplierName}</p>
                              
                              <div className="mb-6 p-4 bg-gray-50 rounded border">
                                <p class="text-sm text-gray-500">Total Payable</p>
                                <p class="text-2xl font-bold text-red-700">₹${ledgerData.summary?.totalOutstanding || '0'}</p>
                              </div>

                              <h2 class="font-bold border-b pb-2 mt-8 mb-4">Purchase Bills</h2>
                              <table class="w-full text-sm mb-8">
                                <thead>
                                  <tr class="text-left border-b-2 border-gray-800">
                                    <th class="py-2">Date</th>
                                    <th class="py-2">Bill #</th>
                                    <th class="py-2 text-right">Total Amount</th>
                                    <th class="py-2 text-right">Balance Due</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${!ledgerData.bills || ledgerData.bills.length === 0 ? '<tr><td colspan="4" class="py-4 text-center text-gray-500">No bills recorded</td></tr>' :
                          ledgerData.bills.map((b: any) => `
                                    <tr class="border-b border-gray-200">
                                      <td class="py-2">${new Date(b.date).toLocaleDateString()}</td>
                                      <td class="py-2 font-mono">${b.code}</td>
                                      <td class="py-2 text-right">₹${b.grandTotal}</td>
                                      <td class="py-2 text-right font-bold text-red-600">₹${b.balanceAmount}</td>
                                    </tr>
                                  `).join('')}
                                </tbody>
                              </table>

                              <h2 class="font-bold border-b pb-2 mt-8 mb-4">Payments Made</h2>
                              <table class="w-full text-sm">
                                <thead>
                                  <tr class="text-left border-b-2 border-gray-800">
                                    <th class="py-2">Date</th>
                                    <th class="py-2">Ref #</th>
                                    <th class="py-2">Mode</th>
                                    <th class="py-2 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${!ledgerData.payments || ledgerData.payments.length === 0 ? '<tr><td colspan="4" class="py-4 text-center text-gray-500">No payments recorded</td></tr>' :
                          ledgerData.payments.map((p: any) => `
                                    <tr class="border-b border-gray-200">
                                      <td class="py-2">${new Date(p.date).toLocaleDateString()}</td>
                                      <td class="py-2 font-mono">${p.code}</td>
                                      <td class="py-2">${p.mode}</td>
                                      <td class="py-2 text-right font-bold text-green-600">₹${p.amount}</td>
                                    </tr>
                                  `).join('')}
                                </tbody>
                              </table>

                              <div class="mt-12 text-center text-xs text-gray-500">
                                <p>Generated on ${new Date().toLocaleDateString()}</p>
                              </div>
                            </div>
                            <script>window.print();</script>
                          </body>
                        </html>
                      `;
                      const win = window.open('', '', 'width=900,height=800');
                      if (win) { win.document.write(printContent); win.document.close(); }
                    }}
                    className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                    title="Print Ledger / Save as PDF"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      const supplierName = suppliers.find(s => s.id === selectedSupplierId)?.name || 'Supplier';
                      const text = `Hello ${supplierName}, sending ledger statement. Outstanding Payable: ₹${ledgerData.summary?.totalOutstanding || '0'}.`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="p-2 border border-gray-300 rounded hover:bg-green-50 text-green-600"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {ledgerData ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bills */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium">Purchase Bills</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Bill #</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Total</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.bills?.map((bill: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2 text-sm">{new Date(bill.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm font-medium">{bill.billNumber}</td>
                        <td className="px-4 py-2 text-sm text-right">₹{bill.grandTotal}</td>
                        <td className="px-4 py-2 text-sm text-right text-red-600 font-medium">₹{bill.balanceAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payments */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium">Payments Made</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Ref #</th>
                      <th className="px-4 py-2 text-left text-xs text-gray-500">Mode</th>
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.payments?.map((pay: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2 text-sm">{new Date(pay.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm">{pay.code}</td>
                        <td className="px-4 py-2 text-sm">{pay.mode}</td>
                        <td className="px-4 py-2 text-sm text-right text-green-600 font-medium">₹{pay.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg dashed-border">
              <Truck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Select a supplier to view their ledger</p>
            </div>
          )}
        </div>
      )}

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid From</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {expenses.map((exp, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">{new Date(exp.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium">{exp.expenseHead?.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{exp.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{exp.account?.name}</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">- ₹{parseFloat(exp.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}



      {/* EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Record Expense</h3>
              <button onClick={() => setShowExpenseModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expense Head</label>
                <select
                  className="w-full border-gray-300 rounded-lg"
                  value={expenseForm.expenseHeadId}
                  onChange={(e) => setExpenseForm(p => ({ ...p, expenseHeadId: e.target.value }))}
                >
                  <option value="">-- Select Category --</option>
                  {expenseHeads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    className="w-full border-gray-300 rounded-lg"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(p => ({ ...p, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full border-gray-300 rounded-lg"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm(p => ({ ...p, date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  className="w-full border-gray-300 rounded-lg"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paid From Account</label>
                <select
                  className="w-full border-gray-300 rounded-lg"
                  value={expenseForm.accountId}
                  onChange={(e) => setExpenseForm(p => ({ ...p, accountId: e.target.value }))}
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (₹{a.balance})</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => setShowExpenseModal(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExpenseSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
