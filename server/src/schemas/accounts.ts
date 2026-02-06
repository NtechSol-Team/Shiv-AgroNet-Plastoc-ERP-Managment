import { z } from 'zod';

export const recordPaymentSchema = z.object({
    type: z.enum(['RECEIPT', 'PAYMENT']),
    partyType: z.enum(['customer', 'supplier']),
    partyId: z.string().min(1, 'Party ID is required'),

    referenceType: z.enum(['sales', 'purchase']).optional(), // Optional for Advance
    referenceId: z.string().optional(), // Optional for Advance
    amount: z.number().positive('Amount must be positive'),
    mode: z.enum(['Cash', 'Bank', 'Cheque', 'UPI']),
    accountId: z.string().min(1, 'Account ID is required'),
    bankReference: z.string().optional(),
    remarks: z.string().optional(),
    isAdvance: z.boolean().optional(), // New
});

export const createExpenseSchema = z.object({
    date: z.string().transform((str) => new Date(str)),
    expenseHeadId: z.string().min(1, 'Expense Head ID is required'),
    accountId: z.string().min(1, 'Account ID is required'),
    amount: z.number().positive('Amount must be positive'),
    paymentMode: z.enum(['Cash', 'Bank', 'Cheque', 'UPI']),
    description: z.string().optional(),
    reference: z.string().optional(),
});
