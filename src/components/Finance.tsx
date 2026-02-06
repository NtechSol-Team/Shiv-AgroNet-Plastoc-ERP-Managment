
import React, { useState, useEffect } from 'react';
import { financeApi, accountsApi, mastersApi } from '../lib/api';
import { Plus, Search, Filter, ArrowUpRight, ArrowDownLeft, Wallet, Building2, User, CheckCircle2 } from 'lucide-react';

export function Finance() {
    const [view, setView] = useState<'dashboard' | 'transactions' | 'entities'>('dashboard');
    const [transactions, setTransactions] = useState<any[]>([]);
    const [entities, setEntities] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

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

    const [partyStats, setPartyStats] = useState<{ totalTaken: number, totalPrincipalRepaid: number, totalInterestPaid: number } | null>(null);

    useEffect(() => {
        loadData();
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

    const loadData = async () => {
        setLoading(true);
        try {
            const [txRes, entRes, accRes] = await Promise.all([
                financeApi.getTransactions(),
                financeApi.getEntities(),
                mastersApi.getAccounts()
            ]);
            setTransactions(txRes.data || []);
            setEntities(entRes.data || []);
            setAccounts(accRes.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
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
                loadData();
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
                loadData();
                setEntityForm({ name: '', type: 'Lender', contact: '', email: '' });
            }
        } catch (error) {
            alert('Failed to create entity');
        }
    };

    // Derived Stats
    const totalLoansTaken = transactions.filter((t: any) => t.transactionType === 'LOAN_TAKEN').reduce((sum, t: any) => sum + parseFloat(t.amount), 0);
    const totalLoansGiven = transactions.filter((t: any) => t.transactionType === 'LOAN_GIVEN').reduce((sum, t: any) => sum + parseFloat(t.amount), 0);
    const totalInvestments = transactions.filter((t: any) => t.transactionType === 'INVESTMENT_RECEIVED').reduce((sum, t: any) => sum + parseFloat(t.amount), 0);


    return (
        <div className="space-y-6">
            {/* ... Header and Content Views omitted for brevity, logic remains same ... */}
            {/* Header Actions */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex gap-2">
                    <button
                        onClick={() => setView('dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setView('transactions')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'transactions' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Transactions
                    </button>
                    <button
                        onClick={() => setView('entities')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'entities' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        Entities (Lenders/Investors)
                    </button>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowEntityModal(true)}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <User className="w-4 h-4" />
                        Add Entity
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Transaction
                    </button>
                </div>
            </div>

            {/* Content */}
            {view === 'dashboard' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-slate-500">Total Loans Taken</h3>
                            <div className="p-2 bg-red-50 rounded-lg">
                                <ArrowDownLeft className="w-5 h-5 text-red-600" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">₹{totalLoansTaken.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 mt-1">Outstanding Liability</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-slate-500">Total Investments</h3>
                            <div className="p-2 bg-green-50 rounded-lg">
                                <Wallet className="w-5 h-5 text-green-600" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">₹{totalInvestments.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 mt-1">Capital Introduced</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-slate-500">Loans Given</h3>
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <ArrowUpRight className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">₹{totalLoansGiven.toLocaleString()}</p>
                        <p className="text-xs text-slate-500 mt-1">Assets / Receivable</p>
                    </div>
                </div>
            )}

            {view === 'transactions' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Party</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Account</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {transactions.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-slate-600">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 font-medium text-slate-900">{tx.transactionType.replace(/_/g, ' ')}</td>
                                    <td className="px-6 py-4 text-slate-600">{tx.party?.name || '-'}</td>
                                    <td className="px-6 py-4 font-medium text-slate-900">₹{parseFloat(tx.amount).toLocaleString()}</td>
                                    <td className="px-6 py-4 text-slate-600">{tx.account?.name || 'Cash'}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">Active</span>
                                    </td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No transactions found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {view === 'entities' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Contact</th>
                                <th className="px-6 py-4">Email</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {entities.map((e: any) => (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium text-slate-900">{e.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${e.type === 'Lender' ? 'bg-red-50 text-red-700' :
                                            e.type === 'Investor' ? 'bg-green-50 text-green-700' :
                                                'bg-blue-50 text-blue-700'
                                            }`}>
                                            {e.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{e.contact}</td>
                                    <td className="px-6 py-4 text-slate-600">{e.email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Transaction Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-semibold text-lg text-slate-900">New Financial Transaction</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                        value={formData.transactionDate}
                                        onChange={e => setFormData({ ...formData, transactionDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Party (Lender/Investor)</label>
                                <select
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    value={formData.partyId}
                                    onChange={e => setFormData({ ...formData, partyId: e.target.value })}
                                >
                                    <option value="">Select Party</option>
                                    {entities.map((e: any) => (
                                        <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Party Summary Stats (Only for Repayment) */}
                            {formData.transactionType === 'REPAYMENT' && formData.partyId && partyStats && (
                                <div className="grid grid-cols-3 gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="text-center">
                                        <p className="text-xs text-blue-600 mb-0.5">Total Taken</p>
                                        <p className="font-bold text-slate-800 text-sm">₹{partyStats.totalTaken.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center border-l border-blue-200">
                                        <p className="text-xs text-blue-600 mb-0.5">Principal Paid</p>
                                        <p className="font-bold text-green-700 text-sm">₹{partyStats.totalPrincipalRepaid.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center border-l border-blue-200">
                                        <p className="text-xs text-blue-600 mb-0.5">Interest Paid</p>
                                        <p className="font-bold text-orange-700 text-sm">₹{partyStats.totalInterestPaid.toLocaleString()}</p>
                                    </div>
                                    <div className="col-span-3 mt-2 pt-2 border-t border-blue-200 flex justify-between items-center px-2">
                                        <span className="text-xs font-medium text-slate-600">Net Outstanding:</span>
                                        <span className="font-bold text-blue-900">₹{(partyStats.totalTaken - partyStats.totalPrincipalRepaid).toLocaleString()}</span>
                                    </div>
                                </div>
                            )}

                            {/* Conditional Amount Inputs */}
                            {formData.transactionType === 'REPAYMENT' ? (
                                <div className="space-y-3 p-3 bg-red-50 rounded-lg border border-red-100">
                                    <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Repayment Breakdown</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Principal Amount</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                                placeholder="0.00"
                                                value={formData.principalAmount}
                                                onChange={e => setFormData({ ...formData, principalAmount: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Interest Expense</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                                placeholder="0.00"
                                                value={formData.interestAmount}
                                                onChange={e => setFormData({ ...formData, interestAmount: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-red-100">
                                        <span className="text-xs font-medium text-red-700">Total Payment:</span>
                                        <span className="font-bold text-red-900">
                                            ₹{((parseFloat(formData.principalAmount) || 0) + (parseFloat(formData.interestAmount) || 0)).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            placeholder="0.00"
                                            value={formData.amount}
                                            onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">{getAccountLabel(formData.transactionType)}</label>
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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

                            {/* Account Select for Repayment (Moved since structure differs) */}
                            {formData.transactionType === 'REPAYMENT' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">{getAccountLabel(formData.transactionType)}</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
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



                            {formData.transactionType !== 'REPAYMENT' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
                                        <textarea
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            rows={2}
                                            value={formData.remarks}
                                            onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                        ></textarea>
                                    </div>

                                    {/* Optional Fields */}
                                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Interest Rate (%)</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                                placeholder="Optional"
                                                value={formData.interestRate}
                                                onChange={e => setFormData({ ...formData, interestRate: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Tenure (Months)</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                                placeholder="Optional"
                                                value={formData.tenure}
                                                onChange={e => setFormData({ ...formData, tenure: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                        </div>
                        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
                            <button
                                onClick={handleCreateTransaction}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
                            >
                                Save Transaction
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Entity Modal */}
            {showEntityModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-semibold text-lg text-slate-900">Add New Entity</h3>
                            <button onClick={() => setShowEntityModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Entity Name</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    value={entityForm.name}
                                    onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                                <select
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    value={entityForm.type}
                                    onChange={e => setEntityForm({ ...entityForm, type: e.target.value })}
                                >
                                    <option value="Lender">Lender</option>
                                    <option value="Borrower">Borrower</option>
                                    <option value="Investor">Investor</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Contact</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    value={entityForm.contact}
                                    onChange={e => setEntityForm({ ...entityForm, contact: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                    value={entityForm.email}
                                    onChange={e => setEntityForm({ ...entityForm, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
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
        </div>
    );
}
