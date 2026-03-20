import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { IndianRupee, TrendingUp, Package, Percent, Calendar, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { reportsApi } from '../lib/api';

interface EconomicsData {
    month: string;
    totalPurchases: number;
    totalExpenses: number;
    totalCost: number;
    totalProductionKg: number;
    totalSalesRevenue: number;
    totalSalesKg: number;
    costPerKg: number;
    avgSellingPrice: number;
    profitPerKg: number;
    expenseBreakdown: { name: string; value: number }[];
}

// Inline formatters to bypass missing utils
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
    }).format(num);
};

export function MonthlyAnalysis() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<EconomicsData | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await reportsApi.getMonthlyEconomics(selectedMonth);
            if (res.data) {
                setData(res.data);
            } else {
                setError(res.error || 'Failed to load economics data');
            }
        } catch (err) {
            setError('Error connecting to server');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedMonth]);

    const StatCard = ({ title, value, subtext, icon: Icon, trend = 'neutral', highlight = false }: any) => {
        const trendColors = {
            positive: 'text-emerald-600 bg-emerald-50',
            negative: 'text-rose-600 bg-rose-50',
            neutral: 'text-slate-600 bg-slate-50'
        };

        return (
            <div className={`
        bg-white rounded-2xl p-6 border transition-all duration-300
        ${highlight ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-slate-200 shadow-sm hover:shadow-md'}
      `}>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                        <h3 className={`text-3xl font-bold ${highlight ? 'text-slate-900' : 'text-slate-800'}`}>
                            {value}
                        </h3>
                    </div>
                    <div className={`p-3 rounded-xl ${trendColors[trend as keyof typeof trendColors]}`}>
                        <Icon className="w-6 h-6" />
                    </div>
                </div>
                {subtext && (
                    <div className="flex items-center text-sm">
                        <span className="text-slate-500">{subtext}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{selectedMonth === 'all' ? 'Overall Profitability Analysis' : 'Monthly Profitability Analysis'}</h1>
                    <p className="text-slate-500 mt-1">Review your cost of production vs selling price per kg</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex gap-2 items-center bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button
                            onClick={() => {
                                const today = new Date();
                                setSelectedMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectedMonth !== 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setSelectedMonth('all')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectedMonth === 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Overall
                        </button>
                    </div>

                    {selectedMonth !== 'all' && (
                        <div className="relative">
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                            />
                            <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                    )}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {loading && !data ? (
                <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                    <p className="text-slate-500">Calculating economics...</p>
                </div>
            ) : data ? (
                <>
                    {/* Main KPI Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard
                            title="Average Selling Price"
                            value={`${formatCurrency(data.avgSellingPrice)} / kg`}
                            subtext={`Based on ${formatNumber(data.totalSalesKg)} kg sold`}
                            icon={TrendingUp}
                            trend="positive"
                        />
                        <StatCard
                            title="Cost of Production"
                            value={`${formatCurrency(data.costPerKg)} / kg`}
                            subtext={`Based on ${formatNumber(data.totalProductionKg)} kg produced`}
                            icon={Package}
                            trend="negative"
                        />
                        <StatCard
                            title="Estimated Profit"
                            value={`${formatCurrency(data.profitPerKg)} / kg`}
                            subtext={`Margin: ${data.avgSellingPrice > 0 ? ((data.profitPerKg / data.avgSellingPrice) * 100).toFixed(1) : 0}%`}
                            icon={Percent}
                            trend={data.profitPerKg >= 0 ? 'positive' : 'negative'}
                            highlight={true}
                        />
                    </div>

                    {/* Detailed Breakdown Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Cost Breakdown */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                                <ArrowRight className="w-5 h-5 text-rose-500 mr-2" />
                                Cost Breakdown
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Raw Material Purchases</p>
                                        <p className="text-xs text-slate-500 mt-1">Taxable amount mapped to this month</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-slate-900">{formatCurrency(data.totalPurchases)}</p>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Overhead Expenses</p>
                                        <p className="text-xs text-slate-500 mt-1">All expenses mapped to this month</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-slate-900">{formatCurrency(data.totalExpenses)}</p>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center p-4 bg-rose-50 rounded-xl border border-rose-100">
                                    <div>
                                        <p className="text-sm font-bold text-rose-900">Total Monthly Cost</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-rose-700">{formatCurrency(data.totalCost)}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Expense Category Breakdown Chart */}
                            {data.expenseBreakdown && data.expenseBreakdown.length > 0 && (
                                <div className="mt-8 pt-6 border-t border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                                        Expense Categories
                                    </h4>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.expenseBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis 
                                                    dataKey="name" 
                                                    tick={{ fontSize: 10, fill: '#64748B' }} 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                />
                                                <YAxis 
                                                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} 
                                                    tick={{ fontSize: 10, fill: '#64748B' }} 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                />
                                                <Tooltip 
                                                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                                                    contentStyle={{ borderRadius: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Bar dataKey="value" fill="#818CF8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-blue-900">Total FG Produced</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-blue-700">{formatNumber(data.totalProductionKg)} kg</p>
                                </div>
                            </div>
                        </div>

                        {/* Revenue Breakdown */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                                <ArrowRight className="w-5 h-5 text-emerald-500 mr-2" />
                                Revenue Breakdown
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">Total Sales Value</p>
                                        <p className="text-xs text-slate-500 mt-1">Taxable amount billed this month</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-slate-900">{formatCurrency(data.totalSalesRevenue)}</p>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                    <div>
                                        <p className="text-sm font-bold text-emerald-900">Total Revenue</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-emerald-700">{formatCurrency(data.totalSalesRevenue)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-14 p-4 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-blue-900">Total FG Sold</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-blue-700">{formatNumber(data.totalSalesKg)} kg</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
