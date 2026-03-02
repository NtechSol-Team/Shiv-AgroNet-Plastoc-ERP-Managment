// Fix DNS resolution for Neon - force IPv4 first
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { SERVER_CONFIG } from './config/app.config';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { apiRateLimiter, strictRateLimiter } from './middleware/rateLimiter';
import {
    securityHeaders,
    xssProtection,
    parameterPollutionPrevention,
    requestSizeLimiter,
} from './middleware/security';
import routes from './routes/index';
import { realtimeService } from './services/realtime.service';

const app = express();
const PORT = SERVER_CONFIG.server.port;

// ===========================================
// SECURITY MIDDLEWARE (Applied first)
// ===========================================

// Security headers (XSS protection, clickjacking prevention, etc.)
app.use(securityHeaders);

// Request size limiter (prevent large payload attacks) - 5MB limit
app.use(requestSizeLimiter(5 * 1024 * 1024));

// ===========================================
// CORE MIDDLEWARE
// ===========================================

// CORS configuration
app.use(cors({
    origin: [...SERVER_CONFIG.security.corsOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
    credentials: true,
}));

// Enable GZIP compression
app.use(compression());

// Parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ===========================================
// SECURITY MIDDLEWARE (After parsing)
// ===========================================

// XSS protection (check for malicious patterns)
app.use(xssProtection);

// HTTP Parameter Pollution prevention
app.use(parameterPollutionPrevention);

// ===========================================
// LOGGING & RATE LIMITING
// ===========================================

// Request logging with timing
app.use(requestLogger);

// General API rate limiting
app.use('/api', apiRateLimiter);

// Stricter rate limiting for payment endpoints
app.use('/api/purchase/payments', strictRateLimiter);
app.use('/api/sales/receipts', strictRateLimiter);
app.use('/api/accounts/transactions', strictRateLimiter);

// ===========================================
// API ROUTES
// ===========================================

app.use('/api', routes);

// ===========================================
// HEALTH CHECK
// ===========================================

app.get('/', (req, res) => {
    res.json({
        message: 'Manufacturing ERP Backend API',
        status: 'online',
        documentation: '/api/docs' // Placeholder
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: SERVER_CONFIG.server.env,
        version: '1.0.0',
    });
});

// ===========================================
// REAL-TIME SSE ENDPOINT
// ===========================================

/**
 * GET /api/events
 * Server-Sent Events stream for real-time UI updates.
 * Browser clients connect here and receive push notifications
 * when any data mutation occurs (sales, purchase, inventory, etc.)
 */
app.get('/api/events', (req, res) => {
    realtimeService.subscribe(res);
});

/**
 * GET /api/events/status
 * Returns count of currently connected SSE clients.
 */
app.get('/api/events/status', (_req, res) => {
    res.json({ connectedClients: realtimeService.clientCount });
});

// ===========================================
// ERROR HANDLING
// ===========================================

app.use(errorHandler);

// ===========================================
// SERVER STARTUP
// ===========================================

app.listen(PORT, async () => {
    console.log(`\n🚀 Manufacturing ERP Server`);
    console.log(`   Environment: ${SERVER_CONFIG.server.env}`);
    console.log(`   Port: ${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);

    // Proactive DB Connection Check
    try {
        const { db } = await import('./db/index');
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`SELECT 1`);
        console.log('✅ Database connected successfully');

        // Warmup cache with master data (background)
        const { cache } = await import('./services/cache.service');
        cache.warmup();
    } catch (err) {
        console.error('❌ Database connection failed:', err);
    }
});

export default app;
