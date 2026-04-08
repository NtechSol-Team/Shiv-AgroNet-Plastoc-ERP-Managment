import React, { useState, useEffect, useCallback } from 'react';
import { Download, FileText, AlertTriangle, Filter, Loader2, TrendingUp, TrendingDown, RotateCcw, Scale } from 'lucide-react';
import { reportsApi, mastersApi } from '../lib/api';

export function Reports() {
  const [activeReport, setActiveReport] = useState<'production-loss' | 'sales-register' | 'purchase-register' | 'stock-valuation' | 'expense-summary' | 'cc-interest' | 'fg-stock-audit'>('production-loss');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Report data
  const [productionLossData, setProductionLossData] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [purchaseData, setPurchaseData] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);
  const [ccInterestData, setCCInterestData] = useState<any[]>([]);
  const [fgAuditData, setFgAuditData] = useState<{ movements: any[]; productSummaries: any[]; summary: any } | null>(null);

  // FG Audit Filters
  const [fgAuditStartDate, setFgAuditStartDate] = useState('');
  const [fgAuditEndDate, setFgAuditEndDate] = useState('');
  const [fgAuditProductId, setFgAuditProductId] = useState('all');
  const [fgAuditMovTypeFilter, setFgAuditMovTypeFilter] = useState('all');
  const [finishedProducts, setFinishedProducts] = useState<any[]>([]);

  // Filters
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [salesPartyFilter, setSalesPartyFilter] = useState('all');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<'all' | 'pending' | 'complete'>('all');
  const [purchasePartyFilter, setPurchasePartyFilter] = useState('all');
  const [purchasePaymentFilter, setPurchasePaymentFilter] = useState<'all' | 'pending' | 'complete'>('all');

  useEffect(() => {
    if (activeReport !== 'fg-stock-audit') {
      fetchReportData();
    }
  }, [activeReport]);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const [customersResult, suppliersResult, fpsResult] = await Promise.all([
        mastersApi.getCustomers(),
        mastersApi.getSuppliers(),
        mastersApi.getFinishedProducts(),
      ]);
      if (customersResult.data) setCustomers(customersResult.data);
      if (suppliersResult.data) setSuppliers(suppliersResult.data);
      if (fpsResult.data) setFinishedProducts(fpsResult.data);
    } catch (err) {
      console.error('Failed to load master data');
    }
  };

  const fetchFGAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await reportsApi.getFGStockAudit({
        startDate: fgAuditStartDate || undefined,
        endDate: fgAuditEndDate || undefined,
        productId: fgAuditProductId !== 'all' ? fgAuditProductId : undefined,
      });
      if (result.data) {
        setFgAuditData(result.data);
      } else {
        setFgAuditData(null);
      }
    } catch (err) {
      setError('Failed to load FG Stock Audit data');
    }
    setLoading(false);
  }, [fgAuditStartDate, fgAuditEndDate, fgAuditProductId]);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeReport) {
        case 'production-loss':
          const lossResult = await reportsApi.getProductionLoss();
          // Backend returns { batches: [], summary: {} }
          if (lossResult.data && Array.isArray(lossResult.data.batches)) {
            setProductionLossData(lossResult.data.batches);
          } else {
            console.warn('Production loss data format mismatch:', lossResult.data);
            setProductionLossData([]);
          }
          break;
        case 'sales-register':
          const salesResult = await reportsApi.getSales();
          // Backend returns { invoices: [], summary: {} }
          if (salesResult.data && Array.isArray(salesResult.data.invoices)) {
            setSalesData(salesResult.data.invoices);
          } else {
            setSalesData([]);
          }
          break;
        case 'purchase-register':
          const purchaseResult = await reportsApi.getPurchases();
          // Backend returns { bills: [], summary: {} }
          if (purchaseResult.data && Array.isArray(purchaseResult.data.bills)) {
            setPurchaseData(purchaseResult.data.bills);
          } else {
            setPurchaseData([]);
          }
          break;
        case 'stock-valuation':
          const stockResult = await reportsApi.getStockValuation();
          // Backend returns { valuation: [...], summary: {...} }
          if (stockResult.data && Array.isArray(stockResult.data.valuation)) {
            setStockData(stockResult.data.valuation);
          } else {
            setStockData([]);
          }
          break;
        case 'expense-summary':
          const expenseResult = await reportsApi.getExpenses();
          // Backend returns { expenses: [], byCategory: [], summary: {} }
          // Users want the summary table by category, so we use byCategory
          if (expenseResult.data && Array.isArray(expenseResult.data.byCategory)) {
            // Map 'amount' to 'totalAmount' for table compatibility
            setExpenseData(expenseResult.data.byCategory.map((e: any) => ({
              ...e,
              totalAmount: e.amount
            })));
          } else {
            setExpenseData([]);
          }
          break;
        case 'cc-interest':
          const ccResult = await mastersApi.getCCInterestLogs();
          if (ccResult.data) {
            setCCInterestData(ccResult.data);
          } else {
            setCCInterestData([]);
          }
          break;
        case 'fg-stock-audit':
          // handled separately via fetchFGAudit
          await fetchFGAudit();
          return; // fetchFGAudit sets loading itself
      }
    } catch (err) {
      setError('Failed to load report data');
    }
    setLoading(false);
  };

  // Filter Sales Data
  const getFilteredSalesData = () => {
    let filtered = salesData;
    if (salesPartyFilter !== 'all') {
      filtered = filtered.filter(s => s.customerId === salesPartyFilter);
    }
    if (salesPaymentFilter === 'pending') {
      filtered = filtered.filter(s => s.status === 'Pending');
    } else if (salesPaymentFilter === 'complete') {
      filtered = filtered.filter(s => s.status === 'Paid');
    }
    return filtered;
  };

  // Filter Purchase Data
  const getFilteredPurchaseData = () => {
    let filtered = purchaseData;
    if (purchasePartyFilter !== 'all') {
      filtered = filtered.filter(p => p.supplierId === purchasePartyFilter);
    }
    if (purchasePaymentFilter === 'pending') {
      filtered = filtered.filter(p => p.status === 'Pending');
    } else if (purchasePaymentFilter === 'complete') {
      filtered = filtered.filter(p => p.status === 'Paid');
    }
    return filtered;
  };

  // Filter FG Audit Data (movement type is a client-side filter only)
  const getFgAuditFiltered = (): any[] => {
    if (!fgAuditData) return [];
    let rows = fgAuditData.movements;
    if (fgAuditMovTypeFilter !== 'all') {
      rows = rows.filter((m: any) => m.movementType === fgAuditMovTypeFilter);
    }
    return rows;
  };

  // Download CSV
  const downloadCSV = (data: any[], filename: string, headers: string[]) => {
    let csv = headers.join(',') + '\n';
    data.forEach(row => {
      const rowValues = Object.values(row).map(val => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csv += rowValues.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Reports & Analytics</h1>
        <p className="text-sm text-gray-600 mt-1">View and download comprehensive business reports</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Report Type Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Reports">
            <button
              onClick={() => setActiveReport('production-loss')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'production-loss'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Production Loss
            </button>
            <button
              onClick={() => setActiveReport('sales-register')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'sales-register'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Sales Register
            </button>
            <button
              onClick={() => setActiveReport('purchase-register')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'purchase-register'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Purchase Register
            </button>
            <button
              onClick={() => setActiveReport('stock-valuation')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'stock-valuation'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Stock Valuation
            </button>
            <button
              onClick={() => setActiveReport('expense-summary')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'expense-summary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Expense Summary
            </button>
            <button
              onClick={() => setActiveReport('cc-interest')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeReport === 'cc-interest'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              CC Interest
            </button>
            <button
              onClick={() => {
                setActiveReport('fg-stock-audit');
                setTimeout(() => fetchFGAudit(), 0);
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeReport === 'fg-stock-audit'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📦 FG Stock Audit
            </button>
          </nav>
        </div>

        {/* Report Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading report...</span>
            </div>
          ) : (
            <>
              {/* Production Loss Report */}
              {activeReport === 'production-loss' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Production Loss Analysis</h2>
                      <p className="text-sm text-gray-600">Batches with loss exceeding 5% are highlighted</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Batch ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Machine</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Raw Material</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Input (kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Output (kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Loss %</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {productionLossData.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No production data available</p>
                            </td>
                          </tr>
                        ) : (
                          productionLossData.map((batch, index) => (
                            <tr key={index} className={`border-b border-gray-200 ${batch.lossExceeded ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3 text-sm text-gray-900">{batch.code}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{batch.allocationDate}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{batch.machine?.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{batch.rawMaterial?.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">{batch.inputQuantity}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">{batch.outputQuantity || '-'}</td>
                              <td className={`px-4 py-3 text-sm text-right font-medium ${batch.lossExceeded ? 'text-red-600' : 'text-green-600'}`}>
                                {batch.lossPercentage ? `${parseFloat(batch.lossPercentage).toFixed(1)}%` : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {batch.lossExceeded ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Exceeded
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Normal
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sales Register Report */}
              {activeReport === 'sales-register' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Sales Register</h2>
                      <p className="text-sm text-gray-600">All sales invoices with payment details</p>
                    </div>
                    <button
                      onClick={() => {
                        const exportData = getFilteredSalesData().map(sale => ({
                          code: sale.code,
                          date: new Date(sale.date).toLocaleDateString(),
                          customer: sale.customer,
                          items: sale.items?.map((i: any) => i.name).join(' | ') || '-',
                          qty: sale.items?.map((i: any) => i.quantity).join(' | ') || '-',
                          amount: sale.subtotal || 0,
                          gst: sale.gst || 0,
                          total: sale.total || 0,
                          status: sale.status
                        }));
                        downloadCSV(exportData, 'sales_report', ['Invoice', 'Date', 'Customer', 'Items', 'Qty', 'Amount', 'GST', 'Total', 'Status'])
                      }}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Report
                    </button>
                  </div>

                  {/* Filters */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Filter className="w-4 h-4 inline mr-1" />
                        Filter by Customer
                      </label>
                      <select
                        value={salesPartyFilter}
                        onChange={(e) => setSalesPartyFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="all">All Customers</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>{customer.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Filter className="w-4 h-4 inline mr-1" />
                        Payment Status
                      </label>
                      <select
                        value={salesPaymentFilter}
                        onChange={(e) => setSalesPaymentFilter(e.target.value as 'all' | 'pending' | 'complete')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="all">Full Report (All)</option>
                        <option value="pending">Pending Payments Only</option>
                        <option value="complete">Completed Payments Only</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Invoice ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Item</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Qty (kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">GST</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {getFilteredSalesData().length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No sales records found</p>
                            </td>
                          </tr>
                        ) : (
                          getFilteredSalesData().map((sale, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{sale.code}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{sale.date}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{sale.customer}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {sale.items?.map((i: any, idx: number) => <div key={idx}>{i.name}</div>) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {sale.items?.map((i: any, idx: number) => <div key={idx}>{i.quantity}</div>) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{parseFloat(sale.subtotal || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{parseFloat(sale.gst || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">₹{parseFloat(sale.total || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sale.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                  {sale.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total:</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            ₹{getFilteredSalesData().reduce((sum, s) => sum + parseFloat(s.total || 0), 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Purchase Register Report */}
              {activeReport === 'purchase-register' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Purchase Register</h2>
                      <p className="text-sm text-gray-600">All purchase bills with payment details</p>
                    </div>
                    <button
                      onClick={() => {
                        const exportData = getFilteredPurchaseData().map(purchase => ({
                          code: purchase.code,
                          date: new Date(purchase.date).toLocaleDateString(),
                          supplier: purchase.supplier,
                          items: purchase.items?.map((i: any) => i.name).join(' | ') || '-',
                          qty: purchase.items?.map((i: any) => i.quantity).join(' | ') || '-',
                          amount: purchase.amount || 0,
                          gst: purchase.gst || 0,
                          total: purchase.total || 0,
                          status: purchase.status
                        }));
                        downloadCSV(exportData, 'purchase_report', ['Bill', 'Date', 'Supplier', 'Items', 'Qty', 'Amount', 'GST', 'Total', 'Status'])
                      }}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Report
                    </button>
                  </div>

                  {/* Filters */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Filter className="w-4 h-4 inline mr-1" />
                        Filter by Supplier
                      </label>
                      <select
                        value={purchasePartyFilter}
                        onChange={(e) => setPurchasePartyFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="all">All Suppliers</option>
                        {suppliers.map(supplier => (
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Filter className="w-4 h-4 inline mr-1" />
                        Payment Status
                      </label>
                      <select
                        value={purchasePaymentFilter}
                        onChange={(e) => setPurchasePaymentFilter(e.target.value as 'all' | 'pending' | 'complete')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="all">Full Report (All)</option>
                        <option value="pending">Pending Payments Only</option>
                        <option value="complete">Completed Payments Only</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Bill ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Supplier</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Item</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Qty (kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">GST</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {getFilteredPurchaseData().length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No purchase records found</p>
                            </td>
                          </tr>
                        ) : (
                          getFilteredPurchaseData().map((purchase, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{purchase.code}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{new Date(purchase.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{purchase.supplier}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {purchase.items?.map((i: any, idx: number) => <div key={idx}>{i.name}</div>) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {purchase.items?.map((i: any, idx: number) => <div key={idx}>{i.quantity}</div>) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{parseFloat(purchase.amount || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{parseFloat(purchase.gst || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">₹{parseFloat(purchase.total || 0).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${purchase.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                  {purchase.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total:</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            ₹{getFilteredPurchaseData().reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            ₹{getFilteredPurchaseData().reduce((sum, p) => sum + parseFloat(p.gst || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                            ₹{getFilteredPurchaseData().reduce((sum, p) => sum + parseFloat(p.total || 0), 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Stock Valuation Report */}
              {activeReport === 'stock-valuation' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Stock Valuation Report</h2>
                      <p className="text-sm text-gray-600">Current inventory value across all items</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Item</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Quantity (kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Rate (₹/kg)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {stockData.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No stock data available</p>
                            </td>
                          </tr>
                        ) : (
                          stockData.map((item, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">{item.category}</td>
                              <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.stock}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{item.ratePerKg}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                ₹{(parseFloat(item.stock || 0) * parseFloat(item.ratePerKg || 0)).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total Stock Value:</td>
                          <td className="px-4 py-3 text-sm font-semibold text-blue-600 text-right">
                            ₹{stockData.reduce((sum, item) => sum + (parseFloat(item.stock || 0) * parseFloat(item.ratePerKg || 0)), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Expense Summary Report */}
              {activeReport === 'expense-summary' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Expense Summary</h2>
                      <p className="text-sm text-gray-600">Expense breakdown by category</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Expense Head</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Total Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {expenseData.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No expense data available</p>
                            </td>
                          </tr>
                        ) : (
                          expenseData.map((expense, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{expense.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{expense.category}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{parseFloat(expense.totalAmount || 0).toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-900">Total:</td>
                          <td className="px-4 py-3 text-sm font-semibold text-blue-600 text-right">
                            ₹{expenseData.reduce((sum, e) => sum + parseFloat(e.totalAmount || 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              {/* CC Interest Report */}
              {activeReport === 'cc-interest' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">CC Interest Statement</h2>
                      <p className="text-sm text-gray-600">Monthly interest posted to Cash Credit accounts</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Account</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Month</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 border-b">Interest Amount (₹)</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 border-b">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {ccInterestData.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No interest logs found</p>
                            </td>
                          </tr>
                        ) : (
                          ccInterestData.map((log, index) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-600">{new Date(log.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {log.accountName} <span className="text-xs text-gray-500">({log.accountNo})</span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{new Date(log.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">₹{parseFloat(log.totalInterest).toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${log.isPosted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {log.isPosted ? 'Posted' : 'Pending'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* FG Stock Audit Report */}
              {activeReport === 'fg-stock-audit' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Finished Goods Stock Audit Report</h2>
                      <p className="text-sm text-gray-600">Complete ledger of all FG stock movements — IN, OUT, Restore / Adjustment</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!fgAuditData) return;
                        const rows = getFgAuditFiltered().map(m => ({
                          Date: new Date(m.date).toLocaleDateString(),
                          Product: m.productName,
                          Code: m.productCode,
                          Type: m.movementLabel,
                          Reference: m.referenceCode,
                          Reason: m.reason,
                          'Qty In (kg)': m.quantityIn > 0 ? m.quantityIn.toFixed(3) : '',
                          'Qty Out (kg)': m.quantityOut > 0 ? m.quantityOut.toFixed(3) : '',
                          'Running Balance (kg)': m.runningBalance.toFixed(3),
                        }));
                        downloadCSV(rows, 'fg_stock_audit', ['Date', 'Product', 'Code', 'Type', 'Reference', 'Reason', 'Qty In (kg)', 'Qty Out (kg)', 'Running Balance (kg)']);
                      }}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download CSV
                    </button>
                  </div>

                  {/* Filters */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-5 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                      <input
                        type="date"
                        value={fgAuditStartDate}
                        onChange={e => setFgAuditStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                      <input
                        type="date"
                        value={fgAuditEndDate}
                        onChange={e => setFgAuditEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                      <select
                        value={fgAuditProductId}
                        onChange={e => setFgAuditProductId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="all">All Products</option>
                        {finishedProducts.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type</label>
                      <select
                        value={fgAuditMovTypeFilter}
                        onChange={e => setFgAuditMovTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="all">All Types</option>
                        <option value="FG_IN">Stock IN (Production / Purchase)</option>
                        <option value="FG_OUT">Stock OUT (Sales / Sample)</option>
                        <option value="ADJUSTMENT">Restore / Adjustment</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 mb-5">
                    <button
                      onClick={fetchFGAudit}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                    >
                      Apply Filters
                    </button>
                    <button
                      onClick={() => { setFgAuditStartDate(''); setFgAuditEndDate(''); setFgAuditProductId('all'); setFgAuditMovTypeFilter('all'); setTimeout(fetchFGAudit, 0); }}
                      className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Summary Cards */}
                  {fgAuditData && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
                        <div>
                          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Total IN</p>
                          <p className="text-xl font-bold text-emerald-800">{fgAuditData.summary.totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg</p>
                          <p className="text-xs text-emerald-600 mt-0.5">Production + Purchase</p>
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                        <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="w-5 h-5 text-red-600" /></div>
                        <div>
                          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Total OUT</p>
                          <p className="text-xl font-bold text-red-800">{fgAuditData.summary.totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg</p>
                          <p className="text-xs text-red-600 mt-0.5">Sales + Samples</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg"><RotateCcw className="w-5 h-5 text-amber-600" /></div>
                        <div>
                          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Adjustments</p>
                          <p className="text-xl font-bold text-amber-800">{fgAuditData.summary.totalAdjustment >= 0 ? '+' : ''}{fgAuditData.summary.totalAdjustment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg</p>
                          <p className="text-xs text-amber-600 mt-0.5">Restores &amp; Corrections</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg"><Scale className="w-5 h-5 text-blue-600" /></div>
                        <div>
                          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Net Change</p>
                          <p className={`text-xl font-bold ${fgAuditData.summary.netChange >= 0 ? 'text-blue-800' : 'text-red-700'}`}>
                            {fgAuditData.summary.netChange >= 0 ? '+' : ''}{fgAuditData.summary.netChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg
                          </p>
                          <p className="text-xs text-blue-600 mt-0.5">{fgAuditData.summary.totalMovements} movements</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-Product Summary */}
                  {fgAuditData && fgAuditData.productSummaries.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-800 mb-2">Product-wise Summary</h3>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Product Name</th>
                              {fgAuditStartDate && <th className="px-3 py-2 text-right font-medium text-gray-600">Opening Balance (kg)</th>}
                              <th className="px-3 py-2 text-right font-medium text-emerald-700">IN (kg)</th>
                              <th className="px-3 py-2 text-right font-medium text-red-700">OUT (kg)</th>
                              <th className="px-3 py-2 text-right font-medium text-amber-700">Adjustment (kg)</th>
                              <th className="px-3 py-2 text-right font-medium text-blue-700">Current Balance (kg)</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {fgAuditData.productSummaries.map((ps: any) => (
                              <tr key={ps.productId} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-xs text-gray-500">{ps.productCode}</td>
                                <td className="px-3 py-2 font-medium text-gray-900">{ps.productName}</td>
                                {fgAuditStartDate && (
                                  <td className="px-3 py-2 text-right text-gray-600">
                                    {ps.openingBalance != null ? ps.openingBalance.toFixed(3) : '-'}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-right text-emerald-700 font-medium">{ps.totalIn.toFixed(3)}</td>
                                <td className="px-3 py-2 text-right text-red-700 font-medium">{ps.totalOut.toFixed(3)}</td>
                                <td className={`px-3 py-2 text-right font-medium ${ps.totalAdjustment >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                                  {ps.totalAdjustment >= 0 ? '+' : ''}{ps.totalAdjustment.toFixed(3)}
                                </td>
                                <td className={`px-3 py-2 text-right font-bold ${
                                  ps.closingBalance < 0 ? 'text-red-600' : ps.closingBalance === 0 ? 'text-gray-400' : 'text-blue-700'
                                }`}>
                                  {ps.closingBalance.toFixed(3)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Line-by-line Movement Ledger */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                      Detailed Movement Ledger
                      {fgAuditData ? ` (${getFgAuditFiltered().length} entries)` : ''}
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-b">Date</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-b">Product</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-b">Movement Type</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-b">Reference</th>
                            <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-b">Reason / Note</th>
                            <th className="px-3 py-2.5 text-right font-medium text-emerald-700 border-b">IN (kg)</th>
                            <th className="px-3 py-2.5 text-right font-medium text-red-700 border-b">OUT (kg)</th>
                            <th className="px-3 py-2.5 text-right font-medium text-blue-700 border-b">Balance (kg)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {!fgAuditData || getFgAuditFiltered().length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                <p>{fgAuditData ? 'No movements found for the selected filters.' : 'Apply filters and click Apply to load data.'}</p>
                              </td>
                            </tr>
                          ) : (
                            getFgAuditFiltered().map((m: any) => (
                              <tr key={m.id} className={`hover:bg-gray-50 ${
                                m.movementType === 'FG_IN' ? 'border-l-2 border-emerald-400' :
                                m.movementType === 'FG_OUT' ? 'border-l-2 border-red-400' :
                                'border-l-2 border-amber-400'
                              }`}>
                                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                <td className="px-3 py-2.5">
                                  <span className="font-medium text-gray-900">{m.productName}</span>
                                  <span className="block text-xs text-gray-400 font-mono">{m.productCode}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    m.movementType === 'FG_IN' ? 'bg-emerald-100 text-emerald-800' :
                                    m.movementType === 'FG_OUT' ? 'bg-red-100 text-red-800' :
                                    'bg-amber-100 text-amber-800'
                                  }`}>
                                    {m.movementLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{m.referenceCode}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-500 max-w-xs truncate" title={m.reason}>{m.reason}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-emerald-700">
                                  {m.quantityIn > 0 ? `+${m.quantityIn.toFixed(3)}` : ''}
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-red-700">
                                  {m.quantityOut > 0 ? `-${m.quantityOut.toFixed(3)}` : ''}
                                </td>
                                <td className={`px-3 py-2.5 text-right font-bold ${
                                  m.runningBalance < 0 ? 'text-red-600' : 'text-blue-700'
                                }`}>
                                  {m.runningBalance.toFixed(3)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {fgAuditData && getFgAuditFiltered().length > 0 && (
                          <tfoot className="bg-gray-50">
                            <tr className="border-t-2 border-gray-300">
                              <td colSpan={5} className="px-3 py-2.5 text-sm font-semibold text-gray-800 text-right">Totals:</td>
                              <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                                +{getFgAuditFiltered().reduce((s: number, r: any) => s + r.quantityIn, 0).toFixed(3)} kg
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-red-700">
                                -{getFgAuditFiltered().reduce((s: number, r: any) => s + r.quantityOut, 0).toFixed(3)} kg
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
