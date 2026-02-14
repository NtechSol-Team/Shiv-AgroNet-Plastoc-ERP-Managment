import React, { useState, useEffect } from 'react';
import { X, Loader2, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { productionApi, mastersApi } from '../lib/api';

interface QuickProductionEntryProps {
    onClose: () => void;
    onSuccess: () => void;
}

export function QuickProductionEntry({ onClose, onSuccess }: QuickProductionEntryProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    // Data
    const [batches, setBatches] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    // Form state
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [outputWeight, setOutputWeight] = useState('');
    const [weightLossPercent, setWeightLossPercent] = useState('0');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [batchesRes, productsRes] = await Promise.all([
                productionApi.getBatches('in-progress'),
                mastersApi.getFinishedProducts()
            ]);

            if (batchesRes.data) {
                setBatches(batchesRes.data.filter((b: any) => b.status === 'in-progress' || b.status === 'partially-completed'));
            }
            if (productsRes.data) {
                setProducts(productsRes.data);
            }
        } catch (err: any) {
            setError('Failed to load data');
        }
        setLoading(false);
    };

    // Group batches by machine
    const batchesByMachine = batches.reduce((acc: any, batch: any) => {
        const machineId = batch.machine?.id;
        if (!machineId) return acc;
        if (!acc[machineId]) {
            acc[machineId] = {
                machine: batch.machine,
                batches: [],
                totalWeight: 0
            };
        }
        acc[machineId].batches.push(batch);
        const inputQty = parseFloat(batch.inputQuantity || '0');
        const consumed = parseFloat(batch.outputQuantity || '0');
        acc[machineId].totalWeight += (inputQty - consumed);
        return acc;
    }, {});

    const selectedMachineData = batchesByMachine[selectedMachineId];
    const selectedProduct = products.find(p => p.id === selectedProductId);

    const machineTotal = selectedMachineData?.totalWeight || 0;
    const weightLossDecimal = parseFloat(weightLossPercent || '0') / 100;
    const totalConsumption = weightLossDecimal >= 1 ? 0 :
        parseFloat(outputWeight || '0') / (1 - weightLossDecimal);
    const actualLoss = totalConsumption - parseFloat(outputWeight || '0');
    const remaining = machineTotal - totalConsumption;
    const isValid = totalConsumption > 0 && totalConsumption <= machineTotal;

    const handleNext = () => {
        if (step === 1 && !selectedMachineId) {
            setError('Please select a machine');
            return;
        }
        if (step === 2 && !selectedProductId) {
            setError('Please select a finished product');
            return;
        }
        setError(null);
        setStep((step + 1) as 1 | 2 | 3);
    };

    const handleBack = () => {
        setError(null);
        setStep((step - 1) as 1 | 2 | 3);
    };

    const handleSubmit = async () => {
        if (!isValid) {
            setError('Invalid consumption values');
            return;
        }

        setSaving(true);
        setError(null);
        setWarning(null);

        try {
            const result = await productionApi.quickComplete({
                machineId: selectedMachineId,
                finishedProductId: selectedProductId,
                outputWeight: parseFloat(outputWeight),
                weightLossPercent: parseFloat(weightLossPercent)
            });

            if (result.error) {
                setError(result.error);
            } else {
                if (result.data?.warning) {
                    setWarning(result.data.warning);
                }
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to complete production');
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 flex items-center space-x-3">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    <span className="text-slate-700 font-medium">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-blue-50 to-white">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 flex items-center">
                            <Package className="w-6 h-6 mr-3 text-blue-600" />
                            Quick Production Entry
                        </h2>
                        <p className="text-sm text-slate-500 mt-1 ml-9">Add finished goods from machine production</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex items-center justify-between max-w-md mx-auto">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                    {s}
                                </div>
                                {s < 3 && (
                                    <div className={`w-16 h-0.5 mx-2 transition-all ${step > s ? 'bg-blue-600' : 'bg-slate-200'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between max-w-md mx-auto mt-2 text-xs text-slate-500 font-medium">
                        <span>Select Machine</span>
                        <span>Select Product</span>
                        <span>Enter Weights</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 min-h-[500px] max-h-[600px] overflow-y-auto">
                    {/* Error/Warning Messages */}
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center">
                            <AlertCircle className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    )}
                    {warning && (
                        <div className="mb-6 bg-amber-50 border border-amber-100 text-amber-600 px-4 py-3 rounded-xl flex items-center">
                            <AlertCircle className="w-5 h-5 mr-2" />
                            {warning}
                        </div>
                    )}

                    {/* Step 1: Select Machine with Batch Preview */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Select Machine</h3>
                            {Object.keys(batchesByMachine).length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No active production batches available</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {Object.entries(batchesByMachine).map(([machineId, data]: [string, any]) => (
                                        <button
                                            key={machineId}
                                            onClick={() => setSelectedMachineId(machineId)}
                                            className={`w-full p-5 border-2 rounded-xl text-left transition-all ${selectedMachineId === machineId
                                                ? 'border-blue-600 bg-blue-50'
                                                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                                }`}
                                        >
                                            {/* Machine Header */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="text-lg font-bold text-slate-900">{data.machine.name}</div>
                                                    <div className="text-sm text-slate-500 mt-1">{data.batches.length} active batch{data.batches.length > 1 ? 'es' : ''}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-slate-500 uppercase tracking-wider">Available</div>
                                                    <div className="text-2xl font-black text-blue-700">{data.totalWeight.toFixed(1)}</div>
                                                    <div className="text-xs text-slate-400">kg</div>
                                                </div>
                                            </div>

                                            {/* Batch List */}
                                            <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                                                {data.batches.map((batch: any) => {
                                                    const inputQty = parseFloat(batch.inputQuantity || '0');
                                                    const consumed = parseFloat(batch.outputQuantity || '0');
                                                    const batchAvailable = inputQty - consumed;

                                                    return (
                                                        <div key={batch.id} className="bg-white border border-slate-200 rounded-lg p-3">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="font-mono text-sm font-bold text-blue-700">{batch.code}</div>
                                                                <div className="text-right">
                                                                    <div className="text-xs text-slate-500">Batch Available</div>
                                                                    <div className="text-lg font-bold text-slate-800">{batchAvailable.toFixed(1)} kg</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-slate-600 space-y-1">
                                                                {batch.inputs?.map((inp: any, i: number) => (
                                                                    <div key={i} className="flex justify-between">
                                                                        <span>{inp.rawMaterial?.name}</span>
                                                                        <span className="font-mono font-medium">{parseFloat(inp.quantity).toFixed(1)} kg</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Select Product */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Select Finished Product</h3>
                            <div className="space-y-3">
                                {products.map((product) => (
                                    <button
                                        key={product.id}
                                        onClick={() => setSelectedProductId(product.id)}
                                        className={`w-full p-4 border-2 rounded-xl text-left transition-all ${selectedProductId === product.id
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="font-bold text-slate-800">{product.name}</div>
                                        <div className="text-sm text-slate-600 mt-1 flex items-center space-x-4">
                                            <span>Length: {product.length}m</span>
                                            <span>Width: {product.width}m</span>
                                            <span>Shade: {product.gsm}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Enter Weights */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Enter Production Details</h3>

                            {/* Selected Info */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Machine</div>
                                    <div className="font-bold text-slate-800">{selectedMachineData?.machine.name}</div>
                                    <div className="text-sm text-slate-500 mt-1">{selectedMachineData?.totalWeight.toFixed(1)} kg available</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Product</div>
                                    <div className="font-bold text-slate-800">{selectedProduct?.name}</div>
                                </div>
                            </div>

                            {/* Weight Inputs */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Output Weight (kg) *</label>
                                    <input
                                        type="number"
                                        value={outputWeight}
                                        onChange={(e) => setOutputWeight(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-lg text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Weight Loss (%)
                                        <span className="text-xs font-normal text-slate-500 ml-2">e.g., 5 for 5%</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={weightLossPercent}
                                        onChange={(e) => setWeightLossPercent(e.target.value)}
                                        placeholder="0"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-lg text-slate-800"
                                    />
                                </div>
                            </div>

                            {/* Calculation Preview */}
                            <div className="p-5 bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border-2 border-blue-100">
                                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">Consumption Preview</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Output Weight:</span>
                                        <span className="font-mono font-bold text-slate-800">{parseFloat(outputWeight || '0').toFixed(2)} kg</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Loss ({weightLossPercent}%):</span>
                                        <span className="font-mono font-bold text-slate-800">{actualLoss.toFixed(2)} kg</span>
                                    </div>
                                    <div className="border-t border-blue-200 my-2"></div>
                                    <div className="flex justify-between text-base">
                                        <span className="font-bold text-slate-700">Total Consumption:</span>
                                        <span className="font-mono font-black text-blue-700">{totalConsumption.toFixed(2)} kg</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Remaining Available:</span>
                                        <span className={`font-mono font-bold ${remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            {remaining.toFixed(2)} kg
                                        </span>
                                    </div>
                                </div>
                                {!isValid && totalConsumption > 0 && (
                                    <div className="mt-3 text-xs text-red-600 font-medium">
                                        ⚠️ Consumption exceeds available capacity!
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-between items-center">
                    <button
                        onClick={step === 1 ? onClose : handleBack}
                        className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={step === 3 ? handleSubmit : handleNext}
                        disabled={step === 3 ? (saving || !isValid || !outputWeight) : (step === 1 && !selectedMachineId) || (step === 2 && !selectedProductId)}
                        className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {step === 3 ? 'Complete Production' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
}
