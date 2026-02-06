export interface ApiResponse<T> {
    success: true;
    data: T;
    warning?: string;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export function successResponse<T>(data: T, warning?: string): ApiResponse<T> {
    const response: ApiResponse<T> = { success: true, data };
    if (warning) {
        response.warning = warning;
    }
    return response;
}
