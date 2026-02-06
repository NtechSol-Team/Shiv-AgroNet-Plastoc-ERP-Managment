import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Calendar, Package, Weight } from 'lucide-react';

interface ProductionBatch {
  id: string;
  allocationDate: string;
  machine: string;
  rawMaterial: string;
  quantityIssued: number;
  productConfig: {
    length: number;
    width: number;
    gsm: number;
  };
  status: 'pending' | 'completed';
}

export function ProductionCompletion() {
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [completionDate, setCompletionDate] = useState('2026-01-25');
  const [finalQuantity, setFinalQuantity] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const pendingBatches: ProductionBatch[] = [
    {
      id: 'BATCH-1253',
      allocationDate: '2026-01-24',
      machine: 'M-001',
      rawMaterial: 'Green HDPE',
      quantityIssued: 600,
      productConfig: { length: 50, width: 25, gsm: 120 },
      status: 'pending'
    },
    {
      id: 'BATCH-1254',
      allocationDate: '2026-01-24',
      machine: 'M-002',
      rawMaterial: 'Black HDPE',
      quantityIssued: 500,
      productConfig: { length: 40, width: 20, gsm: 100 },
      status: 'pending'
    },
    {
      id: 'BATCH-1255',
      allocationDate: '2026-01-25',
      machine: 'M-004',
      rawMaterial: 'Green HDPE',
      quantityIssued: 800,
      productConfig: { length: 60, width: 30, gsm: 150 },
      status: 'pending'
    }
  ];

  const selectedBatchData = pendingBatches.find(b => b.id === selectedBatch);

  const calculateLoss = () => {
    if (!selectedBatchData || !finalQuantity) return null;
    
    const input = selectedBatchData.quantityIssued;
    const output = parseFloat(finalQuantity);
    const difference = input - output;
    const lossPercentage = (difference / input) * 100;
    
    return {
      input,
      output,
      difference,
      lossPercentage,
      isAcceptable: lossPercentage <= 5
    };
  };

  const lossData = calculateLoss();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Production Completion</h1>
        <p className="text-sm text-gray-500 mt-1">Record final product output with automatic loss validation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-medium text-gray-900 mb-6">Production Completion Entry</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Completion Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Completion Date
              </label>
              <input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              />
            </div>

            {/* Select Batch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="w-4 h-4 inline mr-1" />
                Select Production Batch
              </label>
              <select
                value={selectedBatch}
                onChange={(e) => {
                  setSelectedBatch(e.target.value);
                  setFinalQuantity('');
                  setShowValidation(false);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              >
                <option value="">-- Select Batch --</option>
                {pendingBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.id} - {batch.machine} - {batch.rawMaterial} ({batch.quantityIssued} kg)
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Details */}
            {selectedBatchData && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Batch Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Allocation Date:</span>
                    <div className="font-medium text-gray-900">{selectedBatchData.allocationDate}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Machine:</span>
                    <div className="font-medium text-gray-900">{selectedBatchData.machine}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Raw Material:</span>
                    <div className="font-medium text-gray-900">{selectedBatchData.rawMaterial}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Quantity Issued:</span>
                    <div className="font-medium text-cyan-600">{selectedBatchData.quantityIssued} kg</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Product Configuration:</span>
                    <div className="font-medium text-gray-900">
                      L: {selectedBatchData.productConfig.length}m × W: {selectedBatchData.productConfig.width}m × GSM: {selectedBatchData.productConfig.gsm}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Final Product Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Weight className="w-4 h-4 inline mr-1" />
                Final Product Quantity (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={finalQuantity}
                onChange={(e) => {
                  setFinalQuantity(e.target.value);
                  setShowValidation(false);
                }}
                placeholder="Enter final product quantity"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
                disabled={!selectedBatch}
              />
            </div>

            {/* Loss Validation Display */}
            {lossData && finalQuantity && (
              <div className={`rounded-lg p-5 border-2 ${
                lossData.isAcceptable 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-orange-50 border-orange-300'
              }`}>
                <div className="flex items-start gap-3 mb-4">
                  {lossData.isAcceptable ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <h3 className={`font-semibold ${
                      lossData.isAcceptable ? 'text-green-900' : 'text-orange-900'
                    }`}>
                      {lossData.isAcceptable 
                        ? 'Production within acceptable loss limit' 
                        : '⚠️ Weight loss exceeds 5%. Please review production.'}
                    </h3>
                    <p className={`text-sm mt-1 ${
                      lossData.isAcceptable ? 'text-green-700' : 'text-orange-700'
                    }`}>
                      {lossData.isAcceptable 
                        ? 'This batch meets quality standards.' 
                        : 'High material loss detected. Investigation recommended.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">Raw Material Input</div>
                    <div className="text-xl font-semibold text-gray-900">{lossData.input} kg</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">Final Product Output</div>
                    <div className="text-xl font-semibold text-cyan-600">{lossData.output} kg</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">Weight Difference</div>
                    <div className="text-xl font-semibold text-gray-900">{lossData.difference.toFixed(2)} kg</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">Loss Percentage</div>
                    <div className={`text-xl font-semibold ${
                      lossData.isAcceptable ? 'text-green-600' : 'text-orange-600'
                    }`}>
                      {lossData.lossPercentage.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!selectedBatch || !finalQuantity}
                className="flex-1 bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-cyan-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Complete Production
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedBatch('');
                  setFinalQuantity('');
                  setShowValidation(false);
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </form>

          {/* Success Message */}
          {showValidation && lossData && (
            <div className="mt-6 bg-cyan-50 border border-cyan-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-cyan-900">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Production completed successfully!</span>
              </div>
              <p className="text-sm text-cyan-700 mt-1">
                Batch {selectedBatch} has been recorded. Stock updated automatically.
              </p>
            </div>
          )}
        </div>

        {/* Pending Batches Sidebar */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Pending Batches</h3>
          <div className="space-y-3">
            {pendingBatches.map((batch) => (
              <div
                key={batch.id}
                onClick={() => {
                  setSelectedBatch(batch.id);
                  setFinalQuantity('');
                  setShowValidation(false);
                }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedBatch === batch.id
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-gray-900 mb-2">{batch.id}</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Machine: {batch.machine}</div>
                  <div>Material: {batch.rawMaterial}</div>
                  <div className="font-medium text-cyan-600">{batch.quantityIssued} kg issued</div>
                  <div className="text-gray-500">{batch.allocationDate}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
