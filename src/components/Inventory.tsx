import React, { useState, useEffect } from 'react';
import { Search, Filter, Loader2, Package } from 'lucide-react';
import { inventoryApi } from '../lib/api';

import { BellInventory } from './BellInventory';

export function Inventory() {
  const [activeTab, setActiveTab] = useState<'finished-goods' | 'raw-material' | 'bells' | 'movements'>('finished-goods');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [finishedResult, rawResult, movementsResult, summaryResult] = await Promise.all([
        inventoryApi.getFinishedGoods(),
        inventoryApi.getRawMaterials(),
        inventoryApi.getMovements(),
        inventoryApi.getSummary(),
      ]);

      if (finishedResult.data) setFinishedGoods(finishedResult.data);
      if (rawResult.data) setRawMaterials(rawResult.data);
      if (movementsResult.data) setStockMovements(movementsResult.data);
      if (summaryResult.data) setSummary(summaryResult.data);
    } catch (err) {
      setError('Failed to load inventory data');
    }
    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Control</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time stock tracking and movement history</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setActiveTab('movements')}
            className="px-4 py-2 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center space-x-2"
          >
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center">
          {error}
        </div>
      )}

      {/* Summary Row - Compact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[{ label: 'Raw Material', value: `${summary?.rawMaterialStock?.toFixed(0) || 0} kg`, sub: 'Physical Stock' },
        { label: 'Finished Goods', value: `${summary?.finishedGoodsStock?.toFixed(0) || 0} kg`, sub: 'Available to Sell' },
        { label: 'Total Asset Value', value: formatCurrency(summary?.rawMaterialValue || 0), sub: 'Estimated' },
        { label: 'Stock Alerts', value: summary?.lowStockCount || 0, sub: 'Items below reorder', alert: true }]
          .map((stat, i) => (
            <div key={i} className={`bg-white border p-3 rounded-sm ${stat.alert && stat.value > 0 ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{stat.label}</p>
              <p className={`text-xl font-bold mt-1 ${stat.alert && stat.value > 0 ? 'text-red-700' : 'text-gray-900'}`}>{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.sub}</p>
            </div>
          ))}
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Tabs & Search Header - Enterprise Linear */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 pb-2">
          <div className="flex space-x-6">
            <button onClick={() => setActiveTab('finished-goods')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'finished-goods' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Finished Goods
            </button>
            <button onClick={() => setActiveTab('bells')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'bells' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Bell Inventory
            </button>
            <button onClick={() => setActiveTab('raw-material')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'raw-material' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Raw Materials
            </button>
            <button onClick={() => setActiveTab('movements')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'movements' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Stock Ledger
            </button>
          </div>

          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search SKU or Name..."
              className="w-full pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-sm text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Tab Content - Dense Tables */}
        <div className={`bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[400px] ${activeTab === 'bells' ? 'p-4 border-none' : ''}`}>
          {activeTab === 'bells' ? (
            <BellInventory />
          ) : (
            <>
              {activeTab === 'finished-goods' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-24">Item Code</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Product Name</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Dimensions</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">GSM</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Stock (Kg)</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {finishedGoods.map((item: any) => (
                        <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">{item.code}</td>
                          <td className="px-4 py-1.5 text-sm font-bold text-gray-900">{item.name}</td>
                          <td className="px-4 py-1.5 text-xs text-gray-600">{item.length} x {item.width}</td>
                          <td className="px-4 py-1.5 text-xs text-gray-600">{item.gsm}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-right text-gray-900">{item.stock}</td>
                          <td className="px-4 py-1.5 text-center">
                            {parseFloat(item.stock) < 100 ?
                              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1 rounded">LOW STOCK</span> :
                              <span className="text-[10px] font-bold text-green-700">OK</span>
                            }
                          </td>
                        </tr>
                      ))}
                      {finishedGoods.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-500 italic">No products produced yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'raw-material' && (
                <RawMaterialTable rawMaterials={rawMaterials} />
              )}

              {activeTab === 'movements' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-32">Date</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-24">Type</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Item Name</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Reference</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Qty</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Reason/Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {stockMovements.map((movement: any, index: number) => {
                        const isIn = parseFloat(movement.quantityIn) > 0;
                        return (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(movement.date).toLocaleDateString()}</td>
                            <td className="px-4 py-1.5">
                              <span className={`text-[10px] font-bold px-1 rounded ${isIn ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {isIn ? 'STOCK IN' : 'STOCK OUT'}
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-sm font-medium text-gray-900">{movement.rawMaterial?.name || movement.finishedProduct?.name || 'Unknown Item'}</td>
                            <td className="px-4 py-1.5 text-xs font-mono text-gray-500">{movement.referenceCode || '-'}</td>
                            <td className="px-4 py-1.5 text-sm font-mono font-bold text-right">
                              <span className={isIn ? 'text-green-700' : 'text-red-700'}>
                                {isIn ? '+' : '-'}{isIn ? movement.quantityIn : movement.quantityOut}
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-xs text-gray-500 max-w-xs truncate">{movement.reason}</td>
                          </tr>
                        );
                      })}
                      {stockMovements.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-500 italic">No history found</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Extracted Component for Raw Material Table to handle state easier
function RawMaterialTable({ rawMaterials }: { rawMaterials: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setBatches([]);
      return;
    }

    setExpandedId(id);
    setLoadingBatches(true);
    try {
      const res = await inventoryApi.getAvailableBatches(id);
      if (res.data) setBatches(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoadingBatches(false);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-100 border-b border-gray-300">
          <tr>
            <th className="w-8"></th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-24">Item Code</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Material Name</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Color</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Avg Rate/Kg</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Stock (Kg)</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Value (₹)</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rawMaterials.map((item: any) => {
            const avgPrice = parseFloat(item.averagePrice || '0');
            const stock = parseFloat(item.stock || '0');
            const value = (stock * avgPrice).toFixed(0);
            const isExpanded = expandedId === item.id;

            return (
              <React.Fragment key={item.id}>
                <tr
                  className={`hover:bg-blue-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                  onClick={() => handleExpand(item.id)}
                >
                  <td className="px-2 text-center text-gray-500">
                    <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</div>
                  </td>
                  <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">{item.code}</td>
                  <td className="px-4 py-1.5 text-sm font-bold text-gray-900">{item.name}</td>
                  <td className="px-4 py-1.5 text-xs text-gray-600">{item.color}</td>
                  <td className="px-4 py-1.5 text-xs text-right text-gray-600">₹{avgPrice.toFixed(2)}</td>
                  <td className="px-4 py-1.5 text-sm font-mono font-bold text-right text-gray-900">{item.stock}</td>
                  <td className="px-4 py-1.5 text-xs font-mono text-right text-gray-600">₹{value}</td>
                  <td className="px-4 py-1.5 text-center">
                    {stock < parseFloat(item.reorderLevel || '200') ?
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1 rounded">REORDER</span> :
                      <span className="text-[10px] font-bold text-green-700">OK</span>
                    }
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-gray-50">
                    <td colSpan={8} className="p-4 pl-12">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase text-gray-700">Active Batches</h4>
                          <span className="text-xs text-gray-500">{batches.length} batches found</span>
                        </div>
                        {loadingBatches ? (
                          <div className="p-4 text-center text-gray-500 text-xs">Loading batches...</div>
                        ) : batches.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-xs italic">No active batches found for this material.</div>
                        ) : (
                          <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-2 font-medium">Batch Code</th>
                                <th className="px-4 py-2 font-medium">Invoice #</th>
                                <th className="px-4 py-2 font-medium">Inward Date</th>
                                <th className="px-4 py-2 text-right font-medium">Initial Qty</th>
                                <th className="px-4 py-2 text-right font-medium">Used Qty</th>
                                <th className="px-4 py-2 text-right font-medium">Available</th>
                                <th className="px-4 py-2 text-right font-medium">Age (Days)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {batches.map((batch) => {
                                const age = Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 3600 * 24));
                                return (
                                  <tr key={batch.id}>
                                    <td className="px-4 py-2 font-mono text-blue-600 font-bold">{batch.batchCode}</td>
                                    <td className="px-4 py-2 font-mono text-gray-600">{batch.invoiceNumber || '-'}</td>
                                    <td className="px-4 py-2 text-gray-600">{new Date(batch.createdAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-2 text-right text-gray-500">{parseFloat(batch.quantity).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right text-gray-500">{parseFloat(batch.quantityUsed).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right font-bold text-green-700">
                                      {(parseFloat(batch.quantity) - parseFloat(batch.quantityUsed)).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-500">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${age > 60 ? 'bg-red-100 text-red-700' : age > 30 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                        {age}d
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {rawMaterials.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-gray-500 italic">No materials purchased yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
