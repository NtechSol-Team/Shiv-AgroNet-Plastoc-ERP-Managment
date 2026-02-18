import { Router, Request, Response } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';

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

        // Handle Subscription/General errors
        if (data.status === 0) {
            throw createError(data.message || 'GSTZen API Error', 400);
        }

        // Handle invalid GSTIN
        if (!data.valid) {
            throw createError('Invalid GSTIN', 400);
        }

        if (!data.company_details) {
            throw createError('No company details found for this GSTIN', 404);
        }

        const details = data.company_details;

        // Map to our internal format
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

export default router;
