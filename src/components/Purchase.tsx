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
import { purchaseApi, mastersApi, accountsApi, gstApi } from '../lib/api';
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
  color: string;
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

interface GeneralItem {
  id: string;
  name: string;
  defaultExpenseHeadId?: string;
  defaultExpenseHead?: ExpenseHead;
}

interface PurchaseItem {
  id: string;
  rawMaterialId?: string;
  finishedProductId?: string;
  generalItemId?: string;
  expenseHeadId?: string;
  materialName: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  rate: string;
  gstPercent: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  pendingQuantity?: number; // Fetched from API
  sourceBills?: any[]; // Store bills for adjustment
  pendingAdjustment?: { qty: number; sourceBills: any[] }; // To be processed on save
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

// Company state code (Gujarat)
const COMPANY_STATE_CODE = '24';

// Indian states for Place of Supply
// GST State Codes for Mapping
const GST_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman & Diu' },
  { code: '26', name: 'Dadra & Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' }
];

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
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  // Data State
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<FinishedProduct[]>([]);
  const [generalItems, setGeneralItems] = useState<GeneralItem[]>([]);
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
  const [filters, setFilters] = useState({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    type: ''
  });

  // Payment State
  const [activeTab, setActiveTab] = useState<'bills' | 'payments' | 'advances'>('bills');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [purchasePayments, setPurchasePayments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [outstandingBills, setOutstandingBills] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<{ [key: string]: number }>({});
  const [paymentFilters, setPaymentFilters] = useState({
    supplierId: '',
    startDate: '',
    endDate: '',
    mode: ''
  });

  // Quick Add Party State
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false);
  const [quickAddGstLoading, setQuickAddGstLoading] = useState(false);
  const [quickAddGstSuccess, setQuickAddGstSuccess] = useState<string | null>(null);
  const [quickAddSupplierForm, setQuickAddSupplierForm] = useState({
    name: '',
    gstNo: '',
    contact: '', // Suppliers use 'contact' instead of 'phone' in some parts of this codebase's masters, let's verify
    address: '',
    stateCode: '24' // default to Gujarat
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null; error?: string }>({ isOpen: false, id: null });
  const [showRollModal, setShowRollModal] = useState(false);
  const [selectedBillForRolls, setSelectedBillForRolls] = useState<any>(null);

  const handleQuickSupplierGstSearch = async () => {
    const gstin = quickAddSupplierForm.gstNo;
    if (!gstin || gstin.length !== 15) return;

    setQuickAddGstLoading(true);
    setError(null);
    setQuickAddGstSuccess(null);

    try {
      const result = await gstApi.search(gstin);
      if (result.data) {
        setQuickAddSupplierForm(prev => ({
          ...prev,
          name: result.data.name,
          stateCode: result.data.stateCode,
          address: result.data.address
        }));
        setQuickAddGstSuccess('GST details fetched successfully.');
        setTimeout(() => setQuickAddGstSuccess(null), 3000);
      } else {
        setError(result.error || 'Unable to fetch GST details.');
      }
    } catch (err) {
      setError('Failed to fetch GST details.');
    }
    setQuickAddGstLoading(false);
  };

  const saveQuickSupplier = async () => {
    if (!quickAddSupplierForm.name) {
      setError('Supplier name is required.');
      return;
    }

    setSaving(true);
    try {
      const result = await mastersApi.createSupplier(quickAddSupplierForm);
      if (result.data) {
        setSuppliers(prev => [...prev, result.data]);
        handleSupplierSelect(result.data.id);
        setShowQuickAddSupplier(false);
        setQuickAddSupplierForm({
          name: '',
          gstNo: '',
          contact: '',
          address: '',
          stateCode: '27'
        });
        setSuccess('Supplier added and selected.');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to add supplier.');
      }
    } catch (err) {
      setError('Failed to save supplier.');
    }
    setSaving(false);
  };
  const [availableAdvances, setAvailableAdvances] = useState<any[]>([]); // For integrated adjustment

  const [paymentForm, setPaymentForm] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      supplierId: '',
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      mode: 'Bank',
      amount: '',
      accountId: '',
      reference: '',
      remarks: '',
      isAdvance: false,
      useAdvancePayment: false,
      selectedAdvanceId: ''
    };
  });

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const fetchData = useCallback(async (p = page, currentFilters = filters) => {
    console.log('\n📊 FRONTEND: fetchData - START');
    setLoading(true);
    setError(null);
    try {
      const [billsRes, suppliersRes, materialsRes, finishedRes, expensesRes, generalRes, summaryRes, accountsRes, paymentsRes] = await Promise.all([
        purchaseApi.getBills(p, limit, currentFilters),
        mastersApi.getSuppliers(),
        mastersApi.getRawMaterials(),
        mastersApi.getFinishedProducts(),
        mastersApi.getExpenseHeads(),
        mastersApi.getGeneralItems(),
        purchaseApi.getSummary(),
        mastersApi.getAccounts(),
        accountsApi.getTransactions({ type: 'PAYMENT', partyType: 'supplier' }, 1, 500), // Fetch all supplier payments (high limit to avoid pagination cutoff)
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
      if (generalRes.data) setGeneralItems(generalRes.data);
      if (summaryRes.data) setSummary(summaryRes.data);
      if (accountsRes.data) setAccounts(accountsRes.data);
      if (paymentsRes.data) {
        const payments = Array.isArray(paymentsRes.data) ? paymentsRes.data : ((paymentsRes.data as any).data || []);
        setPurchasePayments(payments);
      } else if (paymentsRes.error) {
        setError(`Failed to fetch payments: ${paymentsRes.error}`);
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
      unit: 'kg',
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
          updatedItem.expenseHeadId = head.id;
          // Don't overwrite materialName if it's already set (e.g. from general item)
          if (!updatedItem.materialName) {
            updatedItem.materialName = head.name;
          }
        }
      } else if (field === 'generalItemId') {
        const item = generalItems.find(i => i.id === value);
        if (item) {
          updatedItem.materialName = item.name;
          updatedItem.generalItemId = item.id;
          if (item.defaultExpenseHeadId) {
            updatedItem.expenseHeadId = item.defaultExpenseHeadId;
          }
          updatedItem.gstPercent = '18';
        }
      } else if (field === 'unit') {
        updatedItem.unit = value;
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
      updatedItem.total = gst.total;

      return updatedItem;
    }));
  };

  const updateItemGeneralItem = (itemId: string, value: string) => {
    // Check if selected value matches an existing General Item
    const existingItem = generalItems.find(i => i.name === value || i.id === value);

    setItems(items.map(item => {
      if (item.id !== itemId) return item;

      if (existingItem) {
        return {
          ...item,
          generalItemId: existingItem.id,
          materialName: existingItem.name,
          expenseHeadId: existingItem.defaultExpenseHeadId || item.expenseHeadId,
          gstPercent: '18'
        };
      } else {
        // New General Item
        return {
          ...item,
          generalItemId: undefined,
          materialName: value,
          gstPercent: '18'
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
          .filter(item => (purchaseType === 'RAW_MATERIAL' && item.rawMaterialId) || (purchaseType === 'FINISHED_GOODS' && item.finishedProductId) || (purchaseType === 'GENERAL' && (item.expenseHeadId || item.generalItemId || item.materialName)))
          .map(item => ({
            rawMaterialId: purchaseType === 'RAW_MATERIAL' ? item.rawMaterialId : undefined,
            finishedProductId: purchaseType === 'FINISHED_GOODS' ? item.finishedProductId : undefined,
            generalItemId: purchaseType === 'GENERAL' ? item.generalItemId : undefined,
            generalItemName: (purchaseType === 'GENERAL' && !item.generalItemId) ? item.materialName : undefined,
            expenseHeadId: purchaseType === 'GENERAL' ? item.expenseHeadId : undefined,
            quantity: parseFloat(item.quantity) || 1,
            unit: item.unit || 'kg',
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
        const newBillId = result.data.id; // Correctly get the ID
        console.log(`✓ Bill ${action} successfully:`, result.data?.code);
        console.log('  Items in response:', result.data?.items?.length || 0);

        // Process Pending Adjustments
        // If an item has 'pendingAdjustment', we must create adjustment records linking past bills to this new bill
        if (newBillId && purchaseType === 'RAW_MATERIAL') {
          for (const item of items) {
            if (item.pendingAdjustment && item.pendingAdjustment.qty > 0) {
              try {
                console.log(`Processing adjustment for ${item.materialName}: ${item.pendingAdjustment.qty} kg`);
                // We need to distribute this qty across the source bills (FIFO)
                // item.sourceBills should be sorted by date (desc) from the API, but we want FIFO/Oldest first usually?
                // Actually the API returns them sorted by date DESC.
                // Let's allocate to the OLDEST available bill first (reverse the array).
                const sourceBills = [...(item.pendingAdjustment.sourceBills || [])].reverse();

                let remainingToAdjust = item.pendingAdjustment.qty;

                for (const sourceBill of sourceBills) {
                  if (remainingToAdjust <= 0) break;

                  const canAdjust = Math.min(remainingToAdjust, sourceBill.pendingQuantity);
                  if (canAdjust > 0) {
                    await purchaseApi.adjustPendingQuantity({
                      sourceBillId: sourceBill.id,
                      targetBillId: newBillId,
                      rawMaterialId: item.rawMaterialId,
                      quantity: canAdjust
                    });
                    remainingToAdjust -= canAdjust;
                  }
                }

              } catch (adjErr) {
                console.error('Failed to auto-create adjustment:', adjErr);
                // We don't block the bill success, but maybe show a warning?
              }
            }
          }
        }

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

  const handleEditPayment = async (id: string) => {
    setLoading(true);
    try {
      const res = await purchaseApi.getPayment(id);
      if (res.data) {
        const p = res.data;
        const supplierId = p.partyId;

        // 1. Set Form
        setPaymentForm({
          supplierId,
          date: (() => {
            const d = new Date(p.date);
            // Format as yyyy-MM-ddTHH:mm for datetime-local input (preserves original time)
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          })(),
          mode: p.mode,
          amount: p.amount,
          accountId: p.accountId || '',
          reference: p.bankReference || '',
          remarks: p.remarks || '',
          isAdvance: p.isAdvance || false,
          useAdvancePayment: false,
          selectedAdvanceId: ''
        });

        // 2. Set Allocations Map and adjust bills
        const existingAllocations: { [key: string]: number } = {};
        const allocatedBills: any[] = [];

        if (p.allocations) {
          p.allocations.forEach((a: any) => {
            existingAllocations[a.billId] = parseFloat(a.amount);
            allocatedBills.push({
              id: a.billId,
              code: a.billCode,
              date: a.billDate,
              grandTotal: a.billTotal,
              balanceAmount: a.currBalance
            });
          });
        }
        setAllocations(existingAllocations);

        // 3. Fetch Outstanding Bills
        const outRes = await purchaseApi.getOutstandingBills(supplierId);
        let bills = outRes.data || [];

        // 4. Merge and Adjust Balances
        const mergedBills = [...bills];
        allocatedBills.forEach(allocBill => {
          if (!mergedBills.find(b => b.id === allocBill.id)) {
            mergedBills.push(allocBill);
          }
        });

        const adjustedBills = mergedBills.map(b => {
          const allocatedByThis = existingAllocations[b.id] || 0;
          const currentDbBal = parseFloat(b.balanceAmount || b.grandTotal || '0');
          return {
            ...b,
            balanceAmount: (currentDbBal + allocatedByThis).toString()
          };
        });

        adjustedBills.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setOutstandingBills(adjustedBills);
        setEditingPaymentId(id);
        setShowPaymentForm(true);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load payment details');
    }
    setLoading(false);
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
      // Send the datetime-local value directly as a full ISO timestamp
      // datetime-local gives us 'yyyy-MM-ddTHH:mm', just append :00.000Z offset
      let finalDate: string;
      if (paymentForm.date.includes('T')) {
        // datetime-local format: convert to proper ISO string in local time
        finalDate = new Date(paymentForm.date).toISOString();
      } else {
        // fallback: date only — use current time
        finalDate = new Date().toISOString();
      }

      const payload = {
        ...paymentForm,
        date: finalDate,
        allocations: allocationItems,
        adjustmentAmount: paymentForm.useAdvancePayment ? totalAllocated : 0
      };

      const result = editingPaymentId
        ? await purchaseApi.updatePayment(editingPaymentId, payload)
        : await purchaseApi.createPayment(payload);

      if (result.error) {
        setError(result.error);
      } else {
        setShowPaymentForm(false);
        setEditingPaymentId(null);
        setPaymentForm({
          supplierId: '',
          date: (() => {
            const d = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          })(),
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

  const [deletePaymentConfirmation, setDeletePaymentConfirmation] = useState<{ isOpen: boolean; id: string | null; error?: string }>({ isOpen: false, id: null });

  const handleDeletePayment = async (paymentId: string) => {
    setDeletePaymentConfirmation({ isOpen: true, id: paymentId });
  };

  const confirmDeletePayment = async () => {
    if (!deletePaymentConfirmation.id) return;

    setLoading(true);
    try {
      const result = await purchaseApi.deletePayment(deletePaymentConfirmation.id);
      if (result.error) throw new Error(result.error);
      fetchData();
      setSuccess('Payment deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
      setDeletePaymentConfirmation({ isOpen: false, id: null });
    } catch (err: any) {
      setError(err.message || "Failed to delete payment");
      setDeletePaymentConfirmation({ isOpen: true, id: deletePaymentConfirmation.id, error: err.message || "Failed to delete payment" });
    } finally {
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
      gstPercent: item.gstPercent ? parseFloat(item.gstPercent.toString()).toString() : '18',
      unit: item.unit || 'kg',
      amount: parseFloat(item.amount) || 0,
      cgst: parseFloat(item.cgst) || 0,
      sgst: parseFloat(item.sgst) || 0,
      igst: parseFloat(item.igst) || 0,
      total: parseFloat(item.totalAmount || item.total) || 0
    })) || [];

    setItems(billItems);
    setShowForm(true);
  };

  // ============================================================
  // PENDING QUANTITY LOGIC
  // ============================================================

  const [adjustmentModal, setAdjustmentModal] = useState<{
    isOpen: boolean;
    itemIndex: number;
    rawMaterialId: string;
    pendingBills: any[];
  }>({ isOpen: false, itemIndex: -1, rawMaterialId: '', pendingBills: [] });

  const checkPendingQuantity = async (index: number, rawMaterialId: string) => {
    if (!selectedSupplier || !rawMaterialId) return;

    try {
      const result = await purchaseApi.getPendingQuantity(selectedSupplier.id, rawMaterialId);
      if (result.data) {
        // Exclude current bill if editing
        const filteredData = editingBillId
          ? result.data.filter((b: any) => b.id !== editingBillId)
          : result.data;

        const totalPending = filteredData.reduce((sum: number, b: any) => sum + b.pendingQuantity, 0);

        // Update item with pending info
        const newItems = [...items];
        newItems[index] = {
          ...newItems[index],
          pendingQuantity: totalPending,
          sourceBills: filteredData // Store source bills for later adjustment
        };
        setItems(newItems);
      }
    } catch (err) {
      console.error('Failed to check pending qty:', err);
    }
  };

  // Watch for material changes to trigger check
  useEffect(() => {
    items.forEach((item, index) => {
      if (item.rawMaterialId && selectedSupplier && purchaseType === 'RAW_MATERIAL') {
        // Debounce or just check if not already checked? 
        // For simplicity, we'll let the user click "Check" or check on selection
      }
    });
  }, [items, selectedSupplier]);

  const openAdjustmentModal = async (index: number, rawMaterialId: string) => {
    if (!selectedSupplier) return;
    setLoading(true);
    try {
      const result = await purchaseApi.getPendingQuantity(selectedSupplier.id, rawMaterialId);
      if (result.data) {
        setAdjustmentModal({
          isOpen: true,
          itemIndex: index,
          rawMaterialId,
          pendingBills: result.data
        });
      }
    } catch (e) {
      setError("Failed to fetch pending bills");
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustConfirm = async (billId: string, adjustQty: number) => {
    if (editingBillId) {
      try {
        await purchaseApi.adjustPendingQuantity({
          sourceBillId: billId,
          targetBillId: editingBillId,
          rawMaterialId: adjustmentModal.rawMaterialId,
          quantity: adjustQty
        });
        setSuccess("Adjustment recorded!");
        setAdjustmentModal({ ...adjustmentModal, isOpen: false });
        // Refresh
        checkPendingQuantity(adjustmentModal.itemIndex, adjustmentModal.rawMaterialId);
      } catch (e) {
        setError("Failed to adjust");
      }
    } else {
      alert("Please save the bill as Draft first to perform adjustments.");
    }
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
        <div className="mb-4 flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filter By Type:</span>
            <select
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.type}
              onChange={(e) => {
                const newFilters = { ...filters, type: e.target.value };
                setFilters(newFilters);
                setPage(1);
                fetchData(1, newFilters);
              }}
            >
              <option value="">All Types</option>
              <option value="RAW_MATERIAL">Raw Material</option>
              <option value="FINISHED_GOODS">Trading Purchase</option>
              <option value="GENERAL">General Expense</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sort By:</span>
            <select
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.sortBy}
              onChange={(e) => {
                const newFilters = { ...filters, sortBy: e.target.value };
                setFilters(newFilters);
                fetchData(page, newFilters);
              }}
            >
              <option value="createdAt">Entry Date</option>
              <option value="date">Bill Date</option>
              <option value="code">Bill Number</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order:</span>
            <select
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.sortOrder}
              onChange={(e) => {
                const newFilters = { ...filters, sortOrder: e.target.value };
                setFilters(newFilters);
                fetchData(page, newFilters);
              }}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      )}

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
                            {bill.items?.map((i: any, idx) => <div key={idx}>{i.quantity} {i.unit || 'kg'}</div>)}
                          </td>
                          <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{parseFloat(bill.subtotal || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{(parseFloat(bill.cgst || '0') + parseFloat(bill.sgst || '0') + parseFloat(bill.igst || '0')).toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono text-red-600 text-right">₹{parseFloat(bill.discountAmount || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{parseFloat(bill.grandTotal || '0').toLocaleString()}</td>
                          <td className="px-4 py-1.5 text-center">
                            <span className={`text-[10px] font-bold px-1 rounded uppercase ${bill.paymentStatus === 'Paid' ? 'text-green-700 bg-green-100' : bill.paymentStatus === 'Partial' ? 'text-orange-700 bg-orange-100' : 'text-red-700 bg-red-100'}`}>
                              {bill.paymentStatus}
                            </span>
                            {/* Roll Status Badge & Difference */}
                            {bill.type === 'RAW_MATERIAL' && (() => {
                              const invoiceQty = bill.items?.reduce((sum: number, i: any) => sum + parseFloat(i.quantity || '0'), 0) || 0;
                              const rollWeight = parseFloat(bill.totalRollWeight || '0');
                              const diff = rollWeight - invoiceQty;
                              const hasDiff = Math.abs(diff) > 0.01;

                              return (
                                <div className="mt-1 flex flex-col items-center">
                                  <div className={`text-[9px] font-bold px-1 rounded border text-center uppercase ${bill.rollEntryStatus === 'Completed' ? 'border-green-200 text-green-600 bg-green-50' :
                                    bill.rollEntryStatus === 'Partial' ? 'border-orange-200 text-orange-600 bg-orange-50' :
                                      'border-gray-200 text-gray-500 bg-gray-50'
                                    }`}>
                                    {bill.rollEntryStatus === 'Pending' ? 'No Rolls' : bill.rollEntryStatus}
                                    {rollWeight > 0 && ` (${rollWeight}kg)`}
                                  </div>
                                  {hasDiff && (
                                    <div className="text-[10px] font-bold text-red-600 mt-0.5 bg-red-50 px-1 border border-red-100 rounded-sm">
                                      Diff: {diff > 0 ? '+' : ''}{diff.toFixed(2)}kg
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
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
                    <div className="flex space-x-2">
                      <select id="supplierSelect" value={selectedSupplier?.id || ''} onChange={e => handleSupplierSelect(e.target.value)} className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white">
                        <option value="">Select Accounts...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.gstNo}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowQuickAddSupplier(true)}
                        className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-sm hover:bg-blue-100 transition-colors"
                        title="Quick Add Supplier"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
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
                            {purchaseType === 'RAW_MATERIAL' ? 'Raw Material' : purchaseType === 'FINISHED_GOODS' ? 'Finished Product' : 'Item Name'}
                          </th>
                          {purchaseType === 'GENERAL' && <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-40">Expense Head</th>}
                          {purchaseType !== 'GENERAL' && <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">HSN</th>}
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 text-right">Qty</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24 text-center">Unit</th>
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
                                    <option key={rm.id} value={rm.id}>
                                      {rm.name} | {rm.color} - Stock: {rm.stock} {rm.unit}
                                    </option>
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
                                    list={`general-items-${item.id}`}
                                    value={item.materialName} // Display name (either from existing or typed)
                                    onChange={(e) => updateItemGeneralItem(item.id, e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                                    placeholder="Type or select Item Name..."
                                  />
                                  <datalist id={`general-items-${item.id}`}>
                                    {generalItems.map(gi => (
                                      <option key={gi.id} value={gi.name} />
                                    ))}
                                  </datalist>
                                </>
                              )}
                            </td>
                            {purchaseType === 'GENERAL' && (
                              <td className="px-3 py-2">
                                <select
                                  value={item.expenseHeadId || ''}
                                  onChange={(e) => updateItem(item.id, 'expenseHeadId', e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium bg-slate-50"
                                >
                                  <option value="">Select Ledger...</option>
                                  {expenseHeads.map(eh => (
                                    <option key={eh.id} value={eh.id}>{eh.name}</option>
                                  ))}
                                </select>
                              </td>
                            )}
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
                              {/* Pending Qty Badge */}
                              {purchaseType === 'RAW_MATERIAL' && item.rawMaterialId && (
                                <div className="mt-1 flex items-center justify-end space-x-2">
                                  {item.pendingQuantity === undefined ? (
                                    <button
                                      onClick={() => checkPendingQuantity(index, item.rawMaterialId!)}
                                      className="text-[10px] text-blue-600 hover:underline"
                                      tabIndex={-1}
                                    >
                                      Check Pending
                                    </button>
                                  ) : item.pendingQuantity > 0 && (
                                    <div className="flex items-center gap-2 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                                      <span className="text-[10px] text-orange-800 font-medium">
                                        Pending: {item.pendingQuantity.toFixed(2)} kg
                                      </span>

                                      {!item.pendingAdjustment ? (
                                        <button
                                          onClick={() => {
                                            // Add pending quantity to current quantity
                                            const currentQty = parseFloat(item.quantity) || 0;
                                            const newQty = currentQty + item.pendingQuantity!;

                                            const newItems = [...items];
                                            newItems[index] = {
                                              ...newItems[index],
                                              quantity: newQty.toFixed(2),
                                              pendingAdjustment: {
                                                qty: item.pendingQuantity!,
                                                sourceBills: item.sourceBills || [] // We need to store source bills from checkPendingQuantity
                                              }
                                            };
                                            // Trigger recalculation
                                            // Reuse existing calculation logic by updating quantity directly?
                                            // Logic mirrors updateItem partially
                                            const qty = parseFloat(newItems[index].quantity) || 0;
                                            const rate = parseFloat(newItems[index].rate) || 0;
                                            const gst = parseFloat(newItems[index].gstPercent) || 0;
                                            const amount = qty * rate;
                                            const gstAmount = amount * (gst / 100);

                                            // Determine GST split based on Supplier stateCode matching Company stateCode (24 for Gujarat)
                                            const COMPANY_STATE_CODE = '24';
                                            const supplierStateCode = selectedSupplier?.stateCode || COMPANY_STATE_CODE;
                                            const isInterState = supplierStateCode !== COMPANY_STATE_CODE;

                                            let cgst = 0, sgst = 0, igst = 0;
                                            if (isInterState) {
                                              igst = gstAmount;
                                            } else {
                                              cgst = gstAmount / 2;
                                              sgst = gstAmount / 2;
                                            }

                                            newItems[index] = {
                                              ...newItems[index],
                                              amount,
                                              cgst,
                                              sgst,
                                              igst,
                                              total: amount + gstAmount
                                            };
                                            setItems(newItems);
                                          }}
                                          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center"
                                          title="Add this pending quantity to current bill"
                                        >
                                          <Plus className="w-3 h-3 mr-0.5" /> Add
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-green-600 font-bold flex items-center">
                                          <CheckCircle className="w-3 h-3 mr-1" /> Added
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {purchaseType === 'GENERAL' ? (
                                <select
                                  value={item.unit}
                                  onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                                  className="w-full px-1 py-1 text-xs border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 bg-white"
                                >
                                  <option value="kg">kg</option>
                                  <option value="pise">pise</option>
                                  <option value="meter">meter</option>
                                  <option value="gram">gram</option>
                                  <option value="pkt">pkt</option>
                                  <option value="nos">nos</option>
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={item.unit || 'kg'}
                                  readOnly
                                  className="w-full px-1 py-1 text-xs border border-transparent bg-transparent text-gray-500 text-center"
                                />
                              )}
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
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {!showPaymentForm && (
            <div className="bg-gray-50 p-3 border border-gray-300 rounded-sm flex flex-wrap gap-4 items-center sticky top-0 z-10 shadow-sm">
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-gray-400" />
                <select
                  value={paymentFilters.supplierId}
                  onChange={e => setPaymentFilters(prev => ({ ...prev, supplierId: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">From:</span>
                <input
                  type="date"
                  value={paymentFilters.startDate}
                  onChange={e => setPaymentFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">To:</span>
                <input
                  type="date"
                  value={paymentFilters.endDate}
                  onChange={e => setPaymentFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Mode:</span>
                <select
                  value={paymentFilters.mode}
                  onChange={e => setPaymentFilters(prev => ({ ...prev, mode: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Modes</option>
                  <option value="Bank">Bank</option>
                  <option value="Cash">Cash</option>
                  <option value="Adjustment">Adjustment</option>
                </select>
              </div>

              <button
                onClick={() => setPaymentFilters({ supplierId: '', startDate: '', endDate: '', mode: '' })}
                className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-bold uppercase underline"
              >
                Clear
              </button>
            </div>
          )}
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
                    {(() => {
                      const filtered = purchasePayments.filter(p => {
                        const matchSupplier = !paymentFilters.supplierId || p.partyId === paymentFilters.supplierId;
                        const matchMode = !paymentFilters.mode || p.mode === paymentFilters.mode;
                        const paymentDate = new Date(p.date);
                        const matchStart = !paymentFilters.startDate || paymentDate >= new Date(paymentFilters.startDate);
                        const matchEnd = !paymentFilters.endDate || paymentDate <= new Date(paymentFilters.endDate + 'T23:59:59');
                        return matchSupplier && matchMode && matchStart && matchEnd;
                      });

                      if (filtered.length === 0) {
                        return <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 italic">No payments match your filters.</td></tr>;
                      }

                      return filtered.map((payment) => (
                        <tr key={payment.id} className={`hover:bg-blue-50 transition-colors ${payment.status === 'Reversed' ? 'bg-red-50 opacity-70' : ''}`}>
                          <td className="px-4 py-1.5 text-[11px] text-gray-600 leading-tight">
                            {new Date(payment.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            <div className="text-[9px] text-gray-400 font-mono">
                              {new Date(payment.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </div>
                          </td>
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
                              <div className="flex justify-end space-x-1">
                                <button onClick={() => handleEditPayment(payment.id)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Edit Payment">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeletePayment(payment.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Delete Payment">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
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
            <h2 className="text-sm font-bold text-gray-800 uppercase">{editingPaymentId ? 'Edit Payment / Advance' : 'New Outward Payment / Advance'}</h2>
            <div className="flex space-x-2">
              <button onClick={() => { setShowPaymentForm(false); setEditingPaymentId(null); }} className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-red-600 border border-transparent hover:border-red-200 rounded-sm uppercase">Cancel</button>
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
                <input type="datetime-local" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
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
      {/* Adjustment Modal */}
      {adjustmentModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Adjust Pending Quantity</h3>
            <p className="text-sm text-gray-600 mb-4">
              Select a previous bill to adjust pending quantity from. This will link the stock from this bill to the previous one.
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {adjustmentModal.pendingBills.length === 0 ? (
                <p className="text-sm text-gray-500">No pending bills found.</p>
              ) : (
                adjustmentModal.pendingBills.map(bill => (
                  <div key={bill.id} className="border p-3 rounded hover:bg-gray-50 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-sm">{bill.code}</div>
                      <div className="text-xs text-gray-500">{new Date(bill.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-600">{bill.pendingQuantity.toFixed(2)} kg</div>
                      <button
                        onClick={() => {
                          const qty = parseFloat(prompt(`Enter quantity to adjust (Max ${bill.pendingQuantity})`, bill.pendingQuantity.toString()) || '0');
                          if (qty > 0 && qty <= bill.pendingQuantity) {
                            handleAdjustConfirm(bill.id, qty);
                          } else if (qty > bill.pendingQuantity) {
                            alert("Quantity exceeds pending amount");
                          }
                        }}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mt-1 hover:bg-blue-200"
                      >
                        Adjust
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setAdjustmentModal({ ...adjustmentModal, isOpen: false })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-2 text-gray-900">Confirm Deletion</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete this purchase bill? This action cannot be undone and will reverse stock movements.
            </p>
            {deleteConfirmation.error && (
              <div className="bg-red-50 text-red-700 text-xs p-2 rounded mb-4">
                {deleteConfirmation.error}
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmation({ isOpen: false, id: null })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteBill}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium text-sm flex items-center"
                disabled={loading}
              >
                {loading && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Delete Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Payment Confirmation Modal */}
      {deletePaymentConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Delete Payment?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this payment?
              <br /><br />
              <span className="font-bold text-red-600">Warning:</span> This will reverse the payment effect on all allocated bills (marking them as Unpaid/Partial) and increase the Supplier's outstanding balance.
              <br /><br />
              This action cannot be undone.
            </p>
            {deletePaymentConfirmation.error && (
              <p className="text-xs text-red-600 mb-4">{deletePaymentConfirmation.error}</p>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletePaymentConfirmation({ isOpen: false, id: null })}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePayment}
                className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700 font-bold"
              >
                Delete Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickAddSupplier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-gray-200">
            <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center">
                <Plus className="w-4 h-4 mr-2" />
                Quick Add Supplier
              </h3>
              <button onClick={() => setShowQuickAddSupplier(false)} className="hover:bg-blue-700 p-1 rounded transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && <div className="p-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-sm mb-2">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">GST Number (Optional)</label>
                  <div className="flex space-x-2 mt-1">
                    <input
                      type="text"
                      maxLength={15}
                      value={quickAddSupplierForm.gstNo}
                      onChange={e => {
                        const value = e.target.value.toUpperCase();
                        if (value.length >= 2) {
                          const prefix = value.substring(0, 2);
                          if (/^\d{2}$/.test(prefix)) {
                            setQuickAddSupplierForm(prev => ({ ...prev, gstNo: value, stateCode: prefix }));
                          } else {
                            setQuickAddSupplierForm(prev => ({ ...prev, gstNo: value }));
                          }
                        } else {
                          setQuickAddSupplierForm(prev => ({ ...prev, gstNo: value }));
                        }
                      }}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 uppercase font-mono"
                      placeholder="Enter GSTIN..."
                    />
                    <button
                      type="button"
                      onClick={handleQuickSupplierGstSearch}
                      disabled={quickAddGstLoading || quickAddSupplierForm.gstNo.length !== 15}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-200 disabled:opacity-50 text-xs font-bold"
                    >
                      {quickAddGstLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'FETCH'}
                    </button>
                  </div>
                  {quickAddGstSuccess && <p className="text-[10px] text-green-600 font-bold mt-1">{quickAddGstSuccess}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={quickAddSupplierForm.name}
                    onChange={e => setQuickAddSupplierForm({ ...quickAddSupplierForm, name: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Contact</label>
                  <input
                    type="text"
                    value={quickAddSupplierForm.contact}
                    onChange={e => setQuickAddSupplierForm({ ...quickAddSupplierForm, contact: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">State *</label>
                  <select
                    value={quickAddSupplierForm.stateCode}
                    onChange={e => setQuickAddSupplierForm({ ...quickAddSupplierForm, stateCode: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {GST_STATES.map((state) => (
                      <option key={state.code} value={state.code}>{state.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Address</label>
                  <textarea
                    rows={2}
                    value={quickAddSupplierForm.address}
                    onChange={e => setQuickAddSupplierForm({ ...quickAddSupplierForm, address: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 flex justify-end space-x-3 border-t border-gray-200">
              <button
                onClick={() => setShowQuickAddSupplier(false)}
                className="px-4 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveQuickSupplier}
                disabled={saving}
                className="px-6 py-1.5 text-sm font-bold bg-blue-600 text-white rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Save & Select'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

