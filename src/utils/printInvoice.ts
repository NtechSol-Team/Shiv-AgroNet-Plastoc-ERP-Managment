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

function escapeHtml(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineText(input: unknown, fallback = '-'): string {
  const raw = String(input ?? '').trim();
  if (!raw) return fallback;
  return escapeHtml(raw).replace(/\r?\n/g, '<br>');
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
    pieceCount?: number | string;
    batchCode?: string;
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

  const placeOfSupplyLabel = invoice.placeOfSupply
    ? `${getStateName(invoice.placeOfSupply)} (${invoice.placeOfSupply})`
    : `${customerStateName} (${customerStateCode || company.stateCode})`;

  const customerGstin = invoice.customerGST || invoice.customer?.gstNo || '';
  const reverseChargeText = 'No'; // Default: No reverse charge applicable

  const billToName = (invoice.customerName || invoice.customer?.name || 'Cash Customer').trim();
  const billToAddress = invoice.billingAddress || invoice.customer?.address || '';
  const shipToName = (invoice.customerName || invoice.customer?.name || 'Same as Buyer').trim();
  const shipToAddress = invoice.shippingAddress || billToAddress || invoice.customer?.address || '';

  const invoiceNo = (invoice.invoiceNumber || invoice.code || '').trim();
  const invoiceDate = formatDate(invoice.invoiceDate || invoice.date || new Date());
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : '';
  const supplyTypeText = isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)';

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
      totalAmt,
      pieceCount: item.pieceCount,
      batchCode: item.batchCode, // Pass through batch code
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice - ${escapeHtml(invoiceNo || 'Invoice')}</title>
    <style>
        :root {
            --primary-color: #333;
            --border-color: #b0b0b0;
            --bg-light: #f9f9f9;
        }

        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: #ddd; margin: 0; padding: 20px; }

        /* A4 Paper Styling */
        .invoice-container {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 15mm;
            border: 1px solid var(--border-color);
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }

        /* Header Section */
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .header-table td { vertical-align: top; }
        
        .logo { max-width: 150px; margin-bottom: 10px; }
        .company-name { font-size: 20px; font-weight: bold; text-transform: uppercase; }
        .invoice-title { 
            text-align: right; 
            font-size: 24px; 
            font-weight: bold; 
            color: var(--primary-color);
            text-transform: uppercase;
        }
        .compliance-text { text-align: right; font-size: 11px; color: #555; }

        /* Meta Info Grid */
        .meta-section { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            border: 1px solid var(--border-color);
            margin-bottom: 15px;
        }
        .meta-box { padding: 8px; border-right: 1px solid var(--border-color); }
        .meta-box:last-child { border-right: none; }
        .label { font-size: 11px; font-weight: bold; color: #666; display: block; }
        .value { font-size: 13px; font-weight: 500; }

        /* Address Section */
        .address-section { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            border: 1px solid var(--border-color); 
            border-top: none;
            margin-bottom: 15px;
        }
        .address-box { padding: 10px; border-right: 1px solid var(--border-color); }
        .address-box:last-child { border-right: none; }

        /* Main Item Table */
        .items-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 10px;
            table-layout: fixed;
        }
        .items-table th { 
            background: var(--bg-light); 
            border: 1px solid var(--border-color); 
            padding: 6px; 
            font-size: 11px; 
            text-align: center;
        }
        .items-table td { 
            border: 1px solid var(--border-color); 
            padding: 8px; 
            font-size: 12px;
            vertical-align: top;
        }

        /* Totals & Summary */
        .summary-wrapper { display: flex; justify-content: space-between; margin-top: 10px; }
        .bank-details { width: 55%; border: 1px solid var(--border-color); padding: 10px; }
        .totals-box { width: 40%; }
        
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        .grand-total { 
            border-top: 2px solid #000; 
            margin-top: 5px; 
            padding-top: 5px; 
            font-weight: bold; 
            font-size: 16px; 
        }

        /* Footer */
        .declaration { font-size: 10px; color: #444; margin-top: 20px; line-height: 1.4; }
        .signature-section { 
            margin-top: 30px; 
            text-align: right; 
        }
        .sig-box { 
            display: inline-block; 
            width: 250px; 
            text-align: center; 
            font-size: 12px;
        }

        /* Print Optimization */
        @media print {
            body { background: none; padding: 0; }
            .invoice-container { box-shadow: none; border: none; width: 100%; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>

<div class="invoice-container">
    <table class="header-table">
        <tr>
            <td>
                <!-- Logo optional -->
                <img class="logo" src="${logoUrl}" onerror="this.style.display='none'" alt="Logo" style="max-height: 80px; width: auto; max-width: 150px; margin-bottom: 10px; display: block;">
                <div class="company-name">${escapeHtml(company.legalName || company.name)}</div>
                <div class="value">${formatMultilineText(`${company.address1}${company.address2 ? `, ${company.address2}` : ''}\n${company.city} - ${company.pincode}, ${company.state}`, '')}</div>
                <div class="value"><strong>GSTIN:</strong> ${escapeHtml(company.gstin)} | <strong>PAN:</strong> ${escapeHtml(company.pan)}</div>
                <div class="value"><strong>State:</strong> ${escapeHtml(company.stateName)} (Code: ${escapeHtml(company.stateCode)})</div>
                <div class="value"><strong>Mobile:</strong> ${escapeHtml(company.mobile)} | <strong>UDYAM:</strong> ${escapeHtml(company.udyamRegistration)}</div>
            </td>
            <td>
                <div class="invoice-title">${invoiceType === 'B2B' ? 'Tax Invoice' : 'Bill of Supply'}</div>
                <div class="compliance-text">(Issued under Rule 46 of the CGST Rules, 2017)</div>
            </td>
        </tr>
    </table>

    <div class="meta-section">
        <div class="meta-box">
            <span class="label">Invoice Number</span>
            <span class="value">${escapeHtml(invoiceNo || '-')}</span>
        </div>
        <div class="meta-box">
            <span class="label">Invoice Date</span>
            <span class="value">${escapeHtml(invoiceDate)}</span>
        </div>
        <div class="meta-box">
            <span class="label">Place of Supply</span>
            <span class="value">${escapeHtml(placeOfSupplyLabel)}</span>
        </div>
        <div class="meta-box">
            <span class="label">Reverse Charge Applicable</span>
            <span class="value">${reverseChargeText}</span>
        </div>
    </div>

    <div class="address-section">
        <div class="address-box">
            <span class="label">Bill To:</span>
            <div class="value"><strong>${escapeHtml(billToName || '-')}</strong></div>
            <div class="value">${formatMultilineText(billToAddress, '-')}</div>
            <div class="value"><strong>GSTIN:</strong> ${escapeHtml(customerGstin || 'Unregistered')}</div>
            <div class="value"><strong>State:</strong> ${escapeHtml(customerStateName)} (Code: ${escapeHtml(customerStateCode || 'NA')})</div>
        </div>
        <div class="address-box">
            <span class="label">Ship To:</span>
            <div class="value"><strong>${escapeHtml(shipToName || '-')}</strong></div>
            <div class="value">${formatMultilineText(shipToAddress, '-')}</div>
            <div class="value"><strong>State:</strong> ${escapeHtml(customerStateName)} (Code: ${escapeHtml(customerStateCode || 'NA')})</div>
        </div>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 5%;">Sr.</th>
                <th style="width: 30%;">Description of Goods / Services</th>
                <th style="width: 10%;">HSN/SAC</th>
                <th style="width: 8%;">Qty</th>
                <th style="width: 10%;">Rate</th>
                <th style="width: 12%;">Taxable Val.</th>
                ${!isInterState ? `
                <th style="width: 12%;">CGST</th>
                <th style="width: 12%;">SGST</th>
                ` : `
                <th style="width: 24%;">IGST</th>
                `}
                <th style="width: 15%;">Total</th>
            </tr>
        </thead>
        <tbody>
            ${processedItems.map((item, idx) => `
            <tr>
                <td align="center">${idx + 1}</td>
                <td><strong>${escapeHtml(item.batchCode ? item.batchCode + ' - ' + (item.finishedProduct?.name || 'Item') : (item.productName || item.finishedProduct?.name || 'Item'))}</strong>${item.pieceCount ? `<br><small>(${escapeHtml(String(Math.round(Number(item.pieceCount))))} pcs)</small>` : ''}</td>
                <td align="center">${escapeHtml(item.hsnCode || '5608')}</td>
                <td align="center">${escapeHtml(item.qty.toFixed(2))} ${escapeHtml(String(item.unit || 'Kg'))}</td>
                <td align="right">${formatCurrency(item.rate)}</td>
                <td align="right">${formatCurrency(item.taxableAmt)}</td>
                ${!isInterState ? `
                <td align="right">${item.cgstPct}%<br><small>${formatCurrency(item.cgstAmt)}</small></td>
                <td align="right">${item.sgstPct}%<br><small>${formatCurrency(item.sgstAmt)}</small></td>
                ` : `
                <td align="right">${item.igstPct}%<br><small>${formatCurrency(item.igstAmt)}</small></td>
                `}
                <td align="right">${formatCurrency(item.totalAmt)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="summary-wrapper">
        <div class="bank-details">
            <span class="label">Bank Account Details:</span>
            <div class="value"><strong>Bank Name:</strong> ${escapeHtml(company.bankDetails?.bankName || '')}</div>
            <div class="value"><strong>A/c Name:</strong> ${escapeHtml(company.bankDetails?.accountHolder || '')}</div>
            <div class="value"><strong>A/c No:</strong> ${escapeHtml(company.bankDetails?.accountNumber || '')}</div>
            <div class="value"><strong>IFSC:</strong> ${escapeHtml(company.bankDetails?.ifscCode || '')}</div>
            <div class="value"><strong>Branch:</strong> ${escapeHtml(company.bankDetails?.branchName || '')}</div>
            
            ${invoice.transportDetails || invoice.vehicleNumber || invoice.eWayBillNo || invoice.remarks ? `
            <div style="margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px;">
                <span class="label">Transport / Remarks:</span>
                ${invoice.transportDetails ? `<div class="value"><strong>Transport:</strong> ${formatMultilineText(invoice.transportDetails)}</div>` : ''}
                ${invoice.vehicleNumber ? `<div class="value"><strong>Vehicle No:</strong> <span class="mono">${escapeHtml(invoice.vehicleNumber)}</span></div>` : ''}
                ${invoice.eWayBillNo ? `<div class="value"><strong>E-Way No:</strong> <span class="mono">${escapeHtml(invoice.eWayBillNo)}</span></div>` : ''}
                ${invoice.remarks ? `<div class="value"><strong>Remarks:</strong> ${formatMultilineText(invoice.remarks)}</div>` : ''}
            </div>
            ` : ''}
        </div>
        
        <div class="totals-box">
            <div class="total-row"><span>Total Taxable Value:</span><span>${formatCurrency(totalTaxable)}</span></div>
            ${!isInterState ? `
            <div class="total-row"><span>Total CGST:</span><span>${formatCurrency(summaryRows.reduce((a, b) => a + b.cgst, 0))}</span></div>
            <div class="total-row"><span>Total SGST:</span><span>${formatCurrency(summaryRows.reduce((a, b) => a + b.sgst, 0))}</span></div>
            ` : `
            <div class="total-row"><span>Total IGST:</span><span>${formatCurrency(summaryRows.reduce((a, b) => a + b.igst, 0))}</span></div>
            `}
            ${totalDiscount > 0 ? `<div class="total-row"><span>Total Discount:</span><span>-${formatCurrency(totalDiscount)}</span></div>` : ''}
            <div class="total-row"><span>Round Off:</span><span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>Grand Total:</span><span>₹ ${formatCurrency(finalGrandTotal)}</span></div>
            
            <div style="margin-top: 10px;">
                <span class="label">Amount in Words:</span>
                <div class="value"><em>${escapeHtml(formatAmountInWords(finalGrandTotal))}</em></div>
            </div>
        </div>
    </div>

    <div class="declaration">
        <strong>Terms & Conditions:</strong>
        <ol>
            ${terms.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
        </ol>
        <p><strong>Declaration:</strong> We hereby declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.</p>
    </div>

    <div class="signature-section">
        <div class="sig-box">
            For <strong>${escapeHtml(company.legalName || company.name)}</strong>
            <br><br><br><br>
            Authorized Signatory
        </div>
    </div>
</div>

<div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer; background-color: #333; color: #fff; border: none; border-radius: 4px; font-weight: bold;">Print Invoice</button>
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
