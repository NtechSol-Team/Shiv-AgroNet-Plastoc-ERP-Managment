import React, { useState, useEffect } from 'react';
import { Package, Plus, Search, Scale, AlertCircle, RefreshCcw, Trash2, Edit2, X, Check, ArrowRight, ChevronDown, ChevronRight, Layers, Box } from 'lucide-react';
import { bellInventoryApi, inventoryApi } from '../lib/api';

interface BellItem {
    id: string;
    code: string;
    finishedProductId: string;
    gsm: string;
    size: string;
    pieceCount: string;
    netWeight: string;
    status: 'Available' | 'Issued' | 'Deleted';
    finishedProduct?: {
        name: string;
    };
}

interface BellBatch {
    id: string;
    code: string;
    totalWeight: string;
    status: 'Active' | 'Deleted';
    createdAt: string;
    items?: BellItem[];
}

interface Product {
    id: string;
    name: string;
    gsm: string;
    length: string;
    width: string;
    stock: string;
}

interface NewBellItem {
    finishedProductId: string;
    productName: string; // For display
    gsm: string;
    size: string;
    pieceCount: string;
    netWeight: string;
}

export function BellInventory() {
    const [batches, setBatches] = useState<BellBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

    // Filters State
    const [showFilters, setShowFilters] = useState(false);
    const [filterProduct, setFilterProduct] = useState('');
    const [filterSize, setFilterSize] = useState('');
    const [filterGsm, setFilterGsm] = useState('');

    // Create Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [bellItems, setBellItems] = useState<NewBellItem[]>([]);

    // Derived state for current product selection
    const selectedProduct = products.find(p => p.id === selectedProductId);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [batchesRes, productsRes] = await Promise.all([
                bellInventoryApi.getBells(),
                inventoryApi.getFinishedGoods()
            ]);
            if (batchesRes.data) setBatches(batchesRes.data);
            if (productsRes.data) setProducts(productsRes.data);
        } catch (err) {
            setError('Failed to load data');
        }
        setLoading(false);
    };

    const toggleExpand = (batchId: string) => {
        const newSet = new Set(expandedBatches);
        if (newSet.has(batchId)) newSet.delete(batchId);
        else newSet.add(batchId);
        setExpandedBatches(newSet);
    };

    const handleProductChange = (productId: string) => {
        setSelectedProductId(productId);
    };

    const addItem = () => {
        if (!selectedProduct) return;
        setBellItems([...bellItems, {
            finishedProductId: selectedProduct.id,
            productName: selectedProduct.name,
            gsm: selectedProduct.gsm,
            size: `${selectedProduct.length}x${selectedProduct.width}`,
            pieceCount: '1',
            netWeight: ''
        }]);
    };

    const updateItem = (index: number, field: keyof NewBellItem, value: string) => {
        const newItems = [...bellItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setBellItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = bellItems.filter((_, i) => i !== index);
        setBellItems(newItems);
    };

    const getStockSummary = () => {
        const usageMap = new Map<string, number>();
        let totalWeight = 0;

        bellItems.forEach(item => {
            const w = parseFloat(item.netWeight) || 0;
            totalWeight += w;
            const current = usageMap.get(item.finishedProductId) || 0;
            usageMap.set(item.finishedProductId, current + w);
        });

        const validationErrors: string[] = [];
        const productSummaries: { name: string, used: number, available: number, isSubSufficient: boolean }[] = [];

        usageMap.forEach((used, pid) => {
            const prod = products.find(p => p.id === pid);
            if (prod) {
                const available = parseFloat(prod.stock || '0');
                productSummaries.push({
                    name: prod.name,
                    used,
                    available,
                    isSubSufficient: used <= available
                });
                if (used > available) {
                    validationErrors.push(`Insufficient stock for ${prod.name} (Req: ${used.toFixed(2)}, Avail: ${available.toFixed(2)})`);
                }
            }
        });

        return { totalWeight, productSummaries, validationErrors, isValid: validationErrors.length === 0 };
    };

    const { totalWeight, productSummaries, validationErrors, isValid } = getStockSummary();

    const handleSubmit = async () => {
        setError(null);
        setIsSubmitting(true);
        try {
            if (bellItems.length === 0) throw new Error('At least one item is required');
            for (const item of bellItems) {
                if (!item.netWeight || parseFloat(item.netWeight) <= 0) throw new Error('All items must have a valid positive Net Weight');
            }
            if (!isValid) throw new Error(validationErrors[0]);

            const payload = {
                items: bellItems.map(item => ({
                    finishedProductId: item.finishedProductId,
                    gsm: item.gsm,
                    size: item.size,
                    pieceCount: item.pieceCount,
                    netWeight: item.netWeight
                }))
            };
            const res = await bellInventoryApi.createBell(payload);
            if (res.data) {
                setShowCreateModal(false);
                setSelectedProductId('');
                setBellItems([]);
                fetchData();
            } else if (res.error) {
                setError(res.error);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to create batch');
        }
        setIsSubmitting(false);
    };

    const handleDeleteBatch = async (id: string) => {
        if (!window.confirm('Delete this Batch? Items will be removed and Stock restored.')) return;
        try {
            await bellInventoryApi.deleteBell(id);
            fetchData();
        } catch (err) {
            alert('Failed to delete batch');
        }
    };

    // Calculate Unique Filter Options
    const allItems = batches.flatMap(b => b.items || []);
    const uniqueProducts = Array.from(new Set(allItems.map(i => i.finishedProduct?.name))).filter(Boolean).sort();
    const uniqueSizes = Array.from(new Set(allItems.map(i => i.size))).filter(Boolean).sort();
    const uniqueGsms = Array.from(new Set(allItems.map(i => i.gsm))).filter(Boolean).sort((a, b) => parseFloat(String(a)) - parseFloat(String(b)));

    // Filter Logic
    const filteredBatches = batches.filter(batch => {
        // 1. Hide Deleted Batches (backend does this, but safely check)
        if (batch.status === 'Deleted') return false;

        // 2. Hide Empty Batches or Batches where ALL items are Issued/Deleted
        // We only want to show batches that have at least one 'Available' item
        const availableItems = batch.items?.filter(i => i.status === 'Available') || [];
        if (availableItems.length === 0) return false;

        // 3. Apply Filters
        // Check if ANY *Available* item in the batch matches ALL selected filters
        const matchesProduct = !filterProduct || availableItems.some(i => i.finishedProduct?.name === filterProduct);
        const matchesSize = !filterSize || availableItems.some(i => i.size === filterSize);
        const matchesGsm = !filterGsm || availableItems.some(i => i.gsm === filterGsm);

        return matchesProduct && matchesSize && matchesGsm;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Bell Production Batches</h2>
                    <p className="text-sm text-slate-500">Manage Multi-Item Bell Production • Inventory Deductions</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2 border rounded-lg flex items-center shadow-sm transition-all text-sm font-medium ${showFilters || filterProduct || filterSize || filterGsm ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        <Search className="w-4 h-4 mr-2" />
                        {showFilters ? 'Hide Filters' : 'Filters'}
                        {(filterProduct || filterSize || filterGsm) && <span className="ml-2 w-2 h-2 bg-blue-600 rounded-full"></span>}
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-all text-sm font-medium"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create New Bell Batch
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            {showFilters && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-wrap gap-4 items-end animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Product</label>
                        <div className="relative">
                            <select
                                value={filterProduct}
                                onChange={(e) => setFilterProduct(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            >
                                <option value="">All Products</option>
                                {uniqueProducts.map(p => <option key={String(p)} value={String(p)}>{p}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="w-40">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Size</label>
                        <div className="relative">
                            <select
                                value={filterSize}
                                onChange={(e) => setFilterSize(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            >
                                <option value="">All Sizes</option>
                                {uniqueSizes.map(s => <option key={String(s)} value={String(s)}>{s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="w-40">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by GSM</label>
                        <div className="relative">
                            <select
                                value={filterGsm}
                                onChange={(e) => setFilterGsm(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                            >
                                <option value="">All GSM</option>
                                {uniqueGsms.map(g => <option key={String(g)} value={String(g)}>{g}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    {(filterProduct || filterSize || filterGsm) && (
                        <button
                            onClick={() => { setFilterProduct(''); setFilterSize(''); setFilterGsm(''); }}
                            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors font-medium"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {error}
                </div>
            )}

            {/* Batch List */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-10"></th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Batch Code</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Product Name</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total Pieces</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total Weight</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Status</th>
                            <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredBatches.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                                    <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No batches match the selected filters</p>
                                </td>
                            </tr>
                        ) : (
                            filteredBatches.map((batch) => {
                                // Calculate total pieces
                                const totalPieces = batch.items?.reduce((sum, item) => sum + (parseInt(item.pieceCount) || 0), 0) || 0;

                                // Get unique product names
                                const uniqueProducts = Array.from(new Set(batch.items?.map(i => i.finishedProduct?.name || 'Unknown') || []));
                                const productNameDisplay = uniqueProducts.length > 1
                                    ? `Mixed (${uniqueProducts.slice(0, 2).join(', ')}${uniqueProducts.length > 2 ? '...' : ''})`
                                    : uniqueProducts[0] || '-';

                                return (
                                    <React.Fragment key={batch.id}>
                                        <tr className={`hover:bg-slate-50 transition-colors ${expandedBatches.has(batch.id) ? 'bg-slate-50' : ''}`}>
                                            <td className="px-6 py-4 cursor-pointer" onClick={() => toggleExpand(batch.id)}>
                                                {expandedBatches.has(batch.id) ?
                                                    <ChevronDown className="w-4 h-4 text-gray-500" /> :
                                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                                }
                                            </td>
                                            <td className="px-6 py-4 font-mono text-sm font-semibold text-blue-600">{batch.code}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{productNameDisplay}</td>
                                            <td className="px-6 py-4 text-sm text-right font-mono">{totalPieces}</td>
                                            <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">{batch.totalWeight} kg</td>
                                            <td className="px-6 py-4 text-sm text-right">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${batch.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {batch.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {batch.status === 'Active' && (
                                                    <button
                                                        onClick={() => handleDeleteBatch(batch.id)}
                                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                        title="Delete Batch"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {/* Expanded Items Only */}
                                        {expandedBatches.has(batch.id) && (
                                            <tr>
                                                <td colSpan={7} className="px-0 py-0 bg-slate-50 border-b border-gray-200">
                                                    <div className="py-2 px-6">
                                                        <table className="w-full text-sm bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                            <thead className="bg-gray-100">
                                                                <tr>
                                                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Item Code</th>
                                                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Product</th>
                                                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Size / GSM</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Pieces</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Weight</th>
                                                                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {batch.items?.map((item) => (
                                                                    <tr key={item.id}>
                                                                        <td className="px-4 py-2 font-mono text-xs text-blue-600">{item.code}</td>
                                                                        <td className="px-4 py-2 font-medium text-gray-900">{item.finishedProduct?.name || 'Unknown Product'}</td>
                                                                        <td className="px-4 py-2 text-gray-600">{item.size} | {item.gsm} GSM</td>
                                                                        <td className="px-4 py-2 text-right text-gray-600">{item.pieceCount}</td>
                                                                        <td className="px-4 py-2 text-right font-medium text-gray-900">{item.netWeight}</td>
                                                                        <td className="px-4 py-2 text-center">
                                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide ${item.status === 'Available' ? 'bg-green-100 text-green-700' :
                                                                                item.status === 'Issued' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                                                                }`}>
                                                                                {item.status}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
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

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Create Mixed Bell Batch</h3>
                                <p className="text-sm text-gray-500">Produce multiple bells from various products</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-grow space-y-6">

                            {/* Input Form */}
                            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                                    <Box className="w-4 h-4 mr-2" />
                                    Add Items to Batch
                                </h4>
                                <div className="flex gap-4 items-end">
                                    <div className="flex-grow">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Product</label>
                                        <div className="relative">
                                            <select
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm"
                                                value={selectedProductId}
                                                onChange={(e) => handleProductChange(e.target.value)}
                                            >
                                                <option value="">Choose a finished product...</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} ({p.length}x{p.width}) - Stock: {parseFloat(p.stock || '0').toFixed(0)}kg
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <button
                                        onClick={addItem}
                                        disabled={!selectedProductId}
                                        className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm font-medium transition-all text-sm h-[38px]"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add to Batch
                                    </button>
                                </div>
                                {selectedProduct && (
                                    <div className="mt-2 text-xs text-blue-600 flex items-center">
                                        <Check className="w-3 h-3 mr-1" />
                                        Selected: {selectedProduct.name} — Current Stock: <strong>{parseFloat(selectedProduct.stock || '0').toFixed(2)} kg</strong>
                                    </div>
                                )}
                            </div>

                            {/* Items Table */}
                            {bellItems.length > 0 && (
                                <div className="space-y-3">
                                    <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">
                                            <tr>
                                                <th className="px-4 py-2 w-12">#</th>
                                                <th className="px-4 py-2">Product</th>
                                                <th className="px-4 py-2">GSM / Size</th>
                                                <th className="px-4 py-2 w-24">Pieces</th>
                                                <th className="px-4 py-2 w-40">Net Weight (Kg)</th>
                                                <th className="px-4 py-2 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {bellItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 group">
                                                    <td className="px-4 py-2 text-center text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="text-sm text-gray-500">{item.size} | {item.gsm} GSM</div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.pieceCount}
                                                            onChange={(e) => updateItem(idx, 'pieceCount', e.target.value)}
                                                            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={item.netWeight}
                                                            onChange={(e) => updateItem(idx, 'netWeight', e.target.value)}
                                                            className="w-full border border-blue-200 bg-blue-50/30 rounded px-2 py-1 text-sm text-right font-bold text-gray-900 focus:ring-1 focus:ring-blue-500 outline-none"
                                                            placeholder="0.00"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button
                                                            onClick={() => removeItem(idx)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Stock Usage Summary */}
                            {productSummaries.length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                                    {productSummaries.map((summary, idx) => (
                                        <div key={idx} className={`p-3 rounded-lg border ${summary.isSubSufficient ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                            <div className="text-xs font-semibold uppercase mb-1 opacity-70 truncate" title={summary.name}>{summary.name}</div>
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <div className="text-xs text-gray-500">Usage</div>
                                                    <div className="font-bold text-lg">{summary.used.toFixed(2)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500">Available</div>
                                                    <div className={`font-mono text-sm ${summary.isSubSufficient ? 'text-green-700' : 'text-red-600'}`}>
                                                        {summary.available.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex-shrink-0">
                            {/* Footer */}
                            <div className="flex space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium bg-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || !isValid || bellItems.length === 0}
                                    className="flex-[2] px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none font-medium flex justify-center items-center"
                                >
                                    {isSubmitting ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : `Create Batch (${bellItems.length} items)`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
