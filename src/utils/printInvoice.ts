/**
 * GST-Compliant Invoice Printing Utility
 * 
 * Generates professional Tax Invoices compliant with Indian GST regulations.
 * Supports both CGST/SGST (Intra-state) and IGST (Inter-state) invoices.
 */

import { APP_CONFIG } from '../config/app.config';

// Indian State Codes for GST
export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Before Division)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (Newly Added)',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

/**
 * Get state name from state code
 */
export function getStateName(stateCode: string): string {
  return INDIAN_STATES[stateCode] || stateCode;
}

/**
 * Extract state code from GSTIN (first 2 digits)
 */
export function getStateCodeFromGSTIN(gstin: string): string {
  if (!gstin || gstin.length < 2) return '';
  return gstin.substring(0, 2);
}

/**
 * Check if supply is inter-state based on customer state code
 */
export function isInterStateSupply(customerStateCode: string): boolean {
  return customerStateCode !== APP_CONFIG.company.stateCode;
}

/**
 * Convert number to words in Indian format (Lakhs, Crores)
 */
export function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';
  if (num < 0) return 'Minus ' + numberToWords(-num);

  let words = '';

  if (Math.floor(num / 10000000) > 0) {
    words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }
  if (Math.floor(num / 100) > 0) {
    words += numberToWords(Math.floor(num / 100)) + ' Hundred ';
    num %= 100;
  }
  if (num > 0) {
    if (num < 20) {
      words += ones[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10 > 0) words += ' ' + ones[num % 10];
    }
  }

  return words.trim();
}

/**
 * Format amount in words with Rupees and Paise
 */
export function formatAmountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = 'Rupees ' + numberToWords(rupees);
  if (paise > 0) {
    result += ' and ' + numberToWords(paise) + ' Paise';
  }
  result += ' Only';
  return result;
}

/**
 * Format date in Indian format (DD/MM/YYYY)
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format currency in Indian format
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
}

/**
 * Invoice data interface
 */
interface InvoiceData {
  // Invoice Details
  code?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  date?: string;
  dueDate?: string;
  invoiceType?: 'B2B' | 'B2C';
  // Customer Details
  customer?: {
    name?: string;
    gstNo?: string;
    stateCode?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  customerName?: string;
  customerGST?: string;
  billingAddress?: string;
  shippingAddress?: string;
  placeOfSupply?: string;
  // Items
  items?: Array<{
    finishedProduct?: { name?: string; gsm?: string };
    productName?: string;
    hsnCode?: string;
    quantity?: number | string;
    unit?: string;
    rate?: number | string;
    discountPercent?: number | string;
    discountAmount?: number | string;
    taxableAmount?: number | string;
    gstPercent?: number | string;
    cgst?: number | string;
    sgst?: number | string;
    igst?: number | string;
    totalAmount?: number | string;
    amount?: number | string;
  }>;
  // Totals
  subtotal?: number | string;
  totalDiscount?: number | string;
  taxableValue?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  roundOff?: number | string;
  grandTotal?: number | string;
  total?: number | string;
  // Additional
  transportDetails?: string;
  vehicleNumber?: string;
  eWayBillNo?: string;
  remarks?: string;
  termsAndConditions?: string[];
}

/**
 * Generate and print GST-compliant Tax Invoice
 */
export function printInvoice(invoice: InvoiceData): void {
  const company = APP_CONFIG.company;

  // Determine customer state code
  // Priority: 1. Derived from GSTIN, 2. Explicit state code, 3. Company state
  const customerStateCode = getStateCodeFromGSTIN(invoice.customer?.gstNo || invoice.customerGST || '') ||
    invoice.customer?.stateCode ||
    company.stateCode;

  // Check if inter-state supply
  const isInterState = isInterStateSupply(customerStateCode);
  const customerStateName = getStateName(customerStateCode);
  const companyStateName = getStateName(company.stateCode);

  // Invoice type (B2B requires GSTIN, B2C doesn't)
  const invoiceType = invoice.invoiceType || (invoice.customer?.gstNo ? 'B2B' : 'B2C');

  // Pre-process items to ensure tax values are calculated correctly
  const processedItems = (invoice.items || []).map(item => {
    const qty = parseFloat(String(item.quantity || 0));
    const rate = parseFloat(String(item.rate || 0));
    const discountAmt = parseFloat(String(item.discountAmount || 0));
    const taxableAmt = parseFloat(String(item.taxableAmount || (qty * rate - discountAmt)));
    const gstPct = parseFloat(String(item.gstPercent || 18));

    // Calculate taxes: use provided amount if > 0, otherwise calculate from taxable value
    const calculatedCgst = taxableAmt * gstPct / 200;
    const calculatedSgst = taxableAmt * gstPct / 200;
    const calculatedIgst = taxableAmt * gstPct / 100;

    // Use calculated tax if the provided tax is 0 (or missing) but should exist
    const finalCgst = parseFloat(String(item.cgst)) || (isInterState ? 0 : calculatedCgst);
    const finalSgst = parseFloat(String(item.sgst)) || (isInterState ? 0 : calculatedSgst);
    const finalIgst = parseFloat(String(item.igst)) || (isInterState ? calculatedIgst : 0);

    // Recalculate total amount to ensure consistency
    const totalAmt = parseFloat(String(item.totalAmount || item.amount)) || (taxableAmt + finalCgst + finalSgst + finalIgst);

    return {
      ...item,
      qty,
      rate,
      discountAmt,
      taxableAmt,
      gstPct,
      cgst: finalCgst,
      sgst: finalSgst,
      igst: finalIgst,
      totalAmt
    };
  });

  // Calculate totals from processed items if the invoice totals are missing or zero
  // This safeguards against cases where backend sends totals but 0 tax breakdown
  const calcSubtotal = processedItems.reduce((sum, item) => sum + item.taxableAmt, 0);
  const calcCgstTotal = processedItems.reduce((sum, item) => sum + item.cgst, 0);
  const calcSgstTotal = processedItems.reduce((sum, item) => sum + item.sgst, 0);
  const calcIgstTotal = processedItems.reduce((sum, item) => sum + item.igst, 0);
  const calcTotalDiscount = processedItems.reduce((sum, item) => sum + item.discountAmt, 0);

  // Calculate totals - PREFER valid calculated totals over apparent zero/missing Invoice totals
  // If the Calculated total is meaningful (> 1) and Invoice Total is 0, use Calculated.
  // Actually, since we rebuilt the items, the Calculated total is the source of truth for the Table.
  // We should align the Footer Totals to match the Table Items.
  const subtotal = calcSubtotal > 0 ? calcSubtotal : (parseFloat(String(invoice.subtotal)) || 0);

  const cgstTotal = isInterState ? 0 : (calcCgstTotal > 0 ? calcCgstTotal : parseFloat(String(invoice.cgst || 0)));
  const sgstTotal = isInterState ? 0 : (calcSgstTotal > 0 ? calcSgstTotal : parseFloat(String(invoice.sgst || 0)));
  const igstTotal = isInterState ? (calcIgstTotal > 0 ? calcIgstTotal : parseFloat(String(invoice.igst || 0))) : 0;

  const totalDiscount = parseFloat(String(invoice.totalDiscount)) || calcTotalDiscount;
  const roundOff = parseFloat(String(invoice.roundOff || 0));
  // Grand Total: Prefer provided, else sum up components
  const grandTotal = parseFloat(String(invoice.grandTotal || invoice.total)) || (subtotal + cgstTotal + sgstTotal + igstTotal);

  // Generate item rows
  const itemRows = processedItems.map((item, idx) => {
    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>
          <div class="bold">${item.productName || item.finishedProduct?.name || 'Product'}</div>
          ${item.finishedProduct?.gsm ? `<div class="small">GSM: ${item.finishedProduct.gsm}</div>` : ''}
        </td>
        <td class="center">${item.hsnCode || '5608'}</td>
        <td class="right">${item.qty.toFixed(2)}</td>
        <td class="center">${item.unit || 'Kg'}</td>
        <td class="right">${formatCurrency(item.rate)}</td>
        <td class="right">${formatCurrency(item.discountAmt)}</td>
        <td class="right">${formatCurrency(item.taxableAmt)}</td>
        ${isInterState ? `
          <td class="center">${item.gstPct}%</td>
          <td class="right">${formatCurrency(item.igst)}</td>
        ` : `
          <td class="center">${(item.gstPct / 2).toFixed(1)}%</td>
          <td class="right">${formatCurrency(item.cgst)}</td>
          <td class="center">${(item.gstPct / 2).toFixed(1)}%</td>
          <td class="right">${formatCurrency(item.sgst)}</td>
        `}
        <td class="right bold">${formatCurrency(item.totalAmt)}</td>
      </tr>
    `;
  }).join('');

  // HSN Summary for items
  const hsnSummary = processedItems.reduce((acc, item) => {
    const hsn = item.hsnCode || '5608';

    if (!acc[hsn]) {
      acc[hsn] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, gstRate: item.gstPct };
    }
    acc[hsn].taxableValue += item.taxableAmt;
    acc[hsn].cgst += item.cgst;
    acc[hsn].sgst += item.sgst;
    acc[hsn].igst += item.igst;
    return acc;
  }, {} as Record<string, { taxableValue: number; cgst: number; sgst: number; igst: number; gstRate: number }>);

  const hsnSummaryRows = Object.entries(hsnSummary).map(([hsn, data]) => `
    <tr>
      <td>${hsn}</td>
      <td class="right">${formatCurrency(data.taxableValue)}</td>
      ${isInterState ? `
        <td class="center">${data.gstRate}%</td>
        <td class="right">${formatCurrency(data.igst)}</td>
      ` : `
        <td class="center">${data.gstRate / 2}%</td>
        <td class="right">${formatCurrency(data.cgst)}</td>
        <td class="center">${data.gstRate / 2}%</td>
        <td class="right">${formatCurrency(data.sgst)}</td>
      `}
      <td class="right bold">${formatCurrency(isInterState ? data.igst : data.cgst + data.sgst)}</td>
    </tr>
  `).join('');

  // Default terms and conditions
  const termsAndConditions = invoice.termsAndConditions || [
    'Goods once sold will not be taken back.',
    'Interest @ 18% p.a. will be charged on delayed payments.',
    'Subject to Pune jurisdiction only.',
    'E. & O.E.',
  ];

  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice - ${invoice.invoiceNumber || invoice.code}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #333;
      background: #fff;
    }
    
    .invoice-container {
      max-width: 210mm;
      min-height: 297mm; /* A4 height */
      margin: 0 auto;
      padding: 10mm;
      border: 2px solid #1a56db;
      display: flex;
      flex-direction: column;
    }
    
    /* Header Section */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1a56db;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    
    .company-info {
      flex: 1;
    }
    
    .company-name {
      font-size: 22px;
      font-weight: bold;
      color: #1a56db;
      margin-bottom: 2px;
    }
    
    .company-tagline {
      font-size: 10px;
      color: #666;
      font-style: italic;
      margin-bottom: 5px;
    }
    
    .company-details {
      font-size: 10px;
      line-height: 1.5;
    }
    
    .company-details span {
      display: block;
    }
    
    .gstin-box {
      background: #f0f7ff;
      border: 1px solid #1a56db;
      padding: 5px 10px;
      margin-top: 5px;
      display: inline-block;
    }
    
    .gstin-box strong {
      color: #1a56db;
    }
    
    .invoice-title-section {
      text-align: right;
    }
    
    .invoice-title {
      font-size: 24px;
      font-weight: bold;
      color: #1a56db;
      border: 2px solid #1a56db;
      padding: 8px 20px;
      display: inline-block;
      margin-bottom: 10px;
    }
    
    .invoice-meta {
      text-align: right;
      font-size: 11px;
    }
    
    .invoice-meta table {
      margin-left: auto;
    }
    
    .invoice-meta td {
      padding: 2px 5px;
    }
    
    .invoice-meta td:first-child {
      text-align: right;
      font-weight: bold;
      color: #555;
    }
    
    .invoice-meta td:last-child {
      text-align: left;
      font-weight: bold;
    }
    
    /* Party Details Section */
    .party-section {
      display: flex;
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .party-box {
      flex: 1;
      border: 1px solid #ddd;
      padding: 10px;
      background: #fafafa;
    }
    
    .party-title {
      font-weight: bold;
      color: #1a56db;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 8px;
      font-size: 11px;
      text-transform: uppercase;
    }
    
    .party-name {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .party-details {
      font-size: 10px;
      line-height: 1.6;
    }
    
    .party-details .label {
      color: #666;
      display: inline-block;
      width: 60px;
    }
    
    .highlight {
      background: #fff3cd;
      padding: 2px 5px;
      font-weight: bold;
    }
    
    /* Items Table */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10px;
    }
    
    .items-table th {
      background: #1a56db;
      color: white;
      padding: 8px 5px;
      text-align: center;
      font-weight: bold;
      border: 1px solid #1a56db;
      font-size: 9px;
    }
    
    .items-table td {
      padding: 6px 5px;
      border: 1px solid #ddd;
      vertical-align: middle;
    }
    
    .items-table tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .items-table tbody tr:hover {
      background: #e8f4ff;
    }
    
    .items-table .center { text-align: center; }
    .items-table .right { text-align: right; }
    .items-table .bold { font-weight: bold; }
    
    /* Totals Section */
    .totals-section {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 15px;
    }
    
    .hsn-summary {
      flex: 1;
    }
    
    .hsn-summary h4 {
      background: #e8f4ff;
      padding: 5px 10px;
      margin-bottom: 5px;
      font-size: 10px;
      color: #1a56db;
    }
    
    .hsn-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    
    .hsn-table th, .hsn-table td {
      border: 1px solid #ddd;
      padding: 4px 5px;
    }
    
    .hsn-table th {
      background: #f0f0f0;
      font-weight: bold;
    }
    
    .totals-box {
      width: 280px;
    }
    
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .totals-table td {
      padding: 5px 8px;
      border: 1px solid #ddd;
    }
    
    .totals-table tr:last-child {
      background: #1a56db;
      color: white;
      font-size: 13px;
    }
    
    .totals-table tr:last-child td {
      border-color: #1a56db;
      font-weight: bold;
    }
    
    .totals-table td:first-child {
      text-align: left;
    }
    
    .totals-table td:last-child {
      text-align: right;
      font-weight: bold;
    }
    
    /* Amount in Words */
    .amount-words {
      background: #f0f7ff;
      border: 1px solid #1a56db;
      padding: 10px;
      margin-bottom: 15px;
      font-size: 11px;
    }
    
    .amount-words strong {
      color: #1a56db;
    }
    
    /* Bank Details & Footer */
    .footer-section {
      display: flex;
      gap: 20px;
      margin-top: auto; /* Push to bottom */
      padding-top: 15px;
      border-top: 1px solid #ddd;
    }
    
    .bank-details {
      flex: 1;
      font-size: 10px;
    }
    
    .bank-details h4 {
      color: #1a56db;
      margin-bottom: 8px;
      font-size: 11px;
    }
    
    .bank-details table {
      width: 100%;
    }
    
    .bank-details td {
      padding: 2px 5px;
    }
    
    .bank-details td:first-child {
      width: 100px;
      color: #666;
    }
    
    .terms-section {
      flex: 1;
      font-size: 9px;
    }
    
    .terms-section h4 {
      color: #1a56db;
      margin-bottom: 8px;
      font-size: 11px;
    }
    
    .terms-section ol {
      margin-left: 15px;
      color: #666;
    }
    
    .terms-section li {
      margin-bottom: 3px;
    }
    
    .signature-section {
      width: 200px;
      text-align: center;
    }
    
    .signature-box {
      border-top: 1px solid #333;
      margin-top: 60px;
      padding-top: 5px;
    }
    
    .company-stamp {
      font-size: 10px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    /* E-Invoice Details (if applicable) */
    .einvoice-section {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 8px;
      margin-bottom: 10px;
      font-size: 10px;
    }
    
    /* Print Styles */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .invoice-container {
        border: none;
        padding: 0;
      }
      
      .no-print {
        display: none !important;
      }
    }
    
    /* Supply Type Badge */
    .supply-type {
      display: inline-block;
      padding: 3px 8px;
      font-size: 9px;
      font-weight: bold;
      border-radius: 3px;
      margin-top: 5px;
    }
    
    .supply-type.intra {
      background: #d4edda;
      color: #155724;
    }
    
    .supply-type.inter {
      background: #fff3cd;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">${company.name}</div>
        <div class="company-tagline">${company.tagline}</div>
        <div class="company-details">
          <span>${company.address1}</span>
          <span>${company.address2}</span>
          <span>${company.city} - ${company.pincode}</span>
          <span>${company.district}, ${company.state}, ${company.country}</span>
          <span>📱 ${company.mobile}</span>
          <span>✉️ ${company.email}</span>
        </div>
        
        <div class="gstin-box">
          <strong>GSTIN:</strong> ${company.gstin} &nbsp;|&nbsp; <strong>State:</strong> ${companyStateName} (${company.stateCode})
        </div>
      </div>
      
      <div class="invoice-title-section">
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-meta">
          <table>
            <tr>
              <td>Invoice No.:</td>
              <td>${invoice.invoiceNumber || invoice.code}</td>
            </tr>
            <tr>
              <td>Invoice Date:</td>
              <td>${formatDate(invoice.invoiceDate || invoice.date || new Date())}</td>
            </tr>
            ${invoice.dueDate ? `
            <tr>
              <td>Due Date:</td>
              <td>${formatDate(invoice.dueDate)}</td>
            </tr>
            ` : ''}
            <tr>
              <td>Invoice Type:</td>
              <td>${invoiceType}</td>
            </tr>
            </tr>
          </table>
        </div>
      </div>
    </div>
    
    ${invoice.eWayBillNo ? `
    <div class="einvoice-section">
      <strong>E-Way Bill No.:</strong> ${invoice.eWayBillNo}
      ${invoice.vehicleNumber ? ` | <strong>Vehicle No.:</strong> ${invoice.vehicleNumber}` : ''}
      ${invoice.transportDetails ? ` | <strong>Transport:</strong> ${invoice.transportDetails}` : ''}
    </div>
    ` : ''}
    
    <!-- Party Details -->
    <div class="party-section">
      <div class="party-box">
        <div class="party-title">📋 Bill To / Buyer Details</div>
        <div class="party-name">${invoice.customerName || invoice.customer?.name || 'Cash Customer'}</div>
        <div class="party-details">
          ${invoiceType === 'B2B' ? `
          <div><span class="label">GSTIN:</span> <span class="highlight">${invoice.customerGST || invoice.customer?.gstNo || 'N/A'}</span></div>
          ` : `
          <div><span class="label">GSTIN:</span> Unregistered / B2C</div>
          `}
          <div><span class="label">State:</span> ${customerStateName} (${customerStateCode})</div>
          <div><span class="label">Address:</span> ${invoice.billingAddress || invoice.customer?.address || 'N/A'}</div>
          <div><span class="label">Phone:</span> ${invoice.customer?.phone || 'N/A'}</div>
          ${invoice.customer?.email ? `<div><span class="label">Email:</span> ${invoice.customer.email}</div>` : ''}
        </div>
      </div>
      
      <div class="party-box">
        <div class="party-title">🚚 Ship To / Consignee Details</div>
        <div class="party-name">${invoice.customerName || invoice.customer?.name || 'Same as Buyer'}</div>
        <div class="party-details">
          <div><span class="label">Address:</span> ${invoice.shippingAddress || invoice.billingAddress || invoice.customer?.address || 'Same as billing address'}</div>
          <div><span class="label">Place of Supply:</span> <span class="highlight">${customerStateName} (${customerStateCode})</span></div>
        </div>
      </div>
    </div>
    
    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">Sr.</th>
          <th style="min-width: 150px;">Description of Goods</th>
          <th style="width: 60px;">HSN/SAC</th>
          <th style="width: 50px;">Qty</th>
          <th style="width: 40px;">Unit</th>
          <th style="width: 70px;">Rate (₹)</th>
          <th style="width: 60px;">Disc (₹)</th>
          <th style="width: 80px;">Taxable Value</th>
          ${isInterState ? `
          <th style="width: 50px;">IGST Rate</th>
          <th style="width: 70px;">IGST Amt</th>
          ` : `
          <th style="width: 45px;">CGST Rate</th>
          <th style="width: 60px;">CGST Amt</th>
          <th style="width: 45px;">SGST Rate</th>
          <th style="width: 60px;">SGST Amt</th>
          `}
          <th style="width: 80px;">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    
    <!-- Totals Section -->
    <div class="totals-section">
      <div class="hsn-summary">
        <h4>HSN/SAC Summary</h4>
        <table class="hsn-table">
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th>Taxable Value</th>
              ${isInterState ? `
              <th>IGST Rate</th>
              <th>IGST Amt</th>
              ` : `
              <th>CGST Rate</th>
              <th>CGST Amt</th>
              <th>SGST Rate</th>
              <th>SGST Amt</th>
              `}
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            ${hsnSummaryRows}
          </tbody>
        </table>
      </div>
      
      <div class="totals-box">
        <table class="totals-table">
          <tr>
            <td>Sub Total</td>
            <td>₹ ${formatCurrency(subtotal)}</td>
          </tr>
          ${invoice.totalDiscount ? `
          <tr>
            <td>Discount</td>
            <td>- ₹ ${formatCurrency(invoice.totalDiscount)}</td>
          </tr>
          ` : ''}
          ${isInterState ? `
          <tr>
            <td>IGST</td>
            <td>₹ ${formatCurrency(igstTotal)}</td>
          </tr>
          ` : `
          <tr>
            <td>CGST</td>
            <td>₹ ${formatCurrency(cgstTotal)}</td>
          </tr>
          <tr>
            <td>SGST</td>
            <td>₹ ${formatCurrency(sgstTotal)}</td>
          </tr>
          `}
          ${roundOff !== 0 ? `
          <tr>
            <td>Round Off</td>
            <td>${roundOff >= 0 ? '+ ' : '- '} ₹ ${formatCurrency(Math.abs(roundOff))}</td>
          </tr>
          ` : ''}
          <tr>
            <td>GRAND TOTAL</td>
            <td>₹ ${formatCurrency(grandTotal)}</td>
          </tr>
        </table>
      </div>
    </div>
    
    <!-- Amount in Words -->
    <div class="amount-words">
      <strong>Amount in Words:</strong> ${formatAmountInWords(grandTotal)}
    </div>
    
    <!-- Footer Section -->
    <div class="footer-section">
      <div class="bank-details">
        <h4>🏦 Bank Details for Payment</h4>
        <h4>Canara Bank A/C Details:</h4>
        <table>
          <tr>
            <td>Account Number :</td>
            <td><strong>125009110096</strong></td>
          </tr>

          <tr>
            <td>Account Holder Name :</td>
            <td><strong>SHIV AGRONET</strong></td>
          </tr>
          <tr>
            <td>Ifsc Code :</td>
            <td><strong>CNRB0007368</strong></td>
          </tr>
        </table>
      </div>
      
      <div class="terms-section">
        <h4>📜 Terms & Conditions</h4>
        <ol>
          ${termsAndConditions.map(term => `<li>${term}</li>`).join('')}
        </ol>
        ${invoice.remarks ? `
        <p style="margin-top: 10px;"><strong>Remarks:</strong> ${invoice.remarks}</p>
        ` : ''}
      </div>
      
      <div class="signature-section">
        <div class="company-stamp">For ${company.name}</div>
        <div class="signature-box">Authorized Signatory</div>
      </div>
    </div>
    
    <!-- Declaration -->
    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ddd; font-size: 9px; color: #666; text-align: center;">
      <em>This is a computer-generated invoice and does not require a physical signature.</em><br>
      <em>Certified that the particulars given above are true and correct.</em>
    </div>
  </div>
</body>
</html>
  `;

  // Open print window
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    // Auto-trigger print after a short delay for styles to load
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}

/**
 * Generate invoice for purchase bills (Supplier -> Company)
 */
export function printPurchaseBill(bill: any): void {
  const company = APP_CONFIG.company;

  // For purchase bills, the supplier is the seller and company is the buyer
  const supplierStateCode = bill.supplier?.stateCode ||
    getStateCodeFromGSTIN(bill.supplier?.gstNo || '') ||
    company.stateCode;

  const isInterState = isInterStateSupply(supplierStateCode);
  const supplierStateName = getStateName(supplierStateCode);

  const subtotal = parseFloat(String(bill.subtotal || 0));
  const cgstTotal = parseFloat(String(bill.cgst || 0));
  const sgstTotal = parseFloat(String(bill.sgst || 0));
  const igstTotal = parseFloat(String(bill.igst || 0));
  const discountTotal = parseFloat(String(bill.discountAmount || 0));
  const grandTotal = parseFloat(String(bill.grandTotal || 0));

  const itemRows = (bill.items || []).map((item: any, idx: number) => {
    const qty = parseFloat(String(item.quantity || 0));
    const rate = parseFloat(String(item.rate || 0));
    const amount = qty * rate;
    const gstPct = parseFloat(String(item.gstPercent || 18));
    const cgst = isInterState ? 0 : (amount * gstPct / 200);
    const sgst = isInterState ? 0 : (amount * gstPct / 200);
    const igst = isInterState ? (amount * gstPct / 100) : 0;
    const total = amount + cgst + sgst + igst;

    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${item.materialName || item.rawMaterial?.name || 'Material'}</td>
        <td class="center">${item.hsnCode || '3901'}</td>
        <td class="right">${qty.toFixed(2)}</td>
        <td class="center">Kg</td>
        <td class="right">${formatCurrency(rate)}</td>
        <td class="right">${formatCurrency(amount)}</td>
        ${isInterState ? `
          <td class="center">${gstPct}%</td>
          <td class="right">${formatCurrency(igst)}</td>
        ` : `
          <td class="center">${(gstPct / 2).toFixed(1)}%</td>
          <td class="right">${formatCurrency(cgst)}</td>
          <td class="center">${(gstPct / 2).toFixed(1)}%</td>
          <td class="right">${formatCurrency(sgst)}</td>
        `}
        <td class="right bold">${formatCurrency(total)}</td>
      </tr>
    `;
  }).join('');

  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Bill - ${bill.code}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #333; padding: 15px; }
    .container { max-width: 210mm; margin: 0 auto; border: 2px solid #2563eb; padding: 15px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
    .title { font-size: 18px; font-weight: bold; color: #2563eb; border: 2px solid #2563eb; padding: 5px 15px; }
    .parties { display: flex; gap: 15px; margin-bottom: 15px; }
    .party-box { flex: 1; border: 1px solid #ddd; padding: 10px; background: #f8f9fa; }
    .party-title { font-weight: bold; color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 8px; }
    .party-name { font-size: 13px; font-weight: bold; margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
    th { background: #2563eb; color: white; padding: 8px 5px; border: 1px solid #2563eb; }
    td { padding: 6px 5px; border: 1px solid #ddd; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .totals { width: 250px; margin-left: auto; }
    .totals td { padding: 5px 8px; border: 1px solid #ddd; }
    .totals tr:last-child { background: #2563eb; color: white; font-weight: bold; }
    .amount-words { background: #eff6ff; border: 1px solid #2563eb; padding: 10px; margin-bottom: 15px; }
    .highlight { background: #fef3c7; padding: 2px 5px; font-weight: bold; }
    @media print { .container { border: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">PURCHASE BILL</div>
        <div style="margin-top: 10px; font-size: 10px;">
          <strong>Bill No:</strong> ${bill.code}<br>
          <strong>Bill Date:</strong> ${formatDate(bill.date)}<br>
          <strong>Supply Type:</strong> <span class="highlight">${isInterState ? 'INTER-STATE (IGST)' : 'INTRA-STATE (CGST+SGST)'}</span>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: bold; color: #2563eb;">${company.name}</div>
        <div style="font-size: 10px;">
          ${company.address1}, ${company.address2}<br>
          ${company.city} - ${company.pincode}, ${company.state}<br>
          GSTIN: ${company.gstin}
        </div>
      </div>
    </div>
    
    <div class="parties">
      <div class="party-box">
        <div class="party-title">Supplier Details</div>
        <div class="party-name">${bill.supplier?.name || 'N/A'}</div>
        <div style="font-size: 10px;">
          <div><strong>GSTIN:</strong> <span class="highlight">${bill.supplier?.gstNo || 'N/A'}</span></div>
          <div><strong>State:</strong> ${supplierStateName} (${supplierStateCode})</div>
          <div><strong>Address:</strong> ${bill.supplier?.address || 'N/A'}</div>
          <div><strong>Contact:</strong> ${bill.supplier?.contact || 'N/A'}</div>
        </div>
      </div>
      <div class="party-box">
        <div class="party-title">Buyer Details (Our Company)</div>
        <div class="party-name">${company.name}</div>
        <div style="font-size: 10px;">
          <div><strong>GSTIN:</strong> <span class="highlight">${company.gstin}</span></div>
          <div><strong>State:</strong> ${getStateName(company.stateCode)} (${company.stateCode})</div>
          <div><strong>Address:</strong> ${company.address1}, ${company.city}</div>
        </div>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Sr.</th>
          <th>Material Description</th>
          <th>HSN</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Rate (₹)</th>
          <th>Amount</th>
          ${isInterState ? '<th>IGST%</th><th>IGST Amt</th>' : '<th>CGST%</th><th>CGST</th><th>SGST%</th><th>SGST</th>'}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    
    <table class="totals">
      <tr><td>Sub Total</td><td class="right">₹ ${formatCurrency(subtotal)}</td></tr>
      ${discountTotal > 0 ? `<tr><td>Discount</td><td class="right">- ₹ ${formatCurrency(discountTotal)}</td></tr>` : ''}
      ${isInterState ?
      `<tr><td>IGST</td><td class="right">₹ ${formatCurrency(igstTotal)}</td></tr>` :
      `<tr><td>CGST</td><td class="right">₹ ${formatCurrency(cgstTotal)}</td></tr>
         <tr><td>SGST</td><td class="right">₹ ${formatCurrency(sgstTotal)}</td></tr>`
    }
      <tr><td>GRAND TOTAL</td><td class="right">₹ ${formatCurrency(grandTotal)}</td></tr>
    </table>
    
    <div class="amount-words">
      <strong>Amount in Words:</strong> ${formatAmountInWords(grandTotal)}
    </div>
    
    <div style="display: flex; justify-content: space-between; margin-top: 20px; font-size: 10px;">
      <div>
        <strong>Received By:</strong><br><br>
        ___________________
      </div>
      <div style="text-align: center;">
        <strong>For ${company.name}</strong><br><br><br>
        ___________________<br>
        Authorized Signatory
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}

export default printInvoice;
