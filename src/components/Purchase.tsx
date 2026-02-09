/**
 * Purchase.tsx - Raw Material Purchase Management
 * 
 * Features:
 * - Multi-line item support with add/remove
 * - CGST/SGST/IGST calculation based on supplier state
 * - Supplier selection with auto-suggestion
 * - Real-time bill total calculation
 * - Stock movement creation on confirm
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, Search, Loader2, Building2, Package, Trash2, CheckCircle, XCircle, RotateCcw, Link, Edit2 } from 'lucide-react';
import { purchaseApi, mastersApi, accountsApi } from '../lib/api';
import RollEntryModal from './RollEntryModal';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface Supplier {
  id: string;
  code: string;
  name: string;
  gstNo: string;
  stateCode: string;
  contact: string;
  address: string;
  outstanding: string;
}

interface RawMaterial {
  id: string;
  code: string;
  name: string;
  hsnCode: string;
  gstPercent: string;
  stock: string;
  unit: string;
}

interface FinishedProduct {
  id: string;
  code: string;
  name: string;
  hsnCode: string;
  unit: string;
}

interface ExpenseHead {
  id: string;
  code: string;
  name: string;
}

interface PurchaseItem {
  id: string;
  rawMaterialId?: string;
  finishedProductId?: string;
  expenseHeadId?: string;
  materialName: string;
  hsnCode: string;
  quantity: string;
  rate: string;
  gstPercent: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface PurchaseBill {
  id: string;
  code: string;
  date: string;
  supplier: Supplier;
  items: any[];
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  grandTotal: string;
  paymentStatus: string;
  status: string;
  discountAmount: string; // Added discountAmount to PurchaseBill interface
  type: 'RAW_MATERIAL' | 'GENERAL' | 'FINISHED_GOODS';
  rollEntryStatus?: 'Pending' | 'Partial' | 'Completed';
  totalRollWeight?: string;
}

// Company state code (Maharashtra)
const COMPANY_STATE_CODE = '27';

// ============================================================
// MAIN COMPONENT
// ============================================================

export function Purchase() {
  // UI State
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  // Data State
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<FinishedProduct[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Form State
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [billStatus, setBillStatus] = useState<'Draft' | 'Confirmed'>('Confirmed');
  const [purchaseType, setPurchaseType] = useState<'RAW_MATERIAL' | 'GENERAL' | 'FINISHED_GOODS'>('RAW_MATERIAL');
  /* State for discount and invoice number */
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  // Payment State
  const [activeTab, setActiveTab] = useState<'bills' | 'payments' | 'advances'>('bills');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [purchasePayments, setPurchasePayments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [outstandingBills, setOutstandingBills] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<{ [key: string]: number }>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null; error?: string }>({ isOpen: false, id: null });
  const [showRollModal, setShowRollModal] = useState(false);
  const [selectedBillForRolls, setSelectedBillForRolls] = useState<any>(null);
  const [availableAdvances, setAvailableAdvances] = useState<any[]>([]); // For integrated adjustment

  const [paymentForm, setPaymentForm] = useState({
    supplierId: '',
    date: new Date().toISOString().split('T')[0],
    mode: 'Bank',
    amount: '',
    accountId: '',
    reference: '',
    remarks: '',
    isAdvance: false,
    useAdvancePayment: false, // NEW: Toggle to pay using advance
    selectedAdvanceId: ''     // NEW: Selected advance ID for adjustment
  });

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const fetchData = useCallback(async () => {
    console.log('\n📊 FRONTEND: fetchData - START');
    setLoading(true);
    setError(null);
    try {
      const [billsRes, suppliersRes, materialsRes, finishedRes, expensesRes, summaryRes, accountsRes, paymentsRes] = await Promise.all([
        purchaseApi.getBills(page, limit),
        mastersApi.getSuppliers(),
        mastersApi.getRawMaterials(),
        mastersApi.getFinishedProducts(),
        mastersApi.getExpenseHeads(),
        purchaseApi.getSummary(),
        mastersApi.getAccounts(),
        accountsApi.getTransactions({ type: 'PAYMENT', partyType: 'supplier' }), // Fetch payments for suppliers only
      ]);

      if (billsRes.data) {
        const isPaginated = !Array.isArray(billsRes.data) && 'data' in billsRes.data;
        const bills = isPaginated ? (billsRes.data as any).data : billsRes.data;
        const meta = isPaginated ? (billsRes.data as any).meta : { totalPages: 1 };

        setPurchaseBills(bills || []);
        setTotalPages(meta.totalPages);
      }
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (materialsRes.data) setRawMaterials(materialsRes.data);
      if (finishedRes.data) setFinishedProducts(finishedRes.data);
      if (expensesRes.data) setExpenseHeads(expensesRes.data);
      if (summaryRes.data) setSummary(summaryRes.data);
      if (accountsRes.data) setAccounts(accountsRes.data);
      if (paymentsRes.data) {
        const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : ((paymentsRes.data as any).data || []);
        setPurchasePayments(payments);
      }

      console.log('✅ FRONTEND: fetchData - SUCCESS\n');
    } catch (err) {
      console.error('❌ Failed to load purchase data:', err);
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [page, limit]); // Add page dependency

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================
  // GST CALCULATION HELPERS
  // ============================================================

  /**
   * Calculate GST split based on supplier state
   * Same state = CGST + SGST, Different state = IGST
   */
  const calculateItemGST = (amount: number, gstPercent: number, supplierStateCode: string) => {
    const gstAmount = (amount * gstPercent) / 100;
    const isInterState = supplierStateCode !== COMPANY_STATE_CODE;

    return {
      cgst: isInterState ? 0 : gstAmount / 2,
      sgst: isInterState ? 0 : gstAmount / 2,
      igst: isInterState ? gstAmount : 0,
      total: amount + gstAmount,
    };
  };

  /**
   * Calculate totals for all items
   */
  const calculateBillTotals = () => {
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const item of items) {
      subtotal += item.amount;
      totalCgst += item.cgst;
      totalSgst += item.sgst;
      totalIgst += item.igst;
    }

    const totalTax = totalCgst + totalSgst + totalIgst;
    const discount = parseFloat(discountAmount) || 0;
    const grandTotal = Math.round(subtotal + totalTax - discount);

    return { subtotal, totalCgst, totalSgst, totalIgst, totalTax, grandTotal };
  };

  // ============================================================
  // ITEM MANAGEMENT
  // ============================================================

  /**
   * Add a new empty item row
   */
  const addItem = () => {
    const newItem: PurchaseItem = {
      id: crypto.randomUUID(),
      rawMaterialId: '',
      finishedProductId: '',
      expenseHeadId: '',
      materialName: '',
      hsnCode: '',
      quantity: '',
      rate: '',
      gstPercent: '18',
      amount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    };
    setItems([...items, newItem]);
  };

  /**
   * Remove an item row
   */
  const removeItem = (itemId: string) => {
    if (items.length <= 1) return; // Keep at least one item
    setItems(items.filter(item => item.id !== itemId));
  };

  /**
   * Update item field and recalculate
   */
  const updateItem = (itemId: string, field: string, value: string) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;

      const updatedItem = { ...item, [field]: value };

      // Auto-fill material details when selecting
      if (field === 'rawMaterialId') {
        const material = rawMaterials.find(m => m.id === value);
        if (material) {
          updatedItem.materialName = material.name;
          updatedItem.hsnCode = material.hsnCode || '3901';
          updatedItem.gstPercent = material.gstPercent || '18';
        }
      } else if (field === 'finishedProductId') {
        const product = finishedProducts.find(p => p.id === value);
        if (product) {
          updatedItem.materialName = product.name;
          updatedItem.hsnCode = product.hsnCode || '5608';
          updatedItem.gstPercent = '12'; // Default for FG? Assume 18 or 12.
        }
      } else if (field === 'expenseHeadId') {
        const head = expenseHeads.find(h => h.id === value);
        if (head) {
          updatedItem.materialName = head.name;
          updatedItem.hsnCode = '';
          updatedItem.gstPercent = '0'; // Expenses often 0 or 18. Let user edit.
        }
      }

      // Recalculate amounts
      const qty = parseFloat(updatedItem.quantity) || 0;
      const rate = parseFloat(updatedItem.rate) || 0;
      const gstPct = parseFloat(updatedItem.gstPercent) || 0;
      const supplierState = selectedSupplier?.stateCode || COMPANY_STATE_CODE;

      const amount = qty * rate;
      const gst = calculateItemGST(amount, gstPct, supplierState);

      updatedItem.amount = amount;
      updatedItem.cgst = gst.cgst;
      updatedItem.sgst = gst.sgst;
      updatedItem.igst = gst.igst;
      updatedItem.amount = amount;
      updatedItem.cgst = gst.cgst;
      updatedItem.sgst = gst.sgst;
      updatedItem.igst = gst.igst;
      updatedItem.total = gst.total;

      return updatedItem;
    }));
  };

  const updateItemExpenseHead = (itemId: string, value: string) => {
    // Check if selected value matches an existing ID
    const existingHead = expenseHeads.find(h => h.name === value || h.id === value);

    setItems(items.map(item => {
      if (item.id !== itemId) return item;

      if (existingHead) {
        return {
          ...item,
          expenseHeadId: existingHead.id,
          materialName: existingHead.name,
          hsnCode: '',
          gstPercent: '0'
        };
      } else {
        // New Expense Head
        return {
          ...item,
          expenseHeadId: undefined, // Clear ID to indicate new
          materialName: value, // Store the typed name
          hsnCode: '',
          gstPercent: '0'
        };
      }
    }));
  };

  // ============================================================
  // SUPPLIER SELECTION
  // ============================================================

  const handleSupplierSelect = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId) || null;
    setSelectedSupplier(supplier);

    // Recalculate all items for new state code
    if (supplier) {
      setItems(items.map(item => {
        const gst = calculateItemGST(item.amount, parseFloat(item.gstPercent) || 0, supplier.stateCode);
        return { ...item, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, total: gst.total };
      }));
    }
  };

  // ============================================================
  // FORM SUBMISSION
  // ============================================================

  const resetForm = () => {
    setSelectedSupplier(null);
    setBillDate(new Date().toISOString().split('T')[0]);
    setItems([]);
    setBillStatus('Confirmed');
    setDiscountAmount(''); // Reset discount
    setInvoiceNumber(''); // Reset invoice number
    setPurchaseType('RAW_MATERIAL'); // Reset type
    setError(null);
  };

  const handleSave = async () => {
    console.log('================================');
    console.log('FRONTEND: handleSave - START');

    // Validation
    if (!selectedSupplier) {
      console.log('❌ Validation failed: No supplier selected');
      setError('Please select a supplier');
      return;
    }

    const hasValidItems = items.some(item =>
      (purchaseType === 'RAW_MATERIAL' && item.rawMaterialId) ||
      (purchaseType === 'FINISHED_GOODS' && item.finishedProductId) ||
      (purchaseType === 'GENERAL' && (item.expenseHeadId || item.materialName))
    );

    if (items.length === 0 || !hasValidItems) {
      console.log('❌ Validation failed: No valid items found for type', purchaseType);
      setError('Please add at least one item');
      return;
    }

    const invalidItems = items.filter(item => {
      const hasIdOrName =
        (purchaseType === 'RAW_MATERIAL' && item.rawMaterialId) ||
        (purchaseType === 'FINISHED_GOODS' && item.finishedProductId) ||
        (purchaseType === 'GENERAL' && (item.expenseHeadId || item.materialName));

      return hasIdOrName && (!item.quantity || parseFloat(item.quantity) <= 0 || !item.rate || parseFloat(item.rate) <= 0);
    });

    if (invalidItems.length > 0) {
      console.log('❌ Validation failed: Invalid items', invalidItems);
      setError('Please fill quantity and rate for all items');
      return;
    }

    console.log('✓ Validation passed');
    console.log('  Supplier:', selectedSupplier.name);
    console.log('  Items count:', items.filter(item => item.rawMaterialId).length);
    console.log('  Status:', billStatus);

    setSaving(true);
    setError(null);

    try {
      const payload = {
        date: billDate,
        supplierId: selectedSupplier.id,
        status: billStatus,
        type: purchaseType, // Added type
        discountAmount: discountAmount || '0',  // Added discount
        invoiceNumber: invoiceNumber, // Added invoice number
        items: items
          .filter(item => (purchaseType === 'RAW_MATERIAL' && item.rawMaterialId) || (purchaseType === 'FINISHED_GOODS' && item.finishedProductId) || (purchaseType === 'GENERAL' && (item.expenseHeadId || item.materialName)))
          .map(item => ({
            rawMaterialId: purchaseType === 'RAW_MATERIAL' ? item.rawMaterialId : undefined,
            finishedProductId: purchaseType === 'FINISHED_GOODS' ? item.finishedProductId : undefined,
            expenseHeadId: purchaseType === 'GENERAL' ? item.expenseHeadId : undefined,
            expenseHeadName: (purchaseType === 'GENERAL' && !item.expenseHeadId) ? item.materialName : undefined, // Send name for new heads
            quantity: parseFloat(item.quantity) || 1, // Default to 1 for expenses if left empty
            rate: parseFloat(item.rate),
            gstPercent: parseFloat(item.gstPercent),
          })),
      };

      console.log('\n--- Sending Payload to API ---');
      console.log(JSON.stringify(payload, null, 2));

      // Call updateBill if editing, otherwise createBill
      const result = editingBillId
        ? await purchaseApi.updateBill(editingBillId, payload)
        : await purchaseApi.createBill(payload);

      console.log('\n--- API Response ---');
      console.log('Error:', result.error);
      console.log('Data:', result.data);

      if (result.error) {
        console.log('❌ API returned error:', result.error);
        setError(result.error);
      } else {
        const action = editingBillId ? 'updated' : 'created';
        console.log(`✓ Bill ${action} successfully:`, result.data?.code);
        console.log('  Items in response:', result.data?.items?.length || 0);

        setSuccess(`Purchase bill ${result.data?.code} ${action} successfully!`);
        setShowForm(false);
        setEditingBillId(null); // Reset edit mode
        resetForm();

        console.log('\n--- Refreshing data ---');
        fetchData();

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }

      console.log('\n✅ FRONTEND: handleSave - SUCCESS');
      console.log('================================\n');
    } catch (err) {
      console.log('\n❌ FRONTEND: handleSave - ERROR');
      console.error('Failed to save purchase bill:', err);
      console.log('================================\n');
      setError('Failed to save purchase bill');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // PAYMENT HANDLERS
  // ============================================================

  const handlePaymentSupplierSelect = async (supplierId: string) => {
    setPaymentForm({ ...paymentForm, supplierId });
    setOutstandingBills([]);
    setAllocations({});

    if (supplierId) {
      setLoading(true);
      try {
        const result = await purchaseApi.getOutstandingBills(supplierId);
        if (result.data) {
          setOutstandingBills(result.data);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
  };

  const handleAutoAllocate = () => {
    const amountPaid = parseFloat(paymentForm.amount || '0');
    if (amountPaid <= 0) return;

    let remaining = amountPaid;
    const newAllocations: { [key: string]: number } = {};

    // Sort by date/code if needed, backend already sorts by date
    outstandingBills.forEach(bill => {
      if (remaining <= 0) return;
      const outstanding = parseFloat(bill.balanceAmount || bill.grandTotal);
      const allocate = Math.min(outstanding, remaining);

      if (allocate > 0) {
        newAllocations[bill.id] = allocate;
        remaining -= allocate;
      }
    });

    setAllocations(newAllocations);
  };

  const handleCreatePayment = async () => {
    if (!paymentForm.supplierId || !paymentForm.amount) {
      setError("Please fill all required fields");
      return;
    }

    if (paymentForm.useAdvancePayment) {
      if (!paymentForm.selectedAdvanceId) {
        setError("Please select an advance payment to adjust");
        return;
      }
    } else {
      if (!paymentForm.accountId) {
        setError("Please select a paid-from account");
        return;
      }
    }

    const allocationItems = Object.entries(allocations).map(([billId, amount]) => ({
      billId,
      amount
    }));

    const totalAllocated = allocationItems.reduce((sum, item) => sum + item.amount, 0);
    const paidAmount = parseFloat(paymentForm.amount);

    if (totalAllocated > paidAmount) {
      setError("Allocated amount cannot exceed paid amount");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...paymentForm,
        allocations: allocationItems
      };
      const result = await purchaseApi.createPayment(payload);
      if (result.error) {
        setError(result.error);
      } else {
        setShowPaymentForm(false);
        setPaymentForm({
          supplierId: '',
          date: new Date().toISOString().split('T')[0],
          mode: 'Bank',
          amount: '',
          accountId: '',
          reference: '',
          remarks: '',
          isAdvance: false,
          useAdvancePayment: false,
          selectedAdvanceId: ''
        });
        setAllocations({});
        fetchData();
        setSuccess('Payment recorded successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError("Failed to create payment");
    }
    setSaving(false);
  };

  // Auto-calculate Amount when adjusting advance based on allocations
  useEffect(() => {
    if (paymentForm.useAdvancePayment) {
      const totalAllocated = Object.values(allocations).reduce((sum, amount) => sum + (amount || 0), 0);
      if (totalAllocated >= 0) {
        setPaymentForm(prev => ({ ...prev, amount: totalAllocated.toString() }));
      }
    }
  }, [allocations, paymentForm.useAdvancePayment]);

  const handleReversePayment = async (paymentId: string) => {
    const reason = prompt("Enter reason for reversal:");
    if (!reason) return;

    if (confirm("Are you sure you want to reverse this payment? This will reopen allocated purchase bills.")) {
      setLoading(true);
      try {
        const result = await purchaseApi.reversePayment(paymentId, reason);
        if (result.error) throw new Error(result.error);
        fetchData();
        setSuccess('Payment reversed successfully');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        setError(err.message || "Failed to reverse payment");
      }
      setLoading(false);
    }
  };

  const handleDeleteBill = async (billId: string) => {
    setDeleteConfirmation({ isOpen: true, id: billId });
  };

  const confirmDeleteBill = async () => {
    if (!deleteConfirmation.id) return;

    setLoading(true);
    try {
      const result = await purchaseApi.deleteBill(deleteConfirmation.id);
      if (result.error) throw new Error(result.error);
      fetchData();
      setSuccess('Purchase bill deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
      setDeleteConfirmation({ isOpen: false, id: null });
    } catch (err: any) {
      setError(err.message || "Failed to delete purchase bill");
      setDeleteConfirmation({ isOpen: true, id: deleteConfirmation.id, error: err.message || "Failed to delete purchase bill" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditBill = (bill: PurchaseBill) => {
    // Set the editing bill ID to track we're in edit mode
    setEditingBillId(bill.id);

    // Populate form with existing bill data
    setBillDate(bill.date.split('T')[0]);
    setInvoiceNumber(bill.code);
    setBillStatus(bill.status as 'Draft' | 'Confirmed');
    setDiscountAmount(bill.discountAmount || '0');
    setPurchaseType(bill.type); // Set purchase type for editing

    // Find and set supplier
    const supplier = suppliers.find(s => s.id === bill.supplier?.id);
    if (supplier) setSelectedSupplier(supplier);

    // Set items
    const billItems = bill.items?.map((item: any, idx: number) => ({
      id: `edit-${idx}`,
      rawMaterialId: item.rawMaterialId || '',
      finishedProductId: item.finishedProductId || '',
      expenseHeadId: item.expenseHeadId || '',
      materialName: item.materialName || '',
      hsnCode: item.hsnCode || '',
      quantity: item.quantity?.toString() || '',
      rate: item.rate?.toString() || '',
      gstPercent: item.gstPercent?.toString() || '18',
      amount: parseFloat(item.amount) || 0,
      cgst: parseFloat(item.cgst) || 0,
      sgst: parseFloat(item.sgst) || 0,
      igst: parseFloat(item.igst) || 0,
      total: parseFloat(item.total) || 0
    })) || [];

    setItems(billItems);
    setShowForm(true);
  };


  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const totals = calculateBillTotals();
  const isInterState = selectedSupplier?.stateCode !== COMPANY_STATE_CODE;

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading purchase data...</span>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Purchase Management</h1>
          <p className="text-xs text-gray-500">Procurement, Payments, and Accounts Payable</p>
        </div>

        {/* Tabs */}
        {!showForm && !showPaymentForm && (
          <div className="flex bg-gray-100 p-1 rounded-sm">
            <button
              onClick={() => setActiveTab('bills')}
              className={`px-4 py-1.5 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'bills' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Bills
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-1.5 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'payments' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Payments
            </button>
          </div>
        )}


        {/* Action Buttons */}
        {!showForm && !showPaymentForm && (
          <button
            onClick={() => {
              if (activeTab === 'bills') {
                setEditingBillId(null); // Reset edit mode for new bill
                setShowForm(true);
              } else {
                setShowPaymentForm(true);
              }
            }}
            className="px-4 py-1.5 bg-blue-700 text-white text-sm font-bold uppercase rounded-sm hover:bg-blue-800 transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-3 h-3 mr-2" />
            {activeTab === 'bills' ? 'New Purchase Bill' : 'New Payment'}
          </button>
        )}
      </div>

      {/* Messages */}
      {success && <div className="bg-green-50 text-green-700 text-xs font-bold p-2 border border-green-200">{success}</div>}
      {error && <div className="bg-red-50 text-red-700 text-xs font-bold p-2 border border-red-200">{error}</div>}

      {/* KPI Strip (Only show when not in form modes and in bills tab) */}
      {!showForm && !showPaymentForm && summary && activeTab === 'bills' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-2 border border-gray-200 rounded-sm">
          {[
            { label: 'Total Purchases', value: summary?.totalPurchases, color: 'text-blue-700' },
            { label: 'Paid Amount', value: summary?.paidAmount, color: 'text-green-700' },
            { label: 'Pending Payments', value: summary?.pendingPayments, color: 'text-orange-700' },
            { label: 'Unpaid Bills', value: summary?.unpaidCount, color: 'text-red-700', isCount: true }
          ].map((kpi, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-500">{kpi.label}</span>
              <span className={`text-lg font-bold font-mono ${kpi.color}`}>
                {kpi.isCount ? kpi.value || 0 : `₹${parseFloat(kpi.value || 0).toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ==================== BILLS VIEW ==================== */}
      {activeTab === 'bills' && (
        <>
          {!showForm ? (
            /* Purchase List Table - Dense */
            <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[500px]">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 border-b border-gray-300">
                    <tr>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Bill Date</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Entry #</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Supplier</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right w-20">Qty</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Basic Amt</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Tax</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Discount</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Total</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center">Status</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {purchaseBills.length === 0 ? (
                      <tr><td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500 italic">No purchase bills recorded.</td></tr>
                    ) : (
                      purchaseBills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(bill.date).toLocaleDateString()}</td>
                          <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">{bill.code}</td>
                          <td className="px-4 py-1.5 text-sm font-bold text-gray-900">{bill.supplier?.name}</td>
                          <td className="px-4 py-1.5 text-sm font-bold text-gray-900">
                            {bill.items?.map((i: any, idx) => <div key={idx}>{i.materialName}{i.rawMaterial?.color ? <span className="text-gray-500 font-normal"> ({i.rawMaterial.color})</span> : ''}</div>)}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-mono text-gray-900 text-right">
                            {bill.items?.map((i: any, idx) => <div key={idx}>{i.quantity} kg</div>)}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{parseFloat(bill.subtotal || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{(parseFloat(bill.cgst || '0') + parseFloat(bill.sgst || '0') + parseFloat(bill.igst || '0')).toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-red-600 text-right">₹{parseFloat(bill.discountAmount || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{parseFloat(bill.grandTotal || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-center">
                            <span className={`text-[10px] font-bold px-1 rounded uppercase ${bill.paymentStatus === 'Paid' ? 'text-green-700 bg-green-100' : bill.paymentStatus === 'Partial' ? 'text-orange-700 bg-orange-100' : 'text-red-700 bg-red-100'}`}>
                              {bill.paymentStatus}
                            </span>
                            {/* Roll Status Badge */}
                            {bill.type === 'RAW_MATERIAL' && (
                              <div className={`mt-1 text-[9px] font-bold px-1 rounded border text-center uppercase ${bill.rollEntryStatus === 'Completed' ? 'border-green-200 text-green-600 bg-green-50' :
                                bill.rollEntryStatus === 'Partial' ? 'border-orange-200 text-orange-600 bg-orange-50' :
                                  'border-gray-200 text-gray-500 bg-gray-50'
                                }`}>
                                {bill.rollEntryStatus === 'Pending' ? 'No Rolls' : bill.rollEntryStatus}
                                {parseFloat(bill.totalRollWeight || '0') > 0 && ` (${bill.totalRollWeight}kg)`}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => handleEditBill(bill)}
                                className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                title="Edit Bill"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBill(bill.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                title="Delete Bill"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {/* Add Rolls Button - Only for RAW_MATERIAL & Confirmed Bills */}
                              {(bill.type === 'RAW_MATERIAL' && bill.status === 'Confirmed') && (
                                <button
                                  onClick={() => {
                                    setSelectedBillForRolls(bill);
                                    setShowRollModal(true);
                                  }}
                                  className={`transition-colors p-1 ${bill.rollEntryStatus === 'Completed' ? 'text-green-500 hover:text-green-700' : 'text-blue-500 hover:text-blue-700'}`}
                                  title="Manage Rolls"
                                >
                                  <Package className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-300 flex items-center justify-between sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Purchase Entry Form - Enterprise */
            <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
              {/* Form Header */}
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10">
                <h2 className="text-sm font-bold text-gray-800 uppercase">{editingBillId ? 'Edit Purchase Bill' : 'New Inward Purchase'}</h2>
                <div className="flex space-x-2">
                  <button onClick={() => { setShowForm(false); setEditingBillId(null); resetForm(); }} className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-red-600 border border-transparent hover:border-red-200 rounded-sm uppercase">Cancel</button>
                  <button onClick={handleSave} disabled={saving} className="px-3 py-1 bg-blue-700 text-white text-xs font-bold uppercase rounded-sm hover:bg-blue-800 shadow-sm flex items-center">
                    {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save Record
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Header Inputs */}
                <div className="col-span-1 lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-200 pb-4">
                  <div className="col-span-1 lg:col-span-4 flex space-x-6 pb-2 border-b border-gray-100">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="purchaseType"
                        value="RAW_MATERIAL"
                        checked={purchaseType === 'RAW_MATERIAL'}
                        onChange={(e) => {
                          setPurchaseType(e.target.value as any);
                          setItems([]); // Clear items on type change
                        }}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-gray-700">Raw Material Purchase</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="purchaseType"
                        value="FINISHED_GOODS"
                        checked={purchaseType === 'FINISHED_GOODS'}
                        onChange={(e) => {
                          setPurchaseType(e.target.value as any);
                          setItems([]);
                        }}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-gray-700">Trading Purchase (FG)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="purchaseType"
                        value="GENERAL"
                        checked={purchaseType === 'GENERAL'}
                        onChange={(e) => {
                          setPurchaseType(e.target.value as any);
                          setItems([]);
                        }}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-gray-700">General Expense</span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="billDate" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bill Date</label>
                    <input id="billDate" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
                  </div>
                  <div>
                    <label htmlFor="invoiceNumber" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Invoice Number <span className="text-red-500">*</span></label>
                    <input id="invoiceNumber" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold" placeholder="e.g. INV-2024-001" />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label htmlFor="supplierSelect" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      {purchaseType === 'GENERAL' ? 'Party / Vendor' : 'Supplier Account'}
                    </label>
                    <select id="supplierSelect" value={selectedSupplier?.id || ''} onChange={e => handleSupplierSelect(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white">
                      <option value="">Select Accounts...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.gstNo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="billStatus" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Record Status</label>
                    <select id="billStatus" value={billStatus} onChange={e => setBillStatus(e.target.value as any)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                      <option value="Confirmed">Confirmed</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                </div>

                {/* Supplier Info */}
                {selectedSupplier && (
                  <div className="col-span-12 bg-blue-50 border border-blue-100 p-2 rounded-sm text-xs flex justify-between items-center">
                    <span className="font-bold text-blue-800 tracking-wider uppercase">Party Details:</span>
                    <span className="text-gray-700">GSTIN: <strong>{selectedSupplier.gstNo}</strong></span>
                    <span className="text-gray-700">State Code: <strong>{selectedSupplier.stateCode}</strong></span>
                    <span className={`font-bold ${parseFloat(selectedSupplier.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Outstanding: ₹{parseFloat(selectedSupplier.outstanding || '0').toLocaleString()}
                    </span>
                    {isInterState && <span className="text-[10px] font-bold bg-orange-200 text-orange-800 px-1 rounded">INTER-STATE</span>}
                  </div>
                )}

                {/* Item Entry Table */}
                <div className="col-span-12 mt-2">
                  <div className="border border-gray-300 rounded-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-gray-100 border-b border-gray-300">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-8">#</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            {purchaseType === 'RAW_MATERIAL' ? 'Raw Material' : purchaseType === 'FINISHED_GOODS' ? 'Finished Product' : 'Expense Head'}
                          </th>
                          {purchaseType !== 'GENERAL' && <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">HSN</th>}
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 text-right">Qty</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28 text-right">Rate</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-32 text-right">Amount</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20 text-right">GST %</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28 text-right">Tax</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-32 text-right">Total</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {items.map((item, index) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-center text-gray-400">{index + 1}</td>
                            <td className="px-3 py-2">
                              {purchaseType === 'RAW_MATERIAL' && (
                                <select
                                  value={item.rawMaterialId}
                                  onChange={(e) => updateItem(item.id, 'rawMaterialId', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                                >
                                  <option value="">Select Material...</option>
                                  {rawMaterials.map(rm => (
                                    <option key={rm.id} value={rm.id}>{rm.name} - {rm.stock} {rm.unit}</option>
                                  ))}
                                </select>
                              )}
                              {purchaseType === 'FINISHED_GOODS' && (
                                <select
                                  value={item.finishedProductId}
                                  onChange={(e) => updateItem(item.id, 'finishedProductId', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                                >
                                  <option value="">Select Product...</option>
                                  {finishedProducts.map(fp => (
                                    <option key={fp.id} value={fp.id}>{fp.name} ({fp.code})</option>
                                  ))}
                                </select>
                              )}
                              {purchaseType === 'GENERAL' && (
                                <>
                                  <input
                                    list={`expense-heads-${item.id}`}
                                    value={item.materialName} // Display name (either from existing or typed)
                                    onChange={(e) => updateItemExpenseHead(item.id, e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                                    placeholder="Type or select Expense Head..."
                                  />
                                  <datalist id={`expense-heads-${item.id}`}>
                                    {expenseHeads.map(eh => (
                                      <option key={eh.id} value={eh.name} />
                                    ))}
                                  </datalist>
                                </>
                              )}
                            </td>
                            {purchaseType !== 'GENERAL' && (
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.hsnCode}
                                  readOnly
                                  className="w-full px-2 py-1 text-xs border border-transparent bg-transparent text-gray-500 text-center"
                                />
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 text-right font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.rate}
                                onChange={(e) => updateItem(item.id, 'rate', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 text-right font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">
                              {item.amount.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={item.gstPercent}
                                onChange={(e) => updateItem(item.id, 'gstPercent', e.target.value)}
                                className="w-full px-1 py-1 text-xs border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 text-right"
                              >
                                <option value="0">0%</option>
                                <option value="5">5%</option>
                                <option value="12">12%</option>
                                <option value="18">18%</option>
                                <option value="28">28%</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono text-gray-500">
                              {(item.cgst + item.sgst + item.igst).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono font-bold text-gray-900 bg-gray-50">
                              {item.total.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeItem(item.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                                tabIndex={-1}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button onClick={addItem} className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-xs text-blue-600 font-bold uppercase border-t border-gray-200">
                      + Add Line Item
                    </button>
                  </div>
                </div>

                {/* Footer Calculation */}
                <div className="col-span-12 flex justify-end mt-2">
                  <div className="w-64 bg-gray-50 p-3 border border-gray-200 rounded-sm space-y-1">
                    <div className="flex justify-between text-xs text-gray-600"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
                    {isInterState ? (
                      <div className="flex justify-between text-xs text-gray-600"><span>IGST</span><span>₹{totals.totalIgst.toFixed(2)}</span></div>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs text-gray-600"><span>CGST</span><span>₹{totals.totalCgst.toFixed(2)}</span></div>
                        <div className="flex justify-between text-xs text-gray-600"><span>SGST</span><span>₹{totals.totalSgst.toFixed(2)}</span></div>
                      </>
                    )}
                    <div className="flex justify-between text-xs text-red-600 items-center">
                      <span>Discount</span>
                      <input
                        type="number"
                        value={discountAmount}
                        onChange={e => setDiscountAmount(e.target.value)}
                        className="w-20 text-right text-xs border border-red-200 rounded px-1 py-0.5"
                        placeholder="0"
                      />
                    </div>
                    <div className="border-t border-gray-300 my-1"></div>
                    <div className="flex justify-between text-base font-bold text-gray-900"><span>Grand Total</span><span>₹{totals.grandTotal.toLocaleString()}</span></div>
                  </div>
                </div>

                {/* Save Button at Bottom */}
                <div className="col-span-12 flex justify-end mt-4 pt-4 border-t border-gray-300">
                  <div className="flex space-x-3">
                    <button onClick={() => { setShowForm(false); resetForm(); }} className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-medium text-sm">
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:shadow-lg transition-all disabled:opacity-50 flex items-center font-medium text-sm">
                      {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Save Record
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== PAYMENTS VIEW ==================== */}

      {/* ==================== PAYMENTS VIEW ==================== */}
      {activeTab === 'payments' && (
        <>
          {!showPaymentForm ? (
            /* Payments List */
            <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[500px]">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 border-b border-gray-300">
                    <tr>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Date</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Payment #</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Supplier</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Mode</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Amount</th>
                      <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {purchasePayments.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 italic">No payments recorded.</td></tr>
                    ) : (
                      purchasePayments.map((payment) => (
                        <tr key={payment.id} className={`hover:bg-blue-50 transition-colors ${payment.status === 'Reversed' ? 'bg-red-50 opacity-70' : ''}`}>
                          <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(payment.date).toLocaleDateString()}</td>
                          <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">
                            {payment.code}
                            {payment.status === 'Reversed' && <span className="ml-2 text-[9px] bg-red-200 text-red-800 px-1 rounded">REVERSED</span>}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-bold text-gray-900">
                            {payment.partyName}
                            {/* Allocations Display */}
                            {payment.allocations && payment.allocations.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {payment.allocations.map((alloc: any, idx: number) => (
                                  <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                    {alloc.billNumber}: ₹{parseFloat(alloc.amount).toLocaleString()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-medium text-gray-600">{payment.mode}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{parseFloat(payment.amount).toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-right text-xs text-blue-600 font-bold">
                            {payment.status !== 'Reversed' && (
                              <button onClick={() => handleReversePayment(payment.id)} className="text-red-600 hover:text-red-800 flex items-center justify-end text-[10px] uppercase ml-auto" title="Reverse Payment">
                                <RotateCcw className="w-3 h-3 mr-1" /> Reverse
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* ==================== ADVANCES LIST (New) ==================== */}
      {!showPaymentForm && activeTab === 'advances' && (
        <div className="space-y-4">
          {/* Advance Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-yellow-50 p-3 border border-yellow-200 rounded-sm">
            {[
              { label: 'Total Advances Given', value: purchasePayments.filter(p => p.isAdvance && p.status !== 'Reversed').reduce((sum, p) => sum + parseFloat(p.amount), 0), color: 'text-blue-700' },
              { label: 'Total Adjusted', value: purchasePayments.filter(p => p.isAdvance && p.status !== 'Reversed').reduce((sum, p) => sum + (parseFloat(p.amount) - parseFloat(p.advanceBalance || '0')), 0), color: 'text-green-700' },
              { label: 'Open Advance Balance', value: purchasePayments.filter(p => p.isAdvance && p.status !== 'Reversed').reduce((sum, p) => sum + parseFloat(p.advanceBalance || '0'), 0), color: 'text-red-700' }
            ].map((kpi, idx) => (
              <div key={idx} className="flex flex-col items-center justify-center p-2 bg-white rounded shadow-sm border border-yellow-100">
                <span className="text-[10px] uppercase font-bold text-gray-500">{kpi.label}</span>
                <span className={`text-xl font-bold font-mono ${kpi.color}`}>
                  ₹{kpi.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Advances Table */}
          <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[500px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Date</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Ref #</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32 text-right">Amount</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32 text-right">Adjusted</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32 text-right">Balance</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchasePayments.filter(p => p.isAdvance).length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 italic">No advance payments found.</td></tr>
                  ) : (
                    purchasePayments.filter(p => p.isAdvance).map((payment) => {
                      const amount = parseFloat(payment.amount);
                      const balance = parseFloat(payment.advanceBalance || '0');
                      const adjusted = amount - balance;
                      const isFullyAdjusted = balance === 0;

                      return (
                        <tr key={payment.id} className={`hover:bg-yellow-50 transition-colors ${payment.status === 'Reversed' ? 'bg-red-50 opacity-70' : ''}`}>
                          <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(payment.date).toLocaleDateString()}</td>
                          <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">
                            {payment.code}
                            {payment.status === 'Reversed' && <span className="ml-2 text-[9px] bg-red-200 text-red-800 px-1 rounded">REVERSED</span>}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-bold text-gray-900">{payment.partyName}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{amount.toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-green-700 text-right">₹{adjusted.toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-red-600 text-right">₹{balance.toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-center">
                            {payment.status === 'Reversed' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 uppercase">Void</span>
                            ) : isFullyAdjusted ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700 uppercase">Adjusted</span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 uppercase border border-yellow-200">Open</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Shared Payment Form View for Payments & Advances tabs */}
      {(activeTab === 'payments' || activeTab === 'advances') && showPaymentForm && (
        /* Payment Entry Form */
        <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
          {/* Header */}
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10">
            <h2 className="text-sm font-bold text-gray-800 uppercase">New Outward Payment / Advance</h2>
            <div className="flex space-x-2">
              <button onClick={() => setShowPaymentForm(false)} className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-red-600 border border-transparent hover:border-red-200 rounded-sm uppercase">Cancel</button>
              <button onClick={handleCreatePayment} disabled={saving} className="px-3 py-1 bg-green-700 text-white text-xs font-bold uppercase rounded-sm hover:bg-green-800 shadow-sm flex items-center">
                {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save Transaction
              </button>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Side: Payment Details */}
            <div className="lg:col-span-4 space-y-4 border-r border-gray-200 pr-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Payment Date</label>
                <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Supplier</label>
                <select value={paymentForm.supplierId} onChange={e => handlePaymentSupplierSelect(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white">
                  <option value="">Select Supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.gstNo}</option>)}
                </select>
              </div>
              <div className="flex items-center space-x-2 bg-blue-50 p-2 rounded border border-blue-100 mb-4">
                <input
                  type="checkbox"
                  id="useAdvancePayment"
                  checked={paymentForm.useAdvancePayment}
                  onChange={e => {
                    const useAdvance = e.target.checked;
                    setPaymentForm({
                      ...paymentForm,
                      useAdvancePayment: useAdvance,
                      accountId: useAdvance ? 'ADVANCE' : '', // Clear or set dummy
                      mode: useAdvance ? 'Adjustment' : 'Bank',
                      selectedAdvanceId: ''
                    });
                    if (useAdvance) {
                      // Fetch advances if supplier selected
                      if (paymentForm.supplierId) {
                        accountsApi.getPartyAdvances(paymentForm.supplierId).then(res => {
                          if (res.data) setAvailableAdvances(res.data);
                        });
                      }
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="useAdvancePayment" className="text-xs font-bold text-blue-800 uppercase select-none cursor-pointer">
                  Pay via Advance Adjustment
                </label>
              </div>

              {!paymentForm.useAdvancePayment && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Payment Mode</label>
                    <select value={paymentForm.mode} onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                      <option value="Bank">Bank Transfer / NEFT</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Paid From Account</label>
                    <select value={paymentForm.accountId} onChange={e => setPaymentForm({ ...paymentForm, accountId: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                      <option value="">Select Account...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Reference No.</label>
                    <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500" placeholder="Cheque / UTR No." />
                  </div>
                </>
              )}

              {paymentForm.useAdvancePayment && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Advance Payment</label>
                  <select
                    value={paymentForm.selectedAdvanceId}
                    onChange={e => {
                      const adv = availableAdvances.find(a => a.id === e.target.value);
                      setPaymentForm({
                        ...paymentForm,
                        selectedAdvanceId: e.target.value,
                        // Make sure we don't autofill amount over what's available
                      });
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white"
                  >
                    <option value="">Select Available Advance...</option>
                    {availableAdvances.filter(a => parseFloat(a.advanceBalance) > 0).map(adv => (
                      <option key={adv.id} value={adv.id}>
                        {new Date(adv.date).toLocaleDateString()} - {adv.code} (Bal: ₹{parseFloat(adv.advanceBalance).toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Only advances with available balance are shown.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  {paymentForm.useAdvancePayment ? "Amount to Adjust" : "Total Amount Paid"}
                </label>
                <div className="relative">
                  <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full pl-6 pr-2 py-1.5 text-lg font-bold border border-blue-500 rounded-sm focus:ring-1 focus:ring-blue-500 text-green-700" placeholder="0.00" />
                </div>
                {paymentForm.useAdvancePayment && paymentForm.selectedAdvanceId && (
                  <div className="text-[10px] text-gray-500 mt-1">
                    Max Available: <span className="font-bold">₹{
                      parseFloat(availableAdvances.find(a => a.id === paymentForm.selectedAdvanceId)?.advanceBalance || '0').toLocaleString()
                    }</span>
                  </div>
                )}
              </div>

              {!paymentForm.useAdvancePayment && (
                <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded border border-gray-200">
                  <input
                    type="checkbox"
                    id="isAdvance"
                    checked={paymentForm.isAdvance}
                    onChange={e => {
                      setPaymentForm({ ...paymentForm, isAdvance: e.target.checked });
                      if (e.target.checked) setAllocations({}); // Clear allocations if advance
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isAdvance" className="text-xs font-bold text-gray-700 uppercase select-none cursor-pointer">
                    Mark as Advance Payment
                  </label>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Remarks</label>
                <textarea value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })} rows={2} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500" placeholder="Optional remarks..." />
              </div>
            </div>

            {/* Right Side: Bill Allocation */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-2 border border-gray-200 rounded-sm">
                <h3 className="text-xs font-bold text-gray-700 uppercase">Outstanding Bills</h3>
                {!paymentForm.isAdvance && (
                  <button onClick={handleAutoAllocate} className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                    Auto Allocate (FIFO)
                  </button>
                )}
              </div>

              <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[300px] max-h-[500px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase">Date</th>
                      <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase">Bill #</th>
                      <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right">Bill Amount</th>
                      <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right">Balance</th>
                      <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-32">Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {outstandingBills.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500 italic">No outstanding bills found.</td></tr>
                    ) : (
                      outstandingBills.map((bill) => {
                        const balance = parseFloat(bill.balanceAmount || bill.grandTotal);
                        return (
                          <tr key={bill.id} className="hover:bg-blue-50">
                            <td className="px-3 py-1.5 text-xs text-gray-600">{new Date(bill.date).toLocaleDateString()}</td>
                            <td className="px-3 py-1.5 text-xs font-mono font-bold text-blue-700">{bill.code}</td>
                            <td className="px-3 py-1.5 text-xs text-right">₹{parseFloat(bill.grandTotal).toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-xs text-right font-bold text-red-600">₹{balance.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                max={balance}
                                value={allocations[bill.id] || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (val > balance) return;

                                  setAllocations(prev => {
                                    const next = { ...prev };
                                    if (!val) delete next[bill.id];
                                    else next[bill.id] = val;
                                    return next;
                                  });
                                }}
                                className={`w-full text-right px-2 py-1 text-sm border rounded-sm focus:ring-1 focus:ring-blue-500 font-mono ${allocations[bill.id] ? 'border-green-500 bg-green-50 font-bold' : 'border-gray-300'}`}
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer */}
              <div className="flex justify-end space-x-4 text-xs font-bold text-gray-700">
                <div>Total Paid: <span className="text-green-700">₹{parseFloat(paymentForm.amount || '0').toLocaleString()}</span></div>
                <div>Total Allocated: <span className={Object.values(allocations).reduce((a, b) => a + b, 0) > parseFloat(paymentForm.amount || '0') ? 'text-red-600' : 'text-blue-700'}>
                  ₹{Object.values(allocations).reduce((a, b) => a + b, 0).toLocaleString()}
                </span></div>
                <div>{paymentForm.isAdvance ? "Advance Amount:" : "Unallocated:"} <span className="text-gray-500">₹{Math.max(0, parseFloat(paymentForm.amount || '0') - Object.values(allocations).reduce((a, b) => a + b, 0)).toLocaleString()}</span></div>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* Roll Entry Modal */}
      {showRollModal && selectedBillForRolls && (
        <RollEntryModal
          bill={selectedBillForRolls}
          onClose={() => {
            setShowRollModal(false);
            setSelectedBillForRolls(null);
          }}
          onSave={() => {
            fetchData();
          }}
        />
      )}

      {/* Adjust Advance Modal Removed */}
    </div>
  );
}
