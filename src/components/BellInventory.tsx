import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Search, AlertCircle, RefreshCcw, Trash2, Edit2, X, Check, ChevronDown, ChevronRight, Layers, Box, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { bellInventoryApi, inventoryApi } from '../lib/api';
import * as XLSX from 'xlsx';

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
    grossWeight: string; // User enters this
    weightLoss: string;  // User enters this in grams
}

export function BellInventory({ onSuccess }: { onSuccess?: () => void }) {
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
    const [filterStatus, setFilterStatus] = useState('Available');

    // Create Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selWidth, setSelWidth] = useState('');
    const [selLength, setSelLength] = useState('');
    const [selShade, setSelShade] = useState('');
    const [batchCode, setBatchCode] = useState('');
    const [bellItems, setBellItems] = useState<NewBellItem[]>([]);

    // Import XLSX State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importRows, setImportRows] = useState<any[]>([]);
    const [importBatchCode, setImportBatchCode] = useState('');
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    // Derived state for current product selection
    const selectedProduct = products.find(p => p.id === selectedProductId);

    // Filter options for Create Modal
    const availableWidths = Array.from(new Set(products.map(p => p.width).filter(Boolean))).sort();
    const availableLengths = Array.from(new Set(
        products
            .filter(p => !selWidth || p.width === selWidth)
            .map(p => p.length)
            .filter(Boolean)
    )).sort();
    const availableShades = Array.from(new Set(
        products
            .filter(p => (!selWidth || p.width === selWidth) && (!selLength || p.length === selLength))
            .map(p => p.gsm)
            .filter(Boolean)
    )).sort();

    // Auto-resolve product based on Width, Length, Shade
    useEffect(() => {
        if (selWidth && selLength && selShade) {
            const match = products.find(p =>
                p.width === selWidth &&
                p.length === selLength &&
                p.gsm === selShade
            );
            if (match) {
                setSelectedProductId(match.id);
            } else {
                setSelectedProductId('');
            }
        } else {
            setSelectedProductId('');
        }
    }, [selWidth, selLength, selShade, products]);

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
            grossWeight: '',
            weightLoss: '0'
        }]);
        setSelWidth('');
        setSelLength('');
        setSelShade('');
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
            if (bellItems.length === 0) throw new Error('At least one item is required');
            for (const item of bellItems) {
                const gross = parseFloat(item.grossWeight);
                const weightLossGrams = parseFloat(item.weightLoss) || 0;
                const netWeight = gross - (weightLossGrams / 1000);

                if (!item.grossWeight || gross <= 0) throw new Error('All items must have a valid positive Gross Weight');
                if (netWeight <= 0) throw new Error(`Net Weight must be positive. Check weight loss values.`);
            }
            if (!isValid) throw new Error(validationErrors[0]);

            const payload = {
                batchCode,
                items: bellItems.map(item => ({
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
                setShowCreateModal(false);
                setSelectedProductId('');
                setBatchCode('');
                setBellItems([]);
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

    // ==================== XLSX IMPORT HANDLERS ====================

    const handleDownloadTemplate = () => {
        const templateData = [
            {
                'Batch Code': 'BB-001',
                'Product Name': 'Product A',
                'Shade (GSM)': '150',
                'Size (LxW)': '120x90',
                'Piece Count': '1',
                'Gross Weight (Kg)': '25.50',
                'Weight Loss (grams)': '200'
            },
            {
                'Batch Code': 'BB-001',
                'Product Name': 'Product B',
                'Shade (GSM)': '200',
                'Size (LxW)': '100x80',
                'Piece Count': '1',
                'Gross Weight (Kg)': '18.75',
                'Weight Loss (grams)': '150'
            }
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        // Set column widths
        ws['!cols'] = [18, 22, 14, 14, 14, 22, 23].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bale Import Template');
        XLSX.writeFile(wb, 'bale_import_template.xlsx');
    };

    const handleImportXlsx = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows: any[] = XLSX.utils.sheet_to_json(sheet);

                if (rows.length === 0) {
                    setImportErrors(['The file is empty or has no data rows.']);
                    setImportRows([]);
                    setShowImportModal(true);
                    return;
                }

                const errors: string[] = [];
                const parsedRows = rows.map((row: any, idx: number) => {
                    const rowNum = idx + 2; // Excel row number (1-indexed + header)
                    const batchCode = String(row['Batch Code'] || '').trim();
                    const productName = String(row['Product Name'] || '').trim();
                    const gsm = String(row['Shade (GSM)'] || '').trim();
                    const size = String(row['Size (LxW)'] || '').trim();
                    const pieceCount = String(row['Piece Count'] || '1').trim();
                    const grossWeight = parseFloat(String(row['Gross Weight (Kg)'] || '0'));
                    const weightLoss = parseFloat(String(row['Weight Loss (grams)'] || '0'));
                    const netWeight = grossWeight - (weightLoss / 1000);

                    if (!batchCode) errors.push(`Row ${rowNum}: Batch Code is missing.`);
                    if (!productName) errors.push(`Row ${rowNum}: Product Name is missing.`);
                    if (!grossWeight || grossWeight <= 0) errors.push(`Row ${rowNum}: Gross Weight must be > 0.`);
                    if (netWeight <= 0) errors.push(`Row ${rowNum}: Net Weight is <= 0 (check Weight Loss).`);

                    // Match product by name
                    const matchedProduct = products.find(
                        p => p.name.trim().toLowerCase() === productName.toLowerCase()
                    );

                    return {
                        batchCode,
                        productName,
                        finishedProductId: matchedProduct?.id || '',
                        productMatched: !!matchedProduct,
                        gsm: gsm || matchedProduct?.gsm || '',
                        size: size || `${matchedProduct?.length || ''}x${matchedProduct?.width || ''}`,
                        pieceCount,
                        grossWeight,
                        weightLoss,
                        netWeight
                    };
                });

                // Detect unmatched products
                parsedRows.forEach((r, idx) => {
                    if (!r.productMatched) {
                        errors.push(`Row ${idx + 2}: Product "${r.productName}" not found in the system.`);
                    }
                });

                // Get batch code from first row
                const detectedBatchCode = parsedRows[0]?.batchCode || '';
                setImportBatchCode(detectedBatchCode);
                setImportRows(parsedRows);
                setImportErrors(errors);
                setShowImportModal(true);
            } catch (err) {
                setImportErrors(['Failed to read the file. Please ensure it is a valid .xlsx file.']);
                setImportRows([]);
                setShowImportModal(true);
            }
        };
        reader.readAsArrayBuffer(file);
        // Reset file input
        e.target.value = '';
    };

    const handleSubmitImport = async () => {
        setImportErrors([]);
        if (!importBatchCode.trim()) {
            setImportErrors(['Batch Code is required.']);
            return;
        }
        const unmatched = importRows.filter(r => !r.productMatched);
        if (unmatched.length > 0) {
            setImportErrors([`Cannot import: ${unmatched.length} product(s) not matched. Please fix the file.`]);
            return;
        }
        setIsImporting(true);
        try {
            const payload = {
                batchCode: importBatchCode.trim(),
                items: importRows.map(r => ({
                    finishedProductId: r.finishedProductId,
                    gsm: r.gsm,
                    size: r.size,
                    pieceCount: r.pieceCount,
                    grossWeight: String(r.grossWeight),
                    weightLoss: String(r.weightLoss)
                }))
            };
            const res = await bellInventoryApi.createBell(payload);
            if (res.data) {
                setShowImportModal(false);
                setImportRows([]);
                setImportBatchCode('');
                fetchData();
                if (onSuccess) onSuccess();
            } else if (res.error) {
                setImportErrors([res.error]);
            }
        } catch (err: any) {
            setImportErrors([err.message || 'Import failed.']);
        }
        setIsImporting(false);
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
            (filterStatus === 'All' || i.status === filterStatus)
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
            (filterStatus === 'All' || i.status === filterStatus) &&
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
                    {/* Hidden file input for XLSX import */}
                    <input
                        ref={importFileRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={handleImportXlsx}
                    />
                    <button
                        onClick={() => importFileRef.current?.click()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-all text-sm font-medium"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Import Bale Data
                    </button>
                    <button
                        onClick={handleDownloadTemplate}
                        className="bg-white hover:bg-gray-50 text-emerald-700 border border-emerald-300 px-4 py-2 rounded-lg flex items-center shadow-sm transition-all text-sm font-medium"
                        title="Download Excel Template"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download Template
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-all text-sm font-medium"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create New Bale Batch
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
                                                                    (filterStatus === 'All' || i.status === filterStatus) &&
                                                                    (!filterProduct || i.finishedProduct?.name === filterProduct) &&
                                                                    (!filterSize || i.size === filterSize) &&
                                                                    (!filterGsm || i.gsm === filterGsm)
                                                                ).map((item) => (
                                                                    <tr key={item.id} className={item.status === 'Issued' ? 'bg-gray-50/50' : ''}>
                                                                        <td className="px-4 py-2 font-mono text-xs text-blue-600">{item.code}</td>
                                                                        <td className="px-4 py-2 font-medium text-gray-900">{item.finishedProduct?.name || 'Unknown Product'}</td>
                                                                        <td className="px-4 py-2 text-gray-600">{item.size} | {item.gsm} Shade</td>
                                                                        <td className="px-4 py-2 text-right text-gray-600">
                                                                            {editingBellItem?.id === item.id ? (
                                                                                <input
                                                                                    type="number"
                                                                                    value={editForm.pieceCount}
                                                                                    onChange={(e) => setEditForm({ ...editForm, pieceCount: e.target.value })}
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
                                                                                    className="w-24 px-2 py-1 border border-blue-300 rounded text-right text-sm focus:ring-1 focus:ring-blue-500"
                                                                                />
                                                                            ) : item.netWeight}
                                                                        </td>
                                                                        <td className="px-4 py-2 text-center">
                                                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide ${item.status === 'Available' ? 'bg-green-100 text-green-700' :
                                                                                item.status === 'Issued' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
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

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Create Mixed Bale Batch</h3>
                                <p className="text-sm text-gray-500">Produce multiple bales from various products</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-grow space-y-6">
                            {/* Batch Info */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                                    <Package className="w-4 h-4 mr-2 text-blue-600" />
                                    Batch Information
                                </h4>
                                <div className="max-w-xs">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Batch Code <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Enter Batch Code (e.g. BB-01)"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                        value={batchCode}
                                        onChange={(e) => setBatchCode(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Input Form */}
                            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                                    <Box className="w-4 h-4 mr-2" />
                                    Add Items to Batch
                                </h4>
                                <div className="flex gap-4 items-end">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Width</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm"
                                                    value={selWidth}
                                                    onChange={(e) => { setSelWidth(e.target.value); setSelLength(''); setSelShade(''); }}
                                                >
                                                    <option value="">Width</option>
                                                    {availableWidths.map(w => (
                                                        <option key={w} value={w}>{w}m</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Length</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm"
                                                    value={selLength}
                                                    onChange={(e) => { setSelLength(e.target.value); setSelShade(''); }}
                                                    disabled={!selWidth}
                                                >
                                                    <option value="">Length</option>
                                                    {availableLengths.map(l => (
                                                        <option key={l} value={l}>{l}m</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Shade</label>
                                            <div className="relative">
                                                <select
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white text-sm"
                                                    value={selShade}
                                                    onChange={(e) => setSelShade(e.target.value)}
                                                    disabled={!selLength}
                                                >
                                                    <option value="">Shade</option>
                                                    {availableShades.map(s => (
                                                        <option key={s} value={s}>{s} Shade</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <button
                                                onClick={addItem}
                                                disabled={!selectedProductId}
                                                className="w-full bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center shadow-sm font-medium transition-all text-sm h-[38px]"
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                Add to Batch
                                            </button>
                                        </div>
                                    </div>
                                    {selectedProduct && (
                                        <div className="mt-2 p-2 bg-white rounded border border-blue-100 flex items-center justify-between">
                                            <div className="text-xs text-blue-900 font-semibold flex items-center">
                                                <Check className="w-3 h-3 mr-1 text-green-500" />
                                                Product Identified: {selectedProduct.name}
                                            </div>
                                            <div className="text-xs text-blue-600">
                                                Stock: <strong>{parseFloat(selectedProduct.stock || '0').toFixed(2)} kg</strong>
                                            </div>
                                        </div>
                                    )}
                                    {!selectedProduct && selWidth && selLength && selShade && (
                                        <div className="mt-2 text-xs text-red-500 flex items-center">
                                            <AlertCircle className="w-3 h-3 mr-1" />
                                            No product matches these specifications.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Items Table */}
                            {bellItems.length > 0 && (
                                <div className="space-y-3">
                                    <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider text-left">
                                            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                <th className="px-4 py-2 w-8">#</th>
                                                <th className="px-4 py-2">Product</th>
                                                <th className="px-4 py-2">Shade / Size</th>
                                                <th className="px-4 py-2 w-20">Pieces</th>
                                                <th className="px-4 py-2 w-28">Gross Wt (Kg)</th>
                                                <th className="px-4 py-2 w-24">Loss (g)</th>
                                                <th className="px-4 py-2 w-28">Net Wt (Kg)</th>
                                                <th className="px-4 py-2 w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {bellItems.map((item, idx) => {
                                                const grossW = parseFloat(item.grossWeight) || 0;
                                                const lossG = parseFloat(item.weightLoss) || 0;
                                                const netW = grossW - (lossG / 1000);
                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50 group">
                                                        <td className="px-4 py-2 text-center text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                        <td className="px-4 py-2">
                                                            <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <div className="text-sm text-gray-500">{item.size} | {item.gsm} Shade</div>
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
                                                                value={item.grossWeight}
                                                                onChange={(e) => updateItem(idx, 'grossWeight', e.target.value)}
                                                                className="w-full border border-blue-200 bg-blue-50/30 rounded px-2 py-1 text-sm text-right font-bold text-gray-900 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="0.00"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                min="0"
                                                                value={item.weightLoss}
                                                                onChange={(e) => updateItem(idx, 'weightLoss', e.target.value)}
                                                                className="w-full border border-orange-200 bg-orange-50/30 rounded px-2 py-1 text-sm text-right text-gray-900 focus:ring-1 focus:ring-orange-500 outline-none"
                                                                placeholder="0"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <span className={`font-mono text-sm ${netW > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                                {netW > 0 ? netW.toFixed(2) : '-'}
                                                            </span>
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
                                                );
                                            })}
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

            {/* ==================== IMPORT XLSX MODAL ==================== */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Import Bale Data from Excel</h3>
                                    <p className="text-sm text-gray-500">{importRows.length} rows detected • Review before importing</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors font-medium"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Template
                                </button>
                                <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportErrors([]); }} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-grow space-y-5">
                            {/* Batch Code */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Batch Code <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={importBatchCode}
                                    onChange={e => setImportBatchCode(e.target.value)}
                                    className="max-w-xs w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                                    placeholder="e.g. BB-001"
                                />
                                <p className="text-xs text-gray-400 mt-1">Auto-filled from the file. You can change it.</p>
                            </div>

                            {/* Errors */}
                            {importErrors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-4 h-4 text-red-600" />
                                        <span className="text-sm font-semibold text-red-700">Issues Found ({importErrors.length})</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-1">
                                        {importErrors.map((err, i) => (
                                            <li key={i} className="text-xs text-red-600">{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Preview Table */}
                            {importRows.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Preview ({importRows.length} items)</h4>
                                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">#</th>
                                                    <th className="px-4 py-2 text-left">Product Name</th>
                                                    <th className="px-4 py-2 text-left">Status</th>
                                                    <th className="px-4 py-2 text-left">Shade</th>
                                                    <th className="px-4 py-2 text-left">Size</th>
                                                    <th className="px-4 py-2 text-right">Pieces</th>
                                                    <th className="px-4 py-2 text-right">Gross Wt (Kg)</th>
                                                    <th className="px-4 py-2 text-right">Loss (g)</th>
                                                    <th className="px-4 py-2 text-right">Net Wt (Kg)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {importRows.map((row, idx) => (
                                                    <tr key={idx} className={`${!row.productMatched ? 'bg-red-50' : row.netWeight <= 0 ? 'bg-orange-50' : ''
                                                        }`}>
                                                        <td className="px-4 py-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                        <td className="px-4 py-2 font-medium text-gray-900">{row.productName}</td>
                                                        <td className="px-4 py-2">
                                                            {row.productMatched ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                                                    <Check className="w-3 h-3" /> Matched
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                                                    <X className="w-3 h-3" /> Not Found
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-gray-600">{row.gsm || '-'}</td>
                                                        <td className="px-4 py-2 text-gray-600">{row.size || '-'}</td>
                                                        <td className="px-4 py-2 text-right text-gray-600">{row.pieceCount}</td>
                                                        <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">{row.grossWeight?.toFixed(2)}</td>
                                                        <td className="px-4 py-2 text-right text-orange-600">{row.weightLoss}</td>
                                                        <td className={`px-4 py-2 text-right font-mono font-bold ${row.netWeight > 0 ? 'text-emerald-600' : 'text-red-500'
                                                            }`}>
                                                            {row.netWeight?.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 border-t border-gray-200">
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-2 text-xs font-bold text-gray-500 uppercase text-right">Totals</td>
                                                    <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">
                                                        {importRows.reduce((s, r) => s + (r.grossWeight || 0), 0).toFixed(2)} kg
                                                    </td>
                                                    <td className="px-4 py-2 text-right"></td>
                                                    <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">
                                                        {importRows.reduce((s, r) => s + (r.netWeight || 0), 0).toFixed(2)} kg
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex-shrink-0">
                            <div className="flex space-x-3">
                                <button
                                    type="button"
                                    onClick={() => { setShowImportModal(false); setImportRows([]); setImportErrors([]); }}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium bg-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmitImport}
                                    disabled={isImporting || importRows.length === 0 || importRows.some(r => !r.productMatched || r.netWeight <= 0)}
                                    className="flex-[2] px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none font-medium flex justify-center items-center"
                                >
                                    {isImporting
                                        ? <><RefreshCcw className="w-4 h-4 animate-spin mr-2" /> Importing...</>
                                        : <><Upload className="w-4 h-4 mr-2" /> Import {importRows.length} Items as Batch</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
