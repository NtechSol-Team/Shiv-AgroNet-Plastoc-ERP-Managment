
import { Router, Request, Response, NextFunction } from 'express';
import { validateRequest } from '../middleware/validation';
import { successResponse } from '../types/api';
import { createCCAccount, updateCCAccount, getCCAccountStatus, postMonthlyInterest } from '../services/cc-account.service';
import { z } from 'zod';
import { db } from '../db/index'; // Needed for code generation if logic is here
import { bankCashAccounts } from '../db/schema'; // Needed for code gen
import { cache } from '../services/cache.service';

const router = Router();

// Validation Schema for CC Account Creation
const createCCAccountSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    accountNo: z.string().min(1, 'Account No is required'),
    sanctionedLimit: z.coerce.number().min(0, 'Limit must be positive'),
    interestRate: z.coerce.number().min(0, 'Interest Rate must be positive'),
    stockMargin: z.coerce.number().min(0).max(100).optional(),
    receivablesMargin: z.coerce.number().min(0).max(100).optional(),
    drawingPowerMode: z.enum(['Manual', 'Automatic']).default('Automatic'),
    securityType: z.string().optional(),
    validityPeriod: z.string().optional(), // Date string
    interestCalculationMethod: z.string().optional()
});

// Validation Schema for CC Account Update
const updateCCAccountSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    accountNo: z.string().min(1, 'Account No is required'),
    sanctionedLimit: z.coerce.number().min(0, 'Limit must be positive'),
    interestRate: z.coerce.number().min(0, 'Interest Rate must be positive'),
    stockMargin: z.coerce.number().min(0).max(100).optional(),
    receivablesMargin: z.coerce.number().min(0).max(100).optional(),
    drawingPowerMode: z.enum(['Manual', 'Automatic']).default('Automatic'),
    securityType: z.string().optional(),
    validityPeriod: z.string().optional(),
    interestCalculationMethod: z.string().optional()
});

/**
 * POST /cc-accounts
 * Create a new Cash Credit Account
 */
router.post('/', validateRequest(createCCAccountSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name } = req.body;

        // Generate Code (Bank specific? Or Generic Account code?)
        // Let's use 'CC-001' format to distinguish.
        const lastItem = await db.query.bankCashAccounts.findFirst({
            where: (accounts, { like }) => like(accounts.code, 'CC-%'),
            orderBy: (table, { desc }) => [desc(table.code)]
        });
        const lastCode = lastItem?.code || 'CC-000';
        const lastNum = parseInt(lastCode.split('-')[1] || '0');
        const code = `CC-${String(lastNum + 1).padStart(3, '0')}`;

        const account = await createCCAccount({ ...req.body, code });

        // Invalidate caches
        cache.del('masters:accounts');
        cache.del('masters:cc-accounts');

        res.status(201).json(successResponse(account));
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /cc-accounts/:id
 * Update an existing CC Account
 */
router.put('/:id', validateRequest(updateCCAccountSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const account = await updateCCAccount(req.params.id, req.body);

        // Invalidate caches
        cache.del('masters:accounts');
        cache.del('masters:cc-accounts');

        res.json(successResponse(account));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /cc-accounts
 * List all CC accounts with details
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accounts = await db.query.ccAccountDetails.findMany({
            with: {
                account: true
            }
        });

        // Transform to flat object if needed, or send as is
        const result = accounts.map(item => ({
            ...item.account,
            ...item, // Account details
        }));

        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

/**
 * GET /cc-accounts/:id/status
 * Get Dashboard Status (Outstanding, DP, Limit, etc.)
 */
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const status = await getCCAccountStatus(req.params.id);
        res.json(successResponse(status));
    } catch (error) {
        next(error);
    }
});

/**
 * POST /cc-accounts/:id/interest/post
 * Manually trigger monthly interest posting
 */
router.post('/:id/interest/post', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Automated interest posting is disabled as per user request.
        // Users should manually enter interest as an expense.
        res.status(400).json({
            success: false,
            message: 'Automated interest posting is disabled. Please use "Add Expense" to record interest manually.'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /cc-accounts/interest-logs
 * Get all interest logs
 */
router.get('/interest-logs', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const logs = await db.query.ccInterestLogs.findMany({
            with: {
                // We need account details. 
                // ccInterestLogs has accountId. 
                // Relations might not be defined in schema for 'account' -> 'bankCashAccounts'.
                // Let's check schema/relations. If not, we might need to fetch separately or use raw query.
                // Assuming relation exists or we can just join manually if needed.
                // Wait, I should check `schema.ts` to see if `ccInterestLogs` has a relation to `bankCashAccounts`.
            },
            orderBy: (logs, { desc }) => [desc(logs.createdAt)]
        });

        // If relation isn't easy, let's just fetch accounts and map.
        // Or updated schema. 
        // For now, let's fetch all accounts to map names.
        const accounts = await db.select().from(bankCashAccounts);
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        const result = logs.map(log => ({
            ...log,
            accountName: accountMap.get(log.accountId)?.name || 'Unknown Account',
            accountNo: accountMap.get(log.accountId)?.accountNo
        }));

        res.json(successResponse(result));
    } catch (error) {
        next(error);
    }
});

export default router;
