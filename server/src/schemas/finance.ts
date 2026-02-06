import { z } from 'zod';

export const createEntitySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: z.enum(['Lender', 'Borrower', 'Investor', 'Other']),
    contact: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
});

export const createTransactionSchema = z.object({
    transactionType: z.enum([
        'LOAN_TAKEN',
        'LOAN_GIVEN',
        'INVESTMENT_RECEIVED',
        'INVESTMENT_MADE',
        'BORROWING',
        'REPAYMENT'
    ]),
    partyId: z.string().optional(),
    amount: z.string().or(z.number()).transform((val) => String(val)),
    paymentMode: z.string().default('Bank'),
    accountId: z.string().optional(), // Make optional, but validate logic inside
    transactionDate: z.string().transform((str) => new Date(str)),
    reference: z.string().optional(),
    remarks: z.string().optional(),
    interestRate: z.string().or(z.number()).optional(),
    tenure: z.string().or(z.number()).optional(),
    dueDate: z.string().optional().transform((str) => (str ? new Date(str) : null)),
    repaymentType: z.string().optional(),
    // For Repayment split
    principalAmount: z.string().or(z.number()).optional(),
    interestAmount: z.string().or(z.number()).optional(),
});
