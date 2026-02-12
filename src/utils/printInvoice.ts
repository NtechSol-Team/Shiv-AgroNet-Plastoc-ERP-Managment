/**
 * GST-Compliant Invoice Printing Utility
 * 
 * Generates professional Tax Invoices compliant with Indian GST regulations.
 * A4 Size (210mm x 297mm) format with fixed layout.
 * Big4 Style Professional Format: Clean, Simplified Main Table, Detailed GST Summary.
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

    // Calculate tax amounts
    const cgstPct = isInterState ? 0 : gstPct / 2;
    const sgstPct = isInterState ? 0 : gstPct / 2;
    const igstPct = isInterState ? gstPct : 0;

    const calculatedCgst = taxableAmt * cgstPct / 100;
    const calculatedSgst = taxableAmt * sgstPct / 100;
    const calculatedIgst = taxableAmt * igstPct / 100;
    const totalTaxAmt = calculatedCgst + calculatedSgst + calculatedIgst;

    const totalAmt = taxableAmt + totalTaxAmt;

    return {
      ...item,
      qty,
      rate,
      discountAmt,
      taxableAmt, // Taxable Value
      gstPct,
      totalTaxAmt, // Total Tax Amount
      cgstPct, sgstPct, igstPct,
      cgstAmt: calculatedCgst,
      sgstAmt: calculatedSgst,
      igstAmt: calculatedIgst,
      totalAmt
    };
  });

  // Calculate totals
  const totalTaxable = processedItems.reduce((sum, item) => sum + item.taxableAmt, 0);
  const totalTax = processedItems.reduce((sum, item) => sum + item.totalTaxAmt, 0);
  const totalDiscount = processedItems.reduce((sum, item) => sum + item.discountAmt, 0);

  const grandTotal = totalTaxable + totalTax;
  const roundOff = Math.round(grandTotal) - grandTotal;
  const finalGrandTotal = Math.round(grandTotal);

  // Group by HSN for GST Summary
  const hsnSummary: Record<string, any> = {};
  processedItems.forEach(item => {
    const hsn = item.hsnCode || 'General';
    if (!hsnSummary[hsn]) {
      hsnSummary[hsn] = {
        hsn,
        taxable: 0,
        cgst: 0, sgst: 0, igst: 0,
        cgstRate: item.cgstPct, sgstRate: item.sgstPct, igstRate: item.igstPct
      };
    }
    hsnSummary[hsn].taxable += item.taxableAmt;
    hsnSummary[hsn].cgst += item.cgstAmt;
    hsnSummary[hsn].sgst += item.sgstAmt;
    hsnSummary[hsn].igst += item.igstAmt;
  });
  const summaryRows = Object.values(hsnSummary);

  // Default terms
  const terms = invoice.termsAndConditions || [
    'Goods once sold will not be taken back.',
    'Interest @24% p.a. will be charged if payment is not made within due date.',
    'Subject to ' + company.city + ' Jurisdiction only.'
  ];

  const logoUrl = `${window.location.origin}/product-logo.png`;

  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${invoice.invoiceNumber || invoice.code}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    @page { size: A4; margin: 10mm; }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.3;
      color: #111;
      background: #fff;
      margin: 0; padding: 0;
      width: 190mm; height: 277mm;
      position: relative;
    }

    .container {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      border: 1px solid #333;
    }

    /* Formatting */
    .row { display: flex; width: 100%; }
    .col { flex: 1; padding: 5px; }
    .border-bottom { border-bottom: 1px solid #333; }
    .border-right { border-right: 1px solid #333; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-bold { font-weight: 700; }
    .uppercase { text-transform: uppercase; }
    .small-text { font-size: 7.5pt; color: #444; }
    
    /* Header */
    .header { padding: 12px; min-height: 100px; display: flex; align-items: flex-start; }
    .company-title { font-size: 18pt; font-weight: 800; letter-spacing: 0.5px; color: #000; margin-bottom: 5px; line-height: 1.1; }
    .invoice-badge { 
      border: 1px solid #000; padding: 4px 12px; font-weight: bold; 
      text-transform: uppercase; letter-spacing: 1px; font-size: 10pt;
      display: inline-block; margin-bottom: 5px; background: #f0f0f0;
    }

    /* 3-Col Grid */
    .info-grid { display: grid; grid-template-columns: 1.2fr 1.4fr 1.4fr; border-bottom: 1px solid #333; }
    .info-col { padding: 10px; border-right: 1px solid #333; overflow-wrap: break-word; }
    .info-col:last-child { border-right: none; }
    .info-label { font-size: 7pt; color: #555; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
    .info-val { font-size: 9pt; font-weight: 600; margin-bottom: 8px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; }
    th { background: #f4f4f4; color: #000; padding: 6px 4px; font-weight: 700; font-size: 8pt; border: 1px solid #000; }
    td { padding: 5px 4px; border-right: 1px solid #000; border-left: 1px solid #000; vertical-align: top; }
    
    .items-table th { text-align: center; border-bottom: 1px solid #000; }
    
    /* Remove horizontal borders for item rows to create column-only look */
    .items-table tbody td {
      border-bottom: none;
      border-top: none;
    }
    
    /* Ensure last row of spacers has a bottom border if it touches GST summary, 
       but GST summary has its own top border. We can just let GST summary handle it. */

    .items-table td { font-size: 9pt; }
    
    /* GST Summary Table - Keep full grid */
    .gst-table th { font-size: 7pt; border: 1px solid #000; }
    .gst-table td { font-size: 8pt; border: 1px solid #000; }

    /* Totals Section */
    .totals-section { display: flex; border-top: 1px solid #000; }
    .terms-box { flex: 1.5; padding: 10px; border-right: 1px solid #000; }
    .totals-box { flex: 1; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 10px; }
    .grand-total { background: #e8e8e8; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 8px 10px; font-weight: 800; font-size: 11pt; }

    /* Footer */
    .footer { margin-top: auto; border-top: 1px solid #000; }
    .signatory-box { height: 70px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; padding: 10px; }
    
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>

  <div class="container">
    <!-- Header -->
    <div class="header row border-bottom">
      <!-- Logo -->
      <div style="margin-right: 15px; display: flex; align-items: center;">
         <img src="${logoUrl}" style="height: 70px; width: auto; object-fit: contain;" onerror="this.style.display='none'">
      </div>
      
      <!-- Company Details -->
      <div style="flex: 2; display: flex; flex-direction: column; justify-content: center;">
         <div class="company-title uppercase" style="font-size: 16pt; margin-bottom: 2px;">${company.name}</div>
         <div class="small-text" style="line-height: 1.3;">
           ${company.address1}, ${company.address2}<br>
           ${company.city} - ${company.pincode}, ${company.state}<br>
           GSTIN: <strong>${company.gstin}</strong> | Mobile: <strong>${company.mobile}</strong>
         </div>
      </div>

      <!-- Invoice Badge -->
      <div style="flex: 1; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start;">
        <div class="invoice-badge" style="margin-top: 5px;">${invoiceType === 'B2B' ? 'Tax Invoice' : 'Bill of Supply'}</div>
        <div class="small-text">Original for Recipient</div>
      </div>
    </div>

    <!-- Details Grid -->
    <div class="info-grid">
      <div class="info-col">
        <div class="info-label">Invoice Details</div>
        <div class="info-val">No: ${invoice.invoiceNumber || invoice.code}</div>
        <div class="info-val">Date: ${formatDate(invoice.invoiceDate || invoice.date || new Date())}</div>
        <div class="info-val">Place: ${customerStateName}</div>
      </div>
      <div class="info-col">
        <div class="info-label">Bill To</div>
        <div class="info-val">${invoice.customerName || invoice.customer?.name || 'Cash Customer'}</div>
        <div class="small-text">
          ${invoice.billingAddress || invoice.customer?.address || ''}<br>
          GSTIN: <strong>${invoice.customerGST || invoice.customer?.gstNo || 'Unregistered'}</strong>
        </div>
      </div>
      <div class="info-col">
        <div class="info-label">Ship To</div>
        <div class="info-val">${invoice.customerName || invoice.customer?.name || 'Same as Buyer'}</div>
        <div class="small-text">
          ${invoice.shippingAddress || invoice.billingAddress || invoice.customer?.address || ''}
        </div>
      </div>
    </div>

    <!-- Main Items Table -->
    <div style="flex: 1; display: flex; flex-direction: column;">
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 30px;">Sr</th>
            <th style="text-align: left;">Item & Description</th>
            <th style="width: 60px;">HSN/SAC</th>
            <th style="width: 50px;">Qty</th>
            <th style="width: 60px;">Rate</th>
            <th style="width: 50px;">Disc</th>
            <th style="width: 70px;">Taxable</th>
            <th style="width: 70px;">Tax Amt</th>
            <th style="width: 80px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${processedItems.map((item, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td><div class="text-bold">${item.productName || item.finishedProduct?.name || 'Item'}</div></td>
              <td class="text-center small-text">${item.hsnCode || '5608'}</td>
              <td class="text-right text-bold">${item.qty.toFixed(2)}</td>
              <td class="text-right">${formatCurrency(item.rate)}</td>
              <td class="text-right text-center">${item.discountAmt > 0 ? formatCurrency(item.discountAmt) : '-'}</td>
              <td class="text-right">${formatCurrency(item.taxableAmt)}</td>
              <td class="text-right small-text">${formatCurrency(item.totalTaxAmt)}<br><span style="font-size:6pt">(${item.gstPct}%)</span></td>
              <td class="text-right text-bold">${formatCurrency(item.totalAmt)}</td>
            </tr>
          `).join('')}
          
          <!-- Spacer Rows to Fill Page - Increased to 18 to fill vertical space -->
           ${Array(Math.max(0, 18 - processedItems.length)).fill(0).map(() => `
            <tr style="height: 25px;">
               <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
               <td style="border-right: 1px solid #000; border-top: none; border-bottom: none;">&nbsp;</td>
            </tr>`).join('')}
          
          <!-- Final Bottom Border -->
          <tr style="height: 1px; line-height: 0;">
             <td style="border-top: 1px solid #000; padding: 0;" colspan="9"></td>
          </tr>
        </tbody>
      </table>

      <!-- GST Summary (Attached directly below) -->
      <div>
        <div style="padding: 4px 8px; background: #e0e0e0; font-weight: 700; font-size: 8pt; border: 1px solid #000; border-top: none; border-bottom: none;">GST Summary</div>
        <table class="gst-table" style="border: 1px solid #000; border-top: 1px solid #000;">
          <thead>
            <tr>
              <th rowspan="2">HSN/SAC</th>
              <th rowspan="2">Taxable Value</th>
              ${isInterState ?
      `<th colspan="2">IGST</th>` :
      `<th colspan="2">CGST</th><th colspan="2">SGST</th>`
    }
              <th rowspan="2">Total Tax</th>
            </tr>
            <tr>
              ${isInterState ?
      `<th>Rate</th><th>Amount</th>` :
      `<th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th>`
    }
            </tr>
          </thead>
          <tbody>
            ${summaryRows.map(row => `
              <tr>
                <td class="text-center">${row.hsn}</td>
                <td class="text-right">${formatCurrency(row.taxable)}</td>
                ${isInterState ? `
                  <td class="text-center">${row.igstRate}%</td>
                  <td class="text-right">${formatCurrency(row.igst)}</td>
                ` : `
                  <td class="text-center">${row.cgstRate}%</td>
                  <td class="text-right">${formatCurrency(row.cgst)}</td>
                  <td class="text-center">${row.sgstRate}%</td>
                  <td class="text-right">${formatCurrency(row.sgst)}</td>
                `}
                <td class="text-right text-bold">${formatCurrency(row.cgst + row.sgst + row.igst)}</td>
              </tr>
            `).join('')}
            <!-- Summary Total Row -->
             <tr style="background: #f9f9f9; font-weight: bold;">
                <td class="text-right">Total</td>
                <td class="text-right">${formatCurrency(totalTaxable)}</td>
                ${isInterState ? `
                  <td></td><td class="text-right">${formatCurrency(totalTax)}</td>
                ` : `
                   <td></td><td class="text-right">${formatCurrency(summaryRows.reduce((a, b) => a + b.cgst, 0))}</td>
                   <td></td><td class="text-right">${formatCurrency(summaryRows.reduce((a, b) => a + b.sgst, 0))}</td>
                `}
                <td class="text-right">${formatCurrency(totalTax)}</td>
             </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Totals & Info -->
    <div class="totals-section">
       <div class="terms-box">
          <div class="info-label">Total in Words</div>
          <div class="text-bold uppercase" style="font-size: 9pt; margin-bottom: 10px;">${formatAmountInWords(finalGrandTotal)}</div>

          <div class="info-label">Bank Details</div>
          <div class="small-text">
            Bank: <strong>${company.bankDetails.bankName}</strong><br>
            A/c No: <strong>${company.bankDetails.accountNumber}</strong><br>
            IFSC: <strong>${company.bankDetails.ifscCode}</strong><br>
            Branch: <strong>${company.bankDetails.branchName || 'Surat'}</strong>
          </div>
          
          <div class="info-label" style="margin-top: 8px;">Terms</div>
          <div class="small-text" style="font-style: italic;">
             ${terms[0]} <br> Subject to ${company.city} Jurisdiction.
          </div>
       </div>
       <div class="totals-box">
          <div class="total-row">
            <span>Taxable Amount</span>
            <span>${formatCurrency(totalTaxable)}</span>
          </div>
          <div class="total-row">
            <span>Total Tax</span>
            <span>${formatCurrency(totalTax)}</span>
          </div>
          ${totalDiscount > 0 ? `
          <div class="total-row">
            <span>Discount</span>
            <span>-${formatCurrency(totalDiscount)}</span>
          </div>` : ''}
          <div class="total-row">
            <span>Round Off</span>
            <span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span>
          </div>
          <div class="grand-total row" style="justify-content: space-between;">
            <span>GRAND TOTAL</span>
            <span>${formatCurrency(finalGrandTotal)}</span>
          </div>
          <div class="signatory-box">
             <div class="small-text">For, <strong>${company.legalName}</strong></div>
             <div style="font-weight: bold; font-size: 8pt;">Authorized Signatory</div>
          </div>
       </div>
    </div>
    
  </div>
  
  <script>
    window.onload = function() {
      setTimeout(() => { window.print(); }, 500);
    }
  </script>

</body>
</html>
  `;

  // Open in new window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
  } else {
    alert('Pop-up blocked! Please allow pop-ups for this site.');
  }
}
