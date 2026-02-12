
import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Package, User, FileText, Loader2, Save, X, Edit2, Trash2 } from 'lucide-react';
import { useMasterData } from '../context/MasterDataContext';
import { samplesApi } from '../lib/api';

interface Sample {
    id: string;
    date: string;
    quantity: number;
    purpose: string;
    notes: string;
    batchCode: string;
    partyId: string; // Added partyId for edit population
    finishedProductId: string; // Added finishedProductId for edit population
    partyName: string;
    productName: string;
    productCode: string;
}

export function Samples() {
    const { suppliers, finishedProducts } = useMasterData();
    const [samples, setSamples] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Edit Mode State
    const [editingId, setEditingId] = useState<string | null>(null);

    // Delete Confirmation State
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, id: string | null }>({
        isOpen: false,
        id: null
    });

    // Form State
    const initialFormState = {
        partyId: '',
        finishedProductId: '',
        quantity: '',
        date: new Date().toISOString().split('T')[0],
        purpose: 'Marketing',
        notes: '',
        batchCode: ''
    };
    const [formData, setFormData] = useState(initialFormState);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await samplesApi.getAll();
            if (result.data) {
                setSamples(result.data);
            }
        } catch (err: any) {
            setError('Failed to fetch samples');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleEdit = (sample: Sample) => {
        setEditingId(sample.id);
        setFormData({
            partyId: sample.partyId || '',
            finishedProductId: sample.finishedProductId,
            quantity: sample.quantity.toString(),
            date: new Date(sample.date).toISOString().split('T')[0],
            purpose: sample.purpose || 'Marketing',
            notes: sample.notes || '',
            batchCode: sample.batchCode || ''
        });
        setShowForm(true);
    };

    const confirmDelete = (id: string) => {
        setDeleteConfirmation({ isOpen: true, id });
    };

    const handleDelete = async () => {
        if (!deleteConfirmation.id) return;
        setSubmitting(true);
        try {
            const result = await samplesApi.delete(deleteConfirmation.id);
            if (result.error) throw new Error(result.error);
            setSuccess('Sample deleted successfully');
            setDeleteConfirmation({ isOpen: false, id: null });
            fetchData();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to delete sample');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            if (!formData.finishedProductId || !formData.quantity) {
                throw new Error('Product and Quantity are required');
            }

            let result;
            if (editingId) {
                result = await samplesApi.update(editingId, formData);
            } else {
                result = await samplesApi.create(formData);
            }

            if (result.error) throw new Error(result.error);

            setSuccess(`Sample ${editingId ? 'updated' : 'recorded'} successfully`);
            setShowForm(false);
            setFormData(initialFormState);
            setEditingId(null);
            fetchData();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || `Failed to ${editingId ? 'update' : 'record'} sample`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData(initialFormState);
        setError(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sample Management</h1>
                    <p className="text-sm text-gray-500">Track product samples given to parties</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setFormData(initialFormState);
                        setShowForm(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center font-medium shadow-sm transition-all"
                >
                    <Plus className="w-4 h-4 mr-2" /> Record Sample
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg relative flex items-center">
                    <span className="block sm:inline">{error}</span>
                    <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg relative flex items-center">
                    <span className="block sm:inline">{success}</span>
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-800">{editingId ? 'Edit Sample Entry' : 'New Sample Entry'}</h2>
                            <button onClick={handleCloseForm} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 flex items-center">
                                        <Calendar className="w-4 h-4 mr-2 text-blue-600" /> Date
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 flex items-center">
                                        <User className="w-4 h-4 mr-2 text-blue-600" /> Party / Prospect (Optional)
                                    </label>
                                    <select
                                        value={formData.partyId}
                                        onChange={e => setFormData({ ...formData, partyId: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium bg-white"
                                    >
                                        <option value="">-- General / Unknown --</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 flex items-center">
                                        <Package className="w-4 h-4 mr-2 text-blue-600" /> Finished Product <span className="text-red-500 ml-1">*</span>
                                    </label>
                                    <select
                                        value={formData.finishedProductId}
                                        onChange={e => setFormData({ ...formData, finishedProductId: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium bg-white"
                                        required
                                    >
                                        <option value="">-- Select Product --</option>
                                        {finishedProducts.map(fp => (
                                            <option key={fp.id} value={fp.id}>{fp.name} ({fp.code})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 flex items-center">
                                        Quantity <span className="text-red-500 ml-1">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">Batch Code (Optional)</label>
                                    <input
                                        type="text"
                                        value={formData.batchCode}
                                        onChange={e => setFormData({ ...formData, batchCode: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        placeholder="e.g. B-123"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">Purpose</label>
                                    <select
                                        value={formData.purpose}
                                        onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium bg-white"
                                    >
                                        <option value="Marketing">Marketing / Sales Demo</option>
                                        <option value="Quality Test">Quality Testing</option>
                                        <option value="Gift">Gift / Goodwill</option>
                                        <option value="Research">R&D</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div className="col-span-1 md:col-span-2 space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        rows={3}
                                        placeholder="Additional details..."
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={handleCloseForm}
                                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex items-center"
                                >
                                    {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    {editingId ? 'Update Record' : 'Save Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmation.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 animation-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Deletion</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Are you sure you want to delete this sample record? The stock quantity will be reversed (added back to inventory).
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setDeleteConfirmation({ isOpen: false, id: null })}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors"
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors shadow-lg shadow-red-200 flex items-center"
                                disabled={submitting}
                            >
                                {submitting && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Party / Recipient</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Qty</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Purpose</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Batch</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Notes</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading samples...
                                    </td>
                                </tr>
                            ) : samples.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 bg-gray-50/50">
                                        No samples recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                samples.map((sample) => (
                                    <tr key={sample.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            {new Date(sample.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-gray-900">{sample.productName}</div>
                                            <div className="text-xs text-blue-600 font-mono">{sample.productCode}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            {sample.partyName || <span className="text-gray-400 italic">General / Unknown</span>}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900">
                                            {parseFloat(sample.quantity.toString()).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {sample.purpose}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-mono text-gray-600">
                                            {sample.batchCode || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                            {sample.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center space-x-2">
                                                <button
                                                    onClick={() => handleEdit(sample)}
                                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                    title="Edit Sample"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => confirmDelete(sample.id)}
                                                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                    title="Delete Sample"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
