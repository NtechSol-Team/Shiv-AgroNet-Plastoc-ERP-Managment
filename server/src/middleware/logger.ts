import { Request, Response, NextFunction } from 'express';

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Status colors
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',

    // Background
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
};

// Method colors
const methodColors: Record<string, string> = {
    GET: colors.cyan,
    POST: colors.green,
    PUT: colors.yellow,
    PATCH: colors.yellow,
    DELETE: colors.red,
};

// Status color based on response code
const getStatusColor = (status: number): string => {
    if (status >= 500) return colors.red;
    if (status >= 400) return colors.yellow;
    if (status >= 300) return colors.cyan;
    if (status >= 200) return colors.green;
    return colors.white;
};

// Format duration
const formatDuration = (ms: number): string => {
    if (ms < 100) return `${colors.green}${ms.toFixed(0)}ms${colors.reset}`;
    if (ms < 500) return `${colors.yellow}${ms.toFixed(0)}ms${colors.reset}`;
    return `${colors.red}${ms.toFixed(0)}ms${colors.reset}`;
};

// Get timestamp
const getTimestamp = (): string => {
    return new Date().toLocaleTimeString('en-US', { hour12: true });
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const method = req.method;
    const path = req.originalUrl || req.url;
    const methodColor = methodColors[method] || colors.white;

    // Log request start
    console.log(
        `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
        `${methodColor}${colors.bright}${method}${colors.reset} ` +
        `${path} ${colors.dim}started...${colors.reset}`
    );

    // Capture the original end function
    const originalEnd = res.end;

    // Override res.end to log when response completes
    res.end = function (chunk?: any, encoding?: any, cb?: any) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const statusColor = getStatusColor(statusCode);

        // Determine success/error
        const isSuccess = statusCode < 400;
        const statusIcon = isSuccess ? '✅' : '❌';
        const statusText = isSuccess ? 'SUCCESS' : 'ERROR';

        // Log completion
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${methodColor}${colors.bright}${method}${colors.reset} ` +
            `${path} ` +
            `${statusColor}${statusCode}${colors.reset} ` +
            `${statusIcon} ${isSuccess ? colors.green : colors.red}${statusText}${colors.reset} ` +
            `[${formatDuration(duration)}]`
        );

        // Log error details if error response
        if (!isSuccess && chunk) {
            try {
                const body = JSON.parse(chunk.toString());
                if (body.error) {
                    console.log(
                        `${colors.red}   └─ Error: ${body.error}${colors.reset}`
                    );
                }
            } catch (e) {
                // Not JSON, skip
            }
        }

        // Call original end
        return originalEnd.call(this, chunk, encoding, cb);
    };

    next();
};

// Console log helper for specific operations
export const logger = {
    info: (message: string, data?: any) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${colors.blue}ℹ️  INFO${colors.reset} ` +
            `${message}`,
            data ? JSON.stringify(data, null, 2) : ''
        );
    },

    success: (message: string, data?: any) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${colors.green}✅ SUCCESS${colors.reset} ` +
            `${message}`,
            data ? JSON.stringify(data, null, 2) : ''
        );
    },

    warn: (message: string, data?: any) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${colors.yellow}⚠️  WARN${colors.reset} ` +
            `${message}`,
            data ? JSON.stringify(data, null, 2) : ''
        );
    },

    error: (message: string, error?: any) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${colors.red}❌ ERROR${colors.reset} ` +
            `${message}`,
            error ? (error.message || error) : ''
        );
    },

    db: (operation: string, table: string, duration?: number) => {
        const durationText = duration ? ` [${formatDuration(duration)}]` : '';
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ` +
            `${colors.magenta}🗄️  DB${colors.reset} ` +
            `${operation} on ${colors.cyan}${table}${colors.reset}${durationText}`
        );
    },
};
