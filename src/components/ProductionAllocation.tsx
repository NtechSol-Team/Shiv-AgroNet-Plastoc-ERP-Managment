import React, { useState, useEffect } from 'react';
import { Calendar, Cpu, Package, Ruler, Weight, Loader2, AlertCircle, CheckCircle, Factory } from 'lucide-react';
import { inventoryApi, productionApi, mastersApi } from '../lib/api';

export function ProductionAllocation() {
  const [formData, setFormData] = useState({
    allocationDate: new Date().toISOString().split('T')[0],
    machine: '',
    targetProduct: '',
    rawMaterial: '',
    materialBatchId: '',
    quantity: '',
    length: '',
    width: '',
    gsm: ''
  });

  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Fetch batches when material changes
  useEffect(() => {
    if (formData.rawMaterial) {
      // Clear batch when material changes
      setFormData(prev => ({ ...prev, materialBatchId: '' }));
      // Fetch new batches
      inventoryApi.getAvailableBatches(formData.rawMaterial)
        .then(res => setBatches(res.data || []))
        .catch(err => console.error(err));
    } else {
      setBatches([]);
    }
  }, [formData.rawMaterial]);

  const loadInitialData = async () => {
    try {
      const [matRes, machRes, prodRes] = await Promise.all([
        inventoryApi.getRawMaterials(),
        mastersApi.getMachines(),
        inventoryApi.getFinishedGoods()
      ]);
      if (matRes.data) setRawMaterials(matRes.data);
      if (machRes.data) setMachines(machRes.data);
      if (prodRes.data) setFinishedProducts(prodRes.data);
    } catch (e) {
      console.error("Failed to load data", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rawMaterial || !formData.quantity || !formData.targetProduct || !formData.machine) {
      setError("Please fill all required fields");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        allocationDate: formData.allocationDate,
        machineId: formData.machine,
        rawMaterialId: formData.rawMaterial,
        finishedProductId: formData.targetProduct,
        inputQuantity: formData.quantity,
        inputs: [{
          rawMaterialId: formData.rawMaterial,
          quantity: formData.quantity,
          materialBatchId: formData.materialBatchId || undefined
        }],
      };

      const result = await productionApi.createBatch(payload);
      if (result.error) throw new Error(result.error);

      setSuccess(`Allocation Confirmed! Batch: ${result.data?.code}`);
      setFormData({
        allocationDate: new Date().toISOString().split('T')[0],
        machine: '',
        targetProduct: '',
        rawMaterial: '',
        materialBatchId: '',
        quantity: '',
        length: '',
        width: '',
        gsm: ''
      });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to allocate');
    } finally {
      setLoading(false);
    }
  };

  const selectedMaterial = rawMaterials.find(m => m.id === formData.rawMaterial);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Raw Material Allocation</h1>
        <p className="text-sm text-gray-500 mt-1">Allocate raw materials to production machines</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Allocation Form */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-medium text-gray-900 mb-4">Material Allocation Entry</h2>

          {success && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center text-sm">
              <CheckCircle className="w-4 h-4 mr-2" />
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center text-sm">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Allocation Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Allocation Date
              </label>
              <input
                type="date"
                value={formData.allocationDate}
                onChange={(e) => setFormData({ ...formData, allocationDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              />
            </div>

            {/* Machine Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Cpu className="w-4 h-4 inline mr-1" />
                Select Machine
              </label>
              <select
                value={formData.machine}
                onChange={(e) => setFormData({ ...formData, machine: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              >
                <option value="">-- Select Machine --</option>
                {machines.map((machine: any) => (
                  <option key={machine.id} value={machine.id}>{machine.name}</option>
                ))}
              </select>
            </div>

            {/* Target Product Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Factory className="w-4 h-4 inline mr-1" />
                Target Product
              </label>
              <select
                value={formData.targetProduct}
                onChange={(e) => setFormData({ ...formData, targetProduct: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              >
                <option value="">-- Select Product --</option>
                {finishedProducts.map((product: any) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </div>

            {/* Raw Material Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="w-4 h-4 inline mr-1" />
                Select Raw Material
              </label>
              <select
                value={formData.rawMaterial}
                onChange={(e) => setFormData({ ...formData, rawMaterial: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              >
                <option value="">-- Select Raw Material --</option>
                {rawMaterials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} (Stock: {parseFloat(material.stock || 0).toFixed(2)} kg)
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Selection */}
            {formData.rawMaterial && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Batch (Optional - FIFO by default)
                </label>
                <select
                  value={formData.materialBatchId}
                  onChange={(e) => setFormData({ ...formData, materialBatchId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="">Auto-Select (FIFO)</option>
                  {batches.map((batch: any) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchCode} — Qty: {parseFloat(batch.quantity).toFixed(2)} (Inv: {batch.invoiceNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Available Stock Display */}
            {selectedMaterial && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                <div className="text-sm text-cyan-900">
                  <span className="font-medium">Total Available Stock:</span>
                  <span className="ml-2 text-lg font-semibold">{parseFloat(selectedMaterial.stock || 0).toFixed(2)} kg</span>
                </div>
              </div>
            )}

            {/* Quantity to Issue */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Weight className="w-4 h-4 inline mr-1" />
                Quantity to Issue (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="Enter quantity in kg"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                required
              />
              {formData.quantity && selectedMaterial && parseFloat(formData.quantity) > parseFloat(selectedMaterial.stock || 0) && (
                <p className="text-sm text-red-600 mt-1">⚠️ Quantity exceeds available stock</p>
              )}
            </div>

            {/* Product Configuration */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="font-medium text-gray-900 mb-4">
                <Ruler className="w-4 h-4 inline mr-1" />
                Product Configuration
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Length (meters)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.length}
                    onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                    placeholder="e.g., 50"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Width (meters)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                    placeholder="e.g., 25"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GSM
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.gsm}
                    onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                    placeholder="e.g., 120"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Allocation Summary */}
            {formData.quantity && formData.machine && formData.rawMaterial && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Allocation Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Machine:</span>
                    <span className="font-medium text-gray-900">{formData.machine}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Raw Material:</span>
                    <span className="font-medium text-gray-900">{selectedMaterial?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quantity Issued:</span>
                    <span className="font-medium text-cyan-600">{formData.quantity} kg</span>
                  </div>
                  {formData.length && formData.width && formData.gsm && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Product Spec:</span>
                      <span className="font-medium text-gray-900">
                        {formData.length}m × {formData.width}m × {formData.gsm} GSM
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-cyan-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-cyan-700 transition-colors"
              >
                Allocate Material to Production
              </button>
              <button
                type="button"
                onClick={() => setFormData({
                  allocationDate: new Date().toISOString().split('T')[0],
                  machine: '',
                  targetProduct: '',
                  rawMaterial: '',
                  materialBatchId: '',
                  quantity: '',
                  length: '',
                  width: '',
                  gsm: ''
                })}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Raw Material Stock Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Raw Material Stock</h3>
          <div className="space-y-4">
            {rawMaterials.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Loading materials...</p>
            ) : (
              rawMaterials.map((material) => {
                const stockValue = parseFloat(material.stock || 0);
                return (
                  <div
                    key={material.id}
                    className="p-4 rounded-lg border border-gray-200 hover:border-cyan-300 transition-colors"
                  >
                    <div className="font-medium text-gray-900 mb-2">{material.name}</div>
                    <div className="text-xs text-gray-600 mb-2">ID: {material.code}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold text-cyan-600">{stockValue.toFixed(2)}</span>
                      <span className="text-sm text-gray-500">kg</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${stockValue > 5000 ? 'bg-green-500' :
                            stockValue > 2000 ? 'bg-orange-500' : 'bg-red-500'
                            }`}
                          style={{ width: `${Math.min((stockValue / 10000) * 100, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {stockValue > 5000 ? 'Good stock' :
                          stockValue > 2000 ? 'Moderate stock' : 'Low stock'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
