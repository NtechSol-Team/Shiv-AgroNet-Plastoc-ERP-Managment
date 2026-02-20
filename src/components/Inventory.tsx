import React, { useState, useEffect } from 'react';
import { Search, Filter, Loader2, Package, Edit2, Trash2, X, Plus, Settings2, ArrowDownCircle, CheckCircle } from 'lucide-react';
import { inventoryApi, mastersApi, productionApi } from '../lib/api';

import { BellInventory } from './BellInventory';
import { QuickProductionEntry } from './QuickProductionEntry';

export function Inventory() {
  const [activeTab, setActiveTab] = useState<'finished-goods' | 'raw-material' | 'bells' | 'movements'>('finished-goods');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Quick Production Entry Modal
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  // Stock Adjustment State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<any>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<{ type: 'add' | 'deduct', quantity: string, reason: string }>({
    type: 'deduct',
    quantity: '',
    reason: ''
  });

  // Return to Production (FIFO Reduce) State
  const [showReduceModal, setShowReduceModal] = useState(false);
  const [reduceItem, setReduceItem] = useState<any>(null);
  const [reduceQty, setReduceQty] = useState('');
  const [reduceResult, setReduceResult] = useState<any>(null);
  const [reducing, setReducing] = useState(false);

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

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ ...item });
    setShowEditModal(true);
  };

  const openAdjustmentModal = (item: any, type: 'raw_material' | 'finished_product') => {
    setAdjustmentItem({ ...item, type });
    setAdjustmentForm({ type: 'deduct', quantity: '', reason: '' });
    setShowAdjustModal(true);
  };

  const handleAdjustStock = async () => {
    if (!adjustmentForm.quantity || !adjustmentForm.reason) return;

    setSaving(true);
    try {
      const qty = parseFloat(adjustmentForm.quantity);
      const finalQty = adjustmentForm.type === 'add' ? qty : -qty;

      const result = await inventoryApi.adjustStock({
        itemType: adjustmentItem.type,
        itemId: adjustmentItem.id,
        quantity: finalQty,
        reason: adjustmentForm.reason
      });

      if (result.error) {
        setError(result.error);
      } else {
        setShowAdjustModal(false);
        setAdjustmentItem(null);
        fetchData(); // Refresh all data
      }
    } catch (err) {
      setError('Failed to adjust stock');
    }
    setSaving(false);
  };

  const openReduceModal = (item: any) => {
    setReduceItem(item);
    setReduceQty('');
    setReduceResult(null);
    setShowReduceModal(true);
  };

  const handleReduceFgStock = async () => {
    if (!reduceQty || parseFloat(reduceQty) <= 0) return;
    setReducing(true);
    setError(null);
    try {
      const result = await productionApi.reduceFgStock({
        finishedProductId: reduceItem.id,
        quantityToReduce: parseFloat(reduceQty),
        reason: `Manual FG reduction via Return to Production`,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setReduceResult(result.data);
        fetchData();
      }
    } catch (err) {
      setError('Failed to reduce FG stock');
    }
    setReducing(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product? This will also remove related production batches and revert raw material stock.')) return;

    setLoading(true);
    try {
      const result = await mastersApi.deleteFinishedProduct(id);
      if (result.error) {
        setError(result.error);
      } else {
        fetchData(); // Refresh list
      }
    } catch (err) {
      setError('Failed to delete item');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await mastersApi.updateFinishedProduct(editingItem.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setShowEditModal(false);
        setEditingItem(null);
        fetchData();
      }
    } catch (err) {
      setError('Failed to save changes');
    }
    setSaving(false);
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
              Bale Inventory
            </button>
            <button onClick={() => setActiveTab('raw-material')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'raw-material' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Raw Materials
            </button>
            <button onClick={() => setActiveTab('movements')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'movements' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Stock Ledger
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {activeTab === 'finished-goods' && (
              <button
                onClick={() => setShowQuickEntry(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center space-x-2 font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add from Production</span>
              </button>
            )}
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Search SKU or Name..."
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-sm text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
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
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Shade</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Stock (Kg)</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Status</th>
                        <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Actions</th>
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
                          <td className="px-4 py-1.5 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                title="Edit Product"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openReduceModal(item)}
                                className="p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-all"
                                title="Return to Production (FIFO reduce FG stock)"
                              >
                                <ArrowDownCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openAdjustmentModal(item, 'finished_product')}
                                className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-all"
                                title="Adjust Stock"
                              >
                                <Settings2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                title="Delete Product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {finishedGoods.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-500 italic">No products produced yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'raw-material' && (
                <RawMaterialTable
                  rawMaterials={rawMaterials}
                  onAdjust={(item) => openAdjustmentModal(item, 'raw_material')}
                />
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

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">Edit Finished Product</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-bold text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Length (m)</label>
                  <input
                    type="text"
                    value={formData.length || ''}
                    onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Width (m)</label>
                  <input
                    type="text"
                    value={formData.width || ''}
                    onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Shade (GSM)</label>
                  <input
                    type="text"
                    value={formData.gsm || ''}
                    onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Standard Rate (₹/Kg)</label>
                  <input
                    type="number"
                    value={formData.ratePerKg || ''}
                    onChange={(e) => setFormData({ ...formData, ratePerKg: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={formData.hsnCode || '5608'}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">GST Rate (%)</label>
                  <input
                    type="number"
                    value={formData.gstPercent || '18'}
                    onChange={(e) => setFormData({ ...formData, gstPercent: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Production Modal */}
      {showReduceModal && reduceItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-orange-50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center">
                <ArrowDownCircle className="w-5 h-5 mr-2 text-orange-600" />
                Return to Production
              </h3>
              <button onClick={() => { setShowReduceModal(false); setReduceResult(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!reduceResult ? (
                <>
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <p className="text-sm font-bold text-orange-800">{reduceItem.name}</p>
                    <p className="text-xs text-orange-600">Current Stock: {reduceItem.stock} kg</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                    ℹ️ This will reduce FG stock in <strong>FIFO order</strong> and restore production batches (including weight loss) back to <strong>In Progress</strong>.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Quantity to Reduce (kg)</label>
                    <input
                      type="number"
                      value={reduceQty}
                      onChange={e => setReduceQty(e.target.value)}
                      max={parseFloat(reduceItem.stock)}
                      min={0.01}
                      step={0.01}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-bold text-lg"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      onClick={() => setShowReduceModal(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReduceFgStock}
                      disabled={reducing || !reduceQty || parseFloat(reduceQty) <= 0 || parseFloat(reduceQty) > parseFloat(reduceItem.stock)}
                      className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-bold transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reducing ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Processing...</span></> : <span>Reduce & Restore Batches</span>}
                    </button>
                  </div>
                </>
              ) : (
                // Success: show affected batches
                <>
                  <div className="flex items-center space-x-2 text-emerald-700 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-bold">{reduceResult.message}</span>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 uppercase">Production Batches Restored (FIFO)</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="px-3 py-2 text-left font-medium">Batch</th>
                          <th className="px-3 py-2 text-right font-medium">FG Reversed</th>
                          <th className="px-3 py-2 text-right font-medium">Raw Restored</th>
                          <th className="px-3 py-2 text-right font-medium">Loss Restored</th>
                          <th className="px-3 py-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reduceResult.affectedBatches?.map((b: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-700">{b.batchCode}</td>
                            <td className="px-3 py-2 text-right text-red-700 font-mono">-{b.fgReversed} kg</td>
                            <td className="px-3 py-2 text-right text-emerald-700 font-mono">+{b.rawCapacityRestored} kg</td>
                            <td className="px-3 py-2 text-right text-amber-700 font-mono">+{b.lossRestored} kg</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.newStatus === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                                  b.newStatus === 'partially-completed' ? 'bg-amber-100 text-amber-700' :
                                    'bg-green-100 text-green-700'
                                }`}>{b.newStatus.replace('-', ' ').toUpperCase()}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => { setShowReduceModal(false); setReduceResult(null); }}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold transition-all"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Production Entry Modal */}
      {showQuickEntry && (
        <QuickProductionEntry
          onClose={() => setShowQuickEntry(false)}
          onSuccess={() => {
            fetchData(); // Refresh inventory
          }}
        />
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && adjustmentItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center">
                <Settings2 className="w-5 h-5 mr-2 text-blue-600" />
                Adjust Stock
              </h3>
              <button
                onClick={() => { setShowAdjustModal(false); setAdjustmentItem(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                <p className="text-sm text-blue-800 font-medium">Adjusting: {adjustmentItem.name}</p>
                <p className="text-xs text-blue-600">Current Stock: {adjustmentItem.stock} kg</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Operation</label>
                  <select
                    value={adjustmentForm.type}
                    onChange={e => setAdjustmentForm({ ...adjustmentForm, type: e.target.value as 'add' | 'deduct' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  >
                    <option value="add">Add Stock (+)</option>
                    <option value="deduct">Deduct Stock (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Quantity (kg)</label>
                  <input
                    type="number"
                    value={adjustmentForm.quantity}
                    onChange={e => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason</label>
                <textarea
                  value={adjustmentForm.reason}
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Damage, Found in stock, Correction"
                  rows={2}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleAdjustStock}
                  disabled={saving || !adjustmentForm.quantity || !adjustmentForm.reason}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Confirm Adjustment</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted Component for Raw Material Table to handle state easier
// UPDATED: Now shows Rolls (single source of truth) instead of batches
function RawMaterialTable({ rawMaterials, onAdjust }: { rawMaterials: any[], onAdjust: (item: any) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rolls, setRolls] = useState<any[]>([]);
  const [loadingRolls, setLoadingRolls] = useState(false);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setRolls([]);
      return;
    }

    setExpandedId(id);
    setLoadingRolls(true);
    try {
      const res = await inventoryApi.getRollsByMaterial(id);
      if (res.data) setRolls(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoadingRolls(false);
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
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Rolls</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Value (₹)</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-center">Status</th>
            <th className="px-4 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider text-right">Actions</th>
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
                  <td className="px-4 py-1.5 text-sm font-mono font-bold text-right text-gray-900">{stock.toFixed(2)}</td>
                  <td className="px-4 py-1.5 text-center">
                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      {item.rollCount || 0}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-xs font-mono text-right text-gray-600">₹{value}</td>
                  <td className="px-4 py-1.5 text-center">
                    {stock < parseFloat(item.reorderLevel || '200') ?
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1 rounded">REORDER</span> :
                      <span className="text-[10px] font-bold text-green-700">OK</span>
                    }
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdjust(item);
                      }}
                      className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-all"
                      title="Adjust Stock"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="p-4 pl-12">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase text-blue-800">📦 All Rolls (FIFO Order)</h4>
                          <span className="text-xs text-blue-600 font-medium">{rolls.length} rolls • {stock.toFixed(2)} kg total</span>
                        </div>
                        {loadingRolls ? (
                          <div className="p-4 text-center text-gray-500 text-xs">Loading rolls...</div>
                        ) : rolls.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-xs italic">No rolls found. Add rolls via Purchase → Manage Rolls.</div>
                        ) : (
                          <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-2 font-medium">Roll Code</th>
                                <th className="px-4 py-2 font-medium">Bill #</th>
                                <th className="px-4 py-2 font-medium">Inward Date</th>
                                <th className="px-4 py-2 text-right font-medium">Weight (Kg)</th>
                                <th className="px-4 py-2 text-center font-medium">Shade</th>
                                <th className="px-4 py-2 text-center font-medium">Width</th>
                                <th className="px-4 py-2 text-center font-medium">Status</th>
                                <th className="px-4 py-2 text-right font-medium">Age</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {rolls.map((roll) => {
                                const age = Math.floor((new Date().getTime() - new Date(roll.createdAt).getTime()) / (1000 * 3600 * 24));
                                return (
                                  <tr key={roll.id} className={roll.status !== 'In Stock' ? 'opacity-50' : ''}>
                                    <td className="px-4 py-2 font-mono text-blue-600 font-bold">{roll.rollCode}</td>
                                    <td className="px-4 py-2 font-mono text-gray-600">{roll.purchaseBill?.code || '-'}</td>
                                    <td className="px-4 py-2 text-gray-600">{new Date(roll.createdAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-2 text-right font-bold text-gray-900">{parseFloat(roll.netWeight).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-center text-gray-500">{roll.gsm || '-'}</td>
                                    <td className="px-4 py-2 text-center text-gray-500">{roll.length || '-'}</td>
                                    <td className="px-4 py-2 text-center">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${roll.status === 'In Stock' ? 'bg-green-100 text-green-700' :
                                        roll.status === 'Consumed' ? 'bg-gray-100 text-gray-600' :
                                          'bg-orange-100 text-orange-700'
                                        }`}>
                                        {roll.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right">
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
          {rawMaterials.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-gray-500 italic">No materials purchased yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
