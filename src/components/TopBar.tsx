import React from 'react';
import { Search, Bell, HelpCircle, ChevronDown, Settings } from 'lucide-react';

interface TopBarProps {
    title: string;
}

export function TopBar({ title }: TopBarProps) {
    return (
        <header className="h-16 bg-white border-b border-slate-100 sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm">
            {/* Left Actions (Spacer or Breadcrumbs if needed) */}
            <div className="flex items-center">
                {/* We removed the title to avoid duplication with page headers */}
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-6">
                {/* Search Bar */}
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-56 placeholder-slate-400 text-slate-700 rounded-lg"
                    />
                </div>

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
    );
}
