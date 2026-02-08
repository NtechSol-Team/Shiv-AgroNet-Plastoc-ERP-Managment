import React, { useState, useEffect } from 'react';
import { Plus, Printer, Search, X, Trash2, Loader2, Building2, MapPin, FileText, Download, Receipt, ArrowRight, RotateCcw, History, Info, MessageCircle, Link, Edit2 } from 'lucide-react';
import { salesApi, mastersApi, accountsApi } from '../lib/api';
import { printInvoice } from '../utils/printInvoice';

/* Updated Invoice Item Interface matching Backend */
interface InvoiceItem {
  id: string;
  finishedProductId: string; // Changed from productId to match backend
  product: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number; // gstPercent
  taxableAmount: number;
  amount: number;
  bellItemId?: string; // LINK to bell item
  childItems?: any[]; // For grouped items (Bales)
}

// Indian states for Place of Supply
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

export function Sales() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'receipts' | 'advances'>('invoices');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null); // NEW: Success message state
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const [salesInvoices, setSalesInvoices] = useState<any[]>([]);
  const [salesReceipts, setSalesReceipts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  const [products, setProducts] = useState<any[]>([]);
  const [availableBells, setAvailableBells] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Invoice Form State
  const [invoiceForm, setInvoiceForm] = useState({
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerId: '',
    invoiceType: 'B2B',
    placeOfSupply: 'Maharashtra',
    billingAddress: '',
    shippingAddress: '',
    sameAsBilling: true,
    status: 'Pending'
  });

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [currentItem, setCurrentItem] = useState<{
    finishedProductId: string;
    bellItemId: string;
    product: string;
    hsnCode: string;
    quantity: string;
    rate: string;
    discountPercent: string;
    taxPercent: string;
    childItems?: any[];
  }>({
    finishedProductId: '',
    bellItemId: '', // For bell selection
    product: '',
    hsnCode: '5608',
    quantity: '',
    rate: '',
    discountPercent: '0',
    taxPercent: '18',
    childItems: []
  });

  // Receipt Form State
  const [receiptForm, setReceiptForm] = useState({
    customerId: '',
    date: new Date().toISOString().split('T')[0],
    mode: 'Bank',
    amount: '',
    accountId: '',
    isAdvance: false,
    useAdvanceReceipt: false, // NEW: Toggle to receive using advance
    selectedAdvanceId: '',    // NEW: Selected advance ID for adjustment
    reference: '',
    remarks: ''
  });

  const [outstandingInvoices, setOutstandingInvoices] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<{ [key: string]: number }>({});

  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  // Adjust Advance State REMOVED
  const [availableAdvances, setAvailableAdvances] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [page, limit]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invoicesResult, customersResult, productsResult, summaryResult, accountsResult, receiptsResult, bellsResult] = await Promise.all([
        salesApi.getInvoices(page, limit),
        mastersApi.getCustomers(),
        mastersApi.getFinishedProducts(),
        salesApi.getSummary(),
        mastersApi.getAccounts(), // Fetch accounts for receipt
        accountsApi.getTransactions({ type: 'RECEIPT', partyType: 'customer' }), // Fetch receipts for customers only
        salesApi.getAvailableBells(),
      ]);

      if (invoicesResult.data) {
        // Handle paginated response
        const isPaginated = !Array.isArray(invoicesResult.data) && 'data' in invoicesResult.data;
        const invoices = isPaginated ? (invoicesResult.data as any).data : invoicesResult.data;
        const meta = isPaginated ? (invoicesResult.data as any).meta : { totalPages: 1 };

        setSalesInvoices(invoices || []);
        setTotalPages(meta.totalPages);
      }
      if (customersResult.data) setCustomers(customersResult.data);
      if (productsResult.data) setProducts(productsResult.data);
      if (summaryResult.data) setSummary(summaryResult.data);
      if (accountsResult.data) setAccounts(accountsResult.data);
      if (receiptsResult.data) {
        const receipts = Array.isArray(receiptsResult.data) ? receiptsResult.data : ((receiptsResult.data as any).data || []);
        setSalesReceipts(receipts);
      }
      if (bellsResult.data) setAvailableBells(bellsResult.data);
    } catch (err) {
      setError('Failed to load data');
    }
    setLoading(false);
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setInvoiceForm({
      ...invoiceForm,
      customerId,
      billingAddress: customer?.address || '',
      shippingAddress: invoiceForm.sameAsBilling ? (customer?.address || '') : invoiceForm.shippingAddress
    });
  };

  const handleProductSelect = (value: string) => {
    if (!value) {
      setCurrentItem({ ...currentItem, finishedProductId: '', bellItemId: '', product: '', quantity: '', rate: '' });
      return;
    }

    const [type, id] = value.split(':');

    if (type === 'bell') {
      const bell = availableBells.find(b => b.id === id);
      if (bell) {
        setCurrentItem({
          ...currentItem,
          finishedProductId: bell.finishedProductId,
          bellItemId: bell.id,
          product: `${bell.code} - ${bell.finishedProduct?.name}`,
          hsnCode: bell.finishedProduct?.hsnCode || '5608',
          quantity: bell.netWeight, // Fixed quantity from bell
          rate: bell.finishedProduct?.ratePerKg || '0',
          taxPercent: bell.finishedProduct?.gstPercent || '18',
          childItems: []
        });
      }
    } else if (type === 'bellGroup') {
      const groupCode = id;
      // Group by Batch Code/Bell Code
      const bellsInGroup = availableBells.filter(b => (b.batch?.code || b.code) === groupCode);

      if (bellsInGroup.length > 0) {
        // Populate Form for Manual Addition
        const totalWeight = bellsInGroup.reduce((sum, b) => sum + parseFloat(b.netWeight), 0);
        const representative = bellsInGroup[0];

        setCurrentItem({
          finishedProductId: representative.finishedProductId,
          bellItemId: '', // No single ID
          product: `${groupCode} (Bell)`,
          hsnCode: representative.finishedProduct?.hsnCode || '5608',
          quantity: totalWeight.toString(),
          rate: (representative.finishedProduct?.ratePerKg || '0').toString(),
          discountPercent: '0',
          taxPercent: (representative.finishedProduct?.gstPercent || '18').toString(),
          childItems: bellsInGroup
        });
      }
    } else {
      const product = products.find(p => p.id === id);
      if (product) {
        setCurrentItem({
          ...currentItem,
          finishedProductId: product.id,
          bellItemId: '', // Clear bell
          product: product.name,
          hsnCode: product.hsnCode || '5608',
          quantity: '', // Reset quantity for manual entry
          rate: product.ratePerKg?.toString() || '0',
          taxPercent: product.gstPercent?.toString() || '18',
          childItems: []
        });
      }
    }
  };

  const handleAddItem = () => {
    if (!currentItem.finishedProductId || !currentItem.quantity || !currentItem.rate) {
      setError('Please fill product, quantity and rate');
      return;
    }

    const qty = parseFloat(currentItem.quantity);
    const rt = parseFloat(currentItem.rate);
    const disc = parseFloat(currentItem.discountPercent) || 0;
    const tax = parseFloat(currentItem.taxPercent) || 0;

    const subtotal = qty * rt;
    const discountAmount = (subtotal * disc) / 100;
    const taxable = subtotal - discountAmount;
    const taxAmount = (taxable * tax) / 100;

    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      finishedProductId: currentItem.finishedProductId,
      product: currentItem.product,
      hsnCode: currentItem.hsnCode,
      quantity: qty,
      rate: rt,
      discountPercent: disc,
      taxPercent: tax,
      taxableAmount: taxable,
      amount: taxable + taxAmount,
      bellItemId: currentItem.bellItemId || undefined,
      childItems: currentItem.childItems
    };

    setInvoiceItems([...invoiceItems, newItem]);

    // Reset form
    setCurrentItem({
      finishedProductId: '',
      bellItemId: '',
      product: '',
      hsnCode: '5608',
      quantity: '',
      rate: '',
      discountPercent: '0',
      taxPercent: '18',
      childItems: []
    });
    setError(null);
  };

  const handleRemoveItem = (itemId: string) => {
    setInvoiceItems(invoiceItems.filter(item => item.id !== itemId));
  };

  const calculateTotals = () => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const totalDiscount = invoiceItems.reduce((sum, item) => {
      const itemSubtotal = item.quantity * item.rate;
      return sum + (itemSubtotal * item.discountPercent) / 100;
    }, 0);
    const taxableAmount = subtotal - totalDiscount;
    const totalTax = invoiceItems.reduce((sum, item) => (item.taxableAmount * item.taxPercent) / 100, 0);

    const isInterstate = invoiceForm.placeOfSupply !== 'Maharashtra';
    const cgst = isInterstate ? 0 : totalTax / 2;
    const sgst = isInterstate ? 0 : totalTax / 2;
    const igst = isInterstate ? totalTax : 0;

    const grandTotal = taxableAmount + totalTax;
    const roundOff = Math.round(grandTotal) - grandTotal;

    return { subtotal, totalDiscount, taxableAmount, cgst, sgst, igst, totalTax, roundOff, total: Math.round(grandTotal) };
  };

  const handleSaveInvoice = async (status: 'Draft' | 'Confirmed') => {
    // Validation
    if (invoiceForm.invoiceType === 'B2B' && !invoiceForm.customerId) {
      setError('Please select customer for B2B invoice');
      return;
    }
    if (invoiceItems.length === 0) {
      setError('Please add at least one item');
      return;
    }

    setSaving(true);
    setError(null);

    const totals = calculateTotals();

    try {
      // Construct payload matching Backend CreateInvoiceRequest
      const payload = {
        invoiceDate: invoiceForm.date,
        customerId: invoiceForm.customerId || undefined,
        customerName: invoiceForm.customerId ? undefined : 'Walk-in Customer', // Logic for B2C
        invoiceType: invoiceForm.invoiceType,
        status: status,
        items: invoiceItems.flatMap(item => {
          if (item.childItems && item.childItems.length > 0) {
            return item.childItems.map(child => ({
              finishedProductId: child.finishedProductId,
              bellItemId: child.id,
              quantity: parseFloat(child.netWeight),
              rate: item.rate,
              gstPercent: item.taxPercent,
              discount: (parseFloat(child.netWeight) * item.rate * item.discountPercent) / 100
            }));
          }
          return [{
            finishedProductId: item.finishedProductId,
            bellItemId: item.bellItemId,
            quantity: item.quantity,
            rate: item.rate,
            gstPercent: item.taxPercent,
            discount: (item.quantity * item.rate * item.discountPercent) / 100
          }];
        })
      };

      // Call updateInvoice if editing, otherwise createInvoice
      const result = editingInvoiceId
        ? await salesApi.updateInvoice(editingInvoiceId, payload)
        : await salesApi.createInvoice(payload);

      if (result.error) {
        setError(result.error);
      } else {
        const action = editingInvoiceId ? 'updated' : 'created';
        setSuccess(`Invoice ${action} successfully!`);
        setShowInvoiceForm(false);
        setEditingInvoiceId(null); // Reset edit mode
        fetchData();
        resetForm();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError('Failed to save invoice');
    }
    setSaving(false);
  };

  const resetForm = () => {
    setInvoiceItems([]);
    setSelectedCustomer(null);
    setInvoiceForm({
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customerId: '',
      invoiceType: 'B2B',
      placeOfSupply: 'Maharashtra',
      billingAddress: '',
      shippingAddress: '',
      sameAsBilling: true,
      status: 'Pending'
    });
  };

  const handleReceiptCustomerSelect = async (customerId: string) => {
    setReceiptForm({ ...receiptForm, customerId });
    setOutstandingInvoices([]);
    setAllocations({});

    if (customerId) {
      setLoading(true);
      try {
        const result = await salesApi.getOutstandingInvoices(customerId);
        if (result.data) {
          setOutstandingInvoices(result.data);
        }
        // NEW: Fetch advances if the toggle is active
        if (receiptForm.useAdvanceReceipt) {
          accountsApi.getPartyAdvances(customerId).then(res => {
            if (res.data) setAvailableAdvances(res.data);
          });
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
  };

  const handleAutoAllocate = () => {
    const amountReceived = parseFloat(receiptForm.amount || '0');
    if (amountReceived <= 0) return;

    let remaining = amountReceived;
    const newAllocations: { [key: string]: number } = {};

    outstandingInvoices.forEach(inv => {
      if (remaining <= 0) return;
      const outstanding = parseFloat(inv.balanceAmount || inv.grandTotal);
      const allocate = Math.min(outstanding, remaining);

      if (allocate > 0) {
        newAllocations[inv.id] = allocate;
        remaining -= allocate;
      }
    });

    setAllocations(newAllocations);
  };

  const handleCreateReceipt = async () => {
    // Validation
    if (!receiptForm.customerId || !receiptForm.amount) {
      setError("Please fill all required fields");
      return;
    }

    if (receiptForm.useAdvanceReceipt) {
      if (!receiptForm.selectedAdvanceId) {
        setError("Please select an advance receipt to adjust");
        return;
      }
    } else {
      if (!receiptForm.accountId) {
        setError("Please select a deposit-to account");
        return;
      }
    }

    const allocationItems = Object.entries(allocations).map(([invoiceId, amount]) => ({
      invoiceId,
      amount
    }));

    const totalAllocated = allocationItems.reduce((sum, item) => sum + item.amount, 0);
    const receivedAmount = parseFloat(receiptForm.amount);

    if (totalAllocated > receivedAmount) {
      setError("Allocated amount cannot exceed received amount");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...receiptForm,
        allocations: allocationItems
      };
      const result = await salesApi.createReceipt(payload);
      if (result.error) {
        setError(result.error);
      } else {
        setShowReceiptForm(false);
        setReceiptForm({
          customerId: '',
          date: new Date().toISOString().split('T')[0],
          mode: 'Bank',
          amount: '',
          accountId: '',
          isAdvance: false,
          useAdvanceReceipt: false, // Reset new field
          selectedAdvanceId: '',    // Reset new field
          reference: '',
          remarks: ''
        });
        setAllocations({});
        fetchData();
        setSuccess('Receipt recorded successfully'); // Add success msg similar to purchase (optional)
      }
    } catch (err) {
      setError("Failed to create receipt");
    }
    setSaving(false);
  };



  const handleReverseReceipt = async (receiptId: string) => {
    const reason = prompt("Enter reason for reversal:");
    if (!reason) return;

    if (confirm("Are you sure you want to reverse this receipt? This will reopen allocated invoices.")) {
      setLoading(true);
      try {
        const result = await salesApi.reverseReceipt(receiptId, reason);
        if (result.error) throw new Error(result.error);
        fetchData();
      } catch (err: any) {
        setError(err.message || "Failed to reverse receipt");
      }
      setLoading(false);
      setLoading(false);
    }
  };

  // ============================================================
  // ADJUSTMENT HANDLERS
  // ============================================================

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) return;

    setLoading(true);
    try {
      const result = await salesApi.deleteInvoice(invoiceId);
      if (result.error) throw new Error(result.error);
      fetchData();
      setSuccess('Invoice deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to delete invoice");
    }
    setLoading(false);
  };

  const handleEditInvoice = (invoice: any) => {
    // Set the editing invoice ID to track we're in edit mode
    setEditingInvoiceId(invoice.id);

    // Populate form with existing invoice data
    setInvoiceForm({
      date: invoice.invoiceDate?.split('T')[0] || new Date().toISOString().split('T')[0],
      dueDate: invoice.dueDate?.split('T')[0] || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customerId: invoice.customerId || '',
      invoiceType: invoice.invoiceType || 'B2B',
      placeOfSupply: invoice.placeOfSupply || 'Maharashtra',
      billingAddress: invoice.billingAddress || '',
      shippingAddress: invoice.shippingAddress || '',
      sameAsBilling: true,
      status: invoice.status || 'Pending'
    });

    // Find and set customer
    const customer = customers.find((c: any) => c.id === invoice.customerId);
    if (customer) setSelectedCustomer(customer);

    // Set items
    const items = invoice.items?.map((item: any, idx: number) => ({
      id: `edit-${idx}`,
      finishedProductId: item.finishedProductId || '',
      product: item.productName || item.finishedProduct?.name || '',
      hsnCode: item.hsnCode || '5608',
      quantity: parseFloat(item.quantity) || 0,
      rate: parseFloat(item.rate) || 0,
      discountPercent: parseFloat(item.discountPercent) || 0,
      taxPercent: parseFloat(item.gstPercent) || 18,
      taxableAmount: parseFloat(item.taxableAmount) || 0,
      amount: parseFloat(item.amount) || 0,
      bellItemId: item.bellItemId || undefined,
      childItems: item.childItems || []
    })) || [];

    setInvoiceItems(items);
    setShowInvoiceForm(true);
  };

  const handlePrintInvoice = (invoice: any) => {
    printInvoice(invoice);
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Sales Management</h1>
          <p className="text-xs text-gray-500">Invoices, Receipts, and Revenue Tracking</p>
        </div>

        {/* Tabs */}
        {!showInvoiceForm && !showReceiptForm && (
          <div className="flex bg-gray-100 p-1 rounded-sm">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-4 py-1.5 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'invoices' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-4 py-1.5 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'receipts' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Receipts
            </button>
          </div>
        )}

        {/* Action Buttons */}
        {!showInvoiceForm && !showReceiptForm && (
          <button
            onClick={() => {
              if (activeTab === 'invoices') {
                setEditingInvoiceId(null); // Reset edit mode for new invoice
                setShowInvoiceForm(true);
              } else {
                setShowReceiptForm(true);
              }
            }}
            className="px-4 py-1.5 bg-blue-700 text-white text-sm font-bold uppercase rounded-sm hover:bg-blue-800 transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-3 h-3 mr-2" />
            {activeTab === 'invoices' ? 'New Invoice' : 'New Receipt'}
          </button>

        )}

        {/* Tab Switcher for Receipts/Advances */}
        {!showInvoiceForm && !showReceiptForm && activeTab !== 'invoices' && (
          <div className="flex bg-gray-200 rounded-sm p-0.5 ml-4">
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-3 py-1 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'receipts' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
            >Receipts</button>
            <button
              onClick={() => setActiveTab('advances')}
              className={`px-3 py-1 text-xs font-bold uppercase rounded-sm transition-all ${activeTab === 'advances' ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}
            >Advances</button>
          </div>
        )}

      </div>

      {/* Error & Success Messages */}
      {error && <div className="bg-red-50 text-red-700 text-xs font-bold p-2 border border-red-200 mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 text-xs font-bold p-2 border border-green-200 mb-4">{success}</div>}

      {/* KPI Strip (Only show when not in form modes) */}
      {
        !showInvoiceForm && !showReceiptForm && summary && activeTab === 'invoices' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-2 border border-gray-200 rounded-sm">
            {[
              { label: 'Total Sales', value: summary.totalSales, color: 'text-blue-700' },
              { label: 'Collected', value: summary.collected, color: 'text-green-700' },
              { label: 'Receivables', value: summary.receivables, color: 'text-orange-700' },
              { label: 'GST Output', value: summary.gstCollected, color: 'text-purple-700' },
            ].map((kpi, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-500">{kpi.label}</span>
                <span className={`text-lg font-bold font-mono ${kpi.color}`}>₹{kpi.value?.toLocaleString() || '0'}</span>
              </div>
            ))}
          </div>
        )
      }

      {/* ==================== INVOICES VIEW ==================== */}
      {
        activeTab === 'invoices' && (
          <>
            {!showInvoiceForm ? (
              /* Invoice List Table - Dense */
              <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Bill Date</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Entry #</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</th>
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
                      {salesInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500 italic">No invoices recorded.</td>
                        </tr>
                      ) : (
                        salesInvoices.map((invoice) => (
                          <React.Fragment key={invoice.id}>
                            <tr className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}>
                              <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                              <td className="px-4 py-1.5 text-xs font-mono font-bold text-blue-700">{invoice.invoiceNumber}</td>
                              <td className="px-4 py-1.5 text-sm font-bold text-gray-900">
                                {invoice.customerName}
                                {invoice.invoiceType === 'B2C' && <span className="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1 rounded">B2C</span>}
                              </td>
                              <td className="px-4 py-1.5 text-sm font-medium text-gray-900">
                                {invoice.items?.map((i: any, idx: number) => <div key={idx}>{i.productName || i.finishedProduct?.name}</div>)}
                              </td>
                              <td className="px-4 py-1.5 text-sm font-mono text-gray-900 text-right">
                                {invoice.items?.map((i: any, idx: number) => <div key={idx}>{i.quantity} kg</div>)}
                              </td>
                              <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{parseFloat(invoice.subtotal || '0').toLocaleString()}</td>
                              <td className="px-4 py-1.5 text-sm font-mono text-gray-600 text-right">₹{parseFloat(invoice.totalTax || '0').toLocaleString()}</td>
                              <td className="px-4 py-1.5 text-sm font-mono text-red-600 text-right">₹{parseFloat(invoice.discountAmount || '0').toLocaleString()}</td>
                              <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{parseFloat(invoice.grandTotal || '0').toLocaleString()}</td>
                              <td className="px-4 py-1.5 text-center">
                                <span className={`text-[10px] font-bold px-1 rounded uppercase ${invoice.status === 'Confirmed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {invoice.status}
                                </span>
                              </td>
                              <td className="px-4 py-1.5 text-center flex items-center justify-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditInvoice(invoice);
                                  }}
                                  className="text-gray-500 hover:text-blue-600 p-1"
                                  title="Edit Invoice"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteInvoice(invoice.id);
                                  }}
                                  className="text-gray-500 hover:text-red-600 p-1"
                                  title="Delete Invoice"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintInvoice(invoice);
                                  }}
                                  className="text-gray-500 hover:text-blue-600 p-1"
                                  title="Print Bill"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const text = `Hello ${invoice.customerName}, Here is your invoice details:%0AInvoice No: ${invoice.invoiceNumber}%0ADate: ${new Date(invoice.invoiceDate).toLocaleDateString()}%0AAmount: ₹${invoice.grandTotal}%0APlease make the payment.`;
                                    const phone = invoice.customer?.phone || '';
                                    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                                  }}
                                  className="text-gray-500 hover:text-green-600 p-1"
                                  title="Send on WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                              </td>

                            </tr>
                            {expandedInvoice === invoice.id && invoice.allocations && invoice.allocations.length > 0 && (
                              <tr className="bg-gray-50">
                                <td colSpan={11} className="px-12 py-2">
                                  <div className="text-xs font-bold text-gray-600 mb-1">Payment History:</div>
                                  <table className="w-full text-xs text-left border border-gray-200">
                                    <thead className="bg-gray-200">
                                      <tr>
                                        <th className="px-2 py-1">Type</th>
                                        <th className="px-2 py-1">Receipt #</th>
                                        <th className="px-2 py-1">Date</th>
                                        <th className="px-2 py-1 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invoice.allocations.map((alloc: any, idx: number) => (
                                        <tr key={idx} className="border-t border-gray-100">
                                          <td className="px-2 py-1 text-gray-500">Allocation</td>
                                          <td className="px-2 py-1 font-mono text-blue-600">{alloc.receiptCode}</td>
                                          <td className="px-2 py-1">{new Date(alloc.date).toLocaleDateString()}</td>
                                          <td className="px-2 py-1 text-right font-bold text-green-700">₹{alloc.amount.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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
              /* Invoice Entry Form - Enterprise */
              <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
                {/* Form Header */}
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10">
                  <h2 className="text-sm font-bold text-gray-800 uppercase">New Tax Invoice</h2>
                  <div className="flex space-x-2">
                    <button onClick={() => { setShowInvoiceForm(false); resetForm(); }} className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-red-600 border border-transparent hover:border-red-200 rounded-sm uppercase">Cancel</button>
                    <button onClick={() => handleSaveInvoice('Draft')} disabled={saving} className="px-3 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-bold uppercase rounded-sm hover:bg-gray-50">Save Draft</button>
                    <button onClick={() => handleSaveInvoice('Confirmed')} disabled={saving} className="px-3 py-1 bg-blue-700 text-white text-xs font-bold uppercase rounded-sm hover:bg-blue-800 shadow-sm flex items-center">
                      {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save & Print
                    </button>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Header Inputs */}
                  <div className="col-span-1 lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-b border-gray-200 pb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Invoice Date</label>
                      <input type="date" value={invoiceForm.date} onChange={e => setInvoiceForm({ ...invoiceForm, date: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Due Date</label>
                      <input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Invoice Type</label>
                      <select value={invoiceForm.invoiceType} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceType: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                        <option value="B2B">B2B (Business)</option>
                        <option value="B2C">B2C (Consumer)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Place of Supply</label>
                      <select value={invoiceForm.placeOfSupply} onChange={e => setInvoiceForm({ ...invoiceForm, placeOfSupply: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                        {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="col-span-1 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase">Bill To Parent</label>
                      <select value={invoiceForm.customerId} onChange={e => handleCustomerSelect(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white">
                        <option value="">Select Customer Account...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {selectedCustomer && (
                        <div className="text-xs text-gray-600 bg-gray-50 p-2 border border-gray-200 rounded-sm">
                          <p className="font-bold">{selectedCustomer.name}</p>
                          <p>{selectedCustomer.address}</p>
                          <p className="mt-1 font-mono text-[10px]">GSTIN: {selectedCustomer.gstNo}</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Shipping Address</label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input type="checkbox" checked={invoiceForm.sameAsBilling} onChange={e => setInvoiceForm({ ...invoiceForm, sameAsBilling: e.target.checked })} className="rounded-sm border-gray-300 text-blue-600 focus:ring-0 w-3 h-3" />
                          <span className="text-[10px] text-gray-600 uppercase">Same as Billing</span>
                        </label>
                      </div>
                      {!invoiceForm.sameAsBilling ? (
                        <textarea value={invoiceForm.shippingAddress} onChange={e => setInvoiceForm({ ...invoiceForm, shippingAddress: e.target.value })} rows={3} className="w-full px-2 py-1 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500" placeholder="Enter shipping address..." />
                      ) : (
                        <div className="text-xs text-gray-500 italic p-2 border border-dashed border-gray-200 rounded-sm bg-gray-50">
                          Same address as billing
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Item Entry Table */}
                  <div className="col-span-12 mt-2">
                    <div className="border border-gray-300 rounded-sm overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-gray-100 border-b border-gray-300">
                          <tr>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase w-10">#</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase">Item Description</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-20">Qty</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-24">Rate (₹)</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-16">Disc %</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-16">GST %</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-32">Amount</th>
                            <th className="px-3 py-1.5 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {invoiceItems.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-3 py-1 text-xs text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-1 text-sm font-medium text-gray-900">
                                <div>{item.product}</div>
                                {item.childItems && item.childItems.length > 0 && (
                                  <div className="mt-1">
                                    <table className="min-w-full text-[10px] text-gray-500 border border-gray-200">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          <th className="px-1 py-0.5 border">Product</th>
                                          <th className="px-1 py-0.5 border">Size / GSM</th>
                                          <th className="px-1 py-0.5 border">Pieces</th>
                                          <th className="px-1 py-0.5 border">Weight</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.childItems.map((child: any, cIdx: number) => (
                                          <tr key={`${item.id}-child-${cIdx}`}>
                                            <td className="px-1 py-0.5 border">{child.finishedProduct?.name}</td>
                                            <td className="px-1 py-0.5 border">{child.size} / {child.gsm}</td>
                                            <td className="px-1 py-0.5 border text-right">{child.pieceCount || '-'}</td>
                                            <td className="px-1 py-0.5 border text-right">{child.netWeight}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                <div className="mt-1 text-[10px] text-gray-500 font-mono">HSN: {item.hsnCode}</div>
                              </td>
                              <td className="px-3 py-1 text-sm text-right">{item.quantity}</td>
                              <td className="px-3 py-1 text-sm text-right">{item.rate.toFixed(2)}</td>
                              <td className="px-3 py-1 text-sm text-right">{item.discountPercent}</td>
                              <td className="px-3 py-1 text-sm text-right">{item.taxPercent}</td>
                              <td className="px-3 py-1 text-sm font-bold text-right text-gray-900">{item.amount.toFixed(2)}</td>
                              <td className="px-3 py-1 text-center">
                                <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                              </td>
                            </tr>
                          ))}
                          {/* Entry Row */}
                          <tr className="bg-blue-50/50">
                            <td className="px-3 py-1 text-xs text-gray-400 text-center">+</td>
                            <td className="px-3 py-1">
                              <select
                                value={currentItem.finishedProductId}
                                onChange={e => handleProductSelect(e.target.value)}
                                className="w-full text-sm bg-transparent border-0 border-b border-blue-300 focus:ring-0 p-1 font-medium"
                              >
                                <option value="">Select Bell/Batch...</option>
                                <optgroup label="Bell Batches">
                                  {/* Group Bells by Batch Code */}
                                  {Object.values(availableBells.reduce((acc: any, bell) => {
                                    // FILTER: Skip bells that are already in invoiceItems (top-level or children)
                                    const isUsed = invoiceItems.some(item =>
                                      item.bellItemId === bell.id ||
                                      (item.childItems && item.childItems.some(child => child.id === bell.id))
                                    );

                                    if (isUsed) return acc;

                                    // Prefer Batch Code, fallback to Bell Code
                                    const key = bell.batch?.code || bell.code;
                                    if (!acc[key]) acc[key] = { code: key, count: 0, bells: [], products: [] };
                                    acc[key].count++;
                                    acc[key].bells.push(bell);
                                    // For Reference: All constituent items
                                    const details = bell.childItems || [];
                                    const refString = bell.finishedProduct?.name +
                                      ` | ${bell.size}/${bell.gsm} | Pcs:${bell.pieceCount} | Wt:${bell.netWeight}`;

                                    acc[key].products.push(refString);
                                    return acc;
                                  }, {})).map((group: any) => (
                                    <option key={`group-${group.code}`} value={`bellGroup:${group.code}`}>
                                      {group.code} ({group.count} Items) — {group.products.join(' || ')}
                                    </option>
                                  ))}
                                </optgroup>

                              </select>
                            </td>
                            <td className="px-3 py-1"><input type="number" value={currentItem.quantity} onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.value })} className={`w-full text-right text-sm bg-transparent border-0 border-b border-blue-300 focus:ring-0 p-1 ${currentItem.bellItemId ? 'text-gray-500 font-bold bg-gray-50' : ''}`} placeholder="0" readOnly={!!currentItem.bellItemId} /></td>
                            <td className="px-3 py-1"><input type="number" value={currentItem.rate} onChange={e => setCurrentItem({ ...currentItem, rate: e.target.value })} className="w-full text-right text-sm bg-transparent border-0 border-b border-blue-300 focus:ring-0 p-1" placeholder="0.00" /></td>
                            <td className="px-3 py-1"><input type="number" value={currentItem.discountPercent} onChange={e => setCurrentItem({ ...currentItem, discountPercent: e.target.value })} className="w-full text-right text-sm bg-transparent border-0 border-b border-blue-300 focus:ring-0 p-1" placeholder="0" /></td>
                            <td className="px-3 py-1">
                              <select value={currentItem.taxPercent} onChange={e => setCurrentItem({ ...currentItem, taxPercent: e.target.value })} className="w-full text-right text-sm bg-transparent border-0 border-b border-blue-300 focus:ring-0 p-1">
                                <option value="18">18%</option>
                                <option value="12">12%</option>
                                <option value="5">5%</option>
                                <option value="0">0%</option>
                              </select>
                            </td>
                            <td className="px-3 py-1 text-right text-sm text-gray-400 font-mono">
                              {/* Display only if current item is set (manual entry mode?) - though we auto-add bells now */}
                              {((parseFloat(currentItem.quantity || '0') * parseFloat(currentItem.rate || '0')) * (1 + parseFloat(currentItem.taxPercent) / 100)).toFixed(2)}
                            </td>
                            <td className="px-3 py-1 text-center"><button onClick={handleAddItem} className="text-xs font-bold bg-blue-700 text-white px-2 py-0.5 rounded-sm hover:bg-blue-800 uppercase">Add</button></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Footer Calculation */}
                  <div className="col-span-12 flex justify-end mt-4">
                    <div className="w-64 bg-gray-50 p-4 border border-gray-200 rounded-sm space-y-2">
                      <div className="flex justify-between text-xs text-gray-600"><span>Taxable Amount</span><span>₹{totals.taxableAmount.toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs text-gray-600"><span>Total Tax</span><span>₹{totals.totalTax.toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs text-gray-600 border-b border-gray-300 pb-2 mb-2"><span>Round Off</span><span>{totals.roundOff.toFixed(2)}</span></div>
                      <div className="flex justify-between text-base font-bold text-gray-900"><span>Grand Total</span><span>₹{totals.total.toLocaleString()}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      }

      {/* ==================== RECEIPTS VIEW ==================== */}
      {
        activeTab === 'receipts' && (
          <>
            {!showReceiptForm ? (
              /* Receipt List */
              <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Date</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Allocations / Bill No</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Receipt #</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Mode</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Amount</th>
                        <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {salesReceipts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 italic">No receipts recorded.</td>
                        </tr>
                      ) : (
                        salesReceipts.map((receipt) => (
                          <tr key={receipt.id} className={`hover:bg-emerald-50 transition-colors ${receipt.status === 'Reversed' ? 'bg-red-50 opacity-70' : ''}`}>
                            <td className="px-4 py-1.5 text-xs text-gray-600">{new Date(receipt.date).toLocaleDateString()}</td>
                            <td className="px-4 py-1.5 text-xs text-gray-600">
                              {receipt.allocations && receipt.allocations.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {receipt.allocations.map((alloc: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                      <span className="font-mono font-bold text-blue-600 text-[10px]">{alloc.billNumber}</span>
                                      <span className="font-mono text-gray-800 text-[10px]">₹{parseFloat(alloc.amount).toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-[10px]">-</span>
                              )}
                            </td>
                            <td className="px-4 py-1.5 text-xs font-mono font-bold text-emerald-700">
                              {receipt.code}
                              {receipt.status === 'Reversed' && <span className="ml-2 text-[9px] bg-red-200 text-red-800 px-1 rounded">REVERSED</span>}
                              {receipt.isAdvance && <span className="ml-2 text-[9px] bg-yellow-100 text-yellow-800 px-1 rounded border border-yellow-200">ADVANCE</span>}
                            </td>
                            <td className="px-4 py-1.5 text-sm font-bold text-gray-900">{receipt.partyName}</td>
                            <td className="px-4 py-1.5 text-sm font-medium text-gray-600">{receipt.mode}</td>
                            <td className="px-4 py-1.5 text-sm font-mono font-bold text-gray-900 text-right">₹{parseFloat(receipt.amount).toLocaleString()}</td>
                            <td className="px-4 py-1.5 text-right text-xs text-blue-600 font-bold">
                              {receipt.status !== 'Reversed' && (
                                <button onClick={() => handleReverseReceipt(receipt.id)} className="text-red-600 hover:text-red-800 flex items-center justify-end text-[10px] uppercase ml-auto" title="Reverse Receipt">
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
            ) : (
              /* Receipt Entry Form */
              <div className="bg-white border border-gray-300 rounded-sm shadow-sm">
                {/* Header */}
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center sticky top-0 z-10">
                  <h2 className="text-sm font-bold text-gray-800 uppercase">New Payment Receipt</h2>
                  <div className="flex space-x-2">
                    <button onClick={() => setShowReceiptForm(false)} className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-red-600 border border-transparent hover:border-red-200 rounded-sm uppercase">Cancel</button>
                    <button onClick={handleCreateReceipt} disabled={saving} className="px-3 py-1 bg-green-700 text-white text-xs font-bold uppercase rounded-sm hover:bg-green-800 shadow-sm flex items-center">
                      {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save Receipt
                    </button>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Side: Receipt Details */}
                  <div className="lg:col-span-4 space-y-4 border-r border-gray-200 pr-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Receipt Date</label>
                      <input type="date" value={receiptForm.date} onChange={e => setReceiptForm({ ...receiptForm, date: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Customer</label>
                      <select value={receiptForm.customerId} onChange={e => handleReceiptCustomerSelect(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white">
                        <option value="">Select Customer...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {/* NEW: Receive via Advance Adjustment Toggle */}
                    <div className="flex items-center space-x-2 bg-yellow-50 p-2 rounded border border-yellow-100">
                      <input
                        type="checkbox"
                        id="useAdvanceReceipt"
                        checked={receiptForm.useAdvanceReceipt}
                        onChange={e => {
                          const checked = e.target.checked;
                          setReceiptForm({
                            ...receiptForm,
                            useAdvanceReceipt: checked,
                            isAdvance: checked ? false : receiptForm.isAdvance, // Disable isAdvance if adjusting
                          });
                          // Fetch advances if enabled
                          if (checked && receiptForm.customerId) {
                            accountsApi.getPartyAdvances(receiptForm.customerId).then(res => {
                              if (res.data) setAvailableAdvances(res.data);
                            });
                          }
                        }}
                        className="rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                      />
                      <label htmlFor="useAdvanceReceipt" className="text-xs font-bold text-yellow-800 uppercase select-none cursor-pointer">
                        Receive via Advance Adjustment
                      </label>
                    </div>

                    {!receiptForm.useAdvanceReceipt && (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Payment Mode</label>
                          <select value={receiptForm.mode} onChange={e => setReceiptForm({ ...receiptForm, mode: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                            <option value="Bank">Bank Transfer / NEFT</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Deposit To Account</label>
                          <select value={receiptForm.accountId} onChange={e => setReceiptForm({ ...receiptForm, accountId: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-medium bg-white">
                            <option value="">Select Account...</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Reference No.</label>
                          <input type="text" value={receiptForm.reference} onChange={e => setReceiptForm({ ...receiptForm, reference: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500" placeholder="Cheque / UTR No." />
                        </div>
                      </>
                    )}

                    {/* Show Dropdown if Adjusting Advance */}
                    {receiptForm.useAdvanceReceipt && (
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Amount to Adjust</label>
                        <select
                          value={receiptForm.selectedAdvanceId}
                          onChange={e => {
                            const adv = availableAdvances.find(a => a.id === e.target.value);
                            setReceiptForm({
                              ...receiptForm,
                              selectedAdvanceId: e.target.value,
                              // Auto-fill amount but allow edit? Or just set max cap
                              // For now, let user enter amount, but maybe show hint.
                            });
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 font-bold bg-white mb-2"
                        >
                          <option value="">Select Advance Receipt...</option>
                          {availableAdvances.map(adv => (
                            <option key={adv.id} value={adv.id}>
                              {new Date(adv.date).toLocaleDateString()} - {adv.code} (Bal: ₹{parseFloat(adv.advanceBalance).toLocaleString()})
                            </option>
                          ))}
                        </select>
                        {availableAdvances.length === 0 && <p className="text-xs text-red-500 italic mb-2">No advance receipts found for this customer.</p>}
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Total Amount {receiptForm.useAdvanceReceipt ? 'Adjusted' : 'Received'}</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-gray-500 font-bold">₹</span>
                        <input type="number" value={receiptForm.amount} onChange={e => setReceiptForm({ ...receiptForm, amount: e.target.value })} className="w-full pl-6 pr-2 py-1.5 text-lg font-bold border border-blue-500 rounded-sm focus:ring-1 focus:ring-blue-500 text-green-700" placeholder="0.00" />
                      </div>
                      {receiptForm.useAdvanceReceipt && receiptForm.selectedAdvanceId && (() => {
                        const adv = availableAdvances.find(a => a.id === receiptForm.selectedAdvanceId);
                        if (adv) return <p className="text-xs text-gray-500 mt-1">Max Available: ₹{parseFloat(adv.advanceBalance).toLocaleString()}</p>
                      })()}
                    </div>

                    {!receiptForm.useAdvanceReceipt && (
                      <div className="flex items-center space-x-2 bg-blue-50 p-2 rounded border border-blue-100">
                        <input
                          type="checkbox"
                          id="isAdvanceReceipt"
                          checked={receiptForm.isAdvance}
                          onChange={e => {
                            setReceiptForm({ ...receiptForm, isAdvance: e.target.checked } as any);
                            if (e.target.checked) setAllocations({});
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="isAdvanceReceipt" className="text-xs font-bold text-blue-800 uppercase select-none cursor-pointer">
                          Mark as Advance Receipt
                        </label>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Remarks</label>
                      <textarea value={receiptForm.remarks} onChange={e => setReceiptForm({ ...receiptForm, remarks: e.target.value })} rows={2} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500" placeholder="Optional remarks..." />
                    </div>
                  </div>

                  {/* Right Side: Invoice Allocation */}
                  <div className="lg:col-span-8 space-y-4">
                    <div className="flex justify-between items-center bg-gray-50 p-2 border border-gray-200 rounded-sm">
                      <h3 className="text-xs font-bold text-gray-700 uppercase">Outstanding Invoices</h3>
                      {!(receiptForm as any).isAdvance && (
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
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase">Inv #</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right">Inv Amount</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right">Balance</th>
                            <th className="px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase text-right w-32">Allocated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {outstandingInvoices.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500 italic">No outstanding invoices found.</td></tr>
                          ) : (
                            outstandingInvoices.map((inv) => {
                              const balance = parseFloat(inv.balanceAmount || inv.grandTotal);
                              return (
                                <tr key={inv.id} className="hover:bg-blue-50">
                                  <td className="px-3 py-1.5 text-xs text-gray-600">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                                  <td className="px-3 py-1.5 text-xs font-mono font-bold text-blue-700">{inv.invoiceNumber}</td>
                                  <td className="px-3 py-1.5 text-xs text-right">₹{parseFloat(inv.grandTotal).toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-xs text-right font-bold text-red-600">₹{balance.toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      max={balance}
                                      value={allocations[inv.id] || ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        // Validation logic: cannot exceed balance
                                        if (val > balance) return;

                                        setAllocations(prev => {
                                          const next = { ...prev };
                                          if (!val) delete next[inv.id];
                                          else next[inv.id] = val;
                                          return next;
                                        });
                                      }}
                                      className={`w-full text-right px-2 py-1 text-sm border rounded-sm focus:ring-1 focus:ring-blue-500 font-mono ${allocations[inv.id] ? 'border-green-500 bg-green-50 font-bold' : 'border-gray-300'}`}
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
                      <div>Total Received: <span className="text-green-700">₹{parseFloat(receiptForm.amount || '0').toLocaleString()}</span></div>
                      <div>Total Allocated: <span className={Object.values(allocations).reduce((a, b) => a + b, 0) > parseFloat(receiptForm.amount || '0') ? 'text-red-600' : 'text-blue-700'}>
                        ₹{Object.values(allocations).reduce((a, b) => a + b, 0).toLocaleString()}
                      </span></div>
                      <div>{(receiptForm as any).isAdvance ? "Advance Amount:" : "Unallocated:"} <span className="text-gray-500">₹{Math.max(0, parseFloat(receiptForm.amount || '0') - Object.values(allocations).reduce((a, b) => a + b, 0)).toLocaleString()}</span></div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </>
        )
      }

      {/* ==================== ADVANCES VIEW ==================== */}
      {
        activeTab === 'advances' && (
          <div className="space-y-4">
            {/* Advance Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-sm border border-gray-200 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Total Advances Received</span>
                <span className="text-2xl font-bold text-blue-700 mt-1">
                  ₹{salesReceipts.filter(p => p.isAdvance).reduce((sum, p) => sum + parseFloat(p.amount), 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-white p-4 rounded-sm border border-gray-200 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Total Adjusted</span>
                <span className="text-2xl font-bold text-green-700 mt-1">
                  ₹{salesReceipts.filter(p => p.isAdvance).reduce((sum, p) => sum + (parseFloat(p.amount) - parseFloat(p.advanceBalance || '0')), 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-white p-4 rounded-sm border border-gray-200 shadow-sm flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Open Advance Balance</span>
                <span className="text-2xl font-bold text-purple-700 mt-1">
                  ₹{salesReceipts.filter(p => p.isAdvance).reduce((sum, p) => sum + parseFloat(p.advanceBalance || '0'), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Advances Table */}
            <div className="bg-white border border-gray-300 rounded-sm overflow-hidden min-h-[400px]">
              <table className="w-full text-left">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Date</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider w-32">Ref #</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Adjusted</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Balance</th>
                    <th className="px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {salesReceipts.filter(p => p.isAdvance).length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 italic">No advance receipts found.</td></tr>
                  ) : (
                    salesReceipts.filter(p => p.isAdvance).map(receipt => {
                      const amount = parseFloat(receipt.amount);
                      const balance = parseFloat(receipt.advanceBalance || '0');
                      const adjusted = amount - balance;
                      return (
                        <tr key={receipt.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-600">{new Date(receipt.date).toLocaleDateString()}</td>
                          <td className="px-4 py-2 text-xs font-mono font-bold text-blue-700">{receipt.code}</td>
                          <td className="px-4 py-2 text-sm font-bold text-gray-900">{receipt.partyName}</td>
                          <td className="px-4 py-2 text-sm font-mono font-bold text-right">₹{amount.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm font-mono text-gray-600 text-right">₹{adjusted.toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm font-mono font-bold text-purple-700 text-right">₹{balance.toLocaleString()}</td>
                          <td className="px-4 py-2 text-center">
                            {receipt.status === 'Reversed' ? (
                              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">VOID</span>
                            ) : balance === 0 ? (
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ADJUSTED</span>
                            ) : (
                              <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">OPEN</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      }


    </div >
  );
}
