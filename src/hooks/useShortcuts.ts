import { useEffect } from 'react';

/**
 * useShortcuts Hook
 * 
 * Sets up global keyboard shortcuts for the application.
 * Handled shortcuts:
 * - Alt + D: Dashboard
 * - Alt + S: Sales
 * - Alt + P: Purchase
 * - Alt + I: Inventory
 * - Alt + M: Production (Manufacture)
 * - Alt + A: Accounts
 * - Alt + F: Finance
 * - Alt + R: Reports
 * - Alt + G: GST Dashboard
 * - Ctrl + K: Search (Command Palette)
 */

interface ShortcutOptions {
    onModuleChange: (moduleId: string) => void;
    onSearchOpen: () => void;
}

export function useShortcuts({ onModuleChange, onSearchOpen }: ShortcutOptions) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check for Ctrl/Cmd + K
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                onSearchOpen();
                return;
            }

            // Check for Alt shortcuts
            if (event.altKey) {
                switch (event.key.toLowerCase()) {
                    case 'd':
                        event.preventDefault();
                        onModuleChange('dashboard');
                        break;
                    case 's':
                        event.preventDefault();
                        onModuleChange('sales');
                        break;
                    case 'p':
                        event.preventDefault();
                        onModuleChange('purchase');
                        break;
                    case 'i':
                        event.preventDefault();
                        onModuleChange('inventory');
                        break;
                    case 'm':
                        event.preventDefault();
                        onModuleChange('production');
                        break;
                    case 'a':
                        event.preventDefault();
                        onModuleChange('accounts');
                        break;
                    case 'f':
                        event.preventDefault();
                        onModuleChange('finance');
                        break;
                    case 'r':
                        event.preventDefault();
                        onModuleChange('reports');
                        break;
                    case 'g':
                        event.preventDefault();
                        onModuleChange('gst-dashboard');
                        break;
                    case 'n':
                        event.preventDefault();
                        window.dispatchEvent(new CustomEvent('app-new-entry'));
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onModuleChange, onSearchOpen]);
}
