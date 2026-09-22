'use client';

import { useState, useEffect } from 'react';
import {
  FolderOpen, Play, FileText, CheckSquare, Square,
  RefreshCw, AlertCircle, CheckCircle, ChevronDown,
  ChevronUp, X, Search, FileCheck, Phone, User, Settings,
  ExternalLink, Copy, Send, Upload, FastForward, Trash2
} from 'lucide-react';
import SettingsModal, { AppSettings } from './components/SettingsModal';

interface PdfFile {
  name: string;
  path: string;
  size: number;
}

interface RecordData {
  path: string;
  pdfName: string;
  customerName: string;
  customerNumber: string;
  billNo: string;
  date: string;
  amount: string;
  confidence: string;
  pages: number;
  status: 'Success' | 'Error';
  publicUrl?: string;
  uploadStatus?: 'Idle' | 'Uploading' | 'Uploaded' | 'Error';
  whatsappStatus?: 'Idle' | 'Sending' | 'Sent' | 'Error';
  error?: string;
  processedAt?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>;
      scanPdfs: (p: string) => Promise<{ success: boolean; files: PdfFile[]; error?: string }>;
      extractPdfData: (paths: string[]) => Promise<RecordData[]>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>;
      getHistory: () => Promise<{ lastProcessedPath: string | null; records: Record<string, RecordData> }>;
      saveHistory: (history: any) => Promise<{ success: boolean; error?: string }>;
      clearHistory: () => Promise<{ success: boolean; error?: string }>;
      uploadthingUpload: (params: { filePath: string; uploadthingToken?: string }) => Promise<{ success: boolean; publicUrl?: string; provider?: string; error?: string }>;
      aisensySend: (params: { apiKey: string; campaignName: string; destination: string; customerName: string; billNo: string; amount: string; pdfUrl: string; countryCode: string }) => Promise<{ success: boolean; error?: string; response?: any }>;
    };
  }
}

export default function Home() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data Records
  const [records, setRecords] = useState<Record<string, RecordData>>({});
  const [lastProcessedPath, setLastProcessedPath] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Settings & Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    uploadthingToken: '',
    aisensyApiKey: '',
    aisensyCampaignName: '',
    countryCode: '91',
  });

  // Table Filters & Sorting
  const [sortField, setSortField] = useState<keyof RecordData>('pdfName');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');

  // Initial Load from Persistent Storage
  useEffect(() => {
    if (!window.electronAPI) return;
    
    // Load Settings
    window.electronAPI.getSettings().then((res) => {
      if (res) setSettings(res);
    });

    // Load History
    window.electronAPI.getHistory().then((res) => {
      if (res) {
        if (res.records) setRecords(res.records);
        if (res.lastProcessedPath) setLastProcessedPath(res.lastProcessedPath);
      }
    });
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(newSettings);
    }
  };

  const handleSelectFolder = async () => {
    if (!window.electronAPI) {
      alert('Please run this inside the Electron app (npm run start).');
      return;
    }
    const path = await window.electronAPI.selectFolder();
    if (!path) return;
    setFolderPath(path);
    setIsScanning(true);
    const scan = await window.electronAPI.scanPdfs(path);
    setIsScanning(false);
    if (scan.success) {
      setPdfFiles(scan.files);
      setSelected(new Set(scan.files.map((f) => f.path)));
    } else {
      alert('Scan error: ' + scan.error);
    }
  };

  const toggleAll = () => {
    if (selected.size === pdfFiles.length) setSelected(new Set());
    else setSelected(new Set(pdfFiles.map((f) => f.path)));
  };

  const toggleOne = (path: string) => {
    const s = new Set(selected);
    s.has(path) ? s.delete(path) : s.add(path);
    setSelected(s);
  };

  // ─── Single Item Pipeline Execution ───
  const processSingleFile = async (filePath: string, currentRecords: Record<string, RecordData>) => {
    if (!window.electronAPI) return currentRecords;

    const fileName = pdfFiles.find(f => f.path === filePath)?.name || filePath.split('\\').pop() || 'Bill.pdf';

    // Step 1: Extract PDF Data
    const extractedList = await window.electronAPI.extractPdfData([filePath]);
    const extracted = extractedList[0];

    if (!extracted || extracted.status === 'Error') {
      const errRecord: RecordData = {
        path: filePath,
        pdfName: fileName,
        customerName: '—',
        customerNumber: '—',
        billNo: '—',
        date: '—',
        amount: '—',
        confidence: 'None',
        pages: 0,
        status: 'Error',
        uploadStatus: 'Error',
        whatsappStatus: 'Error',
        error: extracted?.error || 'Failed to parse PDF',
        processedAt: new Date().toLocaleTimeString(),
      };
      const updated = { ...currentRecords, [filePath]: errRecord };
      setRecords(updated);
      setLastProcessedPath(filePath);
      await window.electronAPI.saveHistory({ lastProcessedPath: filePath, records: updated });
      return updated;
    }

    // Update state to extracted & uploading
    let activeRecord: RecordData = {
      ...extracted,
      uploadStatus: 'Uploading',
      whatsappStatus: 'Idle',
      processedAt: new Date().toLocaleTimeString(),
    };
    let updatedRecords = { ...currentRecords, [filePath]: activeRecord };
    setRecords(updatedRecords);

    // Step 2: Upload to Uploadthing / Fallback
    const uploadRes = await window.electronAPI.uploadthingUpload({
      filePath,
      uploadthingToken: settings.uploadthingToken,
    });

    if (!uploadRes.success || !uploadRes.publicUrl) {
      activeRecord.uploadStatus = 'Error';
      activeRecord.error = uploadRes.error || 'Failed to upload PDF';
      updatedRecords = { ...currentRecords, [filePath]: activeRecord };
      setRecords(updatedRecords);
      setLastProcessedPath(filePath);
      await window.electronAPI.saveHistory({ lastProcessedPath: filePath, records: updatedRecords });
      return updatedRecords;
    }

    activeRecord.publicUrl = uploadRes.publicUrl;
    activeRecord.uploadStatus = 'Uploaded';
    activeRecord.whatsappStatus = 'Sending';
    updatedRecords = { ...currentRecords, [filePath]: activeRecord };
    setRecords(updatedRecords);

    // Step 3: Send WhatsApp Message via AiSensy API
    if (activeRecord.customerNumber !== 'Not Found' && activeRecord.customerNumber !== '—') {
      const waRes = await window.electronAPI.aisensySend({
        apiKey: settings.aisensyApiKey,
        campaignName: settings.aisensyCampaignName,
        destination: activeRecord.customerNumber,
        customerName: activeRecord.customerName,
        billNo: activeRecord.billNo,
        amount: activeRecord.amount,
        pdfUrl: activeRecord.publicUrl,
        countryCode: settings.countryCode,
      });

      if (waRes.success) {
        activeRecord.whatsappStatus = 'Sent';
      } else {
        activeRecord.whatsappStatus = 'Error';
        activeRecord.error = waRes.error || 'WhatsApp delivery failed';
      }
    } else {
      activeRecord.whatsappStatus = 'Error';
      activeRecord.error = 'Customer Mobile Number not found in PDF';
    }

    // Step 4: Save State & History
    updatedRecords = { ...currentRecords, [filePath]: activeRecord };
    setRecords(updatedRecords);
    setLastProcessedPath(filePath);
    await window.electronAPI.saveHistory({ lastProcessedPath: filePath, records: updatedRecords });

    return updatedRecords;
  };

  // ─── Batch Execution ───
  const handleProcessSelected = async () => {
    if (!window.electronAPI || selected.size === 0) return;
    setIsProcessing(true);

    let currentMap = { ...records };
    for (const filePath of Array.from(selected)) {
      currentMap = await processSingleFile(filePath, currentMap);
    }

    setIsProcessing(false);
  };

  // ─── Resume Next Unprocessed PDF ───
  const handleResumeNext = async () => {
    if (pdfFiles.length === 0) {
      alert('Please select a folder containing PDFs first.');
      return;
    }

    // Find first PDF that hasn't been processed yet or comes after lastProcessedPath
    let lastIndex = pdfFiles.findIndex(f => f.path === lastProcessedPath);
    let nextFile = pdfFiles[lastIndex + 1];

    if (!nextFile) {
      // Search any unprocessed file
      nextFile = pdfFiles.find(f => !records[f.path] || records[f.path].whatsappStatus !== 'Sent') || pdfFiles[0];
    }

    if (nextFile) {
      setSelected(new Set([nextFile.path]));
      setIsProcessing(true);
      await processSingleFile(nextFile.path, records);
      setIsProcessing(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear all processed history?')) {
      setRecords({});
      setLastProcessedPath(null);
      if (window.electronAPI) {
        await window.electronAPI.clearHistory();
      }
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const recordList = Object.values(records);
  const lastProcessedRecord = lastProcessedPath ? records[lastProcessedPath] : null;

  const handleSort = (field: keyof RecordData) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const filteredResults = recordList
    .filter((r) =>
      r.pdfName.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.customerNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.billNo.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = String(a[sortField] ?? '').toLowerCase();
      const bv = String(b[sortField] ?? '').toLowerCase();
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const SortIcon = ({ field }: { field: keyof RecordData }) =>
    sortField === field
      ? (sortAsc ? <ChevronUp size={12} className="text-[#2383e2]" /> : <ChevronDown size={12} className="text-[#2383e2]" />)
      : <ChevronDown size={12} className="text-[#c9c8c3] group-hover:text-[#9b9a97]" />;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white text-[#37352f]">

      {/* ── Top Header ── */}
      <header className="flex-shrink-0 h-14 px-6 border-b border-[#e9e9e7] bg-white flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl select-none">🧾</span>
          <div>
            <h1 className="font-semibold text-[15px] leading-tight text-[#37352f]">
              PDF Bill Extractor & WhatsApp Dispatcher
            </h1>
            <p className="text-[11px] text-[#9b9a97]">
              Uploadthing Public Links & AiSensy WhatsApp Automation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#37352f] bg-[#f7f6f3] border border-[#e9e9e7] hover:bg-[#efefef] transition-colors"
          >
            <Settings size={14} className="text-[#2383e2]" />
            Settings
          </button>

          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#2383e2] hover:bg-[#1a6bbf] transition-all shadow-xs active:scale-[0.98]"
          >
            <FolderOpen size={14} />
            {folderPath ? 'Change Folder' : 'Select Folder'}
          </button>
        </div>
      </header>

      {/* ── Last Processed PDF Persistence Banner ── */}
      {lastProcessedRecord && (
        <div className="flex-shrink-0 bg-[#e8f0fb] border-b border-[#d0e1f9] px-6 py-2 flex items-center justify-between text-xs z-15">
          <div className="flex items-center gap-2 truncate text-[#1a6bbf]">
            <FastForward size={14} className="flex-shrink-0" />
            <span className="font-bold">Last Processed PDF:</span>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#b2d3f7] font-semibold text-[#37352f] truncate">
              {lastProcessedRecord.pdfName}
            </span>
            <span className="text-[11px] opacity-80">
              ({lastProcessedRecord.customerName} - {lastProcessedRecord.processedAt})
            </span>
          </div>

          <button
            onClick={handleResumeNext}
            disabled={isProcessing}
            className="flex items-center gap-1 px-3 py-1 bg-[#2383e2] hover:bg-[#1a6bbf] text-white font-bold text-[11px] rounded transition-all shadow-xs active:scale-95 disabled:opacity-50"
          >
            <Play size={11} fill="currentColor" /> Resume Next PDF
          </button>
        </div>
      )}

      {/* ── Folder Path Breadcrumb ── */}
      {folderPath && (
        <div className="flex-shrink-0 h-9 px-6 bg-[#f7f6f3] border-b border-[#e9e9e7] flex items-center justify-between text-xs z-10">
          <div className="flex items-center gap-2 truncate">
            <span className="text-[#9b9a97]">📁</span>
            <span className="font-medium text-[#9b9a97]">Active Folder:</span>
            <span className="font-mono text-[#37352f] truncate">{folderPath}</span>
          </div>
          <div className="font-medium text-[#9b9a97] flex-shrink-0 ml-4">
            {pdfFiles.length} File{pdfFiles.length !== 1 ? 's' : ''} Loaded
          </div>
        </div>
      )}

      {/* ── Main Content Split View ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Left Sidebar: PDF Selector Panel ── */}
        <aside className="w-80 flex-shrink-0 flex flex-col h-full bg-[#f7f6f3] border-r border-[#e9e9e7]">

          {/* Sidebar Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-[#e9e9e7] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9b9a97]">
              PDF Bills ({selected.size}/{pdfFiles.length})
            </span>
            {pdfFiles.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-[#2383e2] hover:text-[#1a6bbf] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-[#e8f0fb]"
              >
                {selected.size === pdfFiles.length ? (
                  <><CheckSquare size={13} /> Deselect All</>
                ) : (
                  <><Square size={13} /> Select All</>
                )}
              </button>
            )}
          </div>

          {/* Scrollable PDF List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[#9b9a97]">
                <RefreshCw size={20} className="animate-spin text-[#2383e2]" />
                <span className="text-xs font-medium">Scanning directory...</span>
              </div>
            ) : pdfFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-[#9b9a97]">
                <span className="text-4xl opacity-40 mb-2">📂</span>
                <p className="text-xs font-medium">No PDF files loaded</p>
                <p className="text-[11px] text-[#c9c8c3] mt-1">Click "Select Folder" above to choose a directory.</p>
              </div>
            ) : (
              pdfFiles.map((file) => {
                const isSelected = selected.has(file.path);
                const rec = records[file.path];
                const isProcessed = rec?.whatsappStatus === 'Sent';

                return (
                  <div
                    key={file.path}
                    onClick={() => toggleOne(file.path)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer select-none transition-all"
                    style={{
                      background: isSelected ? '#e8f0fb' : 'transparent',
                      color: isSelected ? '#2383e2' : '#37352f',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = '#efefef';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex-shrink-0" style={{ color: isSelected ? '#2383e2' : '#9b9a97' }}>
                      {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                        {isProcessed && (
                          <span title="Processed & Sent">
                            <CheckCircle size={12} className="text-[#2d7738] flex-shrink-0" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: isSelected ? '#6aadea' : '#9b9a97' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Action Footer */}
          <div className="flex-shrink-0 p-3 bg-[#f7f6f3] border-t border-[#e9e9e7] space-y-2 z-10">
            <button
              onClick={handleProcessSelected}
              disabled={isProcessing || selected.size === 0}
              className="w-full py-2.5 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.99]"
              style={{
                background: isProcessing || selected.size === 0 ? '#e9e9e7' : '#2383e2',
                color: isProcessing || selected.size === 0 ? '#9b9a97' : '#ffffff',
                cursor: isProcessing || selected.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isProcessing ? (
                <><RefreshCw size={14} className="animate-spin" /> Processing & Sending WhatsApp...</>
              ) : (
                <><Send size={14} /> Process & Send WhatsApp ({selected.size})</>
              )}
            </button>
          </div>
        </aside>

        {/* ── Right Panel: Results Data Table ── */}
        <main className="flex-1 min-w-0 flex flex-col h-full bg-white">

          {/* Table Toolbar */}
          <div className="flex-shrink-0 h-12 px-6 border-b border-[#e9e9e7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-[#9b9a97]" />
              <span className="text-xs font-semibold text-[#37352f]">Extracted Data & Dispatch Status</span>
              {recordList.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-[#e8f0fb] text-[#2383e2]">
                  {filteredResults.length} / {recordList.length} Records
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {recordList.length > 0 && (
                <>
                  <button
                    onClick={handleClearHistory}
                    className="p-1.5 rounded-md text-[#9b9a97] hover:text-[#c0392b] hover:bg-[#fdf2f2] transition-colors"
                    title="Clear Processing History"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#f7f6f3] border border-[#e9e9e7]">
                    <Search size={12} className="text-[#9b9a97]" />
                    <input
                      type="text"
                      placeholder="Filter records..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="text-xs bg-transparent outline-none w-44 text-[#37352f] placeholder-[#9b9a97]"
                    />
                    {search && (
                      <button onClick={() => setSearch('')}>
                        <X size={12} className="text-[#9b9a97] hover:text-[#37352f]" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Scrollable Data Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            {recordList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#9b9a97]">
                <span className="text-5xl opacity-20 mb-3 select-none">📊</span>
                <p className="text-sm font-semibold text-[#37352f]">No Extracted Records Yet</p>
                <p className="text-xs text-[#9b9a97] max-w-sm mt-1">
                  Select your PDF bills from the left panel and click <b>Process & Send WhatsApp</b> to automatically extract details, upload to Uploadthing, and trigger AiSensy.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#f7f6f3] z-10 border-b border-[#e9e9e7]">
                  <tr>
                    {[
                      { label: '#', field: null, w: 'w-10' },
                      { label: 'PDF File', field: 'pdfName' as keyof RecordData },
                      { label: 'Customer Name', field: 'customerName' as keyof RecordData },
                      { label: 'Mob No.', field: 'customerNumber' as keyof RecordData },
                      { label: 'Bill No.', field: 'billNo' as keyof RecordData },
                      { label: 'Amount', field: 'amount' as keyof RecordData },
                      { label: 'Public PDF URL', field: null },
                      { label: 'WhatsApp Status', field: 'whatsappStatus' as keyof RecordData },
                      { label: 'Actions', field: null },
                    ].map(({ label, field, w }) => (
                      <th
                        key={label}
                        onClick={() => field && handleSort(field)}
                        className={`group px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#9b9a97] select-none ${field ? 'cursor-pointer hover:bg-[#efefef]' : ''} ${w ?? ''}`}
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {field && <SortIcon field={field} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f0ee]">
                  {filteredResults.map((row, i) => (
                    <tr
                      key={row.path}
                      className="hover:bg-[#f7f6f3] transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-[#c9c8c3]">{i + 1}</td>

                      {/* PDF File Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-[#9b9a97] flex-shrink-0" />
                          <span className="text-xs font-medium text-[#37352f] truncate max-w-[150px]" title={row.pdfName}>
                            {row.pdfName}
                          </span>
                        </div>
                      </td>

                      {/* Customer Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-[#2383e2] flex-shrink-0" />
                          <span className="text-xs font-semibold text-[#111827]">
                            {row.customerName}
                          </span>
                        </div>
                      </td>

                      {/* Mob No. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-[#2d7738] flex-shrink-0" />
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#dff6e4] text-[#2d7738] border border-[#c3e6cb]">
                            {row.customerNumber}
                          </span>
                        </div>
                      </td>

                      {/* Bill No. */}
                      <td className="px-4 py-3 text-xs font-mono text-[#4b5563]">
                        {row.billNo}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-xs font-bold font-mono text-[#2d7738]">
                        {row.amount !== 'Not Found' && row.amount !== '—' ? `₹${row.amount}` : row.amount}
                      </td>

                      {/* Public PDF URL */}
                      <td className="px-4 py-3">
                        {row.publicUrl ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={row.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-mono text-[#2383e2] hover:underline flex items-center gap-1 truncate max-w-[140px]"
                            >
                              <ExternalLink size={11} /> {row.publicUrl.replace('https://', '')}
                            </a>
                            <button
                              onClick={() => copyToClipboard(row.publicUrl!)}
                              className="p-1 rounded text-[#9b9a97] hover:text-[#37352f] hover:bg-[#efefef]"
                              title="Copy URL"
                            >
                              <Copy size={12} />
                            </button>
                            {copiedUrl === row.publicUrl && (
                              <span className="text-[10px] text-[#2d7738] font-bold">Copied!</span>
                            )}
                          </div>
                        ) : row.uploadStatus === 'Uploading' ? (
                          <span className="flex items-center gap-1 text-xs text-[#2383e2]">
                            <RefreshCw size={12} className="animate-spin" /> Uploading...
                          </span>
                        ) : (
                          <span className="text-xs text-[#c9c8c3]">—</span>
                        )}
                      </td>

                      {/* WhatsApp Status */}
                      <td className="px-4 py-3">
                        {row.whatsappStatus === 'Sent' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2d7738] bg-[#dff6e4] px-2 py-0.5 rounded border border-[#c3e6cb]">
                            <CheckCircle size={12} /> Sent via AiSensy
                          </span>
                        ) : row.whatsappStatus === 'Sending' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2383e2] bg-[#e8f0fb] px-2 py-0.5 rounded">
                            <RefreshCw size={12} className="animate-spin" /> Sending...
                          </span>
                        ) : row.whatsappStatus === 'Error' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#c0392b] bg-[#fdf2f2] px-2 py-0.5 rounded border border-[#f5c6cb]" title={row.error}>
                            <AlertCircle size={12} /> Failed
                          </span>
                        ) : (
                          <span className="text-xs text-[#9b9a97]">Pending</span>
                        )}
                      </td>

                      {/* Single Action */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => processSingleFile(row.path, records)}
                          disabled={isProcessing}
                          className="px-2 py-1 bg-[#f7f6f3] hover:bg-[#e8f0fb] hover:text-[#2383e2] text-xs font-medium rounded border border-[#e9e9e7] transition-colors"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

    </div>
  );
}
