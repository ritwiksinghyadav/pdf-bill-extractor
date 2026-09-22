'use client';

import { useState } from 'react';
import {
  FolderOpen, Play, FileText, CheckSquare, Square,
  RefreshCw, AlertCircle, CheckCircle, ChevronDown,
  ChevronUp, X, Search, FileCheck, Phone, User, Calendar, Receipt
} from 'lucide-react';

interface PdfFile {
  name: string;
  path: string;
  size: number;
}

interface ExtractionResult {
  path: string;
  pdfName: string;
  customerName: string;
  customerNumber: string; // Mob No.
  billNo: string;
  date: string;
  amount: string;
  confidence: string;
  pages: number;
  status: 'Success' | 'Error';
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>;
      scanPdfs: (p: string) => Promise<{ success: boolean; files: PdfFile[]; error?: string }>;
      extractPdfData: (paths: string[]) => Promise<ExtractionResult[]>;
    };
  }
}

export default function Home() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [sortField, setSortField] = useState<keyof ExtractionResult>('pdfName');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');

  const handleSelectFolder = async () => {
    if (!window.electronAPI) {
      alert('Please run this inside the Electron app (npm run start).');
      return;
    }
    const path = await window.electronAPI.selectFolder();
    if (!path) return;
    setFolderPath(path);
    setIsScanning(true);
    setResults([]);
    setSelected(new Set());
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

  const handleRun = async () => {
    if (!window.electronAPI || selected.size === 0) return;
    setIsProcessing(true);
    const res = await window.electronAPI.extractPdfData(Array.from(selected));
    setResults(res);
    setIsProcessing(false);
  };

  const handleSort = (field: keyof ExtractionResult) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const filteredResults = results
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

  const SortIcon = ({ field }: { field: keyof ExtractionResult }) =>
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
              PDF Bill Extractor
            </h1>
            <p className="text-[11px] text-[#9b9a97]">
              Extract Customer Name, Mobile No., Bill No., Date & Net Amount
            </p>
          </div>
        </div>

        <button
          onClick={handleSelectFolder}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white transition-all shadow-sm active:scale-[0.98]"
          style={{ background: '#2383e2' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1a6bbf')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2383e2')}
        >
          <FolderOpen size={14} />
          {folderPath ? 'Change Folder' : 'Select Folder'}
        </button>
      </header>

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
                      <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: isSelected ? '#6aadea' : '#9b9a97' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Fixed Sticky Footer Button */}
          <div className="flex-shrink-0 p-3 bg-[#f7f6f3] border-t border-[#e9e9e7] z-10">
            <button
              onClick={handleRun}
              disabled={isProcessing || selected.size === 0}
              className="w-full py-2.5 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
              style={{
                background: isProcessing || selected.size === 0 ? '#e9e9e7' : '#2383e2',
                color: isProcessing || selected.size === 0 ? '#9b9a97' : '#ffffff',
                cursor: isProcessing || selected.size === 0 ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!isProcessing && selected.size > 0) e.currentTarget.style.background = '#1a6bbf';
              }}
              onMouseLeave={e => {
                if (!isProcessing && selected.size > 0) e.currentTarget.style.background = '#2383e2';
              }}
            >
              {isProcessing ? (
                <><RefreshCw size={14} className="animate-spin" /> Processing Extraction...</>
              ) : (
                <><Play size={14} fill="currentColor" /> Run Extraction ({selected.size})</>
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
              <span className="text-xs font-semibold text-[#37352f]">Extracted Data Records</span>
              {results.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-[#e8f0fb] text-[#2383e2]">
                  {filteredResults.length} / {results.length}
                </span>
              )}
            </div>

            {results.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#f7f6f3] border border-[#e9e9e7]">
                <Search size={12} className="text-[#9b9a97]" />
                <input
                  type="text"
                  placeholder="Filter results..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="text-xs bg-transparent outline-none w-48 text-[#37352f] placeholder-[#9b9a97]"
                />
                {search && (
                  <button onClick={() => setSearch('')}>
                    <X size={12} className="text-[#9b9a97] hover:text-[#37352f]" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scrollable Data Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#9b9a97]">
                <span className="text-5xl opacity-20 mb-3 select-none">📊</span>
                <p className="text-sm font-semibold text-[#37352f]">No Extraction Results</p>
                <p className="text-xs text-[#9b9a97] max-w-sm mt-1">
                  Select your PDF bills from the left panel and click <b>Run Extraction</b> to extract Customer Name, Mobile No., Bill No., Date & Net Amount.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#f7f6f3] z-10 border-b border-[#e9e9e7]">
                  <tr>
                    {[
                      { label: '#', field: null, w: 'w-10' },
                      { label: 'PDF File', field: 'pdfName' as keyof ExtractionResult },
                      { label: 'Customer Name', field: 'customerName' as keyof ExtractionResult },
                      { label: 'Mob No.', field: 'customerNumber' as keyof ExtractionResult },
                      { label: 'Bill No.', field: 'billNo' as keyof ExtractionResult },
                      { label: 'Date', field: 'date' as keyof ExtractionResult },
                      { label: 'Net Amount', field: 'amount' as keyof ExtractionResult },
                      { label: 'Status', field: 'status' as keyof ExtractionResult },
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
                          <span className="text-xs font-medium text-[#37352f] truncate max-w-[170px]" title={row.pdfName}>
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

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-[#6b7280]">
                        {row.date}
                      </td>

                      {/* Net Amount */}
                      <td className="px-4 py-3 text-xs font-bold font-mono text-[#2d7738]">
                        {row.amount !== 'Not Found' && row.amount !== '—' ? `₹${row.amount}` : row.amount}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {row.status === 'Success' ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-[#2d7738]">
                            <CheckCircle size={13} /> Extracted
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-[#c0392b]" title={row.error}>
                            <AlertCircle size={13} /> Error
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
