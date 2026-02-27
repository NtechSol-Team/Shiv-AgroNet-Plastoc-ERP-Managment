import React, { useState, useEffect } from 'react';
import {
  Plus, TrendingUp, TrendingDown, X, Loader2, Users, Truck,
  CreditCard, Wallet, FileText, ArrowUpRight, ArrowDownRight, Search, Printer, MessageCircle, ChevronDown, Check, ArrowLeftRight, RotateCcw
} from 'lucide-react';
import { accountsApi, mastersApi, financeApi } from '../lib/api';

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
  advanceBalance?: string;
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
  paymentMode?: string;
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

  // Expense Head Search State
  const [expenseHeadSearch, setExpenseHeadSearch] = useState('');
  const [showExpenseHeadDropdown, setShowExpenseHeadDropdown] = useState(false);
  const [creatingExpenseHead, setCreatingExpenseHead] = useState(false);

  // Filtered Expense Heads
  const filteredExpenseHeads = expenseHeads.filter(h =>
    h.name.toLowerCase().includes(expenseHeadSearch.toLowerCase())
  );

  // Modal States

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [recalculating, setRecalculating] = useState(false);
  const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);

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
    accountId: '',
    paymentMode: 'Cash'
  });

  // ── Supplier Advance Refund state ──
  const [showSupplierRefundModal, setShowSupplierRefundModal] = useState(false);
  const [supplierRefundsHistory, setSupplierRefundsHistory] = useState<any[]>([]);
  const [supplierRefundLoading, setSupplierRefundLoading] = useState(false);
  const [supplierAdvanceData, setSupplierAdvanceData] = useState<any>(null);
  const [supplierRefundForm, setSupplierRefundForm] = useState({
    supplierId: '',
    accountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    remarks: ''
  });
  const [supplierRefundError, setSupplierRefundError] = useState<string | null>(null);

  // ── Bank Transfer state ──
  const [showBankTransferModal, setShowBankTransferModal] = useState(false);
  const [bankTransfersHistory, setBankTransfersHistory] = useState<any[]>([]);
  const [bankTransferLoading, setBankTransferLoading] = useState(false);
  const [bankTransferForm, setBankTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    remarks: ''
  });
  const [bankTransferError, setBankTransferError] = useState<string | null>(null);

  // Helper to compute available balance for display
  const getAvailableBalance = (a: any) => {
    if (a.type === 'CC') {
      const limit = parseFloat(a.sanctionedLimit || '0');
      const balance = parseFloat(a.balance || '0');
      return limit + balance;
    }
    return parseFloat(a.balance || '0');
  };

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

  const loadBankTransfersHistory = async () => {
    const res = await accountsApi.getBankTransfers();
    if (res.data) setBankTransfersHistory(res.data);
  };

  const loadSupplierRefundsHistory = async () => {
    const res = await accountsApi.getSupplierAdvanceRefunds();
    if (res.data) setSupplierRefundsHistory(res.data);
  };

  // ============================================================
  // HANDLERS
  // ============================================================



  const handleExpenseSubmit = async () => {
    try {
      let finalDate = expenseForm.date;
      const todayStr = new Date().toISOString().split('T')[0];
      if (finalDate === todayStr) {
        finalDate = new Date().toISOString();
      } else if (!finalDate.includes('T')) {
        finalDate = new Date(finalDate + 'T12:00:00').toISOString();
      }

      const payload = {
        ...expenseForm,
        date: finalDate,
        amount: parseFloat(expenseForm.amount)
      };

      if (editingExpenseId) {
        await accountsApi.updateExpense(editingExpenseId, payload);
      } else {
        await accountsApi.createExpense(payload);
      }

      setShowExpenseModal(false);
      setEditingExpenseId(null);
      setExpenseHeadSearch(''); // Reset search
      setExpenseForm({
        date: new Date().toISOString().split('T')[0],
        expenseHeadId: '',
        description: '',
        amount: '',
        accountId: '',
        paymentMode: 'Cash'
      });
      fetchInitialData();
      if (selectedAccountId) loadAccountLedger(selectedAccountId); // Refresh ledger if active
    } catch (err) {
      setError('Failed to record expense');
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setExpenseForm({
      date: expense.date.split('T')[0],
      expenseHeadId: expense.expenseHead?.id || '',
      description: expense.description,
      amount: expense.amount,
      accountId: expense.account?.id || '',
      paymentMode: expense.paymentMode || 'Cash'
    });
    setExpenseHeadSearch(expense.expenseHead?.name || ''); // Pre-fill search
    setEditingExpenseId(expense.id);
    setShowExpenseModal(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await accountsApi.deleteExpense(id);
      fetchInitialData();
      if (selectedAccountId) loadAccountLedger(selectedAccountId);
    } catch (err) {
      setError('Failed to delete expense');
    }
  };

  const handleRecalculateBatch = async () => {
    setRecalculating(true);
    try {
      const res = await financeApi.recalculateLedgers();
      if (res.data) {
        alert('Ledgers recalculated successfully!');
        fetchInitialData();
      } else {
        alert('Failed to recalculate: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error during recalculation');
    } finally {
      setRecalculating(false);
      setShowRecalculateConfirm(false);
    }
  };

  // ── Supplier Advance Refund handlers ──
  const handleSupplierRefundSupplierChange = async (supplierId: string) => {
    setSupplierRefundForm(f => ({ ...f, supplierId, amount: '' }));
    setSupplierAdvanceData(null);
    setSupplierRefundError(null);
    if (!supplierId) return;
    const res = await accountsApi.getSupplierAdvances(supplierId);
    if (res.data) setSupplierAdvanceData(res.data);
  };

  const handleSupplierRefundSubmit = async () => {
    setSupplierRefundError(null);
    const { supplierId, accountId, amount } = supplierRefundForm;
    if (!supplierId || !accountId || !amount || parseFloat(amount) <= 0) {
      setSupplierRefundError('Please fill all required fields with a valid amount.');
      return;
    }
    const available = parseFloat(supplierAdvanceData?.totalAdvanceBalance || '0');
    if (parseFloat(amount) > available + 0.01) {
      setSupplierRefundError(`Amount ₹${amount} exceeds available advance balance ₹${available.toFixed(2)}`);
      return;
    }
    setSupplierRefundLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const finalDate = supplierRefundForm.date === today
        ? new Date().toISOString()
        : new Date(supplierRefundForm.date + 'T12:00:00').toISOString();

      const res = await accountsApi.createSupplierAdvanceRefund({
        ...supplierRefundForm,
        date: finalDate,
        amount: parseFloat(supplierRefundForm.amount)
      });
      if (res.error) {
        setSupplierRefundError(res.error);
      } else {
        setShowSupplierRefundModal(false);
        setSupplierRefundForm({ supplierId: '', accountId: '', amount: '', date: new Date().toISOString().split('T')[0], reference: '', remarks: '' });
        setSupplierAdvanceData(null);
        fetchInitialData();
        if (selectedAccountId) loadAccountLedger(selectedAccountId);
      }
    } catch {
      setSupplierRefundError('Failed to record refund. Please try again.');
    } finally {
      setSupplierRefundLoading(false);
    }
  };

  const handleDeleteSupplierRefund = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier advance refund? This will restore the supplier advance balance and reverse the bank/cash entry.')) return;
    try {
      await accountsApi.deleteSupplierAdvanceRefund(id);
      fetchInitialData();
      if (selectedAccountId) loadAccountLedger(selectedAccountId);
    } catch (err) {
      alert('Failed to delete supplier refund. Please try again.');
    }
  };

  // ── Bank Transfer handlers ──
  const handleBankTransferSubmit = async () => {
    setBankTransferError(null);
    const { fromAccountId, toAccountId, amount } = bankTransferForm;
    if (!fromAccountId || !toAccountId || !amount || parseFloat(amount) <= 0) {
      setBankTransferError('Please fill all required fields with a valid amount.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setBankTransferError('From and To accounts cannot be the same.');
      return;
    }
    const fromAcc = accounts.find(a => a.id === fromAccountId);
    const fromBalance = getAvailableBalance(fromAcc || {});
    if (parseFloat(amount) > fromBalance + 0.01) {
      setBankTransferError(`Insufficient balance in ${fromAcc?.name}. Available: ₹${fromBalance.toFixed(2)}`);
      return;
    }
    setBankTransferLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const finalDate = bankTransferForm.date === today
        ? new Date().toISOString()
        : new Date(bankTransferForm.date + 'T12:00:00').toISOString();

      const res = await accountsApi.createBankTransfer({
        ...bankTransferForm,
        date: finalDate,
        amount: parseFloat(bankTransferForm.amount)
      });
      if (res.error) {
        setBankTransferError(res.error);
      } else {
        setShowBankTransferModal(false);
        setBankTransferForm({ fromAccountId: '', toAccountId: '', amount: '', date: new Date().toISOString().split('T')[0], reference: '', remarks: '' });
        fetchInitialData();
        if (selectedAccountId) loadAccountLedger(selectedAccountId);
      }
    } catch {
      setBankTransferError('Failed to record bank transfer. Please try again.');
    } finally {
      setBankTransferLoading(false);
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
          <h1 className="text-2xl font-semibold text-gray-900">Accounts &amp; Ledger</h1>
          <p className="text-sm text-gray-600 mt-1">Manage cash flow, receivables, and payables</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => {
              setSupplierRefundError(null);
              setSupplierAdvanceData(null);
              setSupplierRefundForm({ supplierId: '', accountId: '', amount: '', date: new Date().toISOString().split('T')[0], reference: '', remarks: '' });
              setShowSupplierRefundModal(true);
              loadSupplierRefundsHistory();
            }}
            className="flex items-center px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Supplier Refund
          </button>
          <button
            onClick={() => {
              setBankTransferError(null);
              setBankTransferForm({ fromAccountId: '', toAccountId: '', amount: '', date: new Date().toISOString().split('T')[0], reference: '', remarks: '' });
              setShowBankTransferModal(true);
              loadBankTransfersHistory();
            }}
            className="flex items-center px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-100"
          >
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Bank Transfer
          </button>
          <button
            onClick={() => {
              setShowExpenseModal(true);
              setExpenseHeadSearch('');
            }}
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
                      {acc.type === 'CC' ? (
                        <>
                          <p className="text-xs text-gray-500 mb-1">
                            Utilized: <span className="font-medium text-gray-900">₹{Math.abs(parseFloat(acc.balance || '0')).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </p>
                          <p className={`text-lg font-bold font-mono ${selectedAccountId === acc.id ? 'text-blue-800' : 'text-gray-900'}`} title="Available Balance">
                            ₹{getAvailableBalance(acc).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </>
                      ) : (
                        <p className={`text-lg font-bold font-mono ${selectedAccountId === acc.id ? 'text-blue-800' : 'text-gray-900'}`}>
                          ₹{parseFloat(acc.balance || '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
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
                    {accountLedgerData.account.type === 'CC' ? 'Available Balance' : 'Current Balance'}: <span className="font-bold text-lg">₹{(accountLedgerData.account.type === 'CC' ? getAvailableBalance(accountLedgerData.account) : parseFloat(accountLedgerData.summary.currentBalance)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
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
                            {txn.debit > 0 ? `₹${txn.debit.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-green-600">
                            {txn.credit > 0 ? `₹${txn.credit.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold font-mono text-gray-900">
                            ₹{txn.balance.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {txn.type === 'SUPPLIER_ADVANCE_REFUND' && (
                              <button
                                onClick={() => handleDeleteSupplierRefund(txn.id)}
                                className="text-red-600 hover:text-red-900 mx-1"
                                title="Delete Supplier Refund"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
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

                      return allTransactions.map((txn: any, idx) => (
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
                            {txn.type === 'RECEIPT' || txn.type === 'LOAN_TAKEN' ? '+' : '-'} ₹{parseFloat(txn.amount).toLocaleString('en-IN')}
                            {parseFloat(txn.advanceBalance || '0') > 0 && (
                              <div className="text-[10px] text-blue-600 font-bold mt-0.5">
                                (Inc. ₹{parseFloat(txn.advanceBalance || '0').toLocaleString('en-IN')} Adv.)
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {txn.type === 'SUPPLIER_ADVANCE_REFUND' && (
                              <button
                                onClick={() => handleDeleteSupplierRefund(txn.id)}
                                className="text-red-600 hover:text-red-900 mx-1"
                                title="Delete Supplier Refund"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
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
                <div className="flex gap-8 items-center">
                  <div>
                    <p className="text-sm text-gray-500">Current Outstanding</p>
                    <p className={`text-2xl font-bold ${parseFloat(ledgerData.summary?.totalOutstanding || '0') < 0 ? 'text-blue-700' : 'text-green-700'}`}>
                      ₹{Math.abs(parseFloat(ledgerData.summary?.totalOutstanding || '0')).toFixed(2)}
                      {parseFloat(ledgerData.summary?.totalOutstanding || '0') < 0 && ' (Cr)'}
                    </p>
                  </div>
                  {(ledgerData.summary?.advanceAmount || 0) > 0 && (
                    <div className="pl-6 border-l border-gray-200">
                      <p className="text-sm text-gray-500">Unallocated Advance</p>
                      <p className="text-2xl font-bold text-blue-600">₹{ledgerData.summary?.advanceAmount}</p>
                    </div>
                  )}
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
                                <p class="text-sm text-gray-500">Opening Balance</p>
                                <p class="text-xl font-bold text-gray-700">₹${ledgerData.summary?.openingBalance || '0'}</p>
                                
                                ${parseFloat(ledgerData.summary?.advanceAmount || '0') > 0 ? `
                                <p class="text-sm text-gray-500 mt-2">Unallocated Advance</p>
                                <p class="text-xl font-bold text-blue-700">₹${ledgerData.summary?.advanceAmount}</p>
                                ` : ''}

                                <p class="text-sm text-gray-500 mt-2">Total Outstanding (including Opening Balance)</p>
                                <p class="text-2xl font-bold ${parseFloat(ledgerData.summary?.totalOutstanding || '0') < 0 ? 'text-blue-700' : 'text-red-700'}">
                                  ₹${Math.abs(parseFloat(ledgerData.summary?.totalOutstanding || '0')).toFixed(2)} ${parseFloat(ledgerData.summary?.totalOutstanding || '0') < 0 ? '(Cr)' : ''}
                                </p>
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
              {/* Opening Balance Panel */}
              {parseFloat(ledgerData.summary?.openingBalance || '0') > 0 && (
                <div className="lg:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-blue-800">Opening Balance</h3>
                    <p className="text-sm text-blue-600">Initial outstanding balance carried forward</p>
                  </div>
                  <div className="text-xl font-bold text-blue-700">
                    ₹{ledgerData.summary?.openingBalance}
                  </div>
                </div>
              )}
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
                                    <th class="py-2 text-right">Amount</th>
                                    <th class="py-2 text-right">Advance Bal.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${!ledgerData.payments || ledgerData.payments.length === 0 ? '<tr><td colspan="5" class="py-4 text-center text-gray-500">No payments recorded</td></tr>' :
                          ledgerData.payments.map((p: any) => `
                                    <tr class="border-b border-gray-200">
                                      <td class="py-2">${new Date(p.date).toLocaleDateString()}</td>
                                      <td class="py-2 font-mono">${p.code}</td>
                                      <td class="py-2">${p.mode}</td>
                                      <td class="py-2 text-right font-bold text-green-600">₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
                                      <td class="py-2 text-right ${parseFloat(p.advanceBalance || '0') > 0 ? 'text-blue-600 font-bold' : 'text-gray-400'}">₹${parseFloat(p.advanceBalance || '0').toLocaleString('en-IN')}</td>
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
                        <td className="px-4 py-2 text-sm font-medium">{bill.code}</td>
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
                      <th className="px-4 py-2 text-right text-xs text-gray-500">Advance Bal.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.payments?.map((pay: any, i: number) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">{new Date(pay.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm font-mono">{pay.code}</td>
                        <td className="px-4 py-2 text-sm">{pay.mode}</td>
                        <td className="px-4 py-2 text-sm text-right text-green-600 font-medium">₹{parseFloat(pay.amount).toLocaleString('en-IN')}</td>
                        <td className={`px-4 py-2 text-sm text-right font-medium ${parseFloat(pay.advanceBalance || '0') > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          ₹{parseFloat(pay.advanceBalance || '0').toLocaleString('en-IN')}
                        </td>
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {expenses.map((exp, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">{new Date(exp.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium">{exp.expenseHead?.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{exp.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{exp.account?.name}</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">- ₹{parseFloat(exp.amount).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <button onClick={() => handleEditExpense(exp)} className="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                    <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-600 hover:text-red-900">Delete</button>
                  </td>
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
                <div className="relative">
                  <div
                    className="w-full border border-gray-300 rounded-lg flex items-center justify-between px-3 py-2 cursor-text"
                    onClick={() => setShowExpenseHeadDropdown(true)}
                  >
                    <input
                      type="text"
                      className="w-full outline-none text-sm"
                      placeholder="Select or Create Exepnse Head..."
                      value={expenseHeadSearch}
                      onChange={(e) => {
                        setExpenseHeadSearch(e.target.value);
                        setShowExpenseHeadDropdown(true);
                        // If user clears input, clear selection? Maybe not strictly needed if we rely on selection.
                        if (e.target.value === '') setExpenseForm(p => ({ ...p, expenseHeadId: '' }));
                      }}
                      onFocus={() => setShowExpenseHeadDropdown(true)}
                    />
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </div>

                  {showExpenseHeadDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredExpenseHeads.length > 0 ? (
                        filteredExpenseHeads.map(h => (
                          <div
                            key={h.id}
                            className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer flex justify-between items-center"
                            onClick={() => {
                              setExpenseHeadSearch(h.name);
                              setExpenseForm(p => ({ ...p, expenseHeadId: h.id }));
                              setShowExpenseHeadDropdown(false);
                            }}
                          >
                            <span>{h.name}</span>
                            {expenseForm.expenseHeadId === h.id && <Check className="w-4 h-4 text-blue-600" />}
                          </div>
                        ))
                      ) : (
                        <div className="p-2">
                          <p className="text-xs text-gray-500 px-2 py-1">No matches found.</p>
                        </div>
                      )}

                      {expenseHeadSearch && !filteredExpenseHeads.find(h => h.name.toLowerCase() === expenseHeadSearch.toLowerCase()) && (
                        <div
                          className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer border-t border-gray-100 font-medium flex items-center"
                          onClick={async () => {
                            setCreatingExpenseHead(true);
                            try {
                              const res = await mastersApi.createExpenseHead({ name: expenseHeadSearch, category: 'Variable' });
                              if (res.data) {
                                // Add to local list immediately to update UI without full refetch if possible, 
                                // but expenseHeads is state. We should update state.
                                setExpenseHeads(prev => [...prev, res.data]);
                                setExpenseForm(p => ({ ...p, expenseHeadId: res.data.id }));
                                setShowExpenseHeadDropdown(false);
                              }
                            } catch (e) {
                              console.error(e);
                              alert('Failed to create expense head');
                            } finally {
                              setCreatingExpenseHead(false);
                            }
                          }}
                        >
                          {creatingExpenseHead ? (
                            <><Loader2 className="w-3 h-3 animate-spin mr-2" /> Creating...</>
                          ) : (
                            <><Plus className="w-3 h-3 mr-2" /> Create "{expenseHeadSearch}"</>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Click outside listener could be added here or simple blur, but blur is tricky with click inside dropdown. 
                      For simplicity, we leave it open until selection or strict outside click implementation. 
                      To make it user friendly, we can add a backdrop or use a refined blur handler. 
                      For now, let's add a self-closing overlay if open.
                  */}
                  {showExpenseHeadDropdown && (
                    <div className="fixed inset-0 z-0" onClick={() => setShowExpenseHeadDropdown(false)}></div>
                  )}
                </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select
                  className="w-full border-gray-300 rounded-lg"
                  value={expenseForm.paymentMode}
                  onChange={(e) => setExpenseForm(p => ({ ...p, paymentMode: e.target.value }))}
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Cheque">Cheque</option>
                  <option value="UPI">UPI</option>
                </select>
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
      {/* RECALCULATE CONFIRMATION MODAL */}
      {showRecalculateConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full mb-4 mx-auto">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Recalculate Ledgers?</h3>
              <p className="text-sm text-gray-600 text-center mb-6">
                This will overwrite current supplier and customer outstanding balances based strictly on the sum of their <strong>Confirmed</strong> bills and invoices.
              </p>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mb-6">
                <p className="text-xs text-orange-800 font-medium">
                  <strong>Warning:</strong> Manual opening balances or direct adjustments in the Master data will be LOST and replaced with the system-calculated values.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRecalculateConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  disabled={recalculating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecalculateBatch}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center"
                  disabled={recalculating}
                >
                  {recalculating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Confirm & Fix'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUPPLIER ADVANCE REFUND MODAL */}
      {/* ============================================================ */}
      {showSupplierRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <RotateCcw className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-900">Supplier Advance Refund</h3>
                  <p className="text-xs text-amber-600">Record money received back from a supplier</p>
                </div>
              </div>
              <button onClick={() => setShowSupplierRefundModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6">
              {/* Form Section */}
              <div className="flex-1 space-y-4">
                {/* Accounting note */}
                <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 mb-4">
                  <strong>Accounting:</strong> DR Bank/Cash Account &nbsp;|&nbsp; CR Supplier Ledger
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-amber-500 focus:border-amber-500"
                    value={supplierRefundForm.supplierId}
                    onChange={e => handleSupplierRefundSupplierChange(e.target.value)}
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                  {supplierAdvanceData && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-amber-800">Available Advance Balance</span>
                      <span className="text-lg font-bold text-amber-700">₹{parseFloat(supplierAdvanceData.totalAdvanceBalance).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {supplierRefundForm.supplierId && supplierAdvanceData && parseFloat(supplierAdvanceData.totalAdvanceBalance) === 0 && (
                    <p className="mt-2 text-sm text-red-600 font-medium">⚠️ No advance balance available for this supplier.</p>
                  )}
                </div>

                {/* Received Into Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Received Into (Bank/Cash) <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-amber-500 focus:border-amber-500"
                    value={supplierRefundForm.accountId}
                    onChange={e => setSupplierRefundForm(f => ({ ...f, accountId: e.target.value }))}
                  >
                    <option value="">-- Select Account --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type}) — ₹{getAvailableBalance(a).toLocaleString('en-IN')}</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount (₹) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    max={supplierAdvanceData?.totalAdvanceBalance || undefined}
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-amber-500 focus:border-amber-500"
                    value={supplierRefundForm.amount}
                    onChange={e => setSupplierRefundForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>

                {/* Date & Reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full border-gray-300 rounded-lg shadow-sm"
                      value={supplierRefundForm.date}
                      onChange={e => setSupplierRefundForm(f => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference / Cheque No.</label>
                    <input
                      type="text"
                      placeholder="UTR / Cheque No."
                      className="w-full border-gray-300 rounded-lg shadow-sm"
                      value={supplierRefundForm.reference}
                      onChange={e => setSupplierRefundForm(f => ({ ...f, reference: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    placeholder="Optional note"
                    className="w-full border-gray-300 rounded-lg shadow-sm"
                    value={supplierRefundForm.remarks}
                    onChange={e => setSupplierRefundForm(f => ({ ...f, remarks: e.target.value }))}
                  />
                </div>

                {/* Error */}
                {supplierRefundError && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {supplierRefundError}
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="flex-1 border-t lg:border-t-0 lg:border-l border-gray-200 lg:pl-6 pt-6 lg:pt-0 flex flex-col">
                <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 shrink-0">Refund History</h4>
                <div className="overflow-y-auto flex-1 bg-gray-50 rounded-lg border border-gray-200">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 font-medium sticky top-0 shadow-sm z-10">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Details</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {supplierRefundsHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">No refunds found</td>
                        </tr>
                      ) : (
                        supplierRefundsHistory.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-100">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                              {new Date(tx.date).toLocaleDateString('en-IN')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 truncate max-w-[150px]" title={tx.supplierName}>
                                {tx.supplierName}
                              </div>
                              <div className="text-xs text-gray-500 truncate mt-1">
                                Into: <span className="text-gray-700">{tx.accountName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-700 whitespace-nowrap">
                              ₹{parseFloat(tx.amount).toLocaleString('en-IN')}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                onClick={async () => {
                                  await handleDeleteSupplierRefund(tx.id);
                                  loadSupplierRefundsHistory(); // Refresh list after delete
                                }}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Delete Refund"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowSupplierRefundModal(false)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                disabled={supplierRefundLoading}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  await handleSupplierRefundSubmit();
                  loadSupplierRefundsHistory(); // Refresh history upon success
                }}
                disabled={supplierRefundLoading || (supplierAdvanceData && parseFloat(supplierAdvanceData.totalAdvanceBalance) === 0)}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-medium flex items-center"
              >
                {supplierRefundLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Record Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* BANK TRANSFER MODAL */}
      {/* ============================================================ */}
      {showBankTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-purple-100 bg-purple-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ArrowLeftRight className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-purple-900">Bank / Cash Transfer</h3>
                  <p className="text-xs text-purple-600">Internal fund movement between accounts</p>
                </div>
              </div>
              <button onClick={() => setShowBankTransferModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6">
              {/* Form Section */}
              <div className="flex-1 space-y-4">
                {/* Accounting note */}
                <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 mb-4">
                  <strong>Accounting (CONTRA):</strong> DR Destination Account &nbsp;|&nbsp; CR Source Account &nbsp;—&nbsp; No P&amp;L impact
                </div>

                {/* From Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Account <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                    value={bankTransferForm.fromAccountId}
                    onChange={e => setBankTransferForm(f => ({ ...f, fromAccountId: e.target.value, toAccountId: f.toAccountId === e.target.value ? '' : f.toAccountId }))}
                  >
                    <option value="">-- Select Source Account --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type}) — Balance: ₹{getAvailableBalance(a).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>
                    ))}
                  </select>
                  {bankTransferForm.fromAccountId && (
                    <div className="mt-1 text-xs text-gray-500 pl-1">
                      Available: <span className="font-semibold text-gray-700">
                        ₹{getAvailableBalance(accounts.find(a => a.id === bankTransferForm.fromAccountId) || {}).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* To Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Account <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                    value={bankTransferForm.toAccountId}
                    onChange={e => setBankTransferForm(f => ({ ...f, toAccountId: e.target.value }))}
                  >
                    <option value="">-- Select Destination Account --</option>
                    {accounts.filter(a => a.id !== bankTransferForm.fromAccountId).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                    ))}
                  </select>
                </div>

                {/* Transfer summary arrow */}
                {bankTransferForm.fromAccountId && bankTransferForm.toAccountId && (
                  <div className="flex items-center justify-center gap-3 py-2">
                    <span className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-sm font-medium truncate max-w-[150px]">
                      {accounts.find(a => a.id === bankTransferForm.fromAccountId)?.name}
                    </span>
                    <ArrowLeftRight className="w-5 h-5 text-purple-500 shrink-0" />
                    <span className="px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-sm font-medium truncate max-w-[150px]">
                      {accounts.find(a => a.id === bankTransferForm.toAccountId)?.name}
                    </span>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Amount (₹) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                    value={bankTransferForm.amount}
                    onChange={e => setBankTransferForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>

                {/* Date & Reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full border-gray-300 rounded-lg shadow-sm"
                      value={bankTransferForm.date}
                      onChange={e => setBankTransferForm(f => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UTR / Reference No.</label>
                    <input
                      type="text"
                      placeholder="UTR / Transaction ID"
                      className="w-full border-gray-300 rounded-lg shadow-sm"
                      value={bankTransferForm.reference}
                      onChange={e => setBankTransferForm(f => ({ ...f, reference: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    placeholder="Optional note"
                    className="w-full border-gray-300 rounded-lg shadow-sm"
                    value={bankTransferForm.remarks}
                    onChange={e => setBankTransferForm(f => ({ ...f, remarks: e.target.value }))}
                  />
                </div>

                {/* Error */}
                {bankTransferError && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {bankTransferError}
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="flex-1 border-t lg:border-t-0 lg:border-l border-gray-200 lg:pl-6 pt-6 lg:pt-0 flex flex-col">
                <h4 className="text-sm font-bold text-gray-700 uppercase mb-4 shrink-0">Transfer History</h4>
                <div className="overflow-y-auto flex-1 bg-gray-50 rounded-lg border border-gray-200">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 font-medium sticky top-0 shadow-sm">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Details</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {bankTransfersHistory.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500 italic">No transfers found</td>
                        </tr>
                      ) : (
                        bankTransfersHistory.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-100">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                              {new Date(tx.date).toLocaleDateString('en-IN')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center text-xs">
                                <span className="font-medium text-red-700 truncate max-w-[100px]" title={tx.fromAccountName}>{tx.fromAccountName}</span>
                                <ArrowLeftRight className="w-3 h-3 mx-1 text-gray-400 shrink-0" />
                                <span className="font-medium text-green-700 truncate max-w-[100px]" title={tx.toAccountName}>{tx.toAccountName}</span>
                              </div>
                              {(tx.referenceCode || tx.remarks) && (
                                <div className="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={tx.referenceCode || tx.remarks}>
                                  {tx.referenceCode || tx.remarks}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                              ₹{parseFloat(tx.amount).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowBankTransferModal(false)}
                className="px-5 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                disabled={bankTransferLoading}
              >
                Close
              </button>
              <button
                onClick={handleBankTransferSubmit}
                disabled={bankTransferLoading}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium flex items-center"
              >
                {bankTransferLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Transfer Funds'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
