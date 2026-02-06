import React, { useState, useEffect } from 'react';
import { Plus, AlertTriangle, CheckCircle, X, Loader2, Package, Trash2, ArrowRight, Settings2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { productionApi, mastersApi, inventoryApi } from '../lib/api';

export function Production() {
  const [activeTab, setActiveTab] = useState<'batches' | 'allocations' | 'history' | 'pending'>('batches');
  const [showAllocationForm, setShowAllocationForm] = useState(false);
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [productionBatches, setProductionBatches] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [expandedBatches, setExpandedBatches] = useState<string[]>([]);
  const [batchOptions, setBatchOptions] = useState<Record<string, any[]>>({}); // Map: rawMaterialId -> Batch[]

  const toggleBatch = (id: string) => {
    setExpandedBatches(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const [allocationForm, setAllocationForm] = useState({
    date: new Date().toISOString().split('T')[0],
    machineId: '',
    inputs: [{ rawMaterialId: '', materialBatchId: '', quantity: '' }],
    outputs: ['']
  });

  const [completionForm, setCompletionForm] = useState<{ batchId: string, outputQuantity: string, outputQuantities: any }>({
    batchId: '',
    outputQuantity: '', // Legacy support
    outputQuantities: {} // ProductId -> Quantity mapping
  });

  const [calculatedLoss, setCalculatedLoss] = useState<{
    input: number;
    output: number;
    difference: number;
    percentage: number;
    status: 'safe' | 'exceeded';
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesResult, machinesResult, materialsResult, productsResult, statsResult] = await Promise.all([
        productionApi.getBatches(),
        mastersApi.getMachines(),
        mastersApi.getRawMaterials(),
        mastersApi.getFinishedProducts(),
        productionApi.getStats(),
      ]);

      if (batchesResult.data) setProductionBatches(batchesResult.data);
      if (machinesResult.data) setMachines(machinesResult.data);
      if (materialsResult.data) setRawMaterials(materialsResult.data);
      if (productsResult.data) setFinishedProducts(productsResult.data);
      if (statsResult.data) setStats(statsResult.data);
    } catch (err) {
      setError('Failed to load data');
    }
    setLoading(false);
  };

  const loadBatchesForMaterial = async (materialId: string) => {
    if (!materialId || batchOptions[materialId]) return;

    try {
      const result = await inventoryApi.getAvailableBatches(materialId);
      if (result.data) {
        setBatchOptions(prev => ({ ...prev, [materialId]: result.data || [] }));
      }
    } catch (err) {
      console.error("Failed to load batches", err);
    }
  };

  const handleSaveAllocation = async () => {
    // Validate inputs
    const validInputs = allocationForm.inputs.filter(i => i.rawMaterialId && i.quantity);
    const validOutputs = allocationForm.outputs.filter(o => o);

    if (!allocationForm.machineId || validInputs.length === 0 || validOutputs.length === 0) {
      setError('Please fill all required fields');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await productionApi.createBatch({
        allocationDate: allocationForm.date,
        machineId: allocationForm.machineId,
        inputs: validInputs.map(i => ({
          rawMaterialId: i.rawMaterialId,
          quantity: i.quantity,
          materialBatchId: (i as any).materialBatchId // Forward batch linkage
        })),
        outputs: validOutputs,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setShowAllocationForm(false);
        fetchData();
        setAllocationForm({
          date: new Date().toISOString().split('T')[0],
          machineId: '',
          inputs: [{ rawMaterialId: '', materialBatchId: '', quantity: '' }],
          outputs: ['']
        });
      }
    } catch (err) {
      setError('Failed to create allocation');
    }
    setSaving(false);
  };

  const handleCalculateLoss = () => {
    const batch = productionBatches.find(b => b.id === completionForm.batchId);
    if (batch) {
      const input = parseFloat(batch.inputQuantity); // This is total input

      let totalOutput = 0;
      const quant = completionForm.outputQuantities as Record<string, string>;
      Object.values(quant).forEach(q => {
        totalOutput += parseFloat(q || '0');
      });

      if (totalOutput > 0) {
        const diff = input - totalOutput;
        const percent = (diff / input) * 100;

        setCalculatedLoss({
          input,
          output: totalOutput,
          difference: diff,
          percentage: percent,
          status: percent > 5 ? 'exceeded' : 'safe'
        });
      }
    }
  };

  // Auto-calculate loss when output quantities change
  useEffect(() => {
    if (completionForm.batchId && Object.keys(completionForm.outputQuantities).length > 0) {
      const timer = setTimeout(() => {
        handleCalculateLoss();
      }, 500); // 500ms debounce
      return () => clearTimeout(timer);
    } else {
      setCalculatedLoss(null);
    }
  }, [completionForm.outputQuantities, completionForm.batchId]);

  const handleCompleteProduction = async () => {
    const quant = completionForm.outputQuantities as Record<string, string>;
    const outputs = Object.entries(quant).map(([productId, quantity]) => ({
      productId,
      quantity
    })).filter(o => o.quantity);

    if (!completionForm.batchId || outputs.length === 0) {
      setError('Please enter output quantity');
      return;
    }

    setSaving(true);
    setError(null);
    setWarning(null);

    try {
      const result = await productionApi.completeBatch(completionForm.batchId, {
        outputQuantity: String(outputs.reduce((sum, o) => sum + parseFloat(o.quantity), 0)), // Total for legacy
        outputs, // Detailed breakdown
        completionDate: new Date().toISOString().split('T')[0],
      });

      if (result.error) {
        setError(result.error);
      } else {
        if (result.warning) {
          setWarning(result.warning);
        }
        setShowCompletionForm(false);
        setCalculatedLoss(null);
        fetchData();
        setCompletionForm({ batchId: '', outputQuantity: '', outputQuantities: {} });
      }
    } catch (err) {
      setError('Failed to complete batch');
    }
    setSaving(false);
  };

  const pendingBatches = productionBatches.filter(b => b.status === 'in-progress');
  const completedBatches = productionBatches.filter(b => b.status === 'completed');
  const exceededBatches = completedBatches.filter(b => b.lossExceeded);

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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Production Floor</h1>
          <p className="text-sm text-slate-500 mt-1">Manage active lines, allocations, and output</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAllocationForm(true)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center space-x-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>New Batch Allocation</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center">
          {error}
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 border border-amber-100 text-amber-600 px-4 py-3 rounded-xl flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {warning}
        </div>
      )}

      {/* Allocation Modal */}
      {showAllocationForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            {/* Professional Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center">
                  <Package className="w-6 h-6 mr-3 text-blue-600" />
                  New Production Protocol
                </h2>
                <p className="text-sm text-slate-500 mt-1 ml-9">Configure batch parameters, inputs, and projected targets.</p>
              </div>
              <button
                onClick={() => setShowAllocationForm(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 bg-slate-50/30 overflow-y-auto">
              {/* Top Control Bar */}
              <div className="grid grid-cols-12 gap-6 mb-8">
                <div className="col-span-12 md:col-span-4 lg:col-span-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1.5" /> Start Date
                  </label>
                  <input
                    type="date"
                    value={allocationForm.date}
                    onChange={e => setAllocationForm({ ...allocationForm, date: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-medium text-slate-700"
                  />
                </div>
                <div className="col-span-12 md:col-span-8 lg:col-span-9">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Assigned Machine
                  </label>
                  <div className="relative">
                    <select
                      value={allocationForm.machineId}
                      onChange={e => setAllocationForm({ ...allocationForm, machineId: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm appearance-none font-medium text-slate-700"
                    >
                      <option value="">Select Production Line / Machine...</option>
                      {machines.filter(m => m.status === 'Active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Settings2 className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Production Flow Area */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[420px]">

                {/* LEFT PANEL: INPUTS */}
                <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/10">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">IN</div>
                      <h3 className="font-bold text-slate-800">Raw Materials</h3>
                    </div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{allocationForm.inputs.length} / 6 slots</span>
                  </div>

                  <div className="space-y-3">
                    {allocationForm.inputs.map((input, idx) => (
                      <div key={idx} className="group flex gap-3 items-start animate-in slide-in-from-left-2 duration-300 fill-mode-backwards" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="flex-1">
                          <select
                            value={input.rawMaterialId}
                            onChange={e => {
                              const newInputs = [...allocationForm.inputs];
                              const mid = e.target.value;
                              newInputs[idx].rawMaterialId = mid;
                              (newInputs[idx] as any).materialBatchId = ''; // Reset batch
                              setAllocationForm({ ...allocationForm, inputs: newInputs });
                              if (mid) loadBatchesForMaterial(mid);
                            }}
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                          >
                            <option value="">Select Material...</option>
                            {rawMaterials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.stock} kg)</option>)}
                          </select>
                        </div>

                        {/* Batch Selection */}
                        <div className="flex-1">
                          <select
                            value={(input as any).materialBatchId || ''}
                            onChange={e => {
                              const newInputs = [...allocationForm.inputs];
                              (newInputs[idx] as any).materialBatchId = e.target.value;

                              // Auto-fill max quantity if selecting a batch
                              if (e.target.value) {
                                const batch = batchOptions[input.rawMaterialId]?.find(b => b.id === e.target.value);
                                if (batch) {
                                  const available = parseFloat(batch.quantity) - parseFloat(batch.quantityUsed || '0');
                                  newInputs[idx].quantity = available.toString();
                                }
                              } else {
                                newInputs[idx].quantity = ''; // Reset if batch deselected
                              }

                              setAllocationForm({ ...allocationForm, inputs: newInputs });
                            }}
                            disabled={!input.rawMaterialId}
                            className={`w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium ${!input.rawMaterialId ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                          >
                            <option value="">
                              {input.rawMaterialId ? (batchOptions[input.rawMaterialId]?.length ? 'Select Batch (FIFO if empty)...' : 'No batches found') : 'Select Material First'}
                            </option>
                            {/* Filter out batches selected in other rows */}
                            {batchOptions[input.rawMaterialId]?.filter(b => {
                              // Get list of batch IDs selected in OTHER rows
                              const selectedInOtherRows = allocationForm.inputs
                                .filter((_, i) => i !== idx)
                                .map(inp => (inp as any).materialBatchId);
                              return !selectedInOtherRows.includes(b.id);
                            }).map(b => {
                              const available = parseFloat(b.quantity) - parseFloat(b.quantityUsed || '0');
                              return (
                                <option key={b.id} value={b.id}>
                                  {b.batchCode} | Available: {available.toFixed(2)} kg
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="w-24 relative">
                          <input
                            type="number"
                            value={input.quantity}
                            onChange={e => {
                              const newInputs = [...allocationForm.inputs]; // Corrected variable name
                              let val = e.target.value;

                              // Validate against batch availability
                              if ((input as any).materialBatchId) {
                                const batch = batchOptions[input.rawMaterialId]?.find(b => b.id === (input as any).materialBatchId);
                                if (batch) {
                                  const available = parseFloat(batch.quantity) - parseFloat(batch.quantityUsed || '0');
                                  if (parseFloat(val) > available) {
                                    val = available.toString(); // Cap at max available
                                    // Optional: You could set a transient error state here if needed
                                  }
                                }
                              }

                              newInputs[idx].quantity = val;
                              setAllocationForm({ ...allocationForm, inputs: newInputs });
                            }}
                            className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-right"
                            placeholder="0.00"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium pointer-events-none">kg</span>
                        </div>
                        <button
                          onClick={() => {
                            const newInputs = allocationForm.inputs.filter((_, i) => i !== idx);
                            setAllocationForm({ ...allocationForm, inputs: newInputs });
                          }}
                          disabled={allocationForm.inputs.length <= 1}
                          className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {allocationForm.inputs.length < 6 && (
                      <button
                        onClick={() => setAllocationForm(prev => ({ ...prev, inputs: [...prev.inputs, { rawMaterialId: '', materialBatchId: '', quantity: '' }] }))}
                        className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 font-semibold hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center space-x-2"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Another Input Material</span>
                      </button>
                    )}
                  </div>

                  {/* Total Input Footer */}
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Input Weight</p>
                        <div className="h-1 w-12 bg-blue-600 rounded-full"></div>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-black text-slate-800 tracking-tight">
                          {allocationForm.inputs.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0).toFixed(2)}
                        </span>
                        <span className="text-lg font-medium text-slate-400 ml-1">kg</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CENTER: FLOW INDICATOR (Desktop Only) */}
                <div className="hidden md:flex flex-col items-center justify-center w-12 bg-slate-50 border-l border-r border-slate-100 z-10">
                  <div className="h-full w-px bg-slate-200/50 absolute"></div>
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center z-10 text-slate-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* RIGHT PANEL: OUTPUTS */}
                <div className="flex-1 p-6 bg-white">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">OUT</div>
                      <h3 className="font-bold text-slate-800">Target Products</h3>
                    </div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{allocationForm.outputs.length} / 4 slots</span>
                  </div>

                  <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100/50 text-xs text-emerald-700 mb-4">
                    Specify the expected finished products. You will record actual output quantities upon batch completion.
                  </div>

                  <div className="space-y-3">
                    {allocationForm.outputs.map((output, idx) => (
                      <div key={idx} className="flex gap-3 items-center animate-in slide-in-from-right-2 duration-300 fill-mode-backwards" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="flex-1">
                          <select
                            value={output}
                            onChange={e => {
                              const newOutputs = [...allocationForm.outputs];
                              newOutputs[idx] = e.target.value;
                              setAllocationForm({ ...allocationForm, outputs: newOutputs });
                            }}
                            className="w-full px-3 py-3 bg-white border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                          >
                            <option value="">Select Target Product...</option>
                            {finishedProducts.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} - {p.gsm || 'N/A'} GSM
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            const newOutputs = allocationForm.outputs.filter((_, i) => i !== idx);
                            setAllocationForm({ ...allocationForm, outputs: newOutputs });
                          }}
                          disabled={allocationForm.outputs.length <= 1}
                          className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {allocationForm.outputs.length < 4 && (
                      <button
                        onClick={() => setAllocationForm(prev => ({ ...prev, outputs: [...prev.outputs, ''] }))}
                        className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 font-semibold hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center space-x-2"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Target Product</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-end items-center space-x-4">
              <button
                onClick={() => setShowAllocationForm(false)}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAllocation}
                disabled={saving}
                className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center transform active:scale-95 duration-200"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Initiate Production Protocol
              </button>
            </div>
          </div>
        </div >
      )
      }

      {/* Completion Modal */}
      {
        showCompletionForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-emerald-50 to-white">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center">
                    <CheckCircle className="w-6 h-6 mr-3 text-emerald-600" />
                    Finalize Production Batch
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 ml-9">Record output quantities and verify efficiency.</p>
                </div>
                <button
                  onClick={() => { setShowCompletionForm(false); setCalculatedLoss(null); }}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 bg-slate-50/30 overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Col: Batch Context */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Batch Context</h3>
                      {(() => {
                        const b = pendingBatches.find(bat => bat.id === completionForm.batchId);
                        if (!b) return null;
                        return (
                          <div className="space-y-4">
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Batch Code</label>
                              <div className="font-mono font-bold text-blue-600 text-lg">{b.code}</div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Machine</label>
                              <div className="font-medium text-slate-700">{b.machine?.name}</div>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">Total Input</label>
                              <div className="font-bold text-slate-900 text-2xl">{parseFloat(b.inputQuantity || '0').toFixed(2)} <span className="text-sm text-slate-400 font-normal">kg</span></div>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                              <label className="text-xs text-slate-500 block mb-2">Input Composition</label>
                              <div className="space-y-2">
                                {b.inputs?.map((inpt: any, i: number) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span className="text-slate-600 truncate max-w-[120px]">{inpt.rawMaterial?.name}</span>
                                    <span className="font-mono text-slate-400">{inpt.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {calculatedLoss && (
                      <div className={`p-5 rounded-xl border-2 ${calculatedLoss.status === 'exceeded' ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <div className="flex justify-between items-center mb-4">
                          <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide ${calculatedLoss.status === 'exceeded' ? 'bg-orange-200 text-orange-800' : 'bg-emerald-200 text-emerald-800'}`}>
                            {calculatedLoss.status === 'exceeded' ? 'Efficiency Warning' : 'Optimal Efficiency'}
                          </span>
                        </div>

                        <div className="flex items-baseline space-x-1 mb-1">
                          <span className={`text-3xl font-black ${calculatedLoss.status === 'exceeded' ? 'text-orange-900' : 'text-emerald-900'}`}>
                            {calculatedLoss.percentage.toFixed(2)}%
                          </span>
                          <span className={`font-bold ${calculatedLoss.status === 'exceeded' ? 'text-orange-700' : 'text-emerald-700'}`}>loss</span>
                        </div>
                        <div className={`text-sm font-medium ${calculatedLoss.status === 'exceeded' ? 'text-orange-800' : 'text-emerald-800'}`}>
                          Total {calculatedLoss.difference.toFixed(2)} kg unaccounted
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Col: Output Forms */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center">
                          <Package className="w-4 h-4 mr-2 text-emerald-600" />
                          Observed Outputs
                        </h3>
                      </div>
                      <div className="p-6 space-y-5">
                        {(() => {
                          const selectedBatch = pendingBatches.find(b => b.id === completionForm.batchId);
                          if (!selectedBatch) return null;

                          const targetProducts = selectedBatch.outputs?.length > 0
                            ? selectedBatch.outputs
                            : (selectedBatch.finishedProduct ? [{ finishedProductId: selectedBatch.finishedProductId, finishedProduct: selectedBatch.finishedProduct }] : []);

                          return targetProducts.map((out: any, idx: number) => (
                            <div key={out.finishedProductId || idx} className="flex items-center space-x-4 animate-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                              <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Product</label>
                                <div className="text-sm font-bold text-slate-800 truncate" title={out.finishedProduct?.name}>
                                  {out.finishedProduct?.name || 'Unknown Product'}
                                  {out.finishedProduct?.gsm && <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{out.finishedProduct.gsm} GSM</span>}
                                </div>
                              </div>
                              <div className="w-48">
                                <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 block text-right">Net Weight</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={completionForm.outputQuantities[out.finishedProductId] || ''}
                                    onChange={e => setCompletionForm({
                                      ...completionForm,
                                      outputQuantities: {
                                        ...completionForm.outputQuantities,
                                        [out.finishedProductId]: e.target.value
                                      }
                                    })}
                                    className="w-full pl-4 pr-10 py-2.5 bg-emerald-50/30 border border-emerald-100 rounded-lg text-lg font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-right transition-all"
                                    placeholder="0.00"
                                  />
                                  <span className="absolute right-3 top-3.5 text-xs text-emerald-400 font-bold pointer-events-none">kg</span>
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-end items-center space-x-4">
                <button
                  onClick={() => { setShowCompletionForm(false); setCalculatedLoss(null); }}
                  className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteProduction}
                  disabled={saving || !calculatedLoss}
                  className="px-8 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Commit Production Batch
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Tabs - Enterprise Style */}
      <div className="border-b border-gray-200 flex space-x-6">
        <button onClick={() => setActiveTab('batches')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'batches' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Active Batches
        </button>
        <button onClick={() => setActiveTab('history')} className={`pb-2 text-sm font-bold uppercase border-b-2 transition-colors ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Production History
        </button>
      </div>

      {
        activeTab === 'batches' ? (
          /* Active Batches Table */
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-12">#</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Batch Code</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Input Material</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Input Qty</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Machine</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Start Date</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 italic">No active production batches.</td>
                  </tr>
                ) : (
                  pendingBatches.map((batch, index) => {
                    const isExpanded = expandedBatches.includes(batch.id);

                    return (
                      <React.Fragment key={batch.id}>
                        <tr className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => toggleBatch(batch.id)}>
                          <td className="px-4 py-3 text-xs text-gray-500">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-mono font-bold text-blue-700">{batch.code}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {batch.outputs?.length > 1 ? (
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-blue-800">{batch.outputs.length} Products</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                              </div>
                            ) : (
                              <span className="font-medium text-slate-900">{batch.finishedProduct?.name}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {batch.inputs?.length > 1 ? (
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-600">{batch.inputs.length} Materials</span>
                              </div>
                            ) : (
                              batch.rawMaterial?.name
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-gray-700 text-right">{parseFloat(batch.inputQuantity || '0').toFixed(2)} kg</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{batch.machine?.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(batch.allocationDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompletionForm({
                                  batchId: batch.id,
                                  outputQuantity: '',
                                  outputQuantities: {}
                                });
                                setShowCompletionForm(true);
                              }}
                              className="px-3 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-md text-xs font-bold transition-colors"
                            >
                              Complete
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (batch.inputs?.length > 1 || batch.outputs?.length > 1) && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={8} className="px-4 py-3 border-b border-slate-100 shadow-inner">
                              <div className="grid grid-cols-2 gap-8 ml-10">
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Detailed Input Mix</h4>
                                  <div className="space-y-1">
                                    {batch.inputs?.map((input: any, i: number) => (
                                      <div key={i} className="flex justify-between text-xs text-slate-600 border-b border-dashed border-slate-200 pb-1 last:border-0">
                                        <span>{input.rawMaterial?.name}</span>
                                        <span className="font-mono">{input.quantity} kg</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60 mb-2">Target Outputs</h4>
                                  <div className="space-y-1">
                                    {batch.outputs?.map((output: any, i: number) => (
                                      <div key={i} className="flex justify-between text-xs text-slate-700 border-b border-dashed border-slate-200 pb-1 last:border-0">
                                        <span>{output.finishedProduct?.name}</span>
                                        <span className="text-slate-400 italic">Pending Production</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* History Table - Dense */
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[400px]">
            <table className="w-full text-left">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center w-12">Status</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Completion Date</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Batch Code</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Input</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Output</th>
                  <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Loss %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {completedBatches.map(batch => (
                  <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-center">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{new Date(batch.allocationDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-sm font-mono text-gray-500">{batch.code}</td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900">
                      {batch.outputs?.length > 1 ? (
                        <div className="group relative cursor-help">
                          <span className="font-bold text-slate-800 border-b border-dashed border-slate-400">{batch.outputs.length} Products</span>
                          <span className="text-xs font-normal text-gray-500 ml-2">({batch.machine?.name})</span>
                          <div className="absolute hidden group-hover:block z-10 bg-slate-900 text-white text-xs p-3 rounded shadow-xl w-56 top-full mt-1 left-0">
                            {batch.outputs.map((o: any, i: number) => (
                              <div key={i} className="flex justify-between mb-1 last:mb-0 border-b border-slate-700 pb-1 last:border-0 last:pb-0">
                                <span>{o.finishedProduct?.name}</span>
                                <span className="font-mono text-green-400">{o.outputQuantity}kg</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {batch.finishedProduct?.name}
                          <span className="text-xs font-normal text-gray-500 ml-2">({batch.machine?.name})</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-600">{batch.inputQuantity} kg</td>
                    <td className="px-4 py-2 text-sm text-right font-bold text-gray-900">{batch.outputQuantity} kg</td>
                    <td className="px-4 py-2 text-sm text-right">
                      <span className={`px-1 rounded text-xs font-bold ${batch.lossExceeded ? 'bg-red-100 text-red-700' : 'text-green-700'}`}>
                        {parseFloat(batch.lossPercentage).toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div >
  );
}
