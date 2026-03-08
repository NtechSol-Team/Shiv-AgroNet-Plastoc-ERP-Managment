import React, { useState, useEffect } from 'react';
import { Search, Bell, HelpCircle, ChevronDown, Settings, Package, ShoppingCart, Archive, Cog, CreditCard, Wallet, FileText, ReceiptText } from 'lucide-react';
import { Command } from 'cmdk';

interface TopBarProps {
    title: string;
    isSearchOpen?: boolean;
    onSearchClose?: () => void;
    onModuleChange?: (module: string) => void;
}

export function TopBar({ title, isSearchOpen = false, onSearchClose, onModuleChange }: TopBarProps) {
    const [open, setOpen] = useState(isSearchOpen);

    useEffect(() => {
        setOpen(isSearchOpen);
    }, [isSearchOpen]);

    const handleSelect = (moduleId: string) => {
        if (onModuleChange) onModuleChange(moduleId);
        setOpen(false);
        if (onSearchClose) onSearchClose();
    };

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: Package },
        { id: 'masters', label: 'Masters', icon: Package },
        { id: 'sales', label: 'Sales', icon: ShoppingCart },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
        { id: 'inventory', label: 'Inventory', icon: Archive },
        { id: 'production', label: 'Production', icon: Cog },
        { id: 'accounts', label: 'Accounts', icon: CreditCard },
        { id: 'finance', label: 'Finance', icon: Wallet },
        { id: 'samples', label: 'Samples', icon: Archive },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'gst-dashboard', label: 'GST Dashboard', icon: ReceiptText },
    ];

    return (
        <>
            <header className="h-16 bg-white border-b border-slate-100 sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm">
                {/* Left Actions (Spacer or Breadcrumbs if needed) */}
                <div className="flex items-center">
                    <h2 className="text-xl font-bold text-slate-800 capitalize">{title.replace('-', ' ')}</h2>
                </div>

                {/* Right Actions */}
                <div className="flex items-center space-x-6">
                    {/* Search Clickable Area */}
                    <button
                        onClick={() => setOpen(true)}
                        className="relative group flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-64 text-slate-400 hover:bg-slate-100 transition-all"
                    >
                        <Search className="w-4 h-4 mr-3 text-slate-400 group-hover:text-blue-500 transition-colors" />
                        <span className="text-sm">Search...</span>
                        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 opacity-100">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </button>

                    <div className="flex items-center space-x-4">
                        <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-full transition-all relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-full transition-all">
                            <HelpCircle className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Separator */}
                    <div className="h-8 w-px bg-slate-200"></div>

                    {/* User Profile */}
                    <button className="flex items-center space-x-3 group outline-none">
                        <div className="text-right hidden md:block">
                            <p className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors leading-tight">Admin User</p>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">View Profile</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center text-white font-bold text-sm ring-2 ring-white group-hover:scale-105 transition-transform">
                            AU
                        </div>
                        <Settings className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </button>
                </div>
            </header>

            <Command.Dialog
                open={open}
                onOpenChange={(isOpen) => {
                    setOpen(isOpen);
                    if (!isOpen && onSearchClose) onSearchClose();
                }}
                label="Global Command Menu"
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] bg-white rounded-2xl shadow-2xl z-[100] border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="flex items-center border-b border-slate-100 px-4">
                    <Search className="w-5 h-5 text-slate-400" />
                    <Command.Input
                        autoFocus
                        placeholder="Type a command or search..."
                        className="w-full py-4 px-4 bg-transparent border-none focus:ring-0 text-slate-700 text-base placeholder-slate-400"
                    />
                </div>
                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                    <Command.Empty className="py-8 text-center text-sm text-slate-500">No results found.</Command.Empty>

                    <Command.Group heading="Navigation" className="px-2 pt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {menuItems.map(item => (
                            <Command.Item
                                key={item.id}
                                value={item.label}
                                onSelect={() => handleSelect(item.id)}
                                className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-all group"
                            >
                                <item.icon className="w-4 h-4 mr-3 text-slate-400 group-aria-selected:text-blue-600" />
                                {item.label}
                                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-400 opacity-0 group-aria-selected:opacity-100">
                                    <span className="text-xs">↵</span> Enter
                                </kbd>
                            </Command.Item>
                        ))}
                    </Command.Group>

                    <Command.Group heading="Actions" className="px-2 pt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        <Command.Item className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer aria-selected:bg-slate-50 transition-all">
                            <Plus className="w-4 h-4 mr-3 text-slate-400" />
                            Create New Invoice
                        </Command.Item>
                        <Command.Item className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer aria-selected:bg-slate-50 transition-all">
                            <Plus className="w-4 h-4 mr-3 text-slate-400" />
                            Add Raw Material
                        </Command.Item>
                    </Command.Group>
                </Command.List>
            </Command.Dialog>
        </>
    );
}

const Plus = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
