/**
 * usePagination - Pagination state management hook
 * 
 * Centralizes pagination logic across components
 */

import { useState, useCallback, useMemo } from 'react';
import { APP_CONFIG } from '../config/app.config';

interface PaginationState {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
}

interface UsePaginationOptions {
  /** Initial page number (default: 1) */
  initialPage?: number;
  /** Items per page (default: from config) */
  limit?: number;
  /** Total number of items (can be updated) */
  totalItems?: number;
}

interface UsePaginationReturn extends PaginationState {
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Update total items count */
  setTotalItems: (total: number) => void;
  /** Update total pages count */
  setTotalPages: (pages: number) => void;
  /** Reset to first page */
  reset: () => void;
  /** Check if has next page */
  hasNextPage: boolean;
  /** Check if has previous page */
  hasPrevPage: boolean;
  /** Get offset for API queries */
  offset: number;
  /** Pagination info text (e.g., "Showing 1-10 of 100") */
  paginationInfo: string;
}

/**
 * Pagination hook for managing page state
 * 
 * @example
 * const {
 *   page,
 *   limit,
 *   nextPage,
 *   prevPage,
 *   goToPage,
 *   setTotalPages,
 *   hasNextPage,
 *   hasPrevPage,
 *   paginationInfo
 * } = usePagination({ limit: 20 });
 * 
 * // Use in API call
 * const { data } = useFetch(() => api.getItems(page, limit), { deps: [page] });
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const {
    initialPage = 1,
    limit = APP_CONFIG.pagination.defaultPageSize,
    totalItems: initialTotalItems = 0,
  } = options;

  const [page, setPage] = useState(initialPage);
  const [totalItems, setTotalItemsState] = useState(initialTotalItems);
  const [totalPages, setTotalPagesState] = useState(1);

  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const offset = (page - 1) * limit;

  const nextPage = useCallback(() => {
    setPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage(prev => Math.max(prev - 1, 1));
  }, []);

  const goToPage = useCallback((newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, totalPages));
    setPage(validPage);
  }, [totalPages]);

  const setTotalItems = useCallback((total: number) => {
    setTotalItemsState(total);
    setTotalPagesState(Math.ceil(total / limit));
  }, [limit]);

  const setTotalPages = useCallback((pages: number) => {
    setTotalPagesState(pages);
  }, []);

  const reset = useCallback(() => {
    setPage(initialPage);
  }, [initialPage]);

  const paginationInfo = useMemo(() => {
    if (totalItems === 0) return 'No items';

    const start = offset + 1;
    const end = Math.min(offset + limit, totalItems);

    return `Showing ${start}-${end} of ${totalItems}`;
  }, [offset, limit, totalItems]);

  return {
    page,
    limit,
    totalPages,
    totalItems,
    nextPage,
    prevPage,
    goToPage,
    setTotalItems,
    setTotalPages,
    reset,
    hasNextPage,
    hasPrevPage,
    offset,
    paginationInfo,
  };
}

/**
 * Pagination component props generator
 * Returns props compatible with common pagination UI components
 */
export function getPaginationProps(pagination: UsePaginationReturn) {
  return {
    currentPage: pagination.page,
    totalPages: pagination.totalPages,
    onPageChange: pagination.goToPage,
    hasNextPage: pagination.hasNextPage,
    hasPrevPage: pagination.hasPrevPage,
    onNextPage: pagination.nextPage,
    onPrevPage: pagination.prevPage,
  };
}

export default usePagination;
