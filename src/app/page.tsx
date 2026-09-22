'use client';

import { useState, useEffect } from 'react';
import {
  FolderOpen, Play, FileText, CheckSquare, Square,
  RefreshCw, AlertCircle, CheckCircle, ChevronDown,
  ChevronUp, X, Search, FileCheck, Phone, User,
  Settings, ExternalLink, Copy, Upload
} from 'lucide-react';
import SettingsModal, { AppSettings } from './components/SettingsModal';

interface PdfFile {
  name: string;
  path: string;
  size: number;
}

interface RowRecord {
  path: string;
  pdfName: string;
  customerName: string;
  customerNumber: string;
  billNo: string;
  date: string;
  amount: string;
  confidence: string;
  pages: number;
  // Extraction
  extractStatus: 'Idle' | 'Extracting' | 'OK' | 'Error';
  extractError?: string;
  // Upload
  uploadStatus: 'Idle' | 'Uploading' | 'Uploaded' | 'Error';
  publicUrl?: string;
  uploadError?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>;
      scanPdfs: (p: string) => Promise<{ success: boolean; files: PdfFile[]; error?: string }>;
      extractPdfData: (paths: string[]) => Promise<any[]>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (s: AppSettings) => Promise<{ success: boolean }>;
      uploadthingUpload: (p: { filePath: string; uploadthingToken?: string }) => Promise<{ success: boolean; publicUrl?: string; error?: string }>;
    };
  }
}

const defaultSettings: AppSettings = {
  uploadthingToken: '',
  aisensyApiKey: '',
  aisensyCampaignName: '',
  countryCode: '91',
};

export default function Home() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Results — only populated after clicking Run, never from history
  const [rows, setRows] = useState<Record<string, RowRecord>>({});

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof RowRecord>('pdfName');
  const [sortAsc, setSortAsc] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Load settings only (no history preload — fresh results each session)
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getSettings().then(s => { if (s) setSettings(s); });
  }, []);

  const handleSaveSettings = async (s: AppSettings) => {
    setSettings(s);
    await window.electronAPI?.saveSettings(s);
  };

  // ── Folder Selection ──────────────────────────────────────────────────
  const handleSelectFolder = async () => {
    if (!window.electronAPI) return alert('Run inside the Electron app.');
    const p = await window.electronAPI.selectFolder();
    if (!p) return;
    setFolderPath(p);
    setIsScanning(true);
    setRows({});           // clear previous results when folder changes
    setSelected(new Set());
    const scan = await window.electronAPI.scanPdfs(p);
    setIsScanning(false);
    if (scan.success) {
      setPdfFiles(scan.files);
      setSelected(new Set(scan.files.map(f => f.path)));
    } else {
      alert('Scan error: ' + scan.error);
    }
  };

  const toggleAll = () =>
    selected.size === pdfFiles.length
      ? setSelected(new Set())
      : setSelected(new Set(pdfFiles.map(f => f.path)));

  const toggleOne = (p: string) => {
    const s = new Set(selected);
    s.has(p) ? s.delete(p) : s.add(p);
    setSelected(s);
  };

  // ── Main Run ──────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!window.electronAPI || selected.size === 0) return;
    setIsRunning(true);

    const paths = Array.from(selected);

    // Initialise all selected rows as "Extracting"
    const initMap: Record<string, RowRecord> = {};
    for (const p of paths) {
      const file = pdfFiles.find(f => f.path === p);
      initMap[p] = {
        path: p,
        pdfName: file?.name ?? p.split('\\').pop() ?? p,
        customerName: '—', customerNumber: '—',
        billNo: '—', date: '—', amount: '—',
        confidence: 'Low', pages: 0,
        extractStatus: 'Extracting',
        uploadStatus: 'Idle',
      };
    }
    setRows(initMap);

    // ── Step 1: Extract all PDFs at once via IPC ──
    const extracted: any[] = await window.electronAPI.extractPdfData(paths);

    const afterExtract: Record<string, RowRecord> = { ...initMap };
    for (const ex of extracted) {
      const noPhone =
        !ex.customerNumber ||
        ex.customerNumber === 'Not Found' ||
        ex.customerNumber === '—';

      afterExtract[ex.path] = {
        ...afterExtract[ex.path],
        customerName: ex.customerName ?? '—',
        customerNumber: ex.customerNumber ?? '—',
        billNo: ex.billNo ?? '—',
        date: ex.date ?? '—',
        amount: ex.amount ?? '—',
        confidence: ex.confidence ?? 'Low',
        pages: ex.pages ?? 0,
        // If PDF failed to parse, mark Error. If no phone, mark Error too.
        extractStatus: ex.status === 'Error'
          ? 'Error'
          : noPhone ? 'Error' : 'OK',
        extractError: ex.status === 'Error'
          ? (ex.error ?? 'Failed to parse PDF')
          : noPhone
            ? 'Phone number not found in this PDF — upload skipped'
            : undefined,
        uploadStatus: 'Idle',
      };
    }
    setRows({ ...afterExtract });

    // ── Step 2: Check Uploadthing token ──
    if (!settings.uploadthingToken?.trim()) {
      // Mark all OK rows with a token-missing error
      const noToken: Record<string, RowRecord> = {};
      for (const [p, row] of Object.entries(afterExtract)) {
        noToken[p] = row.extractStatus === 'OK'
          ? { ...row, uploadStatus: 'Error', uploadError: 'No Uploadthing token — open ⚙️ Settings to add it' }
          : row;
      }
      setRows(noToken);
      setIsRunning(false);
      return;
    }

    // ── Step 3: Upload each successfully extracted row sequentially ──
    for (const [p, row] of Object.entries(afterExtract)) {
      if (row.extractStatus !== 'OK') continue;

      // Show uploading state
      setRows(prev => ({ ...prev, [p]: { ...prev[p], uploadStatus: 'Uploading' } }));

      const res = await window.electronAPI.uploadthingUpload({
        filePath: p,
        uploadthingToken: settings.uploadthingToken,
      });

      setRows(prev => ({
        ...prev,
        [p]: {
          ...prev[p],
          uploadStatus: res.success ? 'Uploaded' : 'Error',
          publicUrl: res.publicUrl,
          uploadError: res.success ? undefined : (res.error ?? 'Upload failed'),
        },
      }));
    }

    setIsRunning(false);
  };

  // ── Table helpers ─────────────────────────────────────────────────────
  const handleSort = (f: keyof RowRecord) => {
    if (sortField === f) setSortAsc(a => !a);
    else { setSortField(f); setSortAsc(true); }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const rowList = Object.values(rows)
    .filter(r =>
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

  const SortIcon = ({ f }: { f: keyof RowRecord }) =>
    sortField === f
      ? sortAsc
        ? <ChevronUp size={12} className="text-[#2383e2]" />
        : <ChevronDown size={12} className="text-[#2383e2]" />
      : <ChevronDown size={12} className="text-[#c9c8c3] group-hover:text-[#9b9a97]" />;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white text-[#37352f]">

      {/* Header */}
      <header className="flex-shrink-0 h-14 px-6 border-b border-[#e9e9e7] bg-white flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl select-none">🧾</span>
          <div>
            <h1 className="font-semibold text-[15px] leading-tight">PDF Bill Extractor</h1>
            <p className="text-[11px] text-[#9b9a97]">Extract · Validate Phone · Upload to Uploadthing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-[#37352f] bg-[#f7f6f3] border border-[#e9e9e7] hover:bg-[#efefef] transition-colors"
          >
            <Settings size={14} className="text-[#2383e2]" /> Settings
          </button>
          <button
            onClick={handleSelectFolder}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#2383e2] hover:bg-[#1a6bbf] transition-all shadow-sm active:scale-[0.98]"
          >
            <FolderOpen size={14} />
            {folderPath ? 'Change Folder' : 'Select Folder'}
          </button>
        </div>
      </header>

      {/* Folder breadcrumb */}
      {folderPath && (
        <div className="flex-shrink-0 h-9 px-6 bg-[#f7f6f3] border-b border-[#e9e9e7] flex items-center justify-between text-xs z-10">
          <div className="flex items-center gap-2 truncate">
            <span className="text-[#9b9a97]">📁</span>
            <span className="font-medium text-[#9b9a97]">Active Folder:</span>
            <span className="font-mono text-[#37352f] truncate">{folderPath}</span>
          </div>
          <span className="font-medium text-[#9b9a97] ml-4 flex-shrink-0">
            {pdfFiles.length} File{pdfFiles.length !== 1 ? 's' : ''} Loaded
          </span>
        </div>
      )}

      {/* Main split */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left Sidebar */}
        <aside className="w-72 flex-shrink-0 flex flex-col h-full bg-[#f7f6f3] border-r border-[#e9e9e7]">
          <div className="flex-shrink-0 px-4 py-3 border-b border-[#e9e9e7] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9b9a97]">
              PDF Bills ({selected.size}/{pdfFiles.length})
            </span>
            {pdfFiles.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-[#2383e2] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#e8f0fb] transition-colors"
              >
                {selected.size === pdfFiles.length
                  ? <><CheckSquare size={13} /> Deselect All</>
                  : <><Square size={13} /> Select All</>}
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[#9b9a97]">
                <RefreshCw size={20} className="animate-spin text-[#2383e2]" />
                <span className="text-xs">Scanning directory...</span>
              </div>
            ) : pdfFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-[#9b9a97]">
                <span className="text-4xl opacity-40 mb-2">📂</span>
                <p className="text-xs font-medium">No PDF files loaded</p>
                <p className="text-[11px] text-[#c9c8c3] mt-1">Click "Select Folder" to choose a directory.</p>
              </div>
            ) : (
              pdfFiles.map(file => {
                const isSel = selected.has(file.path);
                const row = rows[file.path];
                return (
                  <div
                    key={file.path}
                    onClick={() => toggleOne(file.path)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer select-none transition-all"
                    style={{ background: isSel ? '#e8f0fb' : 'transparent', color: isSel ? '#2383e2' : '#37352f' }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#efefef'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ color: isSel ? '#2383e2' : '#9b9a97' }}>
                      {isSel ? <CheckSquare size={14} /> : <Square size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                        {row?.extractStatus === 'OK' && row.uploadStatus === 'Uploaded' && (
                          <CheckCircle size={12} className="text-[#2d7738] flex-shrink-0" />
                        )}
                        {row?.extractStatus === 'Error' && (
                          <AlertCircle size={12} className="text-[#c0392b] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: isSel ? '#6aadea' : '#9b9a97' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex-shrink-0 p-3 border-t border-[#e9e9e7]">
            <button
              onClick={handleRun}
              disabled={isRunning || selected.size === 0}
              className="w-full py-2.5 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
              style={{
                background: isRunning || selected.size === 0 ? '#e9e9e7' : '#2383e2',
                color: isRunning || selected.size === 0 ? '#9b9a97' : '#ffffff',
                cursor: isRunning || selected.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isRunning
                ? <><RefreshCw size={14} className="animate-spin" /> Processing...</>
                : <><Play size={14} fill="currentColor" /> Run Extraction ({selected.size})</>}
            </button>
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 min-w-0 flex flex-col h-full bg-white">
          <div className="flex-shrink-0 h-12 px-6 border-b border-[#e9e9e7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-[#9b9a97]" />
              <span className="text-xs font-semibold">Extracted Data</span>
              {Object.keys(rows).length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-[#e8f0fb] text-[#2383e2]">
                  {rowList.length} / {Object.keys(rows).length}
                </span>
              )}
            </div>
            {Object.keys(rows).length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#f7f6f3] border border-[#e9e9e7]">
                <Search size={12} className="text-[#9b9a97]" />
                <input
                  type="text"
                  placeholder="Filter results..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="text-xs bg-transparent outline-none w-44 text-[#37352f] placeholder-[#9b9a97]"
                />
                {search && (
                  <button onClick={() => setSearch('')}>
                    <X size={12} className="text-[#9b9a97] hover:text-[#37352f]" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {Object.keys(rows).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#9b9a97]">
                <span className="text-5xl opacity-20 mb-3 select-none">📊</span>
                <p className="text-sm font-semibold text-[#37352f]">No Results Yet</p>
                <p className="text-xs text-[#9b9a97] max-w-sm mt-1">
                  Select PDFs from the left and click <b>Run Extraction</b>.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#f7f6f3] z-10 border-b border-[#e9e9e7]">
                  <tr>
                    {([
                      { label: '#', field: null },
                      { label: 'PDF File', field: 'pdfName' },
                      { label: 'Customer Name', field: 'customerName' },
                      { label: 'Mob No.', field: 'customerNumber' },
                      { label: 'Bill No.', field: 'billNo' },
                      { label: 'Date', field: 'date' },
                      { label: 'Amount', field: 'amount' },
                      { label: 'Extraction', field: 'extractStatus' },
                      { label: 'Public PDF URL', field: null },
                      { label: 'Upload', field: 'uploadStatus' },
                    ] as { label: string; field: keyof RowRecord | null }[]).map(({ label, field }) => (
                      <th
                        key={label}
                        onClick={() => field && handleSort(field)}
                        className={`group px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#9b9a97] select-none whitespace-nowrap ${field ? 'cursor-pointer hover:bg-[#efefef]' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {field && <SortIcon f={field} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f0ee]">
                  {rowList.map((row, i) => (
                    <tr key={row.path} className="hover:bg-[#f7f6f3] transition-colors">
                      <td className="px-3 py-3 text-xs text-[#c9c8c3]">{i + 1}</td>

                      {/* PDF Name */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-[#9b9a97] flex-shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[140px]" title={row.pdfName}>{row.pdfName}</span>
                        </div>
                      </td>

                      {/* Customer Name */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-[#2383e2] flex-shrink-0" />
                          <span className="text-xs font-semibold">{row.customerName}</span>
                        </div>
                      </td>

                      {/* Phone — red if missing */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="flex-shrink-0" style={{ color: row.extractError?.includes('Phone') ? '#c0392b' : '#2d7738' }} />
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                            row.extractError?.includes('Phone')
                              ? 'bg-[#fdf2f2] text-[#c0392b] border-[#f5c6cb]'
                              : 'bg-[#dff6e4] text-[#2d7738] border-[#c3e6cb]'
                          }`}>
                            {row.customerNumber}
                          </span>
                        </div>
                      </td>

                      {/* Bill No */}
                      <td className="px-3 py-3 text-xs font-mono text-[#4b5563]">{row.billNo}</td>

                      {/* Date */}
                      <td className="px-3 py-3 text-xs text-[#6b7280]">{row.date}</td>

                      {/* Amount */}
                      <td className="px-3 py-3 text-xs font-bold font-mono text-[#2d7738]">
                        {row.amount !== 'Not Found' && row.amount !== '—' ? `₹${row.amount}` : row.amount}
                      </td>

                      {/* Extraction Status */}
                      <td className="px-3 py-3">
                        {row.extractStatus === 'Extracting' ? (
                          <span className="flex items-center gap-1 text-xs text-[#2383e2]">
                            <RefreshCw size={12} className="animate-spin" /> Extracting...
                          </span>
                        ) : row.extractStatus === 'OK' ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-[#2d7738]">
                            <CheckCircle size={12} /> Extracted
                          </span>
                        ) : row.extractStatus === 'Error' ? (
                          <div>
                            <span className="flex items-center gap-1 text-xs font-semibold text-[#c0392b]">
                              <AlertCircle size={12} /> Failed
                            </span>
                            {row.extractError && (
                              <p className="text-[10px] text-[#c0392b] mt-0.5 max-w-[160px] leading-tight">{row.extractError}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#9b9a97]">—</span>
                        )}
                      </td>

                      {/* Public URL */}
                      <td className="px-3 py-3">
                        {row.publicUrl ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={row.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[#2383e2] hover:underline flex items-center gap-1 truncate max-w-[120px]"
                            >
                              <ExternalLink size={11} />
                              {row.publicUrl.replace('https://', '')}
                            </a>
                            <button
                              onClick={() => copyUrl(row.publicUrl!)}
                              className="p-1 rounded text-[#9b9a97] hover:text-[#37352f] hover:bg-[#efefef]"
                            >
                              <Copy size={11} />
                            </button>
                            {copiedUrl === row.publicUrl && (
                              <span className="text-[10px] text-[#2d7738] font-bold">Copied!</span>
                            )}
                          </div>
                        ) : row.uploadStatus === 'Uploading' ? (
                          <span className="flex items-center gap-1 text-xs text-[#2383e2]">
                            <RefreshCw size={11} className="animate-spin" /> Uploading...
                          </span>
                        ) : row.uploadError ? (
                          <span className="text-[10px] text-[#c0392b] max-w-[150px] leading-tight">{row.uploadError}</span>
                        ) : (
                          <span className="text-xs text-[#c9c8c3]">—</span>
                        )}
                      </td>

                      {/* Upload Badge */}
                      <td className="px-3 py-3">
                        {row.uploadStatus === 'Uploaded' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2d7738] bg-[#dff6e4] px-2 py-0.5 rounded border border-[#c3e6cb]">
                            <Upload size={11} /> Uploaded
                          </span>
                        ) : row.uploadStatus === 'Uploading' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#2383e2]">
                            <RefreshCw size={11} className="animate-spin" /> Uploading
                          </span>
                        ) : row.uploadStatus === 'Error' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#c0392b] bg-[#fdf2f2] px-2 py-0.5 rounded border border-[#f5c6cb]">
                            <AlertCircle size={11} /> Error
                          </span>
                        ) : row.extractStatus === 'Error' ? (
                          <span className="text-xs text-[#9b9a97]">Skipped</span>
                        ) : (
                          <span className="text-xs text-[#9b9a97]">—</span>
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
