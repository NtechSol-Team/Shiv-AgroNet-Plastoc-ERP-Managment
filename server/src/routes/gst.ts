import { Router, Request, Response } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';
import { db } from '../db/index';
import { salesInvoices, purchaseBills } from '../db/schema';
import { and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

const GST_API_URL = 'https://my.gstzen.in/api/gstin-validator/';
const API_TOKEN = process.env.GSTZEN_API_TOKEN;

interface GstZenResponse {
    status: number;
    gstin: string;
    valid: boolean;
    company_details?: {
        legal_name: string;
        trade_name: string;
        company_status: string;
        pan: string;
        state: string;
        state_info: {
            code: string;
            name: string;
            alpha_code: string;
        };
        registration_date: string;
        gst_type: string;
        pradr: {
            addr: string;
            loc: string;
            pincode: string;
            street: string;
        };
    };
    message?: string;
}

// ============================================================
// GST SEARCH (EXISTING)
// ============================================================
router.get('/search', async (req: Request, res: Response, next: Function) => {
    try {
        const { gstin } = req.query;

        if (!gstin || typeof gstin !== 'string') {
            throw createError('GSTIN is required', 400);
        }

        if (!API_TOKEN) {
            throw createError('GSTZen API Token is not configured', 500);
        }

        console.log(`fetching GST data for ${gstin} via GSTZen`);

        const response = await fetch(GST_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Token': API_TOKEN
            },
            body: JSON.stringify({ gstin })
        });

        if (!response.ok) {
            console.error('GSTZen API Error:', response.status, response.statusText);
            throw createError('Failed to fetch GST details from GSTZen API', response.status);
        }

        const data = await response.json() as GstZenResponse;

        if (data.status === 0) {
            throw createError(data.message || 'GSTZen API Error', 400);
        }

        if (!data.valid) {
            throw createError('Invalid GSTIN', 400);
        }

        if (!data.company_details) {
            throw createError('No company details found for this GSTIN', 404);
        }

        const details = data.company_details;

        const mappedData = {
            name: details.trade_name || details.legal_name,
            gstin: data.gstin,
            stateCode: details.state_info?.code,
            address: `${details.pradr.addr}, ${details.pradr.street}, ${details.pradr.loc}, ${details.pradr.pincode}`,
            status: details.company_status,
            taxpayerType: details.gst_type,
            gstVerifiedAt: new Date().toISOString()
        };

        res.json(successResponse(mappedData));

    } catch (error) {
        next(error);
    }
});

// ============================================================
// GST DASHBOARD SUMMARY
// ============================================================

/**
 * GET /gst/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns read-only aggregated GST summary.
 * Uses only stored GST values — no re-computation of business logic.
 */
router.get('/dashboard', async (req: Request, res: Response, next: Function) => {
    try {
        const now = new Date();
        // Default: current calendar month
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : defaultStart;
        const endDate = req.query.endDate
            ? new Date((req.query.endDate as string) + 'T23:59:59')
            : defaultEnd;

        // ---- OUTPUT GST (Confirmed sales invoices in range) ----
        const [salesAgg] = await db
            .select({
                totalSales: sql<string>`COALESCE(SUM(grand_total::numeric), 0)`,
                totalCgst: sql<string>`COALESCE(SUM(cgst::numeric), 0)`,
                totalSgst: sql<string>`COALESCE(SUM(sgst::numeric), 0)`,
                totalIgst: sql<string>`COALESCE(SUM(igst::numeric), 0)`,
                totalOutputGst: sql<string>`COALESCE(SUM(cgst::numeric + sgst::numeric + igst::numeric), 0)`,
            })
            .from(salesInvoices)
            .where(and(
                sql`${salesInvoices.status} = 'Confirmed'`,
                gte(salesInvoices.invoiceDate, startDate),
                lte(salesInvoices.invoiceDate, endDate)
            ));

        // ---- PURCHASE GST (All purchase bills in range) ----
        const [purchaseAgg] = await db
            .select({
                totalPurchaseGst: sql<string>`COALESCE(SUM(cgst::numeric + sgst::numeric + igst::numeric), 0)`,
                eligibleITC: sql<string>`COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN cgst::numeric + sgst::numeric + igst::numeric ELSE 0 END), 0)`,
                ineligibleITC: sql<string>`COALESCE(SUM(CASE WHEN status != 'Confirmed' THEN cgst::numeric + sgst::numeric + igst::numeric ELSE 0 END), 0)`,
            })
            .from(purchaseBills)
            .where(and(
                gte(purchaseBills.date, startDate),
                lte(purchaseBills.date, endDate)
            ));

        const outputGst = parseFloat(salesAgg.totalOutputGst || '0');
        const eligibleITC = parseFloat(purchaseAgg.eligibleITC || '0');
        const netGstPayable = outputGst - eligibleITC;

        // ---- MONTHLY TRENDS — last 12 months ----
        const twelveMonthsAgo = new Date(now);
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

        const salesMonthly = await db
            .select({
                month: sql<string>`TO_CHAR(invoice_date, 'YYYY-MM')`,
                outputGst: sql<string>`COALESCE(SUM(cgst::numeric + sgst::numeric + igst::numeric), 0)`,
                cgst: sql<string>`COALESCE(SUM(cgst::numeric), 0)`,
                sgst: sql<string>`COALESCE(SUM(sgst::numeric), 0)`,
                igst: sql<string>`COALESCE(SUM(igst::numeric), 0)`,
            })
            .from(salesInvoices)
            .where(and(
                sql`${salesInvoices.status} = 'Confirmed'`,
                gte(salesInvoices.invoiceDate, twelveMonthsAgo)
            ))
            .groupBy(sql`TO_CHAR(invoice_date, 'YYYY-MM')`)
            .orderBy(sql`TO_CHAR(invoice_date, 'YYYY-MM') ASC`);

        const purchaseMonthly = await db
            .select({
                month: sql<string>`TO_CHAR(date, 'YYYY-MM')`,
                purchaseGst: sql<string>`COALESCE(SUM(cgst::numeric + sgst::numeric + igst::numeric), 0)`,
                eligibleGst: sql<string>`COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN cgst::numeric + sgst::numeric + igst::numeric ELSE 0 END), 0)`,
            })
            .from(purchaseBills)
            .where(gte(purchaseBills.date, twelveMonthsAgo))
            .groupBy(sql`TO_CHAR(date, 'YYYY-MM')`)
            .orderBy(sql`TO_CHAR(date, 'YYYY-MM') ASC`);

        // Merge by month key
        type MonthEntry = { month: string; outputGst: number; purchaseGst: number; eligibleITC: number; cgst: number; sgst: number; igst: number };
        const monthMap: Record<string, MonthEntry> = {};

        const blankEntry = (month: string): MonthEntry => ({ month, outputGst: 0, purchaseGst: 0, eligibleITC: 0, cgst: 0, sgst: 0, igst: 0 });

        for (const r of salesMonthly) {
            if (!monthMap[r.month]) monthMap[r.month] = blankEntry(r.month);
            monthMap[r.month].outputGst = parseFloat(r.outputGst);
            monthMap[r.month].cgst = parseFloat(r.cgst);
            monthMap[r.month].sgst = parseFloat(r.sgst);
            monthMap[r.month].igst = parseFloat(r.igst);
        }
        for (const r of purchaseMonthly) {
            if (!monthMap[r.month]) monthMap[r.month] = blankEntry(r.month);
            monthMap[r.month].purchaseGst = parseFloat(r.purchaseGst);
            monthMap[r.month].eligibleITC = parseFloat(r.eligibleGst);
        }

        const monthlyTrends = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

        res.json(successResponse({
            totalSales: parseFloat(salesAgg.totalSales || '0'),
            outputGst,
            outputCgst: parseFloat(salesAgg.totalCgst || '0'),
            outputSgst: parseFloat(salesAgg.totalSgst || '0'),
            outputIgst: parseFloat(salesAgg.totalIgst || '0'),
            grossPurchaseGst: parseFloat(purchaseAgg.totalPurchaseGst || '0'),
            eligibleITC,
            ineligibleITC: parseFloat(purchaseAgg.ineligibleITC || '0'),
            pendingITC: 0,
            netGstPayable,
            gstStatus: netGstPayable >= 0 ? 'Payable' : 'Refund',
            itcBreakdown: {
                eligible: eligibleITC,
                pending: 0,
                ineligible: parseFloat(purchaseAgg.ineligibleITC || '0'),
            },
            monthlyTrends,
        }));
    } catch (error) {
        next(error);
    }
});

export default router;
