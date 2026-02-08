
import React, { useState, useEffect } from 'react';
import { financeApi, accountsApi, mastersApi } from '../lib/api';
import { Plus, Search, Filter, ArrowUpRight, ArrowDownLeft, Wallet, Building2, User, CheckCircle2, X } from 'lucide-react';

export function Finance() {
    const [view, setView] = useState<'dashboard' | 'transactions' | 'entities'>('dashboard');
    const [transactions, setTransactions] = useState<any[]>([]);
    const [entities, setEntities] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Dashboard Stats
    const [dashboardStats, setDashboardStats] = useState({
        totalLoansTaken: 0,
        totalLoansGiven: 0,
        totalInvestments: 0
    });

    // Form State
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        transactionType: 'LOAN_TAKEN',
        partyId: '',
        amount: '',
        principalAmount: '', // New
        interestAmount: '',  // New
        accountId: '',
        transactionDate: new Date().toISOString().split('T')[0],
        remarks: '',
        paymentMode: 'Bank',
        interestRate: '',
        tenure: ''
    });

    const [showEntityModal, setShowEntityModal] = useState(false);
    const [entityForm, setEntityForm] = useState({
        name: '',
        type: 'Lender', // Lender, Borrower, Investor
        contact: '',
        email: ''
    });

    const [selectedEntity, setSelectedEntity] = useState<any | null>(null);

    const [partyStats, setPartyStats] = useState<{ totalTaken: number, totalPrincipalRepaid: number, totalInterestPaid: number } | null>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    // Fetch Stats when Party changes in Repayment mode
    useEffect(() => {
        if (formData.transactionType === 'REPAYMENT' && formData.partyId) {
            financeApi.getPartyStats(formData.partyId).then(res => {
                if (res.data) setPartyStats(res.data);
            });
        } else {
            setPartyStats(null);
        }
    }, [formData.partyId, formData.transactionType]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [statsRes, entRes, accRes, txRes] = await Promise.all([
                financeApi.getDashboardStats(),
                financeApi.getEntities(),
                mastersApi.getAccounts(),
                financeApi.getTransactions(1, 20)
            ]);

            if (statsRes.data) setDashboardStats(statsRes.data);
            setEntities(entRes.data || []);
            setAccounts(accRes.data || []);

            if (txRes.data && txRes.data.data) {
                setTransactions(txRes.data.data);
                setHasMore(txRes.data.meta.page < txRes.data.meta.totalPages);
                setPage(1);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadMoreTransactions = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const res = await financeApi.getTransactions(nextPage, 20);
            if (res.data && res.data.data) {
                setTransactions(prev => [...prev, ...res.data.data]);
                setHasMore(res.data.meta.page < res.data.meta.totalPages);
                setPage(nextPage);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleCreateTransaction = async () => {
        try {
            // Auto-calculate amount for Repayment
            const finalData = { ...formData };
            if (formData.transactionType === 'REPAYMENT') {
                const principal = parseFloat(formData.principalAmount) || 0;
                const interest = parseFloat(formData.interestAmount) || 0;
                finalData.amount = (principal + interest).toString();
            }

            const res = await financeApi.createTransaction(finalData);
            if (res.data) {
                setShowModal(false);
                loadInitialData(); // Reload everything to update stats and list
                setFormData({
                    transactionType: 'LOAN_TAKEN',
                    partyId: '',
                    amount: '',
                    principalAmount: '',
                    interestAmount: '',
                    accountId: '',
                    transactionDate: new Date().toISOString().split('T')[0],
                    remarks: '',
                    paymentMode: 'Bank',
                    interestRate: '',
                    tenure: ''
                });
            }
        } catch (error) {
            alert('Failed to create transaction');
        }
    };

    // Helper to determine Account Label
    const getAccountLabel = (type: string) => {
        switch (type) {
            case 'LOAN_TAKEN': return 'Deposit To Account';
            case 'INVESTMENT_RECEIVED': return 'Deposit To Account';
            case 'BORROWING': return 'Deposit To Account';
            case 'LOAN_GIVEN': return 'Pay From Account';
            case 'INVESTMENT_MADE': return 'Pay From Account';
            case 'REPAYMENT': return 'Pay From Account';
            default: return 'Bank / Cash Account';
        }
    };

    const handleCreateEntity = async () => {
        try {
            const res = await financeApi.createEntity(entityForm);
            if (res.data) {
                setShowEntityModal(false);
                loadInitialData();
                setEntityForm({ name: '', type: 'Lender', contact: '', email: '' });
            }
        } catch (error) {
            alert('Failed to create entity');
        }
    };

    // Stats are now from backend
    const { totalLoansTaken, totalLoansGiven, totalInvestments } = dashboardStats;


    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financial Overview</h1>
                    <p className="text-slate-500 mt-1">Manage loans, investments, and corporate finance.</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setShowEntityModal(true)}
                        className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm"
                    >
                        <User className="w-4 h-4" />
                        <span>Add Entity</span>
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 hover:shadow-md transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span>New Transaction</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setView('dashboard')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${view === 'dashboard'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => setView('transactions')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${view === 'transactions'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        Transactions History
                    </button>
                    <button
                        onClick={() => setView('entities')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${view === 'entities'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        Entities & Partners
                    </button>
                </nav>
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <>
                        {view === 'dashboard' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Card 1: Liability */}
                                <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <ArrowDownLeft className="w-24 h-24 text-red-600 transform rotate-12" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-red-50 rounded-lg">
                                                <ArrowDownLeft className="w-5 h-5 text-red-600" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Total Loans Taken</h3>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-slate-900">₹{totalLoansTaken.toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-2">Current Outstanding Liabilities</p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-red-600"></div>
                                </div>

                                {/* Card 2: Investments */}
                                <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Wallet className="w-24 h-24 text-green-600 transform -rotate-12" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-green-50 rounded-lg">
                                                <Wallet className="w-5 h-5 text-green-600" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Total Investments</h3>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-slate-900">₹{totalInvestments.toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-2">Capital Injection (Equity/Owner)</p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-600"></div>
                                </div>

                                {/* Card 3: Assets */}
                                <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <ArrowUpRight className="w-24 h-24 text-blue-600 transform rotate-6" />
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-blue-50 rounded-lg">
                                                <ArrowUpRight className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Loans Given</h3>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-slate-900">₹{totalLoansGiven.toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-2">Assets & Receivables</p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600"></div>
                                </div>
                            </div>
                        )}

                        {view === 'transactions' && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                                                <th className="px-6 py-4">Date</th>
                                                <th className="px-6 py-4">Type</th>
                                                <th className="px-6 py-4">Party / Entity</th>
                                                <th className="px-6 py-4">Description</th>
                                                <th className="px-6 py-4 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {transactions.map((tx: any) => (
                                                <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap font-medium">
                                                        {new Date(tx.transactionDate).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${['LOAN_TAKEN', 'INVESTMENT_RECEIVED', 'BORROWING'].includes(tx.transactionType)
                                                            ? 'bg-green-50 text-green-700 border-green-100'
                                                            : 'bg-red-50 text-red-700 border-red-100'
                                                            }`}>
                                                            {tx.transactionType.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-slate-900">{tx.party?.name || '-'}</div>
                                                        <div className="text-xs text-slate-500">{tx.account?.name || 'Cash Account'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={tx.remarks}>
                                                        {tx.remarks || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                                                        ₹{parseFloat(tx.amount).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                            {transactions.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                                                        <div className="flex flex-col items-center justify-center">
                                                            <Filter className="w-8 h-8 mb-2 opacity-50" />
                                                            <p>No transactions recorded yet.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {hasMore && (
                                    <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50">
                                        <button
                                            onClick={loadMoreTransactions}
                                            disabled={loadingMore}
                                            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {loadingMore ? (
                                                <>
                                                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 rounded-full border-t-transparent"></div>
                                                    Loading...
                                                </>
                                            ) : (
                                                'Load More Transactions'
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {view === 'entities' && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                                            <th className="px-6 py-4">Entity Name</th>
                                            <th className="px-6 py-4">Role / Type</th>
                                            <th className="px-6 py-4">Contact Info</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {entities.map((e: any) => (
                                            <tr
                                                key={e.id}
                                                className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                                onClick={() => setSelectedEntity(e)}
                                            >
                                                <td className="px-6 py-4 font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                    {e.name}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${e.type === 'Lender' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                        e.type === 'Investor' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                            'bg-gray-50 text-gray-700 border-gray-100'
                                                        }`}>
                                                        {e.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    <div className="flex flex-col">
                                                        <span>{e.contact || '-'}</span>
                                                        <span className="text-xs text-slate-400">{e.email}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {entities.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">
                                                    No entities found. Add lenders or investors to get started.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Transaction Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900">New Financial Transaction</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Record a loan, repayment, or investment</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Section 1: Transaction Basics */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transaction Type</label>
                                    <select
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                        value={formData.transactionType}
                                        onChange={e => setFormData({ ...formData, transactionType: e.target.value })}
                                    >
                                        <option value="LOAN_TAKEN">Loan Taken (Liability)</option>
                                        <option value="LOAN_GIVEN">Loan Given (Asset)</option>
                                        <option value="INVESTMENT_RECEIVED">Investment Received</option>
                                        <option value="INVESTMENT_MADE">Investment Made</option>
                                        <option value="BORROWING">Borrowed Money</option>
                                        <option value="REPAYMENT">Repayment</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.transactionDate}
                                        onChange={e => setFormData({ ...formData, transactionDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Section 2: Party Details */}
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                                <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Party Selection</label>
                                <select
                                    className="w-full p-2.5 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.partyId}
                                    onChange={e => setFormData({ ...formData, partyId: e.target.value })}
                                >
                                    <option value="">Select Party (Lender / Investor)</option>
                                    {entities.map((e: any) => (
                                        <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                                    ))}
                                </select>

                                {/* Repayment Stats Preview */}
                                {formData.transactionType === 'REPAYMENT' && formData.partyId && partyStats && (
                                    <div className="mt-4 bg-white rounded-lg border border-blue-200 p-3 shadow-sm">
                                        <div className="flex justify-between items-center text-sm mb-2 pb-2 border-b border-blue-50">
                                            <span className="text-slate-500">Net Outstanding</span>
                                            <span className="font-bold text-blue-700">₹{(partyStats.totalTaken - partyStats.totalPrincipalRepaid).toLocaleString()}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                            <div className="text-center">
                                                <div className="text-slate-400">Token</div>
                                                <div className="font-medium">₹{partyStats.totalTaken.toLocaleString()}</div>
                                            </div>
                                            <div className="text-center border-l border-slate-100">
                                                <div className="text-slate-400">Paid (P)</div>
                                                <div className="font-medium text-green-600">₹{partyStats.totalPrincipalRepaid.toLocaleString()}</div>
                                            </div>
                                            <div className="text-center border-l border-slate-100">
                                                <div className="text-slate-400">Paid (I)</div>
                                                <div className="font-medium text-orange-600">₹{partyStats.totalInterestPaid.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Financials */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Financial Details</label>
                                {formData.transactionType === 'REPAYMENT' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Principal Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full pl-7 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="0.00"
                                                    value={formData.principalAmount}
                                                    onChange={e => setFormData({ ...formData, principalAmount: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Interest Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full pl-7 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="0.00"
                                                    value={formData.interestAmount}
                                                    onChange={e => setFormData({ ...formData, interestAmount: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-1">
                                            <label className="block text-xs text-slate-500 mb-1">Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    className="w-full pl-7 p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="0.00"
                                                    value={formData.amount}
                                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs text-slate-500 mb-1">{getAccountLabel(formData.transactionType)}</label>
                                            <select
                                                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.accountId}
                                                onChange={e => setFormData({ ...formData, accountId: e.target.value })}
                                            >
                                                <option value="">Select Account</option>
                                                {accounts.map((a: any) => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Repayment Account Selector (Extra Layout Case) */}
                                {formData.transactionType === 'REPAYMENT' && (
                                    <div className="mt-4">
                                        <label className="block text-xs text-slate-500 mb-1">{getAccountLabel(formData.transactionType)}</label>
                                        <select
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={formData.accountId}
                                            onChange={e => setFormData({ ...formData, accountId: e.target.value })}
                                        >
                                            <option value="">Select Account</option>
                                            {accounts.map((a: any) => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* Section 4: Optional Details */}
                            {formData.transactionType !== 'REPAYMENT' && (
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Additional Terms</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Interest Rate (%)</label>
                                                <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="Optional" value={formData.interestRate} onChange={e => setFormData({ ...formData, interestRate: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Tenure (Months)</label>
                                                <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm" placeholder="Optional" value={formData.tenure} onChange={e => setFormData({ ...formData, tenure: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Remarks / Notes</label>
                                        <textarea
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            rows={2}
                                            value={formData.remarks}
                                            onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                            <button
                                onClick={handleCreateTransaction}
                                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-md transform active:scale-95 transition-all"
                            >
                                Confirm Transaction
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Entity Modal */}
            {showEntityModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-lg text-slate-900">Add New Entity</h3>
                            <button onClick={() => setShowEntityModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Entity Name</label>
                                <input
                                    type="text"
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Company or Individual Name"
                                    value={entityForm.name}
                                    onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Entity Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['Lender', 'Borrower', 'Investor'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setEntityForm({ ...entityForm, type })}
                                            className={`py-2 text-xs font-medium rounded-lg border transition-all ${entityForm.type === type
                                                ? 'bg-blue-50 border-blue-500 text-blue-700'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Contact</label>
                                    <input
                                        type="text"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                        value={entityForm.contact}
                                        onChange={e => setEntityForm({ ...entityForm, contact: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                                    <input
                                        type="email"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                        value={entityForm.email}
                                        onChange={e => setEntityForm({ ...entityForm, email: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowEntityModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                            <button
                                onClick={handleCreateEntity}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
                            >
                                Save Entity
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Repayment History Modal */}
            {selectedEntity && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900">{selectedEntity.name}</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Repayment History</p>
                            </div>
                            <button onClick={() => setSelectedEntity(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-0 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 font-semibold sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3 border-b border-slate-200">Date</th>
                                        <th className="px-6 py-3 border-b border-slate-200">Bank Account</th>
                                        <th className="px-6 py-3 border-b border-slate-200 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {transactions
                                        .filter(t => t.partyId === selectedEntity.id && t.transactionType === 'REPAYMENT')
                                        .map(tx => (
                                            <tr key={tx.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                                                    {new Date(tx.transactionDate).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-3 text-slate-600">
                                                    {tx.account?.name || 'Cash'}
                                                </td>
                                                <td className="px-6 py-3 text-right font-medium text-slate-900">
                                                    ₹{parseFloat(tx.amount).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    {transactions.filter(t => t.partyId === selectedEntity.id && t.transactionType === 'REPAYMENT').length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-8 text-center text-slate-500 italic">
                                                No repayment history found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setSelectedEntity(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
