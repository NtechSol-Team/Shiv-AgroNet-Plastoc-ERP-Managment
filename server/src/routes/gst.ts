import { Router, Request, Response } from 'express';
import { successResponse } from '../types/api';
import { createError } from '../middleware/errorHandler';

const router = Router();

const GST_API_URL = 'https://apisandbox.whitebooks.in/public/search';
const CLIENT_ID = 'GSTS842466fb-5f5e-4564-9d4c-3f80c57078ea';
const CLIENT_SECRET = 'GSTSb28a7b45-4b84-4d26-aa89-d341eb3d3751';

interface GstApiResponse {
    data?: {
        lgnm?: string; // Legal Name
        tradeNam?: string; // Trade Name
        gstin?: string;
        pradr?: {
            addr?: {
                bno?: string; // Building No
                bnm?: string; // Building Name
                st?: string; // Street
                loc?: string; // Location
                dst?: string; // District
                pncd?: string; // Pincode
                stcd?: string; // State Code
            }
        };
        sts?: string; // Status
        dty?: string; // Taxpayer Type
    };
    error?: any;
}

router.get('/search', async (req: Request, res: Response, next: Function) => {
    try {
        const { gstin } = req.query;

        if (!gstin || typeof gstin !== 'string') {
            throw createError('GSTIN is required', 400);
        }

        // Hardcoded email as per user curl request example, or we could leave it blank if optional.
        // The user provided curl has `email=deepnakrani1207%40gmail.com`.
        // The user request says "email" is a query param. I'll use the one from the curl as default or allow passing it.
        // Let's use the one from curl as a fallback/default if not provided in our internal API, 
        // to match the working example.
        const email = req.query.email as string || 'deepnakrani1207@gmail.com';

        const url = `${GST_API_URL}?gstin=${gstin}&email=${encodeURIComponent(email)}`;

        console.log(`fetching GST data for ${gstin}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET
            }
        });

        if (!response.ok) {
            console.error('GST API Error:', response.status, response.statusText);
            throw createError('Failed to fetch GST details from external API', response.status);
        }

        const data = await response.json() as GstApiResponse;

        if (!data || !data.data) {
            throw createError('Invalid response from GST API', 502);
        }

        // Map response to our format
        const gstData = data.data;
        const addressParts = [
            gstData.pradr?.addr?.bno,
            gstData.pradr?.addr?.bnm,
            gstData.pradr?.addr?.st,
            gstData.pradr?.addr?.loc,
            gstData.pradr?.addr?.dst,
            gstData.pradr?.addr?.pncd
        ].filter(Boolean); // Remove undefined/null/empty

        const mappedData = {
            name: gstData.lgnm || gstData.tradeNam, // Prefer Legal Name, fallback to Trade Name
            gstin: gstData.gstin,
            stateCode: gstData.pradr?.addr?.stcd,
            address: addressParts.join(', '),
            status: gstData.sts,
            taxpayerType: gstData.dty,
            gstVerifiedAt: new Date().toISOString()
        };

        res.json(successResponse(mappedData));

    } catch (error) {
        next(error);
    }
});

export default router;
