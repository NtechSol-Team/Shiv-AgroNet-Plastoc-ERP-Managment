/**
 * useNotification - Toast notification hook
 * 
 * Provides easy-to-use notification methods with auto-dismiss
 */

import { useState, useCallback, useRef } from 'react';
import { APP_CONFIG } from '../config/app.config';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration: number;
}

interface UseNotificationReturn {
  /** Current notifications */
  notifications: Notification[];
  /** Show a success notification */
  success: (message: string, duration?: number) => void;
  /** Show an error notification */
  error: (message: string, duration?: number) => void;
  /** Show a warning notification */
  warning: (message: string, duration?: number) => void;
  /** Show an info notification */
  info: (message: string, duration?: number) => void;
  /** Dismiss a specific notification */
  dismiss: (id: string) => void;
  /** Dismiss all notifications */
  dismissAll: () => void;
}

/**
 * Notification hook for displaying toast messages
 * 
 * @example
 * const { success, error } = useNotification();
 * 
 * // Show success message
 * success('Item saved successfully!');
 * 
 * // Show error message
 * error('Failed to save item');
 */
export function useNotification(): UseNotificationReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addNotification = useCallback((
    type: NotificationType,
    message: string,
    duration: number = APP_CONFIG.ui.toastDuration
  ) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const notification: Notification = {
      id,
      type,
      message,
      duration,
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-dismiss after duration
    if (duration > 0) {
      const timeoutId = setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        timeoutRefs.current.delete(id);
      }, duration);

      timeoutRefs.current.set(id, timeoutId);
    }

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));

    // Clear timeout if exists
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);

    // Clear all timeouts
    timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
    timeoutRefs.current.clear();
  }, []);

  const success = useCallback((message: string, duration?: number) => {
    return addNotification('success', message, duration);
  }, [addNotification]);

  const error = useCallback((message: string, duration?: number) => {
    return addNotification('error', message, duration);
  }, [addNotification]);

  const warning = useCallback((message: string, duration?: number) => {
    return addNotification('warning', message, duration);
  }, [addNotification]);

  const info = useCallback((message: string, duration?: number) => {
    return addNotification('info', message, duration);
  }, [addNotification]);

  return {
    notifications,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  };
}

export default useNotification;
