/**
 * Dashboard Component
 * 
 * Displays key performance indicators (KPIs) and alerts for the ERP system.
 * Fetches data from the backend APIs and renders various metric cards.
 */

import React, { useState, useEffect } from 'react';
import {
  Package, TrendingUp, AlertTriangle, Boxes, Loader2,
  ArrowDownRight, CreditCard, Wallet,
  Activity, History, ShoppingCart, Target, Scale
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
}


// ============================================================
// COMPONENT
// ============================================================

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiData | null>(null);
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
      if (kpisResult.data) setKpis(kpisResult.data);
      if (efficiencyResult.data) setMachineEfficiency(efficiencyResult.data);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError('Failed to load dashboard data');
    }
    setLoading(false);
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
          <button
            onClick={fetchDashboardData}
            className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <History className="w-4 h-4 mr-2" />
            Refresh Data
          </button>
          <div className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-indigo-200 shadow-lg">
            {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
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