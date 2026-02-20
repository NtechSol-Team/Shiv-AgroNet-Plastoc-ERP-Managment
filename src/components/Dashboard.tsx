/**
 * Dashboard Component
 * 
 * Displays key performance indicators (KPIs) and alerts for the ERP system.
 * Fetches data from the backend APIs and renders various metric cards.
 */

import React, { useState, useEffect } from 'react';
import {
  Package, TrendingUp, AlertTriangle, DollarSign, Boxes, Loader2,
  ArrowDownRight, CreditCard, Wallet,
  Activity, History, ShoppingCart, Target, Scale,
  Calendar, ChevronDown, Filter
} from 'lucide-react';
import { dashboardApi } from '../lib/api';
import { CCDashboardWidget } from './CCDashboardWidget';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface KpiData {
  inventory: {
    rawMaterialStock: string;
    rawMaterialItems: number;
    lowStockItems: number;
    finishedGoodsStock: string;
    finishedProductItems: number;
    stockInProcess: number;
    stockInBell: number;
    rawStockPurchased: number;
    tradingStockPurchased: number;
    pendingRawStock: number;
    totalWeightLoss: number;
    avgProductionLoss: number;
  };
  production: {
    inProgress: number;
    completed: number;
    totalBatches: number;
    totalOutput: string;
    exceededLoss: number;
  };
  sales: {
    total: string;
    received: string;
    pendingReceivables: string;
    gstCollected: string;
    invoiceCount: number;
  };
  purchases: {
    total: string;
    paid: string;
    pendingPayables: string;
    billCount: number;
  };
  accounts: {
    bankBalance: string;
    cashBalance: string;
    totalBalance: string;
  };
  ledgers: {
    customerOutstanding: string;
    supplierOutstanding: string;
    netPosition: string;
  };
  profitability: {
    today: { sales: number; grossProfit: number; netProfit: number; margin: number };
    monthly: { sales: number; grossProfit: number; netProfit: number; margin: number };
  };
  assets: {
    finishedGoodsValue: number;
    baleValue: number;
  };
};



// ============================================================
// COMPONENT
// ============================================================

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [profitLoading, setProfitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [rangeType, setRangeType] = useState<string>('monthly');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [dynamicProfit, setDynamicProfit] = useState<any>(null);
  const [machineEfficiency, setMachineEfficiency] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpisResult, efficiencyResult] = await Promise.all([
        dashboardApi.getKpis(),
        dashboardApi.getMachineEfficiency(),
      ]);
      if (kpisResult.data) {
        setKpis(kpisResult.data);
        setDynamicProfit(kpisResult.data.profitability.monthly);
      }
      if (efficiencyResult.data) setMachineEfficiency(efficiencyResult.data);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError('Failed to load dashboard data');
    }
    setLoading(false);
  };

  const handleRangeChange = async (type: string) => {
    setRangeType(type);
    if (type === 'today' && kpis) {
      setDynamicProfit(kpis.profitability.today);
      return;
    }
    if (type === 'monthly' && kpis) {
      setDynamicProfit(kpis.profitability.monthly);
      return;
    }
    if (type === 'custom') return; // Wait for date selection

    // Calculate dates for presets
    const end = new Date();
    const start = new Date();
    if (type === 'last3m') start.setMonth(start.getMonth() - 3);
    else if (type === 'last6m') start.setMonth(start.getMonth() - 6);
    else if (type === 'last1y') start.setFullYear(start.getFullYear() - 1);

    fetchDynamicProfit(start.toISOString(), end.toISOString());
  };

  const fetchDynamicProfit = async (start: string, end: string) => {
    setProfitLoading(true);
    try {
      const result = await dashboardApi.getProfitability(start, end);
      if (result.data) setDynamicProfit(result.data);
    } catch (err) {
      console.error('Failed to fetch profit:', err);
    }
    setProfitLoading(false);
  };

  const formatQuantity = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0 kg' : `${num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <span className="text-slate-500 font-medium animate-pulse">Initializing enterprise data...</span>
      </div>
    );
  }


  return (
    <div className="p-6 space-y-8 animate-in bg-slate-50/50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Enterprise Dashboard</h1>
          <p className="text-slate-500 mt-1 font-medium flex items-center">
            <Activity className="w-4 h-4 mr-2 text-indigo-500" />
            Operational overview for Shiv AgroNet Plastoc
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Advanced Range Selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm relative">
            <Filter className="w-3.5 h-3.5 ml-2 text-slate-400" />
            <select
              value={rangeType}
              onChange={(e) => handleRangeChange(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-700 py-1.5 pl-2 pr-8 focus:ring-0 cursor-pointer appearance-none"
            >
              <option value="today">Today</option>
              <option value="monthly">This Month</option>
              <option value="last3m">Last 3 Months</option>
              <option value="last6m">Last 6 Months</option>
              <option value="last1y">Last 1 Year</option>
              <option value="custom">Custom Range</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-3 pointer-events-none text-slate-400" />
          </div>

          {rangeType === 'custom' && (
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                className="bg-transparent border-none text-[10px] font-bold text-slate-600 focus:ring-0 py-1 px-2"
              />
              <span className="text-slate-300 mx-1">-</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                className="bg-transparent border-none text-[10px] font-bold text-slate-600 focus:ring-0 py-1 px-2"
              />
              <button
                disabled={!customRange.start || !customRange.end || profitLoading}
                onClick={() => fetchDynamicProfit(customRange.start, customRange.end)}
                className="bg-indigo-600 text-white p-1.5 rounded-lg ml-1 hover:bg-indigo-700 disabled:bg-slate-200 transition-colors"
              >
                {profitLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
              </button>
            </div>
          )}

          <button
            onClick={fetchDashboardData}
            className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <History className="w-4 h-4 mr-2" />
            Refresh
          </button>

          <div className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-indigo-200 shadow-lg">
            {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Profitability Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Total Sales',
            value: formatCurrency(dynamicProfit?.sales || 0),
            subtitle: rangeType === 'today' ? 'Sales Today' : rangeType === 'monthly' ? 'Monthly Sales' : 'Sales for selected range',
            icon: ShoppingCart,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            trend: 'Revenue'
          },
          {
            label: 'Gross Profit',
            value: formatCurrency(dynamicProfit?.grossProfit || 0),
            subtitle: 'Revenue - Production Costs',
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            trend: 'Operating'
          },
          {
            label: 'Net Profit',
            value: formatCurrency(dynamicProfit?.netProfit || 0),
            subtitle: 'After Overheads & Expenses',
            icon: DollarSign,
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
            trend: (dynamicProfit?.netProfit || 0) >= 0 ? 'Surplus' : 'Deficit'
          },
          {
            label: 'Profit Margin',
            value: `${(dynamicProfit?.margin || 0).toFixed(2)}%`,
            subtitle: 'Efficiency Percentage',
            icon: Activity,
            color: (dynamicProfit?.margin || 0) >= 15 ? 'text-emerald-600' : 'text-amber-600',
            bg: (dynamicProfit?.margin || 0) >= 15 ? 'bg-emerald-50' : 'bg-amber-50',
            trend: (dynamicProfit?.margin || 0) >= 0 ? 'Positive' : 'Negative'
          },
        ].map((item, i) => (
          <div key={i} className="group bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className={`p-3 rounded-2xl ${item.bg} w-fit group-hover:scale-110 transition-transform duration-300`}>
              <item.icon className={`w-6 h-6 ${item.color}`} />
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.trend}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-600 line-clamp-1 group-hover:text-slate-900 transition-colors">{item.label}</h3>
              <p className="text-2xl font-black text-slate-800 tabular-nums">{item.value}</p>
              <p className="text-[10px] font-bold text-slate-400 group-hover:text-slate-500 transition-colors uppercase tracking-tight line-clamp-1">{item.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Asset Valuation Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-lg shadow-md">
            <Scale className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Asset Valuation (Stock-in-Hand)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-indigo-100 hover:shadow-xl transition-all duration-500 flex items-center justify-between group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity rotate-12 group-hover:rotate-0 duration-700 pointer-events-none">
              <Boxes className="w-32 h-32 text-indigo-900" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-indigo-500/80 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full mb-2 inline-block">Enterprise Stock</span>
              <h3 className="text-base font-bold text-slate-600">Finished Goods Value</h3>
              <p className="text-3xl font-black text-slate-900 tabular-nums">{formatCurrency(kpis?.assets?.finishedGoodsValue || 0)}</p>
              <p className="text-xs font-medium text-slate-400">Calculated based on current ledger balance</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
              <Boxes className="w-8 h-8 text-indigo-600 group-hover:text-white" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-emerald-100 hover:shadow-xl transition-all duration-500 flex items-center justify-between group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity rotate-12 group-hover:rotate-0 duration-700 pointer-events-none">
              <Package className="w-32 h-32 text-emerald-900" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full mb-2 inline-block">Bale Inventory</span>
              <h3 className="text-base font-bold text-slate-600">Available Bale Value</h3>
              <p className="text-3xl font-black text-slate-900 tabular-nums">{formatCurrency(kpis?.assets?.baleValue || 0)}</p>
              <p className="text-xs font-medium text-slate-400">Total value of ready-to-dispatch bales</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500 shadow-inner">
              <Package className="w-8 h-8 text-emerald-600 group-hover:text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          {
            label: 'Net Payables',
            value: formatCurrency(kpis?.ledgers.supplierOutstanding || 0),
            subtitle: `${kpis?.purchases.billCount} Outstanding Bills`,
            icon: CreditCard,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            trend: 'Liability'
          },
          {
            label: 'Pending Receivables',
            value: formatCurrency(kpis?.ledgers.customerOutstanding || 0),
            subtitle: `${kpis?.sales.invoiceCount} Unpaid Invoices`,
            icon: ArrowDownRight,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            trend: 'Assets'
          },
          {
            label: 'Net Position',
            value: formatCurrency(Math.abs(parseFloat(kpis?.ledgers.netPosition || '0'))),
            subtitle: parseFloat(kpis?.ledgers.netPosition || '0') >= 0 ? 'Surplus (Net Owed)' : 'Liability (Net Owed)',
            icon: Scale,
            color: parseFloat(kpis?.ledgers.netPosition || '0') >= 0 ? 'text-emerald-600' : 'text-rose-600',
            bg: parseFloat(kpis?.ledgers.netPosition || '0') >= 0 ? 'bg-emerald-50' : 'bg-rose-50',
            trend: parseFloat(kpis?.ledgers.netPosition || '0') >= 0 ? 'Positive' : 'Negative'
          },
          {
            label: 'Treasury Balance',
            value: formatCurrency(kpis?.accounts.totalBalance || 0),
            subtitle: 'Consolidated Bank & Cash',
            icon: Wallet,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            trend: 'Available'
          },
          {
            label: 'Production Output',
            value: formatQuantity(kpis?.production.totalOutput || 0),
            subtitle: `${kpis?.production.completed} Batches Finalized`,
            icon: Boxes,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            trend: 'Total Yield'
          },
          {
            label: 'Resource Loss',
            value: formatQuantity(kpis?.inventory.totalWeightLoss || 0),
            subtitle: `${kpis?.production.exceededLoss} Threshold Breaches`,
            icon: AlertTriangle,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            trend: 'Wastage'
          },
        ].map((item, i) => (
          <div key={i} className="group bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className={`absolute -top-4 -right-4 w-24 h-24 ${item.bg} opacity-10 rounded-full transition-all group-hover:scale-110`} />

            <div className="flex justify-between items-start mb-2 relative z-10">
              <div className={`p-2.5 rounded-xl ${item.bg} ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg ${item.bg} ${item.color} border border-current opacity-80`}>
                {item.trend}
              </span>
            </div>

            <div className="relative z-10">
              <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{item.label}</h3>
              <div className="text-xl font-black text-slate-900 mt-1 truncate">{item.value}</div>
            </div>

            <div className="pt-3 border-t border-slate-50 relative z-10 mt-auto">
              <p className="text-[11px] text-slate-400 font-medium">{item.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      <CCDashboardWidget />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Operational Panels */}
        <div className="lg:col-span-8 space-y-8">

          {/* Inventory Intelligence Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg mr-3">
                  <Package className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Inventory & Logistics</h2>
              </div>
              <div className="flex space-x-2">
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-500 uppercase">Live Metrics</span>
              </div>
            </div>

            <div className="p-1">
              {/* Primary Stock Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 p-2">
                <div className="p-6 bg-slate-50 rounded-2xl border border-transparent hover:border-indigo-100 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Raw Materials</span>
                    {(kpis?.inventory?.lowStockItems || 0) > 0 && <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm">CRITICAL</span>}
                  </div>
                  <div className="text-2xl font-black text-slate-900 leading-none">{formatQuantity(kpis?.inventory.rawMaterialStock || 0)}</div>
                  <div className="text-[11px] text-slate-400 mt-2 font-semibold">{kpis?.inventory.rawMaterialItems} Distinct Items</div>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-transparent hover:border-emerald-100 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Finished Goods</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 leading-none">{formatQuantity(kpis?.inventory.finishedGoodsStock || 0)}</div>
                  <div className="text-[11px] text-slate-400 mt-2 font-semibold tracking-wide uppercase">{kpis?.inventory.finishedProductItems} Active SKUs</div>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-transparent hover:border-purple-100 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Consigned (Bell)</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 leading-none">{formatQuantity(kpis?.inventory.stockInBell || 0)}</div>
                  <div className="text-[11px] text-slate-400 mt-2 font-semibold">Ready for Dispatch</div>
                </div>
              </div>

              {/* Secondary Metrics Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 border-t border-slate-100 bg-white/50">
                {[
                  { label: 'Work In Process', val: kpis?.inventory.stockInProcess, sub: `${kpis?.production.inProgress} Active Batches`, color: 'text-amber-600' },
                  { label: 'Total Raw Purchased', val: kpis?.inventory.rawStockPurchased, sub: 'All Confirmed Bills', color: 'text-indigo-600' },
                  { label: 'Pending Raw Stock', val: kpis?.inventory.pendingRawStock, sub: 'Invoice vs Rolls', color: 'text-rose-600' },
                  { label: 'Trading Purchase', val: kpis?.inventory.tradingStockPurchased, sub: 'Finished Stock', color: 'text-emerald-600' },
                ].map((m, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{m.label}</p>
                    <p className={`text-base font-black ${m.color}`}>{formatQuantity(m.val || 0)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{m.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Right Sidebar: Alerts & Recent Activity (4 cols) */}
        <div className="lg:col-span-4 space-y-8">


          {/* Average Production Loss Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center uppercase tracking-wider">
                <Target className="w-4 h-4 mr-2 text-indigo-500" />
                Production Quality
              </h3>
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Avg Production Loss</span>
                <span className={`font-black text-lg ${parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') > 5 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0').toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full shadow-sm transition-all duration-1000 ${parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') > 5 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') / 10) * 100)}%` }}
                />
              </div>
              <div className="pt-4 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Efficiency Rating</p>
                <div className="flex items-center">
                  <div className={`p-1.5 rounded-lg mr-3 ${parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') <= 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    <Activity className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-bold ${parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') <= 5 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {parseFloat(kpis?.inventory.avgProductionLoss?.toString() || '0') <= 5 ? 'Excellent Efficiency' : 'Action Required'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}