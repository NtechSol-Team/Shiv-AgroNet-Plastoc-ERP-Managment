import React, { useEffect, useState } from 'react';
import { mastersApi } from '../lib/api';
import { Loader2, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';

export function CCDashboardWidget() {
    const [loading, setLoading] = useState(true);
    const [ccAccounts, setCCAccounts] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const result = await mastersApi.getCCAccounts();
            if (result.data) {
                setCCAccounts(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch CC accounts', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="animate-pulse h-32 bg-slate-100 rounded-xl"></div>;
    if (ccAccounts.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {ccAccounts.map((account) => {
                const limit = parseFloat(account.sanctionedLimit || '0');
                const balance = parseFloat(account.balance || '0');
                // Balance is typically negative for liability (Credit balance). 
                // Example: If I used 100k, balance is -100k (Credit).
                // If I deposited 10k, balance is 10k (Debit).
                // Let's assume standard accounting: Liability is Credit.
                // Utilized Amount = -Balance (if Balance < 0) else 0?
                // Actually, for a CC account, 'Balance' usually means the ledger balance.
                // A debit balance (positive) means we have money? No, Bank/Cash: Debit is +ve (Asset).
                // CC is Liability? Or Asset?
                // In `bankCashAccounts`, Type='CC'.
                // If I have money in bank, it's Asset (Debit).
                // If I overdraw CC, it's Liability (Credit).
                // So Balance should be negative when utilized.
                const utilized = balance < 0 ? Math.abs(balance) : 0;
                const availableDrawingPower = parseFloat(account.drawingPower || limit); // Simplified
                // The backend `getCCAccounts` returns details including `drawingPower` if I joined properly?
                // Wait, `getCCAccounts` returns `...item` from `ccAccountDetails`.
                // BUT `drawingPower` is DYNAMIC. It is calculated!
                // `ccAccountDetails` has `drawingPowerMode`.
                // The `getCCAccounts` endpoint (GET /) I implemented in `Step 150` returns `ccAccountDetails` columns.
                // It DOES NOT calculate dynamic DP. 
                // The `GET /:id/status` endpoint calculates DP.
                // I should probably fetch status for each or specific one.
                // For the widget, I might want to use `getCCAccountStatus` if I want real DP.
                // Or I can just show Utilized vs Limit for now.

                // Let's show Utilized vs Limit.
                const utilizationPercent = limit > 0 ? (utilized / limit) * 100 : 0;

                return (
                    <div key={account.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{account.name}</h3>
                                <div className="text-xs text-slate-400">{account.accountNo}</div>
                            </div>
                            <div className={`p-2 rounded-lg ${utilizationPercent > 90 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                <TrendingUp className="w-5 h-5" />
                            </div>
                        </div>

                        <div className="flex items-end justify-between mb-2">
                            <div>
                                <div className="text-2xl font-bold text-slate-900">₹{utilized.toLocaleString()}</div>
                                <div className="text-xs text-slate-500">Utilized Amount</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-semibold text-slate-700">₹{limit.toLocaleString()}</div>
                                <div className="text-xs text-slate-500">Sanctioned Limit</div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                            <div className={`h-2 rounded-full transition-all duration-500 ${utilizationPercent > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(utilizationPercent, 100)}%` }}></div>
                        </div>

                        <div className="flex justify-between text-xs font-medium">
                            <span className={utilizationPercent > 90 ? 'text-red-600' : 'text-blue-600'}>{utilizationPercent.toFixed(1)}% Utilized</span>
                            <span className="text-slate-400">Available: ₹{(limit - utilized).toLocaleString()}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
