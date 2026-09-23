'use client';

import React from 'react';
import {
  FileText,
  Send,
  Database,
  KeyRound,
  Sparkles,
  ScrollText,
} from 'lucide-react';
import { AppSettings } from '../types';

export type ActiveTab = 'bills' | 'campaigns' | 'cache' | 'settings' | 'logs';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  settings: AppSettings;
  cachedCount: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  settings,
  cachedCount,
}: SidebarProps) {
  const hasUploadthing = Boolean(settings.uploadthingToken?.trim());
  const hasAiSensy = Boolean(settings.aisensyApiKey?.trim());

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'bills',
      label: 'Bills & Extractor',
      icon: <FileText size={15} />,
    },
    {
      id: 'campaigns',
      label: 'AiSensy Campaigns',
      icon: <Send size={15} />,
    },
    {
      id: 'cache',
      label: 'URL Cache & Ledger',
      icon: <Database size={15} />,
      badge: cachedCount > 0 ? String(cachedCount) : undefined,
    },
    {
      id: 'settings',
      label: 'API & Credentials',
      icon: <KeyRound size={15} />,
    },
    {
      id: 'logs',
      label: 'Daily Activity Logs',
      icon: <ScrollText size={15} />,
    },
  ];

  return (
    <aside className="w-60 bg-[#f7f6f3] text-[#37352f] flex flex-col flex-shrink-0 select-none border-r border-[#e9e9e7]">
      {/* Notion Workspace Brand Header */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#e9e9e7]">
        <div className="w-7 h-7 rounded-md bg-white border border-[#e9e9e7] shadow-xs flex items-center justify-center text-sm">
          🧾
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-[#37352f] truncate">PDF Bill Extractor</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f1f1ef] text-[#787774] border border-[#e9e9e7]">
              Pro
            </span>
          </div>
          <p className="text-[10px] text-[#9b9a97] truncate">Notion Workspace</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2.5 py-3 space-y-1">
        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9b9a97]">
          Navigation
        </div>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[#e8f0fb] text-[#2383e2]'
                  : 'text-[#37352f] hover:bg-[#efefed]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={isActive ? 'text-[#2383e2]' : 'text-[#787774]'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                    isActive
                      ? 'bg-[#2383e2]/15 text-[#2383e2]'
                      : 'bg-[#e9e9e7] text-[#787774]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Integration Status Footer (Notion Minimalist) */}
      <div className="p-3 m-2.5 rounded-lg bg-white border border-[#e9e9e7] shadow-xs space-y-2 text-xs">
        <div className="text-[11px] font-semibold text-[#787774] flex items-center justify-between">
          <span>Service Status</span>
          <Sparkles size={11} className="text-[#9b9a97]" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#37352f] text-[11px] flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${
                hasUploadthing ? 'bg-[#2d7738]' : 'bg-[#cb912f]'
              }`}
            />
            UploadThing
          </span>
          <span
            className={`text-[10px] font-mono ${
              hasUploadthing ? 'text-[#2d7738] font-medium' : 'text-[#9b9a97]'
            }`}
          >
            {hasUploadthing ? 'Active' : 'Unset'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#37352f] text-[11px] flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${
                hasAiSensy ? 'bg-[#2d7738]' : 'bg-[#cb912f]'
              }`}
            />
            AiSensy API
          </span>
          <span
            className={`text-[10px] font-mono ${
              hasAiSensy ? 'text-[#2d7738] font-medium' : 'text-[#9b9a97]'
            }`}
          >
            {hasAiSensy ? 'Active' : 'Unset'}
          </span>
        </div>
      </div>
    </aside>
  );
}
