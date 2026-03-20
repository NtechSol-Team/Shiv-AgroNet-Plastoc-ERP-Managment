import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Search, AlertCircle, RefreshCcw, Trash2, Edit2, X, Check, ChevronDown, ChevronRight, Layers, Box } from 'lucide-react';
import { bellInventoryApi, inventoryApi } from '../lib/api';


interface BellItem {
    id: string;
    code: string;
    finishedProductId: string;
    gsm: string;
    size: string;
    pieceCount: string;
    grossWeight: string;
    weightLoss: string; // In grams
    netWeight: string;  // Calculated: grossWeight - (weightLoss/1000)
    status: 'Available' | 'Issued' | 'Sold' | 'Deleted';
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
    grossWeight: string; // User enters this
    weightLoss: string;  // User enters this in grams
}

export function BellInventory({ onSuccess }: { onSuccess?: () => void }) {
    const [batches, setBatches] = useState<BellBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

    // Filters State
    const [showFilters, setShowFilters] = useState(false);
    const [filterProduct, setFilterProduct] = useState('');
    const [filterSize, setFilterSize] = useState('');
    const [filterGsm, setFilterGsm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Available');

    // Create Form State — Excel-style inline rows
    const [batchCode, setBatchCode] = useState('');

    interface ExcelRow {
        selWidth: string;
        selLength: string;
        selShade: string;
        finishedProductId: string;
        productName: string;
        gsm: string;
        size: string;
        pieceCount: string;
        grossWeight: string;
        weightLoss: string;
    }

    const emptyRow = (): ExcelRow => ({
        selWidth: '', selLength: '', selShade: '',
        finishedProductId: '', productName: '', gsm: '', size: '',
        pieceCount: '1', grossWeight: '', weightLoss: '0'
    });

    const [bellItems, setBellItems] = useState<ExcelRow[]>([emptyRow()]);
    const rowRefs = useRef<(HTMLElement | null)[][]>([]);
    const addBtnRef = useRef<HTMLButtonElement>(null);
    const saveBtnRef = useRef<HTMLButtonElement>(null);



    const getRowProduct = (row: ReturnType<typeof emptyRow>) => {
        if (!row.selWidth || !row.selLength || !row.selShade) return null;
        return products.find(p => p.width === row.selWidth && p.length === row.selLength && p.gsm === row.selShade) || null;
    };

    const updateRow = (idx: number, patch: Partial<ExcelRow>) => {
        setBellItems(prev => {
            const rows = [...prev];
            const updated = { ...rows[idx], ...patch };

            // If width changed, clear downstream
            if ('selWidth' in patch) { updated.selLength = ''; updated.selShade = ''; }
            if ('selLength' in patch) { updated.selShade = ''; }

            // Resolve product from cascading selects
            if (updated.selWidth && updated.selLength && updated.selShade) {
                const match = products.find(p =>
                    p.width === updated.selWidth &&
                    p.length === updated.selLength &&
                    p.gsm === updated.selShade
                );
                if (match) {
                    updated.finishedProductId = match.id;
                    updated.productName = match.name;
                    updated.gsm = match.gsm;
                    updated.size = `${match.length}x${match.width}`;
                } else {
                    updated.finishedProductId = '';
                    updated.productName = '';
                }
            }

            rows[idx] = updated;
            return rows;
        });
    };

    const addNewRow = () => {
        setBellItems(prev => [...prev, emptyRow()]);
        // Focus first cell of new row on next tick
        setTimeout(() => {
            const newIdx = bellItems.length;
            const el = rowRefs.current[newIdx]?.[0];
            if (el) (el as HTMLElement).focus();
        }, 30);
    };

    const removeRow = (idx: number) => {
        setBellItems(prev => prev.filter((_, i) => i !== idx));
    };

    // Handle keyboard navigation: Tab moves forward, Shift+Tab moves back, Enter in last col adds row
    const handleCellKey = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
        const TOTAL_COLS = 6;
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault();
            const nextCol = colIdx + 1;
            if (nextCol < TOTAL_COLS) {
                const el = rowRefs.current[rowIdx]?.[nextCol];
                if (el) (el as HTMLElement).focus();
            } else {
                // Last column — check if we should add new row or move focus
                if (e.key === 'Enter') {
                    addNewRow();
                } else if (e.key === 'Tab') {
                    if (rowIdx < bellItems.length - 1) {
                        // Move to next row, first column
                        const el = rowRefs.current[rowIdx + 1]?.[0];
                        if (el) (el as HTMLElement).focus();
                    } else {
                        // Last row, last column — focus Add Row button
                        addBtnRef.current?.focus();
                    }
                }
            }
        } else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            const prevCol = colIdx - 1;
            if (prevCol >= 0) {
                const el = rowRefs.current[rowIdx]?.[prevCol];
                if (el) (el as HTMLElement).focus();
            } else if (rowIdx > 0) {
                // Move to previous row, last column
                const el = rowRefs.current[rowIdx - 1]?.[TOTAL_COLS - 1];
                if (el) (el as HTMLElement).focus();
            }
        }
    };

    const setRowRef = (rowIdx: number, colIdx: number) => (el: HTMLElement | null) => {
        if (!rowRefs.current[rowIdx]) rowRefs.current[rowIdx] = [];
        rowRefs.current[rowIdx][colIdx] = el;
    };


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

    const updateItem = (index: number, field: keyof ExcelRow, value: string) => {
        updateRow(index, { [field]: value } as Partial<ExcelRow>);
    };

    const removeItem = (index: number) => removeRow(index);


    const getStockSummary = () => {
        const usageMap = new Map<string, number>();
        let totalGrossWeight = 0;
        let totalNetWeight = 0;

        bellItems.forEach(item => {
            const gross = parseFloat(item.grossWeight) || 0;
            const weightLossGrams = parseFloat(item.weightLoss) || 0;
            const netW = gross - (weightLossGrams / 1000); // Net weight = Gross - (weightLoss in grams / 1000)

            totalGrossWeight += gross;
            totalNetWeight += netW;

            // Stock validation uses NET weight (what we deduct from inventory)
            const current = usageMap.get(item.finishedProductId) || 0;
            usageMap.set(item.finishedProductId, current + netW);
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

        return { totalGrossWeight, totalNetWeight, productSummaries, validationErrors, isValid: validationErrors.length === 0 };
    };

    const { totalGrossWeight, totalNetWeight, productSummaries, validationErrors, isValid } = getStockSummary();

    const handleSubmit = async () => {
        setError(null);
        setIsSubmitting(true);
        try {
            // Filter out completely empty rows
            const validItems = bellItems.filter(item => item.finishedProductId && item.grossWeight);
            if (validItems.length === 0) throw new Error('Please add at least one item with product and gross weight filled.');
            for (const item of validItems) {
                const gross = parseFloat(item.grossWeight);
                const weightLossGrams = parseFloat(item.weightLoss) || 0;
                const netWeight = gross - (weightLossGrams / 1000);
                if (!item.grossWeight || gross <= 0) throw new Error('All items must have a valid positive Gross Weight');
                if (netWeight <= 0) throw new Error(`Net Weight must be positive for ${item.productName}.`);
            }
            if (!isValid) throw new Error(validationErrors[0]);

            const payload = {
                batchCode,
                items: validItems.map(item => ({
                    finishedProductId: item.finishedProductId,
                    gsm: item.gsm,
                    size: item.size,
                    pieceCount: item.pieceCount,
                    grossWeight: item.grossWeight,
                    weightLoss: item.weightLoss
                }))
            };
            const res = await bellInventoryApi.createBell(payload);
            if (res.data) {
                setBatchCode('');
                setBellItems([emptyRow()]);
                fetchData();
                if (onSuccess) onSuccess();
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
            if (onSuccess) onSuccess();
        } catch (err) {
            alert('Failed to delete batch');
        }
    };

    const handleDeleteBale = async (baleId: string) => {
        if (!window.confirm('Delete this individual bale? Stock will be restored.')) return;
        try {
            const res = await bellInventoryApi.deleteBaleItem(baleId);
            if (res.data) {
                fetchData();
                if (onSuccess) onSuccess();
            } else {
                setError(res.error || 'Failed to delete bale');
            }
        } catch (err) {
            setError('Failed to delete bale');
        }
    };

    // Edit Bell Item State
    const [editingBellItem, setEditingBellItem] = useState<BellItem | null>(null);
    const [editForm, setEditForm] = useState({ pieceCount: '', netWeight: '' });

    const handleEditBellItem = (item: BellItem) => {
        setEditingBellItem(item);
        setEditForm({ pieceCount: item.pieceCount, netWeight: item.netWeight });
    };

    const handleSaveEditBellItem = async () => {
        if (!editingBellItem) return;

        setIsSubmitting(true);
        try {
            const result = await bellInventoryApi.updateBell(editingBellItem.id, {
                pieceCount: editForm.pieceCount,
                netWeight: editForm.netWeight
            });
            if (result.error) throw new Error(result.error);
            fetchData();
            if (onSuccess) onSuccess();
            setEditingBellItem(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update bell item');
        }
        setIsSubmitting(false);
    };

    const handleCancelEdit = () => {
        setEditingBellItem(null);
        setEditForm({ pieceCount: '', netWeight: '' });
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

        // 2. Filter items within the batch based on the Status Filter
        // If Status is 'All', consider all items except 'Deleted'
        // Otherwise, only consider items matching the filterStatus
        const relevantItems = batch.items?.filter(i =>
            i.status !== 'Deleted' &&
            (filterStatus === 'All' || 
             (filterStatus === 'Issued' ? (i.status === 'Issued' || i.status === 'Sold') : i.status === filterStatus)
            )
        ) || [];

        // If the batch has no relevant items matching the status filter, hide the batch
        if (relevantItems.length === 0) return false;

        // 3. Apply Product/Size/Shade Filters
        // Check if ANY *relevant* item in the batch matches ALL selected filters
        const matchesProduct = !filterProduct || relevantItems.some(i => i.finishedProduct?.name === filterProduct);
        const matchesSize = !filterSize || relevantItems.some(i => i.size === filterSize);
        const matchesGsm = !filterGsm || relevantItems.some(i => i.gsm === filterGsm);

        return matchesProduct && matchesSize && matchesGsm;
    });

    // Calculate Totals based on Filtered Batches AND Filtered Items
    let totalFilteredWeight = 0;
    let totalFilteredPieces = 0;

    filteredBatches.forEach(batch => {
        const relevantItems = batch.items?.filter(i =>
            i.status !== 'Deleted' &&
            (filterStatus === 'All' || 
                (filterStatus === 'Issued' ? (i.status === 'Issued' || i.status === 'Sold') : i.status === filterStatus)
            ) &&
            (!filterProduct || i.finishedProduct?.name === filterProduct) &&
            (!filterSize || i.size === filterSize) &&
            (!filterGsm || i.gsm === filterGsm)
        ) || [];

        totalFilteredPieces += relevantItems.reduce((sum, item) => sum + (parseInt(item.pieceCount) || 0), 0);
        totalFilteredWeight += relevantItems.reduce((sum, item) => sum + (parseFloat(item.netWeight) || 0), 0);
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Bale Production Batches</h2>
                    <p className="text-sm text-slate-500">Manage Multi-Item Bale Production • Inventory Deductions</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2 border rounded-lg flex items-center shadow-sm transition-all text-sm font-medium ${showFilters || filterProduct || filterSize || filterGsm || filterStatus !== 'Available' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        <Search className="w-4 h-4 mr-2" />
                        {showFilters ? 'Hide Filters' : 'Filters'}
                        {(filterProduct || filterSize || filterGsm || filterStatus !== 'Available') && <span className="ml-2 w-2 h-2 bg-blue-600 rounded-full"></span>}
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            {showFilters && (
                <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 mb-6">
                    {/* Filters Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
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
                        <div>
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
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Shade</label>
                            <div className="relative">
                                <select
                                    value={filterGsm}
                                    onChange={(e) => setFilterGsm(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                >
                                    <option value="">All Shade</option>
                                    {uniqueGsms.map(g => <option key={String(g)} value={String(g)}>{g}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                            <div className="relative">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-medium"
                                >
                                    <option value="All">All Status</option>
                                    <option value="Available">Available Only</option>
                                    <option value="Issued">Consumed Only</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Active Totals Banner & Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-blue-50/50 border border-blue-100 rounded-md p-3">
                        <div className="flex items-center gap-6 mb-3 sm:mb-0">
                            <div>
                                <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block">Filtered Totals</span>
                                <span className="text-xs text-blue-600">Aggregate of matching items</span>
                            </div>
                            <div className="h-8 w-px bg-blue-200 hidden sm:block"></div>
                            <div>
                                <span className="text-xs font-medium text-blue-600 block">Total Pieces</span>
                                <span className="text-base font-bold text-blue-900">{totalFilteredPieces}</span>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-blue-600 block">Total Net Weight</span>
                                <span className="text-base font-bold text-blue-900">{totalFilteredWeight.toFixed(2)} kg</span>
                            </div>
                        </div>

                        {(filterProduct || filterSize || filterGsm || filterStatus !== 'Available') && (
                            <button
                                onClick={() => { setFilterProduct(''); setFilterSize(''); setFilterGsm(''); setFilterStatus('Available'); }}
                                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md transition-colors font-medium border border-transparent hover:border-red-200"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Inline Bale Entry Section - Compact Design */}
            <div className="bg-white border border-blue-100 rounded-xl shadow-md overflow-hidden mb-6 border-l-4 border-l-blue-500">
                <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/80 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        <div>
                            <h3 className="text-base font-bold text-slate-800 leading-tight">Quick Bale Entry</h3>
                            <p className="text-[10px] text-slate-500 font-medium">Auto-calc enabled • Tab to navigate</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Batch Code Integrated */}
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm">
                            <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Batch Code:</label>
                            <input
                                type="text"
                                placeholder="e.g. BB-01"
                                className="w-24 border-none p-0 focus:ring-0 text-sm font-mono font-bold text-slate-700 bg-transparent"
                                value={batchCode}
                                onChange={(e) => setBatchCode(e.target.value)}
                            />
                        </div>

                        {/* Save Button Integrated */}
                        <button
                            ref={saveBtnRef}
                            onClick={handleSubmit}
                            disabled={isSubmitting || bellItems.filter(r => r.finishedProductId && r.grossWeight).length === 0 || !isValid}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20 transition-all text-xs font-bold disabled:opacity-50 disabled:shadow-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 outline-none"
                        >
                            {isSubmitting ? <RefreshCcw className="w-3.5 h-3.5 animate-spin mr-2" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            {isSubmitting ? 'Saving...' : 'Save Bale Batch'}
                        </button>
                    </div>
                </div>

                <div className="p-3 space-y-3">
                    {/* Inline Excel Table - Compact Typography & Padding */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/30">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-800 text-slate-100 uppercase tracking-tight">
                                <tr>
                                    <th className="px-2 py-1.5 text-center w-6">#</th>
                                    <th className="px-2 py-1.5 text-left">Width</th>
                                    <th className="px-2 py-1.5 text-left">Length</th>
                                    <th className="px-2 py-1.5 text-left">Shade</th>
                                    <th className="px-2 py-1.5 text-center w-16">Pcs</th>
                                    <th className="px-2 py-1.5 text-center w-24">Gross (Kg)</th>
                                    <th className="px-2 py-1.5 text-center w-20">Loss (g)</th>
                                    <th className="px-2 py-1.5 text-center w-24 bg-slate-700/50">Net (Kg)</th>
                                    <th className="px-2 py-1.5 text-center w-24">Product</th>
                                    <th className="px-2 py-1.5 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {bellItems.map((row, rowIdx) => {
                                    const grossW = parseFloat(row.grossWeight) || 0;
                                    const lossG = parseFloat(row.weightLoss) || 0;
                                    const netW = grossW > 0 ? grossW - (lossG / 1000) : 0;

                                    const widths = Array.from(new Set(products.map(p => p.width).filter(Boolean))).sort();
                                    const lengths = Array.from(new Set(
                                        products.filter(p => !row.selWidth || p.width === row.selWidth).map(p => p.length).filter(Boolean)
                                    )).sort();
                                    const shades = Array.from(new Set(
                                        products.filter(p => (!row.selWidth || p.width === row.selWidth) && (!row.selLength || p.length === row.selLength)).map(p => p.gsm).filter(Boolean)
                                    )).sort();

                                    const product = getRowProduct(row);
                                    const isActive = row.selWidth || row.grossWeight;

                                    return (
                                        <tr key={rowIdx} className={`${isActive ? 'bg-white' : 'bg-transparent'} hover:bg-blue-50/50 transition-colors group`}>
                                            <td className="px-2 py-1 text-[10px] text-slate-400 font-mono text-center">{rowIdx + 1}</td>
                                            <td className="px-1 py-1">
                                                <select
                                                    ref={setRowRef(rowIdx, 0)}
                                                    value={row.selWidth}
                                                    onChange={(e) => updateRow(rowIdx, { selWidth: e.target.value })}
                                                    onKeyDown={(e) => handleCellKey(e, rowIdx, 0)}
                                                    className="w-full border-none hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 text-xs bg-transparent outline-none transition-all"
                                                >
                                                    <option value="">W</option>
                                                    {widths.map(w => <option key={w} value={w}>{w}m</option>)}
                                                </select>
                                            </td>
                                            <td className="px-1 py-1">
                                                <select
                                                    ref={setRowRef(rowIdx, 1)}
                                                    value={row.selLength}
                                                    onChange={(e) => updateRow(rowIdx, { selLength: e.target.value })}
                                                    onKeyDown={(e) => handleCellKey(e, rowIdx, 1)}
                                                    disabled={!row.selWidth}
                                                    className="w-full border-none hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 text-xs bg-transparent outline-none transition-all disabled:opacity-30"
                                                >
                                                    <option value="">L</option>
                                                    {lengths.map(l => <option key={l} value={l}>{l}m</option>)}
                                                </select>
                                            </td>
                                            <td className="px-1 py-1">
                                                <select
                                                    ref={setRowRef(rowIdx, 2)}
                                                    value={row.selShade}
                                                    onChange={(e) => updateRow(rowIdx, { selShade: e.target.value })}
                                                    onKeyDown={(e) => handleCellKey(e, rowIdx, 2)}
                                                    disabled={!row.selLength}
                                                    className="w-full border-none hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 text-xs bg-transparent outline-none transition-all disabled:opacity-30"
                                                >
                                                    <option value="">S</option>
                                                    {shades.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-1 py-1">
                                                <input
                                                    ref={setRowRef(rowIdx, 3)}
                                                    type="number" min="1"
                                                    value={row.pieceCount}
                                                    onChange={(e) => updateRow(rowIdx, { pieceCount: e.target.value })}
                                                    onKeyDown={(e) => handleCellKey(e, rowIdx, 3)}
                                                    onFocus={(e) => e.target.select()}
                                                    className="w-full border-none hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5 text-xs text-right font-mono bg-transparent outline-none transition-all"
                                                />
                                            </td>
                                            <td className="px-1 py-1">
                                                <input
                                                    ref={setRowRef(rowIdx, 4)}
                                                    type="number" step="0.01"
                                                    value={row.grossWeight}
                                                    onChange={(e) => updateRow(rowIdx, { grossWeight: e.target.value })}
                                                    onKeyDown={(e) => handleCellKey(e, rowIdx, 4)}
                                                    onFocus={(e) => e.target.select()}
                                                    placeholder="0.00"
                                                    className="w-full border-none hover:bg-blue-50 focus:bg-white focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs text-right font-mono font-bold bg-transparent outline-none transition-all text-blue-700 placeholder:text-slate-300"
                                                />
                                            </td>
                                            <td className="px-1 py-1">
                                                <input
                                                    ref={setRowRef(rowIdx, 5)}
                                                    type="number" step="1" min="0"
                                                    value={row.weightLoss}
                                                    onChange={(e) => updateRow(rowIdx, { weightLoss: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.preventDefault(); addNewRow(); }
                                                        else handleCellKey(e, rowIdx, 5);
                                                    }}
                                                    onFocus={(e) => e.target.select()}
                                                    placeholder="0"
                                                    className="w-full border-none hover:bg-orange-50 focus:bg-white focus:ring-1 focus:ring-orange-300 rounded px-1 py-0.5 text-xs text-right font-mono bg-transparent outline-none transition-all text-orange-600 placeholder:text-slate-300"
                                                />
                                            </td>
                                            <td className="px-2 py-1 text-center font-bold text-slate-800 bg-slate-100/30">
                                                {netW > 0 ? netW.toFixed(2) : <span className="text-slate-200">-</span>}
                                            </td>
                                            <td className="px-2 py-1 text-center">
                                                {product ? (
                                                    <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 font-bold max-w-[70px] truncate block mx-auto" title={product.name}>
                                                        {product.name.split(' ')[0]}
                                                    </span>
                                                ) : row.selWidth && row.selLength && row.selShade ? (
                                                    <span className="text-[9px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">ERR</span>
                                                ) : null}
                                            </td>
                                            <td className="px-1 py-1 text-center">
                                                {bellItems.length > 1 && (
                                                    <button onClick={() => removeRow(rowIdx)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr className="divide-x divide-slate-100">
                                    <td colSpan={4} className="px-3 py-1.5">
                                        <button
                                            ref={addBtnRef}
                                            onClick={addNewRow}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Tab' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    saveBtnRef.current?.focus();
                                                }
                                            }}
                                            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold transition-colors focus:ring-1 focus:ring-blue-400 rounded outline-none"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add Row
                                        </button>
                                    </td>
                                    <td className="px-2 py-1.5 text-center text-[10px] font-bold text-slate-500 uppercase">
                                        Pcs: <span className="text-slate-800 ml-0.5 font-mono">{bellItems.reduce((s, r) => s + (parseInt(r.pieceCount) || 0), 0)}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-[10px] font-bold text-slate-500 uppercase">
                                        Grs: <span className="text-blue-700 ml-0.5 font-mono">{bellItems.reduce((s, r) => s + (parseFloat(r.grossWeight) || 0), 0).toFixed(2)}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-center" colSpan={2}>
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Net:</span>
                                            <span className="text-sm font-black text-green-700 font-mono tracking-tight">
                                                {bellItems.reduce((s, r) => {
                                                    const g = parseFloat(r.grossWeight) || 0;
                                                    const l = parseFloat(r.weightLoss) || 0;
                                                    return s + (g > 0 ? g - l / 1000 : 0);
                                                }, 0).toFixed(2)} <span className="text-[9px] uppercase ml-0.5">kg</span>
                                            </span>
                                        </div>
                                    </td>
                                    <td colSpan={2} className="px-4 py-1.5 bg-green-50/30">
                                        {/* Dynamic validation summary - subtle */}
                                        {productSummaries.length > 0 && !isValid && (
                                            <div className="flex items-center gap-1 text-[10px] text-red-600 font-bold">
                                                <AlertCircle className="w-3 h-3" />
                                                <span>Insufficient Stock!</span>
                                            </div>
                                        )}
                                        {isValid && productSummaries.length > 0 && (
                                            <div className="flex items-center gap-1 text-[10px] text-green-600 font-bold">
                                                <Check className="w-3 h-3" />
                                                <span>Stock Valid</span>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Stock validation hints - Super compact badges */}
                    {productSummaries.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {productSummaries.map((s, i) => (
                                <div key={i} className={`px-2 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1.5 transition-all ${s.isSubSufficient ? 'bg-slate-100/50 border-slate-200 text-slate-600' : 'bg-red-50 border-red-100 text-red-700 animate-pulse'}`}>
                                    <div className={`w-1 h-1 rounded-full ${s.isSubSufficient ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className="truncate max-w-[100px]">{s.name}:</span>
                                    <span>{s.available.toFixed(1)} avail</span>
                                    {s.used > 0 && <span className="opacity-50">/ {s.used.toFixed(1)} req</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {error}
                </div>
            )}
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
                                                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Size / Shade</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Pieces</th>
                                                                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Weight</th>
                                                                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Status</th>
                                                                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {batch.items?.filter(i =>
                                                                    i.status !== 'Deleted' &&
                                                                    (filterStatus === 'All' || 
                                                                        (filterStatus === 'Issued' ? (i.status === 'Issued' || i.status === 'Sold') : i.status === filterStatus)
                                                                    ) &&
                                                                    (!filterProduct || i.finishedProduct?.name === filterProduct) &&
                                                                    (!filterSize || i.size === filterSize) &&
                                                                    (!filterGsm || i.gsm === filterGsm)
                                                                ).map((item) => (
                                                                    <tr key={item.id} className={['Issued', 'Sold'].includes(item.status) ? 'bg-gray-50/50' : ''}>
                                                                        <td className="px-4 py-2 font-mono text-xs text-blue-600">{item.code}</td>
                                                                        <td className="px-4 py-2 font-medium text-gray-900">{item.finishedProduct?.name || 'Unknown Product'}</td>
                                                                        <td className="px-4 py-2 text-gray-600">{item.size} | {item.gsm} Shade</td>
                                                                        <td className="px-4 py-2 text-right text-gray-600">
                                                                            {editingBellItem?.id === item.id ? (
                                                                                <input
                                                                                    type="number"
                                                                                    value={editForm.pieceCount}
                                                                                    onChange={(e) => setEditForm({ ...editForm, pieceCount: e.target.value })}
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    className="w-20 px-2 py-1 border border-blue-300 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                                                                                />
                                                                            ) : item.pieceCount}
                                                                        </td>
                                                                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                                                                            {editingBellItem?.id === item.id ? (
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    value={editForm.netWeight}
                                                                                    onChange={(e) => setEditForm({ ...editForm, netWeight: e.target.value })}
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    className="w-24 px-2 py-1 border border-blue-300 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                                                                                />
                                                                            ) : item.netWeight}
                                                                        </td>
                                                                        <td className="px-4 py-2 text-center">
                                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide ${item.status === 'Available' ? 'bg-green-100 text-green-700' :
                                                                                ['Issued', 'Sold'].includes(item.status) ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                                                                                }`}>
                                                                                {item.status === 'Issued' ? 'Consumed' : item.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-2 text-center">
                                                                            {item.status === 'Available' && (
                                                                                editingBellItem?.id === item.id ? (
                                                                                    <div className="flex items-center justify-center space-x-2">
                                                                                        <button
                                                                                            onClick={handleSaveEditBellItem}
                                                                                            disabled={isSubmitting}
                                                                                            className="text-green-600 hover:text-green-800 p-1"
                                                                                            title="Save"
                                                                                        >
                                                                                            <Check className="w-4 h-4" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={handleCancelEdit}
                                                                                            className="text-red-600 hover:text-red-800 p-1"
                                                                                            title="Cancel"
                                                                                        >
                                                                                            <X className="w-4 h-4" />
                                                                                        </button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="flex items-center justify-center space-x-2">
                                                                                        <button
                                                                                            onClick={() => handleEditBellItem(item)}
                                                                                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                                                                            title="Edit Item"
                                                                                        >
                                                                                            <Edit2 className="w-4 h-4" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleDeleteBale(item.id)}
                                                                                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                                                            title="Delete Bale"
                                                                                        >
                                                                                            <Trash2 className="w-4 h-4" />
                                                                                        </button>
                                                                                    </div>
                                                                                )
                                                                            )}
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



        </div>
    );
}
