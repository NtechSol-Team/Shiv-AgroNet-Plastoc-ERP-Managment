/**
 * Dashboard Component
 * 
 * Displays key performance indicators (KPIs) and alerts for the ERP system.
 * Fetches data from the backend APIs and renders various metric cards.
 */

import React, { useState, useEffect } from 'react';
import {
  Package, TrendingUp, AlertTriangle, DollarSign, Boxes, Loader2,
  ArrowUpRight, ArrowDownRight, CreditCard, Wallet, Users, Truck, CheckCircle
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

interface Alert {
  type: string;
  severity: string;
  title: string;
  message: string;
  itemId: string;
}

// ============================================================
// COMPONENT
// ============================================================

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [machineEfficiency, setMachineEfficiency] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  /**
   * Fetch all dashboard data from APIs
   */
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [kpisResult, alertsResult, efficiencyResult] = await Promise.all([
        dashboardApi.getKpis(),
        dashboardApi.getAlerts(),
        dashboardApi.getMachineEfficiency(),
      ]);

      if (kpisResult.data) setKpis(kpisResult.data);
      if (alertsResult.data) setAlerts(alertsResult.data);
      if (efficiencyResult.data) setMachineEfficiency(efficiencyResult.data);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError('Failed to load dashboard data');
    }

    setLoading(false);
  };

  // ============================================================
  // RENDER STATES
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Format number as Indian currency
   */
  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num || 0);
  };

  /**
   * Format quantity with kg suffix
   */
  const formatQuantity = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${Math.round(num || 0)} kg`;
  };

  /**
   * Get color classes for KPI cards
   */
  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-50 text-blue-600',
      teal: 'bg-teal-50 text-teal-600',
      green: 'bg-green-50 text-green-600',
      orange: 'bg-orange-50 text-orange-600',
      red: 'bg-red-50 text-red-600',
      purple: 'bg-purple-50 text-purple-600',
    };
    return colors[color] || colors.blue;
  };

  // ============================================================
  // KPI DATA CONFIGURATION
  // ============================================================

  const inventoryKpis = [
    {
      title: 'Raw Material Stock',
      value: formatQuantity(kpis?.inventory?.rawMaterialStock || '0'),
      icon: Package,
      color: 'blue',
      subtitle: `${kpis?.inventory?.rawMaterialItems || 0} items`,
      alert: (kpis?.inventory?.lowStockItems || 0) > 0,
    },
    {
      title: 'Finished Goods Stock',
      value: formatQuantity(kpis?.inventory?.finishedGoodsStock || '0'),
      icon: Boxes,
      color: 'teal',
      subtitle: `${kpis?.inventory?.finishedProductItems || 0} products`,
    },
  ];

  const productionKpis = [
    {
      title: 'Production Output',
      value: formatQuantity(kpis?.production?.totalOutput || '0'),
      icon: TrendingUp,
      color: 'green',
      subtitle: `${kpis?.production?.completed || 0} batches completed`,
    },
    {
      title: 'In Progress',
      value: kpis?.production?.inProgress || 0,
      icon: Loader2,
      color: 'blue',
      subtitle: 'Active batches',
    },
  ];

  const financialKpis = [
    {
      title: 'Total Sales',
      value: formatCurrency(kpis?.sales?.total || '0'),
      icon: ArrowUpRight,
      color: 'green',
      subtitle: `${kpis?.sales?.invoiceCount || 0} invoices`,
    },
    {
      title: 'Receivables',
      value: formatCurrency(kpis?.sales?.pendingReceivables || '0'),
      icon: Users,
      color: 'orange',
      subtitle: 'From customers',
    },
    {
      title: 'Total Purchases',
      value: formatCurrency(kpis?.purchases?.total || '0'),
      icon: ArrowDownRight,
      color: 'red',
      subtitle: `${kpis?.purchases?.billCount || 0} bills`,
    },
    {
      title: 'Payables',
      value: formatCurrency(kpis?.purchases?.pendingPayables || '0'),
      icon: Truck,
      color: 'purple',
      subtitle: 'To suppliers',
    },
  ];

  const accountKpis = [
    {
      title: 'Bank Balance',
      value: formatCurrency(kpis?.accounts?.bankBalance || '0'),
      icon: CreditCard,
      color: 'blue',
      subtitle: 'All bank accounts',
    },
    {
      title: 'Cash Balance',
      value: formatCurrency(kpis?.accounts?.cashBalance || '0'),
      icon: Wallet,
      color: 'green',
      subtitle: 'Cash in hand',
    },
  ];

  // Filter alerts by type
  const lowStockAlerts = alerts.filter(a => a.type === 'low_stock');
  const lossExceededAlerts = alerts.filter(a => a.type === 'loss_exceeded');
  const overdueAlerts = alerts.filter(a => a.type === 'overdue_payment');

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-4 p-2">
      {/* Page Header - Minimal */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
        <h1 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Executive Dashboard</h1>
        <span className="text-xs text-gray-500 font-mono">Last Updated: {new Date().toLocaleTimeString()}</span>
      </div>

      {/* CC Account Widget */}
      <CCDashboardWidget />

      {/* KPI Grid - High Density */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {financialKpis.map((kpi, index) => (
          <div key={index} className="bg-white border border-gray-300 p-3 rounded-sm shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{kpi.title}</p>
                <h3 className="text-2xl font-bold text-gray-900 leading-none tracking-tight">{kpi.value}</h3>
              </div>
              <kpi.icon className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600 mt-2 font-medium">{kpi.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Operations (8 cols) */}
        <div className="col-span-1 lg:col-span-8 space-y-4">

          {/* Inventory Status - Dense Table-like Grid */}
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-800 uppercase">Inventory Overview</h2>
              <button className="text-xs font-bold text-blue-700 hover:underline">Full Report</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
              {inventoryKpis.map((kpi, index) => (
                <div key={index} className="p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{kpi.title}</span>
                    {kpi.alert && <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-sm">LOW STOCK</span>}
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-xl font-bold text-gray-900">{kpi.value}</span>
                    <span className="text-xs text-gray-500">{kpi.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Production Status - Condensed */}
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 uppercase">Production Floor</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
              {productionKpis.map((kpi, index) => (
                <div key={index} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase">{kpi.title}</p>
                    <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-700 block">Status</span>
                    <span className="text-xs text-gray-600">{kpi.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accounts - Dense List */}
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 uppercase">Liquidity Position</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
              {accountKpis.map((kpi, index) => (
                <div key={index} className="p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">{kpi.title}</p>
                  <p className="text-xl font-mono font-bold text-gray-900">{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{kpi.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Alerts & Financials (4 cols) */}
        <div className="col-span-1 lg:col-span-4 space-y-4">

          {/* System Alerts - List View */}
          <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
            <div className="bg-gray-100 px-3 py-2 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-800 uppercase">System Alerts</h2>
              <span className="bg-red-100 text-red-800 text-[10px] font-bold px-1.5 py-0.5 border border-red-200 rounded-sm">{alerts.length} Active</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">No active alerts</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {lowStockAlerts.map((alert, i) => (
                    <li key={`stock-${i}`} className="p-2 hover:bg-red-50 border-l-2 border-red-500 transition-colors">
                      <p className="text-xs font-bold text-gray-900">Low Stock</p>
                      <p className="text-[10px] text-gray-600 truncate">{alert.title}</p>
                    </li>
                  ))}
                  {lossExceededAlerts.map((alert, i) => (
                    <li key={`loss-${i}`} className="p-2 hover:bg-orange-50 border-l-2 border-orange-500 transition-colors">
                      <p className="text-xs font-bold text-gray-900">Production Loss</p>
                      <p className="text-[10px] text-gray-600 truncate">{alert.title}</p>
                    </li>
                  ))}
                  {overdueAlerts.map((alert, i) => (
                    <li key={`due-${i}`} className="p-2 hover:bg-purple-50 border-l-2 border-purple-500 transition-colors">
                      <p className="text-xs font-bold text-gray-900">Overdue Payment</p>
                      <p className="text-[10px] text-gray-600 truncate">{alert.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Net Position Summary */}
          <div className="bg-white border border-gray-300 rounded-sm p-3 shadow-sm">
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">Financial Net Position</h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600">Receivables</span>
                <span className="font-bold text-green-700 font-mono">{formatCurrency(kpis?.ledgers?.customerOutstanding || '0')}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600">Payables</span>
                <span className="font-bold text-red-700 font-mono">{formatCurrency(kpis?.ledgers?.supplierOutstanding || '0')}</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-800 uppercase">Net Balance</span>
                <span className={`text-sm font-bold font-mono ${parseFloat(kpis?.ledgers?.netPosition || '0') >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {formatCurrency(kpis?.ledgers?.netPosition || '0')}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}