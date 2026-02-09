/**
 * GST-Compliant Invoice Printing Utility
 * 
 * Generates professional Tax Invoices compliant with Indian GST regulations.
 * A4 Size (210mm x 297mm) format with fixed layout.
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

  let result = numberToWords(rupees);
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
  code?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  date?: string;
  dueDate?: string;
  invoiceType?: 'B2B' | 'B2C';
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
  subtotal?: number | string;
  totalDiscount?: number | string;
  taxableValue?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  roundOff?: number | string;
  grandTotal?: number | string;
  total?: number | string;
  transportDetails?: string;
  vehicleNumber?: string;
  eWayBillNo?: string;
  remarks?: string;
  termsAndConditions?: string[];
}

/**
 * Generate and print GST-compliant Tax Invoice - A4 Format
 */
export function printInvoice(invoice: InvoiceData): void {
  const company = APP_CONFIG.company;

  const customerStateCode = getStateCodeFromGSTIN(invoice.customer?.gstNo || invoice.customerGST || '') ||
    invoice.customer?.stateCode ||
    company.stateCode;

  const isInterState = isInterStateSupply(customerStateCode);
  const customerStateName = getStateName(customerStateCode);
  const companyStateName = getStateName(company.stateCode);
  const invoiceType = invoice.invoiceType || (invoice.customer?.gstNo ? 'B2B' : 'B2C');

  // Process items
  const processedItems = (invoice.items || []).map(item => {
    const qty = parseFloat(String(item.quantity || 0));
    const rate = parseFloat(String(item.rate || 0));
    const discountAmt = parseFloat(String(item.discountAmount || 0));
    const taxableAmt = parseFloat(String(item.taxableAmount || (qty * rate - discountAmt)));
    const gstPct = parseFloat(String(item.gstPercent || 18));

    const calculatedCgst = taxableAmt * gstPct / 200;
    const calculatedSgst = taxableAmt * gstPct / 200;
    const calculatedIgst = taxableAmt * gstPct / 100;

    const finalCgst = parseFloat(String(item.cgst)) || (isInterState ? 0 : calculatedCgst);
    const finalSgst = parseFloat(String(item.sgst)) || (isInterState ? 0 : calculatedSgst);
    const finalIgst = parseFloat(String(item.igst)) || (isInterState ? calculatedIgst : 0);
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

  // Calculate totals
  const calcSubtotal = processedItems.reduce((sum, item) => sum + item.taxableAmt, 0);
  const calcCgstTotal = processedItems.reduce((sum, item) => sum + item.cgst, 0);
  const calcSgstTotal = processedItems.reduce((sum, item) => sum + item.sgst, 0);
  const calcIgstTotal = processedItems.reduce((sum, item) => sum + item.igst, 0);

  const subtotal = calcSubtotal > 0 ? calcSubtotal : (parseFloat(String(invoice.subtotal)) || 0);
  const cgstTotal = isInterState ? 0 : (calcCgstTotal > 0 ? calcCgstTotal : parseFloat(String(invoice.cgst || 0)));
  const sgstTotal = isInterState ? 0 : (calcSgstTotal > 0 ? calcSgstTotal : parseFloat(String(invoice.sgst || 0)));
  const igstTotal = isInterState ? (calcIgstTotal > 0 ? calcIgstTotal : parseFloat(String(invoice.igst || 0))) : 0;
  const grandTotal = parseFloat(String(invoice.grandTotal || invoice.total)) || (subtotal + cgstTotal + sgstTotal + igstTotal);

  // Create minimum 3 rows for fixed table height (reduced to ensure footer fits)
  const minRows = 3;
  const emptyRowsNeeded = Math.max(0, minRows - processedItems.length);

  // Generate item rows with simplified columns
  const itemRows = processedItems.map((item, idx) => {
    return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td class="product-cell">
          <div class="product-name">${item.productName || item.finishedProduct?.name || 'Product'}</div>
          ${item.finishedProduct?.gsm ? `<div class="product-detail">${item.finishedProduct.gsm} Shade</div>` : ''}
        </td>
        <td class="center">${item.hsnCode || '5608'}</td>
        <td class="right">${item.qty.toFixed(3)}KGS</td>
        <td class="right">${formatCurrency(item.rate)}</td>
        <td class="center">${item.gstPct.toFixed(2)}</td>
        <td class="right bold">${formatCurrency(item.totalAmt)}</td>
      </tr>
    `;
  }).join('');

  // Add empty rows to maintain fixed table height
  const emptyRows = Array(emptyRowsNeeded).fill(0).map(() => `
    <tr class="empty-row">
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>
  `).join('');

  // Default terms and conditions
  const termsAndConditions = invoice.termsAndConditions || [
    'Goods Once Sold Will Not Be Taken Back Or Exchanged.',
    'Interest Rate @24% P.A.If Payment Is Not Received Within Due Days.',
    'Our Responsibility Ceases Once Goods Leave Our Premises.',
    'Material Checked And Dispatched Under Our Strict Supervision.',
    'Subject to Mangrol Jurisdiction Only. E.&O.E',
  ];

  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice - ${invoice.invoiceNumber || invoice.code}</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      line-height: 1.25;
      color: #000;
      background: #fff;
    }
    
    .invoice-container {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 5mm;
      display: flex;
      flex-direction: column;
      border: 1px solid #000;
      overflow: hidden;
    }
    
    /* Main content area - grows to fill space */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    
    /* Header Section */
    .header {
      display: flex;
      border: 1px solid #000;
      margin-bottom: 3px;
      height: auto;
      flex-shrink: 0;
    }
    
    .header-left {
      flex: 1;
      padding: 4px;
      border-right: 1px solid #000;
    }
    
    .header-right {
      width: 180px;
      padding: 4px;
    }
    
    .company-name {
      font-size: 16px;
      font-weight: bold;
      color: #000;
      margin-bottom: 2px;
    }
    
    .company-details {
      font-size: 9px;
      line-height: 1.3;
    }
    
    .invoice-title {
      font-size: 12px;
      font-weight: bold;
      text-align: center;
      padding: 3px;
      border: 1px solid #000;
      margin-bottom: 3px;
    }
    
    .invoice-meta {
      font-size: 9px;
    }
    
    .invoice-meta table {
      width: 100%;
    }
    
    .invoice-meta td {
      padding: 2px;
    }
    
    /* Party Details */
    .party-section {
      display: flex;
      border: 1px solid #000;
      border-top: none;
      margin-bottom: 3px;
      height: auto;
      flex-shrink: 0;
    }
    
    .party-box {
      flex: 1;
      padding: 4px;
      font-size: 9px;
    }
    
    .party-box:first-child {
      border-right: 1px solid #000;
    }
    
    .party-title {
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .party-name {
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    /* Items Table - Outer Border Only */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      flex: 1;
      border: 1px solid #000;
    }
    
    .items-table th {
      background: #f0f0f0;
      padding: 5px 3px;
      text-align: center;
      font-weight: bold;
      font-size: 10px;
      border: 1px solid #000;
    }
    
    .items-table td {
      padding: 4px 3px;
      vertical-align: top;
      border: 1px solid #000;
    }
    
    .items-table tbody tr:first-child td {
      padding-top: 6px;
    }
    
    .items-table .center { text-align: center; }
    .items-table .right { text-align: right; }
    .items-table .bold { font-weight: bold; }
    
    .product-name {
      font-weight: bold;
      font-size: 10px;
    }
    
    .product-detail {
      font-size: 9px;
      color: #333;
    }
    
    .empty-row td {
      height: 16px;
    }
    
    /* Footer Section - Fixed at bottom */
    .footer-section {
      flex-shrink: 0;
      margin-top: auto;
    }
    
    /* Bank + Totals Row */
    .bank-totals-row {
      display: flex;
      border: 1px solid #000;
    }
    
    .bank-box {
      flex: 1;
      padding: 4px;
      border-right: 1px solid #000;
      font-size: 9px;
    }
    
    .bank-title {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 2px;
    }
    
    .totals-box {
      width: 180px;
      font-size: 9px;
    }
    
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .totals-table td {
      padding: 3px 5px;
      border-bottom: 1px solid #ccc;
    }
    
    .totals-table td:first-child {
      text-align: left;
    }
    
    .totals-table td:last-child {
      text-align: right;
      font-weight: bold;
    }
    
    .grand-total-row {
      background: #e8e8e8;
    }
    
    .grand-total-row td {
      font-size: 10px !important;
      font-weight: bold !important;
      border-bottom: none;
    }
    
    /* Bill Amount */
    .amount-row {
      border: 1px solid #000;
      border-top: none;
      padding: 4px;
      font-size: 9px;
      font-weight: bold;
    }
    
    /* GST Summary */
    .gst-summary {
      border: 1px solid #000;
      border-top: none;
    }
    
    .gst-title {
      font-weight: bold;
      padding: 3px 5px;
      font-size: 9px;
      background: #f5f5f5;
      border-bottom: 1px solid #000;
    }
    
    .gst-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    
    .gst-table th,
    .gst-table td {
      border: 1px solid #000;
      padding: 3px;
      text-align: center;
    }
    
    .gst-table th {
      background: #f0f0f0;
      font-weight: bold;
    }
    
    /* Terms & Signature */
    .terms-row {
      display: flex;
      border: 1px solid #000;
      border-top: none;
    }
    
    .terms-box {
      flex: 1;
      padding: 4px;
      font-size: 8px;
      border-right: 1px solid #000;
    }
    
    .terms-title {
      font-weight: bold;
      margin-bottom: 2px;
      font-size: 9px;
    }
    
    .terms-list {
      margin-left: 12px;
    }
    
    .terms-list li {
      margin-bottom: 1px;
    }
    
    .receiver-box {
      width: 120px;
      padding: 4px;
      text-align: center;
      font-size: 8px;
      border-right: 1px solid #000;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    
    .signature-box {
      width: 140px;
      padding: 4px;
      text-align: center;
      font-size: 8px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    
    .company-for {
      font-weight: bold;
      font-size: 9px;
    }
    
    .auth-sig {
      font-size: 8px;
      font-style: italic;
    }
    
    .page-info {
      font-size: 8px;
      text-align: right;
      margin-top: 3px;
    }
    
    /* Print Styles */
    @media print {
      body { 
        print-color-adjust: exact; 
        -webkit-print-color-adjust: exact; 
      }
      .invoice-container { 
        border: 1px solid #000;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <img src="${window.location.origin}/product-logo.png" alt="Logo" style="height: 40px; width: auto; object-fit: contain;" onerror="this.style.display='none'">
            <div>
              <div class="company-name">SHIV AGRONET</div>
              <div class="company-details">
                ${company.tagline}<br>
                ${company.address1}, ${company.address2}<br>
                ${company.city} - ${company.pincode}, ${company.district}, ${company.state}<br>
                Mo: ${company.mobile} | Email: ${company.email}<br>
                <strong>GSTIN:</strong> ${company.gstin} | <strong>State:</strong> ${companyStateName} (${company.stateCode})
              </div>
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="invoice-title">TAX INVOICE</div>
          <div class="invoice-meta">
            <table>
              <tr><td>Invoice No.:</td><td><strong>${invoice.invoiceNumber || invoice.code}</strong></td></tr>
              <tr><td>Date:</td><td><strong>${formatDate(invoice.invoiceDate || invoice.date || new Date())}</strong></td></tr>
              ${invoice.dueDate ? `<tr><td>Due Date:</td><td><strong>${formatDate(invoice.dueDate)}</strong></td></tr>` : ''}
              <tr><td>Type:</td><td><strong>${invoiceType}</strong></td></tr>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Party Details -->
      <div class="party-section">
        <div class="party-box">
          <div class="party-title">Bill To:</div>
          <div class="party-name">${invoice.customerName || invoice.customer?.name || 'Cash Customer'}</div>
          <div>
            ${invoiceType === 'B2B' ? `<strong>GSTIN:</strong> ${invoice.customerGST || invoice.customer?.gstNo || 'N/A'}<br>` : ''}
            <strong>State:</strong> ${customerStateName} (${customerStateCode})<br>
            <strong>Address:</strong> ${invoice.billingAddress || invoice.customer?.address || 'N/A'}
            ${invoice.customer?.phone ? `<br><strong>Phone:</strong> ${invoice.customer.phone}` : ''}
          </div>
        </div>
        <div class="party-box">
          <div class="party-title">Ship To:</div>
          <div class="party-name">${invoice.customerName || invoice.customer?.name || 'Same as Buyer'}</div>
          <div>
            <strong>Address:</strong> ${invoice.shippingAddress || invoice.billingAddress || invoice.customer?.address || 'Same as billing'}<br>
            <strong>Place of Supply:</strong> ${customerStateName} (${customerStateCode})
          </div>
        </div>
      </div>
      
      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 25px;">SrNo</th>
            <th>Product Name</th>
            <th style="width: 60px;">HSN/SAC</th>
            <th style="width: 80px;">Qty</th>
            <th style="width: 60px;">Rate</th>
            <th style="width: 45px;">GST %</th>
            <th style="width: 80px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${emptyRows}
        </tbody>
      </table>
    </div>
    
    <!-- Footer Section - Fixed at Bottom -->
    <div class="footer-section">
      <!-- Bank Details + Totals Row -->
      <div class="bank-totals-row">
        <div class="bank-box">
          <div class="bank-title">Bank Details for Payment:</div>
          <div>Bank Name: <strong>CANARA BANK</strong></div>
          <div>Account No.: <strong>125009110096</strong></div>
          <div>IFSC Code: <strong>CNRB0007368</strong></div>
          <div>Branch: <strong>Plot No.72-77, Bhaguraj Society, Simada Naka, Sarthana</strong></div>
        </div>
        <div class="totals-box">
          <table class="totals-table">
            <tr>
              <td>Sub Total</td>
              <td>${formatCurrency(subtotal)}</td>
            </tr>
            <tr>
              <td>Taxable Amount</td>
              <td>${formatCurrency(subtotal)}</td>
            </tr>
            ${isInterState ? `
            <tr>
              <td>IGST</td>
              <td>${formatCurrency(igstTotal)}</td>
            </tr>
            ` : `
            <tr>
              <td>CGST</td>
              <td>${formatCurrency(cgstTotal)}</td>
            </tr>
            <tr>
              <td>SGST</td>
              <td>${formatCurrency(sgstTotal)}</td>
            </tr>
            `}
            <tr class="grand-total-row">
              <td>Grand Total</td>
              <td>${formatCurrency(grandTotal)}</td>
            </tr>
          </table>
        </div>
      </div>
      
      <!-- Bill Amount in Words -->
      <div class="amount-row">
        Bill Amount: ${formatAmountInWords(grandTotal)}
      </div>
      
      <!-- GST Summary -->
      <div class="gst-summary">
        <div class="gst-title">GST Summary</div>
        <table class="gst-table">
          <thead>
            <tr>
              <th>Taxable Value</th>
              ${isInterState ? `
              <th>IGST Rate</th>
              <th>IGST Amount</th>
              ` : `
              <th>CGST Rate</th>
              <th>CGST Amount</th>
              <th>SGST Rate</th>
              <th>SGST Amount</th>
              `}
            </tr>
          </thead>
          <tbody>
            ${processedItems.length > 0 ? (() => {
      const gstSlabs = processedItems.reduce((acc, item) => {
        const rate = item.gstPct;
        if (!acc[rate]) {
          acc[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        }
        acc[rate].taxable += item.taxableAmt;
        acc[rate].cgst += item.cgst;
        acc[rate].sgst += item.sgst;
        acc[rate].igst += item.igst;
        return acc;
      }, {} as Record<number, { taxable: number; cgst: number; sgst: number; igst: number }>);

      return Object.entries(gstSlabs).map(([rate, data]) => `
                <tr>
                  <td>${formatCurrency(data.taxable)}</td>
                  ${isInterState ? `
                  <td>${rate}%</td>
                  <td>${formatCurrency(data.igst)}</td>
                  ` : `
                  <td>${(parseFloat(rate) / 2).toFixed(2)}%</td>
                  <td>${formatCurrency(data.cgst)}</td>
                  <td>${(parseFloat(rate) / 2).toFixed(2)}%</td>
                  <td>${formatCurrency(data.sgst)}</td>
                  `}
                </tr>
              `).join('');
    })() : ''}
          </tbody>
        </table>
      </div>
      
      <!-- Terms & Signature Row -->
      <div class="terms-row">
        <div class="terms-box">
          <div class="terms-title">Terms & Conditions:</div>
          <ol class="terms-list">
            <li>Goods Once Sold Will Not Be Taken Back Or Exchanged.</li>
            <li>Interest Rate @24% P.A.If Payment Is Not Received Within Due Days.</li>
            <li>Our Responsibility Ceases Once Goods Leave Our Premises.</li>
            <li>Material Checked And Dispatched Under Our Strict Supervision.</li>
            <li>Subject to Mangrol Jurisdiction Only. E.&O.E</li>
          </ol>
        </div>
        <div class="receiver-box">
          <div>(Receiver Signatory)</div>
        </div>
        <div class="signature-box">
          <div class="company-for" style="line-height: 1.2;">
            For, SHIV AGRONET
          </div>
          <div class="auth-sig">(Authorised Signatory)</div>
        </div>
      </div>
       <div class="page-info">Page: 01 Of 01</div>
    </div>
  </div>
</body>
</html>
  `;

  // Open print window
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
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

  const supplierStateCode = bill.supplier?.stateCode ||
    getStateCodeFromGSTIN(bill.supplier?.gstNo || '') ||
    company.stateCode;

  const isInterState = isInterStateSupply(supplierStateCode);
  const supplierStateName = getStateName(supplierStateCode);

  const subtotal = parseFloat(String(bill.subtotal || 0));
  const cgstTotal = parseFloat(String(bill.cgst || 0));
  const sgstTotal = parseFloat(String(bill.sgst || 0));
  const igstTotal = parseFloat(String(bill.igst || 0));
  const grandTotal = parseFloat(String(bill.grandTotal || 0));

  // Create minimum 10 rows for fixed table height
  const minRows = 10;
  const actualItems = bill.items || [];
  const emptyRowsNeeded = Math.max(0, minRows - actualItems.length);

  const itemRows = actualItems.map((item: any, idx: number) => {
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
        <td class="product-cell">
          <div class="product-name">${item.materialName || item.rawMaterial?.name || 'Material'}</div>
        </td>
        <td class="center">${item.hsnCode || '3901'}</td>
        <td class="right">${qty.toFixed(3)}KGS</td>
        <td class="right">${formatCurrency(rate)}</td>
        <td class="center">${gstPct.toFixed(2)}</td>
        <td class="right bold">${formatCurrency(total)}</td>
      </tr>
    `;
  }).join('');

  const emptyRows = Array(emptyRowsNeeded).fill(0).map(() => `
    <tr class="empty-row">
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>
  `).join('');

  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Bill - ${bill.code}</title>
  <style>
    @page { size: A4; margin: 5mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 10px; }
    .container { width: 210mm; min-height: 297mm; margin: 0 auto; border: 1px solid #000; padding: 5mm; }
    .header { display: flex; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
    .header-left { flex: 1; }
    .header-right { width: 180px; text-align: right; }
    .title { font-size: 16px; font-weight: bold; border: 1px solid #000; padding: 5px 15px; display: inline-block; }
    .company-name { font-size: 18px; font-weight: bold; }
    .parties { display: flex; gap: 15px; margin-bottom: 15px; }
    .party-box { flex: 1; border: 1px solid #000; padding: 10px; }
    .party-title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 8px; }
    .party-name { font-size: 12px; font-weight: bold; margin-bottom: 5px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    .items-table th { background: #f0f0f0; border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; }
    .items-table td { border: 1px solid #000; padding: 4px 3px; }
    .items-table .center { text-align: center; }
    .items-table .right { text-align: right; }
    .items-table .bold { font-weight: bold; }
    .product-cell { text-align: left; }
    .product-name { font-weight: bold; }
    .empty-row td { height: 20px; }
    .totals { width: 220px; margin-left: auto; margin-top: 10px; }
    .totals td { padding: 4px 5px; border: 1px solid #000; }
    .totals tr:last-child { background: #f0f0f0; font-weight: bold; }
    .amount-words { border: 1px solid #000; padding: 8px; margin-top: 10px; font-weight: bold; }
    @media print { .container { border: 1px solid #000; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="company-name">${company.name}</div>
        <div style="font-size: 9px; margin-top: 5px;">
          ${company.address1}, ${company.address2}<br>
          ${company.city} - ${company.pincode}<br>
          GSTIN: ${company.gstin}
        </div>
      </div>
      <div class="header-right">
        <div class="title">PURCHASE BILL</div>
        <div style="margin-top: 10px; font-size: 10px;">
          <div><strong>Bill No.:</strong> ${bill.code}</div>
          <div><strong>Date:</strong> ${formatDate(bill.date)}</div>
          <div><strong>Supplier Invoice:</strong> ${bill.invoiceNumber || 'N/A'}</div>
        </div>
      </div>
    </div>
    
    <div class="parties">
      <div class="party-box">
        <div class="party-title">Supplier Details</div>
        <div class="party-name">${bill.supplier?.name || 'Supplier'}</div>
        <div style="font-size: 9px;">
          ${bill.supplier?.gstNo ? `<div><strong>GSTIN:</strong> ${bill.supplier.gstNo}</div>` : ''}
          <div><strong>State:</strong> ${supplierStateName}</div>
          <div><strong>Address:</strong> ${bill.supplier?.address || 'N/A'}</div>
        </div>
      </div>
      <div class="party-box">
        <div class="party-title">Delivery Details</div>
        <div class="party-name">${company.name}</div>
        <div style="font-size: 9px;">
          <div><strong>Address:</strong> ${company.address1}, ${company.city}</div>
        </div>
      </div>
    </div>
    
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">SrNo</th>
          <th style="min-width: 200px;">Product Name</th>
          <th style="width: 70px;">HSN/SAC</th>
          <th style="width: 90px;">Qty</th>
          <th style="width: 70px;">Rate</th>
          <th style="width: 50px;">GST %</th>
          <th style="width: 90px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${emptyRows}
      </tbody>
    </table>
    
    <table class="totals">
      <tr><td>Sub Total</td><td style="text-align: right;">${formatCurrency(subtotal)}</td></tr>
      ${isInterState ? `
      <tr><td>IGST</td><td style="text-align: right;">${formatCurrency(igstTotal)}</td></tr>
      ` : `
      <tr><td>CGST</td><td style="text-align: right;">${formatCurrency(cgstTotal)}</td></tr>
      <tr><td>SGST</td><td style="text-align: right;">${formatCurrency(sgstTotal)}</td></tr>
      `}
      <tr><td>Grand Total</td><td style="text-align: right;">${formatCurrency(grandTotal)}</td></tr>
    </table>
    
    <div class="amount-words">
      Amount in Words: ${formatAmountInWords(grandTotal)}
    </div>
  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}
