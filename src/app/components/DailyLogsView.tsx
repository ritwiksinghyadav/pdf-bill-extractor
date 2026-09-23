'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  FolderOpen,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Search,
  Filter,
} from 'lucide-react';

export default function DailyLogsView() {
  const [logContent, setLogContent] = useState<string>('');
  const [logPath, setLogPath] = useState<string>('');
  const [logDate, setLogDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'ERROR' | 'AiSensy' | 'UploadThing' | 'Extraction'>('ALL');

  const fetchLogs = async () => {
    if (!window.electronAPI?.getTodayLogs) return;
    setIsLoading(true);
    try {
      const res = await window.electronAPI.getTodayLogs();
      if (res.success) {
        setLogContent(res.content || '');
        setLogPath(res.path || '');
        setLogDate(res.date || '');
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleOpenFolder = async () => {
    if (window.electronAPI?.openLogsFolder) {
      await window.electronAPI.openLogsFolder();
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse lines for filtering and presentation
  const lines = useMemo(() => {
    if (!logContent.trim()) return [];
    return logContent
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line, idx) => {
        let level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO';
        if (line.includes('[ERROR]')) level = 'ERROR';
        else if (line.includes('[SUCCESS]')) level = 'SUCCESS';
        else if (line.includes('[WARN]')) level = 'WARN';

        return { id: idx, raw: line, level };
      });
  }, [logContent]);

  // Filtered lines
  const filteredLines = useMemo(() => {
    return lines.filter((item) => {
      // Type filter
      if (filterType === 'ERROR' && item.level !== 'ERROR') return false;
      if (filterType === 'AiSensy' && !item.raw.includes('[AiSensy]')) return false;
      if (filterType === 'UploadThing' && !item.raw.includes('[UploadThing]')) return false;
      if (filterType === 'Extraction' && !item.raw.includes('[Extraction]')) return false;

      // Text search
      if (searchTerm.trim()) {
        return item.raw.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return true;
    });
  }, [lines, filterType, searchTerm]);

  // Counts for summary cards
  const stats = useMemo(() => {
    let errorCount = 0;
    let successCount = 0;
    let aiSensyCount = 0;
    for (const l of lines) {
      if (l.level === 'ERROR') errorCount++;
      if (l.level === 'SUCCESS') successCount++;
      if (l.raw.includes('[AiSensy]')) aiSensyCount++;
    }
    return { total: lines.length, errorCount, successCount, aiSensyCount };
  }, [lines]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#e9e9e7] bg-[#fafaf9] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-[#37352f] flex items-center gap-2">
              <FileText size={18} className="text-[#2383e2]" />
              Daily Activity & Delivery Logs
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-[#e9e9e7] text-[#787774]">
              {logDate || 'Today'}
            </span>
          </div>
          <p className="text-xs text-[#9b9a97] mt-0.5 truncate max-w-xl" title={logPath}>
            Live audit trail of extractions, cloud uploads, and AiSensy WhatsApp API dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-white border border-[#e9e9e7] text-[#37352f] hover:bg-[#f1f1ef] transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-white border border-[#e9e9e7] text-[#37352f] hover:bg-[#f1f1ef] transition-colors shadow-2xs"
          >
            {copied ? <Check size={12} className="text-[#2d7738]" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy Log'}
          </button>

          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-[#2383e2] text-white hover:bg-[#1a6cb8] transition-colors shadow-2xs"
            title="Open folder containing daily .log files in Windows File Explorer"
          >
            <FolderOpen size={12} />
            Open Logs Folder 📂
          </button>
        </div>
      </div>

      {/* KPI / Stats Strip */}
      <div className="px-6 py-2.5 border-b border-[#e9e9e7] bg-[#f7f6f3] flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[#787774]">Total Entries:</span>
          <span className="font-semibold text-[#37352f]">{stats.total}</span>
        </div>
        <div className="h-3 w-px bg-[#e9e9e7]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#787774]">WhatsApp Events:</span>
          <span className="font-semibold text-[#2383e2]">{stats.aiSensyCount}</span>
        </div>
        <div className="h-3 w-px bg-[#e9e9e7]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#787774]">Successful:</span>
          <span className="font-semibold text-[#2d7738]">{stats.successCount}</span>
        </div>
        <div className="h-3 w-px bg-[#e9e9e7]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#787774]">Errors:</span>
          <span className={`font-semibold ${stats.errorCount > 0 ? 'text-[#d44c47]' : 'text-[#787774]'}`}>
            {stats.errorCount}
          </span>
        </div>

        {logPath && (
          <div className="ml-auto text-[11px] text-[#9b9a97] font-mono truncate max-w-sm" title={logPath}>
            📁 {logPath}
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="px-6 py-2 border-b border-[#e9e9e7] flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9b9a97]" />
          <input
            type="text"
            placeholder="Search phone number, customer, bill no, message ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none text-[#37352f]"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <Filter size={12} className="text-[#9b9a97] mr-1" />
          {(['ALL', 'AiSensy', 'UploadThing', 'Extraction', 'ERROR'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filterType === t
                  ? t === 'ERROR'
                    ? 'bg-[#fbe4e4] text-[#d44c47] font-medium border border-[#f5c6cb]'
                    : 'bg-[#e8f0fb] text-[#2383e2] font-medium border border-[#cce0f5]'
                  : 'text-[#787774] hover:bg-[#f1f1ef]'
              }`}
            >
              {t === 'ALL' ? 'All Logs' : t === 'ERROR' ? 'Errors Only' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Log Content Viewer */}
      <div className="flex-1 overflow-auto bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[11px] p-4 select-text leading-relaxed">
        {filteredLines.length === 0 ? (
          <div className="text-center py-16 text-[#6a6a6a]">
            {lines.length === 0 ? 'No activity recorded today yet.' : 'No entries matched your search/filter.'}
          </div>
        ) : (
          filteredLines.map((item) => {
            const isError = item.level === 'ERROR';
            const isSuccess = item.level === 'SUCCESS';
            const isWarn = item.level === 'WARN';

            return (
              <div
                key={item.id}
                className={`py-0.5 px-1.5 rounded hover:bg-white/5 transition-colors flex gap-2 items-start ${
                  isError ? 'bg-[#5a1d1d]/30 text-[#f87171]' : isWarn ? 'text-[#fbbf24]' : ''
                }`}
              >
                <span className="text-[#565656] select-none text-[10px] w-8 shrink-0 text-right">
                  {item.id + 1}
                </span>

                <span
                  className={`text-[9px] px-1 rounded uppercase font-semibold shrink-0 ${
                    isError
                      ? 'bg-[#ef4444] text-white'
                      : isSuccess
                      ? 'bg-[#22c55e] text-white'
                      : isWarn
                      ? 'bg-[#f59e0b] text-black'
                      : 'bg-[#3b82f6] text-white'
                  }`}
                >
                  {item.level}
                </span>

                <span className="break-all whitespace-pre-wrap flex-1">{item.raw}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
