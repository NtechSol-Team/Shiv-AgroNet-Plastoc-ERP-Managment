import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, X, AlertTriangle, Edit2, Check } from 'lucide-react';
import { purchaseApi } from '../lib/api';

interface RollEntryModalProps {
    bill: any;
    onClose: () => void;
    onSave: () => void;
}

interface RollItem {
    id: string;
    rollCode: string;
    netWeight: string;
    gsm: string;
    width: string; // Changed from length to width
    rawMaterialId: string;
}

interface BillItem {
    rawMaterialId: string;
    materialName: string;
    color: string;
    quantity: string;
    rawMaterial?: { name: string; id: string; color?: string };
}

const RollEntryModal: React.FC<RollEntryModalProps> = ({ bill, onClose, onSave }) => {
    const [rolls, setRolls] = useState<RollItem[]>([]);
    const [existingRolls, setExistingRolls] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);

    // Edit state for existing rolls
    const [editingRollId, setEditingRollId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{ netWeight: string; width: string }>({ netWeight: '', width: '' });

    // Extract bill items with proper structure handling
    const billItems: BillItem[] = (bill.items || []).map((item: any) => ({
        rawMaterialId: item.rawMaterialId || item.purchase_bill_items?.rawMaterialId || '',
        materialName: item.materialName || item.rawMaterial?.name || item.purchase_bill_items?.materialName || 'Unknown Material',
        color: item.color || item.rawMaterial?.color || item.purchase_bill_items?.color || '',
        quantity: item.quantity || item.purchase_bill_items?.quantity || '0',
        rawMaterial: item.rawMaterial
    })).filter((item: BillItem) => item.rawMaterialId);

    // Calculate Invoice Qty from bill items
    const invoiceQty = billItems.reduce((sum, i) => sum + parseFloat(i.quantity || '0'), 0);

    useEffect(() => {
        fetchRolls();
    }, [bill.id]);

    // Focus first input when a new row is added
    useEffect(() => {
        if (rolls.length > 0 && firstInputRef.current) {
            // Focus on the last added row's weight input
            const lastRowId = rolls[rolls.length - 1].id;
            const weightInput = document.getElementById(`weight-${lastRowId}`);
            if (weightInput) weightInput.focus();
        }
    }, [rolls.length]);

    const [pendingQty, setPendingQty] = useState(0);

    const [nextSeq, setNextSeq] = useState(1);

    const fetchRolls = async () => {
        setLoading(true);
        try {
            const result = await purchaseApi.getRolls(bill.id);
            if (result.error) throw new Error(result.error);
            setExistingRolls(result.data || []);

            // Check pending quantity for all materials in bill
            if (bill.supplier?.id) {
                let totalPending = 0;
                for (const item of billItems) {
                    const pendingRes = await purchaseApi.getPendingQuantity(bill.supplier.id, item.rawMaterialId);
                    if (pendingRes.data) {
                        const p = pendingRes.data
                            .filter((b: any) => b.id !== bill.id)
                            .reduce((sum: number, b: any) => sum + b.pendingQuantity, 0);
                        totalPending += p;
                    }
                }
                setPendingQty(totalPending);
            }


            // Fetch next available global sequence
            const seqRes = await purchaseApi.getNextRollSeq();
            console.log('📋 Next Roll Seq API Response:', seqRes);
            if (seqRes.data) {
                console.log('✓ Setting nextSeq to:', seqRes.data.nextSeq);
                setNextSeq(seqRes.data.nextSeq);
            } else {
                console.warn('⚠️ No data in getNextRollSeq response, defaulting to 1');
                setNextSeq(1);
            }


        } catch (err: any) {
            setError(err.message || "Failed to load rolls");
        }
        setLoading(false);
    };

    const handleAddRow = (materialId?: string) => {
        const defaultMaterialId = materialId || billItems[0]?.rawMaterialId || '';

        if (!defaultMaterialId) {
            setError("No raw materials found in this bill. Cannot add rolls.");
            return;
        }

        // Generate Code: ROLL-{GlobalSeq}
        // Offset by current new rolls length to avoid duplicates in this session
        const currentSeq = nextSeq + rolls.length;
        const rollCode = `ROLL-${String(currentSeq).padStart(4, '0')}`;

        console.log(`🎯 Generated Roll Code: ${rollCode} (nextSeq=${nextSeq}, offset=${rolls.length})`);

        setRolls([
            ...rolls,
            {
                id: crypto.randomUUID(),
                rollCode,
                netWeight: '',
                gsm: '',
                width: '', // Changed from length to width
                rawMaterialId: defaultMaterialId
            }
        ]);
    };

    const handleRemoveRow = (id: string) => {
        setRolls(rolls.filter(r => r.id !== id));
    };

    const handleUpdateRow = (id: string, field: keyof RollItem, value: string) => {
        setRolls(rolls.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleDeleteExisting = async (rollId: string) => {
        if (!confirm("Are you sure? This will reverse the stock for this roll.")) return;
        setLoading(true);
        try {
            const result = await purchaseApi.deleteRoll(bill.id, rollId);
            if (result.error) throw new Error(result.error);
            await fetchRolls();
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleEditExisting = (roll: any) => {
        setEditingRollId(roll.id);
        setEditValues({
            netWeight: roll.netWeight,
            width: roll.width || roll.length || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingRollId(null);
        setEditValues({ netWeight: '', width: '' });
    };

    const handleSaveEdit = async (rollId: string) => {
        setLoading(true);
        setError(null);
        try {
            const result = await purchaseApi.updateRoll(bill.id, rollId, {
                netWeight: parseFloat(editValues.netWeight),
                width: parseFloat(editValues.width) || 0
            });
            if (result.error) throw new Error(result.error);
            await fetchRolls();
            setEditingRollId(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update roll');
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            if (rolls.length === 0) {
                throw new Error("No new rolls to add");
            }

            const validRolls = rolls.map(r => ({
                rollCode: r.rollCode,
                netWeight: parseFloat(r.netWeight),
                gsm: parseFloat(r.gsm) || 0,
                width: parseFloat(r.width) || 0, // Changed from length to width
                rawMaterialId: r.rawMaterialId
            }));

            if (validRolls.some(r => isNaN(r.netWeight) || r.netWeight <= 0)) {
                throw new Error("Please enter valid net weight for all rolls");
            }

            if (validRolls.some(r => !r.rawMaterialId)) {
                throw new Error("Please select a material for all rolls");
            }

            const result = await purchaseApi.addRolls(bill.id, validRolls);
            if (result.error) throw new Error(result.error);

            onSave();
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to save rolls");
        }
        setLoading(false);
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Move to next row or add new row if last
            if (rowIndex === rolls.length - 1) {
                handleAddRow();
            } else {
                const nextRowId = rolls[rowIndex + 1]?.id;
                const nextInput = document.getElementById(`weight-${nextRowId}`);
                if (nextInput) nextInput.focus();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    // Calculations
    const existingTotal = existingRolls.reduce((sum, r) => sum + parseFloat(r.netWeight || '0'), 0);
    const newTotal = rolls.reduce((sum, r) => sum + (parseFloat(r.netWeight) || 0), 0);
    const grandTotal = existingTotal + newTotal;
    const difference = grandTotal - invoiceQty;
    const isExactMatch = Math.abs(difference) < 0.01;
    const isAdjustedMatch = !isExactMatch && difference > 0 && difference <= pendingQty + 0.01; // Allow slight float variance
    const isMatch = isExactMatch || isAdjustedMatch;

    // Get material name by ID (with color)
    const getMaterialName = (materialId: string) => {
        const item = billItems.find(i => i.rawMaterialId === materialId);
        return item ? `${item.materialName}${item.color ? ` (${item.color})` : ''}` : 'Unknown';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg">
                    <div>
                        <h2 className="text-lg font-bold text-white">Roll Entry for {bill.code}</h2>
                        <p className="text-sm text-blue-100">{bill.supplier?.name} | {billItems.length} Material(s)</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-blue-500 rounded-full transition-colors">
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
                        </div>
                    )}

                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <span className="text-xs text-blue-600 font-semibold uppercase">Invoice Qty</span>
                            <div className="text-xl font-bold text-blue-900">{invoiceQty.toFixed(2)} kg</div>
                        </div>
                        <div className={`p-3 rounded-lg border ${isMatch ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                            <span className={`text-xs font-semibold uppercase ${isMatch ? 'text-green-600' : 'text-orange-600'}`}>Total Roll Weight</span>
                            <div className={`text-xl font-bold ${isMatch ? 'text-green-900' : 'text-orange-900'}`}>{grandTotal.toFixed(2)} kg</div>
                        </div>
                        <div className={`p-3 rounded-lg border ${isMatch ? (isAdjustedMatch ? 'bg-green-50 border-green-200' : 'bg-green-50 border-green-200') : 'bg-red-50 border-red-200'}`}>
                            <span className={`text-xs font-semibold uppercase ${isMatch ? 'text-green-600' : 'text-red-600'}`}>Difference</span>
                            <div className={`text-xl font-bold ${isMatch ? 'text-green-900' : 'text-red-900'}`}>
                                {isAdjustedMatch ? (
                                    <span className="flex flex-col">
                                        <span>+{difference.toFixed(2)} kg</span>
                                        <span className="text-[10px] font-normal text-green-700 bg-green-100 px-1.5 py-0.5 rounded w-fit">Adjusted from Pending</span>
                                    </span>
                                ) : (
                                    <>
                                        {difference > 0 ? '+' : ''}{difference.toFixed(2)} kg
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Pending from Past Bills Warning */}
                    {pendingQty > 0 && (
                        <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                                <div>
                                    <p className="text-sm font-bold text-orange-800">Pending Quantity from Past Bills: {pendingQty.toFixed(2)} kg</p>
                                    <p className="text-xs text-orange-600">You can accept extra rolls up to this amount to adjust against previous shortfalls.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Existing Rolls */}
                    {existingRolls.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-700 mb-2">✓ Recorded Rolls ({existingRolls.length})</h3>
                            <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-green-200">
                                    <thead className="bg-green-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-bold text-green-800 uppercase">Code</th>
                                            <th className="px-3 py-2 text-left text-xs font-bold text-green-800 uppercase">Material</th>
                                            <th className="px-3 py-2 text-right text-xs font-bold text-green-800 uppercase">Weight (kg)</th>
                                            <th className="px-3 py-2 text-right text-xs font-bold text-green-800 uppercase">Width (mm)</th>
                                            <th className="px-3 py-2 text-center text-xs font-bold text-green-800 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-green-100">
                                        {existingRolls.map((roll) => {
                                            const isEditing = editingRollId === roll.id;
                                            return (
                                                <tr key={roll.id} className={isEditing ? 'bg-blue-50' : ''}>
                                                    <td className="px-3 py-2 text-sm font-mono text-green-900">{roll.rollCode}</td>
                                                    <td className="px-3 py-2 text-sm text-green-800">{getMaterialName(roll.rawMaterialId)}</td>
                                                    <td className="px-3 py-2 text-sm text-right font-bold text-green-900">
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={editValues.netWeight}
                                                                onChange={(e) => setEditValues({ ...editValues, netWeight: e.target.value })}
                                                                className="w-24 px-2 py-1 text-sm border-blue-300 rounded focus:ring-blue-500 focus:border-blue-500 font-bold text-center"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            `${roll.netWeight} kg`
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-sm text-right text-green-700">
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                value={editValues.width}
                                                                onChange={(e) => setEditValues({ ...editValues, width: e.target.value })}
                                                                className="w-20 px-2 py-1 text-sm border-blue-300 rounded focus:ring-blue-500 focus:border-blue-500 text-center"
                                                                placeholder="—"
                                                            />
                                                        ) : (
                                                            roll.width || roll.length || '-'
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {roll.status === 'In Stock' && (
                                                                <>
                                                                    {isEditing ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleSaveEdit(roll.id)}
                                                                                className="text-green-600 hover:text-green-700 p-1"
                                                                                title="Save changes"
                                                                            >
                                                                                <Check className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                onClick={handleCancelEdit}
                                                                                className="text-gray-400 hover:text-gray-600 p-1"
                                                                                title="Cancel"
                                                                            >
                                                                                <X className="w-4 h-4" />
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleEditExisting(roll)}
                                                                                className="text-blue-400 hover:text-blue-600 p-1"
                                                                                title="Edit roll"
                                                                            >
                                                                                <Edit2 className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteExisting(roll.id)}
                                                                                className="text-red-400 hover:text-red-600 p-1"
                                                                                title="Delete roll"
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* New Rolls Entry */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-gray-700">+ Add New Rolls</h3>
                            <div className="flex gap-2">
                                {billItems.length > 1 ? (
                                    // Show dropdown if multiple materials
                                    billItems.map((item) => (
                                        <button
                                            key={item.rawMaterialId}
                                            onClick={() => handleAddRow(item.rawMaterialId)}
                                            className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors font-medium border border-blue-200"
                                            title={`Add roll for ${item.materialName} (${item.color})`}
                                        >
                                            <Plus className="w-3 h-3" /> {item.materialName} {item.color && <span className="text-gray-500">({item.color})</span>}
                                        </button>
                                    ))
                                ) : (
                                    <button
                                        onClick={() => handleAddRow()}
                                        className="flex items-center gap-1 text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-sm"
                                        autoFocus
                                    >
                                        <Plus className="w-4 h-4" /> Add Roll (Enter)
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-blue-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-blue-800 uppercase w-36">Roll Code</th>
                                        {billItems.length > 1 && (
                                            <th className="px-3 py-2 text-left text-xs font-bold text-blue-800 uppercase">Material</th>
                                        )}
                                        <th className="px-3 py-2 text-left text-xs font-bold text-blue-800 uppercase">Net Weight (kg) <span className="text-red-500">*</span></th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-blue-800 uppercase w-24">Width (mm)</th>
                                        <th className="px-3 py-2 text-center text-xs font-bold text-blue-800 uppercase w-16">✕</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {rolls.length === 0 ? (
                                        <tr>
                                            <td colSpan={billItems.length > 1 ? 5 : 4} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                                                Press <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs font-mono">Enter</kbd> or click "Add Roll" to start
                                            </td>
                                        </tr>
                                    ) : (
                                        rolls.map((roll, idx) => (
                                            <tr key={roll.id} className="hover:bg-blue-50">
                                                <td className="px-3 py-1.5">
                                                    <input
                                                        type="text"
                                                        value={roll.rollCode}
                                                        onChange={(e) => handleUpdateRow(roll.id, 'rollCode', e.target.value)}
                                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 font-mono"
                                                        tabIndex={idx * 5 + 1}
                                                    />
                                                </td>
                                                {billItems.length > 1 && (
                                                    <td className="px-3 py-1.5">
                                                        <select
                                                            value={roll.rawMaterialId}
                                                            onChange={(e) => handleUpdateRow(roll.id, 'rawMaterialId', e.target.value)}
                                                            className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                            tabIndex={idx * 5 + 2}
                                                        >
                                                            {billItems.map((item) => (
                                                                <option key={item.rawMaterialId} value={item.rawMaterialId}>
                                                                    {item.materialName}{item.color ? ` (${item.color})` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                )}
                                                <td className="px-3 py-1.5">
                                                    <input
                                                        id={`weight-${roll.id}`}
                                                        type="number"
                                                        step="0.01"
                                                        value={roll.netWeight}
                                                        onChange={(e) => handleUpdateRow(roll.id, 'netWeight', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'weight')}
                                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 font-bold text-center"
                                                        placeholder="0.00"
                                                        tabIndex={idx * 4 + 3}
                                                        autoFocus={idx === rolls.length - 1}
                                                    />
                                                </td>
                                                <td className="px-3 py-1.5">
                                                    <input
                                                        type="number"
                                                        value={roll.width}
                                                        onChange={(e) => handleUpdateRow(roll.id, 'width', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 'width')}
                                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-center"
                                                        placeholder="—"
                                                        tabIndex={idx * 4 + 4}
                                                    />
                                                </td>
                                                <td className="px-3 py-1.5 text-center">
                                                    <button onClick={() => handleRemoveRow(roll.id)} className="text-red-400 hover:text-red-600 p-1" tabIndex={-1}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">💡 Tip: Press <kbd className="px-1 bg-gray-100 rounded border text-xs">Enter</kbd> in weight field to add next row. <kbd className="px-1 bg-gray-100 rounded border text-xs">Esc</kbd> to close.</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-between items-center rounded-b-lg">
                    <div className="text-sm text-gray-600">
                        {rolls.length > 0 && (
                            <span className="font-medium text-blue-600">
                                {rolls.length} roll(s) = {newTotal.toFixed(2)} kg
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded text-sm font-medium transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || rolls.length === 0}
                            className={`px-6 py-2 rounded text-sm font-bold text-white flex items-center gap-2 shadow-sm
                                ${loading || rolls.length === 0 ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md transition-all'}`}
                        >
                            <Save className="w-4 h-4" />
                            {loading ? 'Saving...' : (isAdjustedMatch ? 'Save with Adjustment' : 'Save & Update Stock')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RollEntryModal;
