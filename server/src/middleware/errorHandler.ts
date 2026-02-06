import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}

export function errorHandler(
    err: ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) {
    console.error('Error:', err);

    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message: err.message || 'An unexpected error occurred',
        },
    });
}

export function createError(message: string, statusCode: number = 400, code?: string): ApiError {
    const error: ApiError = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}
