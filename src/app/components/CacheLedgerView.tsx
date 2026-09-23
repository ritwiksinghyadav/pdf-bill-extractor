'use client';

import React, { useState } from 'react';
import {
  Database,
  Search,
  ExternalLink,
  Copy,
  Trash2,
  FileText,
} from 'lucide-react';
import { CacheEntry } from '../types';

interface CacheLedgerViewProps {
  cacheRecords: Record<string, CacheEntry>;
  onClearCache: () => Promise<void>;
  onReupload: (filePath: string) => void;
}

export default function CacheLedgerView({
  cacheRecords,
  onClearCache,
  onReupload,
}: CacheLedgerViewProps) {
  const [search, setSearch] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const list = Object.values(cacheRecords).filter((item) => {
    const q = search.toLowerCase();
    return (
      item.pdfName.toLowerCase().includes(q) ||
      (item.customerName && item.customerName.toLowerCase().includes(q)) ||
      (item.billNo && item.billNo.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-white text-[#37352f]">
      {/* Notion Header */}
      <div className="h-14 px-6 border-b border-[#e9e9e7] flex items-center justify-between flex-shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🗄️</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold text-[#37352f]">PDF Upload Ledger & Cache</h1>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-[#e8f0fb] text-[#2383e2] border border-[#2383e2]/30">
                {list.length} Document{list.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[11px] text-[#9b9a97]">
              Cached documents avoid duplicate CDN uploads.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-[#9b9a97]" />
            <input
              type="text"
              placeholder="Filter ledger..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none w-56 text-[#37352f]"
            />
          </div>

          {Object.keys(cacheRecords).length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all cached uploaded URLs?')) onClearCache();
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#d44c47] bg-[#fbe4e4] hover:bg-[#fad4d4] border border-[#f5c6cb] rounded-md transition-colors"
            >
              <Trash2 size={12} /> Clear Cache
            </button>
          )}
        </div>
      </div>

      {/* Notion Ledger Table */}
      <div className="flex-1 overflow-auto">
        {list.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#9b9a97]">
            <span className="text-4xl opacity-30 mb-2">🗄️</span>
            <p className="text-xs font-semibold text-[#37352f]">No Cached Documents</p>
            <p className="text-[11px] text-[#9b9a97] max-w-sm mt-1">
              When bills are uploaded to UploadThing, their public URLs are cached here automatically to prevent duplicate uploads.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#f7f6f3] border-b border-[#e9e9e7] text-[11px] font-semibold text-[#787774] uppercase tracking-wider select-none z-10">
              <tr>
                <th className="px-3.5 py-2">#</th>
                <th className="px-3.5 py-2">PDF Document</th>
                <th className="px-3.5 py-2">Customer</th>
                <th className="px-3.5 py-2">Bill No.</th>
                <th className="px-3.5 py-2">Amount</th>
                <th className="px-3.5 py-2">Upload Date</th>
                <th className="px-3.5 py-2">Public CDN Link</th>
                <th className="px-3.5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e9e9e7] text-xs">
              {list.map((rec, idx) => (
                <tr key={rec.path} className="hover:bg-[#f7f6f3] transition-colors">
                  <td className="px-3.5 py-2 text-[#9b9a97] font-mono">{idx + 1}</td>
                  <td className="px-3.5 py-2 font-medium text-[#37352f]">
                    <div className="flex items-center gap-1.5">
                      <FileText size={13} className="text-[#9b9a97] flex-shrink-0" />
                      <span className="truncate max-w-[170px]" title={rec.pdfName}>
                        {rec.pdfName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2 font-semibold text-[#37352f]">
                    {rec.customerName || '—'}
                  </td>
                  <td className="px-3.5 py-2 font-mono text-[#787774]">{rec.billNo || '—'}</td>
                  <td className="px-3.5 py-2 font-mono font-semibold text-[#2d7738]">
                    {rec.amount ? (rec.amount.startsWith('₹') ? rec.amount : `₹${rec.amount}`) : '—'}
                  </td>
                  <td className="px-3.5 py-2 text-[#9b9a97] font-mono text-[11px]">
                    {rec.uploadedAt ? new Date(rec.uploadedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3.5 py-2">
                    <div className="flex items-center gap-1">
                      <a
                        href={rec.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2383e2] hover:underline flex items-center gap-1 truncate max-w-[130px]"
                      >
                        <ExternalLink size={11} />
                        {rec.publicUrl.replace('https://', '')}
                      </a>
                      <button
                        onClick={() => copyUrl(rec.publicUrl)}
                        className="p-1 rounded text-[#9b9a97] hover:text-[#37352f] hover:bg-[#efefed]"
                        title="Copy Public URL"
                      >
                        <Copy size={11} />
                      </button>
                      {copiedUrl === rec.publicUrl && (
                        <span className="text-[10px] text-[#2d7738] font-bold">Copied</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3.5 py-2 text-right">
                    <button
                      onClick={() => onReupload(rec.path)}
                      className="text-[11px] font-medium text-[#2383e2] hover:bg-[#e8f0fb] px-2 py-0.5 rounded transition-colors"
                    >
                      Re-upload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
