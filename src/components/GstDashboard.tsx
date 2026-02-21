import React, { useState, useEffect, useMemo } from 'react';
import { gstApi } from '../lib/api';
import {
    TrendingUp, TrendingDown, IndianRupee, ShieldCheck,
    ShieldOff, BarChart2, Percent, AlertCircle, CheckCircle2
} from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v);

const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const MONTH_LABELS: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};
const shortMonth = (ym: string) => {
    const [, m] = ym.split('-');
    return MONTH_LABELS[m] ?? ym;
};

// Donut colours
const ITC_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiProps {
    label: string;
    value: number;
    sub?: string;
    icon: React.ReactNode;
    accent?: 'blue' | 'green' | 'red' | 'orange' | 'violet' | 'emerald';
    badge?: { text: string; color: string };
}
const ACCENT: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    green: 'bg-green-50 border-green-100 text-green-600',
    red: 'bg-red-50 border-red-100 text-red-600',
    orange: 'bg-orange-50 border-orange-100 text-orange-600',
    violet: 'bg-violet-50 border-violet-100 text-violet-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
};

function KpiCard({ label, value, sub, icon, accent = 'blue', badge }: KpiProps) {
    return (
        <div className={`rounded-xl border p-5 flex flex-col gap-3 ${ACCENT[accent]}`}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</span>
                <div className="opacity-80">{icon}</div>
            </div>
            <div className="flex items-end justify-between">
                <p className="text-2xl font-extrabold tracking-tight">₹{fmt(value)}</p>
                {badge && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                        {badge.text}
                    </span>
                )}
            </div>
            {sub && <p className="text-[11px] opacity-60">{sub}</p>}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function GstDashboard() {
    const [startDate, setStartDate] = useState(firstOfMonth());
    const [endDate, setEndDate] = useState(today());
    const [gstType, setGstType] = useState<'ALL' | 'CGST' | 'SGST' | 'IGST'>('ALL');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        gstApi.getDashboard(startDate, endDate).then(res => {
            if (res.error) { setError(res.error); setLoading(false); return; }
            setData(res.data);
            setLoading(false);
        });
    }, [startDate, endDate]);

    // Filter chart data by GST type if needed
    const chartData = useMemo(() => {
        if (!data?.monthlyTrends) return [];
        return data.monthlyTrends.map((r: any) => ({
            month: shortMonth(r.month),
            'Output GST':
                gstType === 'CGST' ? r.cgst :
                    gstType === 'SGST' ? r.sgst :
                        gstType === 'IGST' ? r.igst :
                            r.outputGst,
            'Purchase GST': r.purchaseGst,
            'Eligible ITC': r.eligibleITC,
        }));
    }, [data, gstType]);

    const itcPie = useMemo(() => {
        if (!data) return [];
        return [
            { name: 'Eligible ITC', value: data.eligibleITC || 0 },
            { name: 'Pending ITC', value: data.pendingITC || 0 },
            { name: 'Ineligible ITC', value: data.ineligibleITC || 0 },
        ].filter(d => d.value > 0);
    }, [data]);

    const outputVsITC = useMemo(() => {
        if (!data?.monthlyTrends) return [];
        return data.monthlyTrends.map((r: any) => ({
            month: shortMonth(r.month),
            'Output GST': r.outputGst,
            'Eligible ITC': r.eligibleITC,
        }));
    }, [data]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
        </div>
    );

    if (error) return (
        <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p>{error}</p>
        </div>
    );

    const isPayable = (data?.netGstPayable ?? 0) >= 0;

    return (
        <div className="space-y-8">
            {/* ── Header + Filters ─────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">GST Dashboard</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Compliance overview — read-only, based on confirmed transactions</p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                    {/* Date Range */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                        <input
                            type="date" value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="text-sm text-slate-700 outline-none bg-transparent"
                        />
                        <span className="text-slate-400 text-sm">→</span>
                        <input
                            type="date" value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="text-sm text-slate-700 outline-none bg-transparent"
                        />
                    </div>

                    {/* GST Type Filter */}
                    <select
                        value={gstType}
                        onChange={e => setGstType(e.target.value as any)}
                        className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm outline-none text-slate-700"
                    >
                        <option value="ALL">All GST Types</option>
                        <option value="CGST">CGST Only</option>
                        <option value="SGST">SGST Only</option>
                        <option value="IGST">IGST Only</option>
                    </select>
                </div>
            </div>

            {/* ── Section 1: Top KPI Cards ─────────────────────────────────── */}
            <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">GST Summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        label="Total Sales"
                        value={data?.totalSales ?? 0}
                        icon={<TrendingUp className="w-5 h-5" />}
                        accent="blue"
                        sub="Confirmed invoices in period"
                    />
                    <KpiCard
                        label="Output GST"
                        value={data?.outputGst ?? 0}
                        icon={<IndianRupee className="w-5 h-5" />}
                        accent="violet"
                        sub={`CGST ₹${fmt(data?.outputCgst ?? 0)} · SGST ₹${fmt(data?.outputSgst ?? 0)} · IGST ₹${fmt(data?.outputIgst ?? 0)}`}
                    />
                    <KpiCard
                        label="Gross Purchase GST"
                        value={data?.grossPurchaseGst ?? 0}
                        icon={<BarChart2 className="w-5 h-5" />}
                        accent="orange"
                        sub="All purchase bills in period"
                    />
                    <KpiCard
                        label="Eligible ITC"
                        value={data?.eligibleITC ?? 0}
                        icon={<ShieldCheck className="w-5 h-5" />}
                        accent="green"
                        sub="GST from confirmed purchase bills"
                    />
                    <KpiCard
                        label="Ineligible Input GST"
                        value={data?.ineligibleITC ?? 0}
                        icon={<ShieldOff className="w-5 h-5" />}
                        accent="red"
                        sub="Draft / non-confirmed bills"
                    />
                    <KpiCard
                        label="Net GST Payable"
                        value={Math.abs(data?.netGstPayable ?? 0)}
                        icon={<Percent className="w-5 h-5" />}
                        accent={isPayable ? 'red' : 'green'}
                        sub="Output GST − Eligible ITC"
                        badge={{
                            text: isPayable ? 'Payable' : 'Refund',
                            color: isPayable ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
                        }}
                    />
                    <div className={`col-span-1 sm:col-span-2 rounded-xl border p-5 flex items-center gap-4 ${isPayable ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        {isPayable
                            ? <TrendingUp className="w-10 h-10 text-red-500 shrink-0" />
                            : <CheckCircle2 className="w-10 h-10 text-green-500 shrink-0" />}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-60">GST Status</p>
                            <p className={`text-3xl font-extrabold mt-1 ${isPayable ? 'text-red-600' : 'text-green-600'}`}>
                                {isPayable ? 'GST Payable' : 'GST Refund'}
                            </p>
                            <p className="text-sm opacity-70 mt-1">
                                {isPayable
                                    ? `You owe ₹${fmt(data?.netGstPayable ?? 0)} to the government`
                                    : `You have a refund of ₹${fmt(Math.abs(data?.netGstPayable ?? 0))}`}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Section 2: ITC Summary Cards ─────────────────────────────── */}
            <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Input Tax Credit (ITC) Summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        label="Total Purchase GST"
                        value={data?.grossPurchaseGst ?? 0}
                        icon={<BarChart2 className="w-5 h-5" />}
                        accent="orange"
                    />
                    <KpiCard
                        label="Eligible ITC"
                        value={data?.eligibleITC ?? 0}
                        icon={<ShieldCheck className="w-5 h-5" />}
                        accent="green"
                    />
                    <KpiCard
                        label="ITC Pending"
                        value={data?.pendingITC ?? 0}
                        icon={<AlertCircle className="w-5 h-5" />}
                        accent="orange"
                        sub="Unreconciled purchase GST"
                    />
                    <KpiCard
                        label="ITC Ineligible"
                        value={data?.ineligibleITC ?? 0}
                        icon={<ShieldOff className="w-5 h-5" />}
                        accent="red"
                    />
                </div>

                {/* Net ITC Available highlight */}
                <div className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-5 text-white flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest opacity-80">Net ITC Available for Set-off</p>
                        <p className="text-3xl font-extrabold mt-1">₹{fmt(data?.eligibleITC ?? 0)}</p>
                    </div>
                    <CheckCircle2 className="w-12 h-12 opacity-40" />
                </div>
            </section>

            {/* ── Section 3: Charts ────────────────────────────────────────── */}
            <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">GST Trends & Analysis</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Monthly Output GST Trend */}
                    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">
                            Monthly Output GST Trend
                            {gstType !== 'ALL' && <span className="ml-2 text-xs font-normal text-blue-600">({gstType})</span>}
                        </h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => `₹${fmt(v)}`} />
                                <Line type="monotone" dataKey="Output GST" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Monthly Input GST Trend */}
                    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Monthly Input GST Trend (Purchase GST)</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => `₹${fmt(v)}`} />
                                <Line type="monotone" dataKey="Purchase GST" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Output GST vs Eligible ITC — Bar */}
                    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Output GST vs Eligible ITC</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={outputVsITC} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => `₹${fmt(v)}`} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Output GST" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Eligible ITC" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ITC Breakdown — Donut */}
                    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">ITC Breakdown</h3>
                        {itcPie.length === 0 ? (
                            <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">No ITC data for period</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={itcPie} cx="50%" cy="50%"
                                        innerRadius={60} outerRadius={88}
                                        paddingAngle={3} dataKey="value"
                                    >
                                        {itcPie.map((_, i) => (
                                            <Cell key={i} fill={ITC_COLORS[i % ITC_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => `₹${fmt(v)}`} />
                                    <Legend
                                        wrapperStyle={{ fontSize: 11 }}
                                        formatter={(value, entry: any) => `${value} — ₹${fmt(entry.payload.value)}`}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
