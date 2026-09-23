'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Play,
  FileText,
  CheckSquare,
  Square,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Search,
  FileCheck,
  Phone,
  ExternalLink,
  Copy,
  Upload,
  Send,
  Edit2,
  Sparkles,
  Check,
  RotateCcw,
  FileSpreadsheet,
} from 'lucide-react';
import Sidebar, { ActiveTab } from './components/Sidebar';
import SettingsView from './components/SettingsView';
import CampaignsView from './components/CampaignsView';
import CacheLedgerView from './components/CacheLedgerView';
import DailyLogsView from './components/DailyLogsView';
import {
  PdfFile,
  RowRecord,
  AppSettings,
  CacheEntry,
  StorageHistory,
  CampaignConfig,
} from './types';

const defaultCampaigns: CampaignConfig[] = [
  {
    id: 'camp_standard',
    name: 'Standard Bill Notification',
    templateName: 'bill_notification_v2',
    // Order MUST match your AiSensy template's {{1}}, {{2}}, {{3}}, {{4}} variables
    // PDF is sent as media attachment (not as a param) — do NOT include {{PublicUrl}} here
    params: ['{{CustomerName}}', '{{Date}}', '{{BillNo}}', '{{Amount}}'],
    customNote: 'Dear {{CustomerName}}, your bill {{BillNo}} dated {{Date}} for {{Amount}} is attached.',
    isActive: true,
  },
];


const defaultSettings: AppSettings = {
  uploadthingToken: '',
  aisensyApiKey: '',
  aisensyCampaignName: 'bill_notification_v2',
  countryCode: '91',
  campaigns: defaultCampaigns,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('bills');
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);

  // Execution states
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  // Extraction results
  const [rows, setRows] = useState<Record<string, RowRecord>>({});

  // Settings & Cache History
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [cacheHistory, setCacheHistory] = useState<StorageHistory>({
    lastProcessedPath: null,
    records: {},
  });

  // Table filtering and sorting
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof RowRecord>('pdfName');
  const [sortAsc, setSortAsc] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    path: string;
    field: 'customerName' | 'customerNumber' | 'billNo' | 'amount';
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  // WhatsApp confirmation dialog state
  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [whatsAppProgress, setWhatsAppProgress] = useState<{ current: number; total: number } | null>(null);

  // Floating non-blocking toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const showToast = (text: string, type: 'error' | 'success' = 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Auto-updater state
  const [downloadedUpdate, setDownloadedUpdate] = useState<{ version: string } | null>(null);

  // Load settings & cache history on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getSettings().then((s) => {
      if (s) {
        setSettings((prev) => ({
          ...prev,
          ...s,
          campaigns: (s.campaigns && s.campaigns.length > 0) ? s.campaigns : defaultCampaigns,
        }));
      }
    });
    window.electronAPI.getHistory().then((h) => {
      if (h && h.records) setCacheHistory(h);
    });

    // Listen for background auto-updates
    window.electronAPI.onUpdateAvailable?.((info) => {
      showToast(`New update (v${info.version}) downloading in background...`, 'success');
    });

    window.electronAPI.onUpdateDownloaded?.((info) => {
      setDownloadedUpdate(info);
    });
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await window.electronAPI?.saveSettings(newSettings);
  };

  const handleClearCache = async () => {
    await window.electronAPI?.clearHistory();
    setCacheHistory({ lastProcessedPath: null, records: {} });
    setRows((prev) => {
      const updated = { ...prev };
      for (const p in updated) {
        if (updated[p].uploadStatus === 'Cached') {
          updated[p].uploadStatus = 'Idle';
          updated[p].publicUrl = undefined;
        }
      }
      return updated;
    });
  };

  // ─── Folder Selection & Scanning ──────────────────────────────────────────
  const handleSelectFolder = async () => {
    if (!window.electronAPI) {
      showToast('Please launch inside the Electron desktop app.');
      return;
    }
    const p = await window.electronAPI.selectFolder();
    if (!p) return;
    setFolderPath(p);
    setIsScanning(true);
    setRows({});
    setSelected(new Set());

    const scan = await window.electronAPI.scanPdfs(p);
    setIsScanning(false);
    if (scan.success) {
      setPdfFiles(scan.files);
      setSelected(new Set(scan.files.map((f) => f.path)));
    } else {
      showToast('Directory scan error: ' + scan.error);
    }
  };

  const toggleAll = () =>
    selected.size === pdfFiles.length
      ? setSelected(new Set())
      : setSelected(new Set(pdfFiles.map((f) => f.path)));

  const toggleOne = (p: string) => {
    const s = new Set(selected);
    s.has(p) ? s.delete(p) : s.add(p);
    setSelected(s);
  };

  // ─── Stage 1: Run Extraction Only ─────────────────────────────────────────
  const handleRunExtraction = async () => {
    if (!window.electronAPI || selected.size === 0) return;
    setIsExtracting(true);

    const paths = Array.from(selected);

    // Initialise rows
    const initMap: Record<string, RowRecord> = {};
    for (const p of paths) {
      const file = pdfFiles.find((f) => f.path === p);
      const cached = cacheHistory.records[p];
      initMap[p] = {
        path: p,
        pdfName: file?.name ?? p.split('\\').pop() ?? p,
        customerName: cached?.customerName || '—',
        customerNumber: '—',
        billNo: cached?.billNo || '—',
        date: '—',
        amount: cached?.amount || '—',
        confidence: 'Low',
        pages: 0,
        extractStatus: 'Extracting',
        uploadStatus: cached ? 'Cached' : 'Idle',
        publicUrl: cached?.publicUrl,
        whatsAppStatus: 'Idle',
      };
    }
    setRows(initMap);

    const extracted: any[] = await window.electronAPI.extractPdfData(paths);

    const afterExtract: Record<string, RowRecord> = { ...initMap };
    for (const ex of extracted) {
      const cached = cacheHistory.records[ex.path];
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
        extractStatus:
          ex.status === 'Error' ? 'Error' : noPhone ? 'Error' : 'OK',
        extractError:
          ex.status === 'Error'
            ? ex.error ?? 'Failed to parse PDF'
            : noPhone
            ? 'Phone number missing — edit cell to fix'
            : undefined,
        uploadStatus: cached ? 'Cached' : 'Idle',
        publicUrl: cached?.publicUrl,
      };
    }
    setRows(afterExtract);
    setIsExtracting(false);
  };

  // ─── Stage 2: Upload Only to Cloud (UploadThing) ───────────────────────────
  const handleRunUpload = async (forceReuploadPaths?: string[]) => {
    if (!window.electronAPI) return;
    if (!settings.uploadthingToken?.trim()) {
      showToast('UploadThing Token is missing. Please go to "API & Credentials" to configure it.');
      setActiveTab('settings');
      return;
    }

    setIsUploading(true);
    const updatedHistoryRecords = { ...cacheHistory.records };
    const targetPaths = forceReuploadPaths || Object.keys(rows);

    for (const p of targetPaths) {
      const row = rows[p];
      if (!row || row.extractStatus !== 'OK') continue;
      if (!forceReuploadPaths && (row.uploadStatus === 'Uploaded' || row.uploadStatus === 'Cached')) {
        continue;
      }

      setRows((prev) => ({
        ...prev,
        [p]: { ...prev[p], uploadStatus: 'Uploading', uploadError: undefined },
      }));

      const res = await window.electronAPI.uploadthingUpload({
        filePath: p,
        uploadthingToken: settings.uploadthingToken,
      });

      if (res.success && res.publicUrl) {
        const file = pdfFiles.find((f) => f.path === p);
        const newRecord: CacheEntry = {
          path: p,
          pdfName: row.pdfName,
          customerName: row.customerName,
          billNo: row.billNo,
          amount: row.amount,
          publicUrl: res.publicUrl,
          uploadedAt: new Date().toISOString(),
          size: file?.size || 0,
        };
        updatedHistoryRecords[p] = newRecord;

        setRows((prev) => ({
          ...prev,
          [p]: {
            ...prev[p],
            uploadStatus: 'Uploaded',
            publicUrl: res.publicUrl,
            uploadError: undefined,
          },
        }));
      } else {
        setRows((prev) => ({
          ...prev,
          [p]: {
            ...prev[p],
            uploadStatus: 'Error',
            uploadError: res.error || 'Upload failed',
          },
        }));
      }
    }

    const newHistory: StorageHistory = {
      lastProcessedPath: folderPath,
      records: updatedHistoryRecords,
    };
    setCacheHistory(newHistory);
    await window.electronAPI.saveHistory(newHistory);
    setIsUploading(false);
  };

  // ─── Stage 3: Upload & Send WhatsApp (Active Campaign Evaluation) ──────────
  const activeCampaign = (settings.campaigns && settings.campaigns.length > 0)
    ? (settings.campaigns.find((c) => c.isActive) || settings.campaigns[0])
    : defaultCampaigns[0];

  const handleProceedWhatsAppBroadcast = async () => {
    setShowWhatsAppConfirm(false);

    if (!window.electronAPI) {
      showToast('Please launch inside the Electron desktop app.');
      return;
    }

    if (!settings.aisensyApiKey?.trim()) {
      showToast('AiSensy API Key is missing. Please configure it in API & Credentials.');
      setActiveTab('settings');
      return;
    }

    const campaignName = activeCampaign?.templateName?.trim() || settings.aisensyCampaignName?.trim();
    if (!campaignName) {
      showToast('AiSensy Campaign Name is missing. Please configure it in API & Credentials or Campaigns.');
      setActiveTab('settings');
      return;
    }

    // Identify all extracted rows with a valid phone number (at least 10 digits)
    const allValidRows = Object.values(rows).filter(
      (r) => r.extractStatus === 'OK' && r.customerNumber && r.customerNumber.replace(/\D/g, '').length >= 10
    );

    if (allValidRows.length === 0) {
      showToast('No bills with valid 10-digit phone numbers are ready to send.', 'error');
      return;
    }

    // Prioritize unsent bills. If all are already sent, allow re-broadcasting all valid rows.
    const unsentRows = allValidRows.filter((r) => r.whatsAppStatus !== 'Sent');
    const targetRows = unsentRows.length > 0 ? unsentRows : allValidRows;

    // Check if any target bills still need to be uploaded to the cloud
    const needsUpload = targetRows.some((r) => !r.publicUrl);
    if (needsUpload && !settings.uploadthingToken?.trim()) {
      showToast('UploadThing Token is missing. Please configure it in API & Credentials to upload bills.');
      setActiveTab('settings');
      return;
    }

    setIsSendingWhatsApp(true);
    setWhatsAppProgress({ current: 0, total: targetRows.length });

    let successCount = 0;
    let failCount = 0;
    const updatedHistoryRecords = { ...cacheHistory.records };

    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      setWhatsAppProgress({ current: i + 1, total: targetRows.length });

      let currentPublicUrl = row.publicUrl;

      // ── Step 1: Upload to UploadThing if not already uploaded ──
      if (!currentPublicUrl) {
        setRows((prev) => ({
          ...prev,
          [row.path]: {
            ...prev[row.path],
            uploadStatus: 'Uploading',
            whatsAppStatus: 'Sending',
            uploadError: undefined,
            whatsAppError: undefined,
          },
        }));

        const upRes = await window.electronAPI.uploadthingUpload({
          filePath: row.path,
          uploadthingToken: settings.uploadthingToken,
        });

        if (upRes.success && upRes.publicUrl) {
          currentPublicUrl = upRes.publicUrl;
          const file = pdfFiles.find((f) => f.path === row.path);
          const newRecord: CacheEntry = {
            path: row.path,
            pdfName: row.pdfName,
            customerName: row.customerName,
            billNo: row.billNo,
            amount: row.amount,
            publicUrl: upRes.publicUrl,
            uploadedAt: new Date().toISOString(),
            size: file?.size || 0,
          };
          updatedHistoryRecords[row.path] = newRecord;

          setRows((prev) => ({
            ...prev,
            [row.path]: {
              ...prev[row.path],
              uploadStatus: 'Uploaded',
              publicUrl: upRes.publicUrl,
            },
          }));
        } else {
          failCount++;
          setRows((prev) => ({
            ...prev,
            [row.path]: {
              ...prev[row.path],
              uploadStatus: 'Error',
              uploadError: upRes.error || 'Upload failed',
              whatsAppStatus: 'Error',
              whatsAppError: 'Upload failed — cannot send without PDF URL',
            },
          }));
          continue; // Skip sending this row
        }
      }

      // ── Step 2: Dispatch WhatsApp message via AiSensy ──
      setRows((prev) => ({
        ...prev,
        [row.path]: { ...prev[row.path], whatsAppStatus: 'Sending' },
      }));

      // Evaluate custom templateParams from active campaign
      const evaluatedParams = (activeCampaign.params || []).map((paramTag) => {
        return paramTag
          .replace(/{{CustomerName}}/g, row.customerName || 'Customer')
          .replace(/{{BillNo}}/g, row.billNo || 'N/A')
          .replace(/{{Amount}}/g, cleanAmount(row.amount || '0'))
          .replace(/{{Date}}/g, row.date || 'N/A')
          .replace(/{{PublicUrl}}/g, currentPublicUrl || '');
      });

      const mediaFilename = `${(row.customerName || 'Bill').replace(/[^a-zA-Z0-9 ]/g, '').trim()}-${(row.billNo || 'Invoice').replace(/[^a-zA-Z0-9\/\-]/g, '').trim()}`;

      const res = await window.electronAPI.aisensySend({
        apiKey: settings.aisensyApiKey,
        campaignName: campaignName,
        destination: row.customerNumber,
        customerName: row.customerName,
        billNo: row.billNo,
        amount: row.amount,
        pdfUrl: currentPublicUrl,
        countryCode: settings.countryCode,
        templateParams: evaluatedParams,
        mediaFilename,
      });

      if (res.success) {
        successCount++;
        setRows((prev) => ({
          ...prev,
          [row.path]: {
            ...prev[row.path],
            whatsAppStatus: 'Sent',
            whatsAppError: undefined,
          },
        }));
      } else {
        failCount++;
        setRows((prev) => ({
          ...prev,
          [row.path]: {
            ...prev[row.path],
            whatsAppStatus: 'Error',
            whatsAppError: res.error || 'Delivery failed',
          },
        }));
      }

      // Rate pacing: 500ms between requests to avoid AiSensy rate throttling
      if (i < targetRows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Save updated upload cache to disk if new uploads were completed
    if (Object.keys(updatedHistoryRecords).length > Object.keys(cacheHistory.records).length) {
      const newHistory: StorageHistory = {
        lastProcessedPath: folderPath,
        records: updatedHistoryRecords,
      };
      setCacheHistory(newHistory);
      await window.electronAPI.saveHistory(newHistory);
    }

    setIsSendingWhatsApp(false);
    setWhatsAppProgress(null);

    if (successCount > 0 && failCount === 0) {
      showToast(`Delivered all ${successCount} bill(s) via WhatsApp!`, 'success');
    } else if (successCount > 0 && failCount > 0) {
      showToast(`Sent ${successCount} bill(s), but ${failCount} failed. Check row status for details.`, 'error');
    } else if (failCount > 0) {
      showToast(`Failed to send ${failCount} bill(s). Check API & Credentials or Daily Logs.`, 'error');
    }
  };

  // ─── Single Row: Send WhatsApp (individual per-row button) ─────────────────
  const handleSendSingleRow = async (row: RowRecord) => {
    if (!window.electronAPI) return;
    if (!settings.aisensyApiKey?.trim()) {
      showToast('AiSensy API Key is missing. Please go to "API & Credentials" to configure it.');
      setActiveTab('settings');
      return;
    }
    if (!settings.aisensyCampaignName?.trim() && !activeCampaign?.templateName?.trim()) {
      showToast('AiSensy Campaign Name is missing. Please configure it in "API & Credentials".');
      setActiveTab('settings');
      return;
    }
    if (row.extractStatus !== 'OK') return;

    // Mark row as sending
    setRows((prev) => ({
      ...prev,
      [row.path]: { ...prev[row.path], whatsAppStatus: 'Sending' },
    }));

    let uploadedUrl = row.publicUrl;

    // Auto-upload if not yet uploaded
    if (!uploadedUrl) {
      if (!settings.uploadthingToken?.trim()) {
        showToast('UploadThing Token is missing. Cannot auto-upload before sending.');
        setRows((prev) => ({ ...prev, [row.path]: { ...prev[row.path], whatsAppStatus: 'Error', whatsAppError: 'No UploadThing token' } }));
        return;
      }

      setRows((prev) => ({
        ...prev,
        [row.path]: { ...prev[row.path], uploadStatus: 'Uploading', uploadError: undefined, whatsAppStatus: 'Sending' },
      }));

      const upRes = await window.electronAPI.uploadthingUpload({
        filePath: row.path,
        uploadthingToken: settings.uploadthingToken,
      });

      if (upRes.success && upRes.publicUrl) {
        uploadedUrl = upRes.publicUrl;
        const file = pdfFiles.find((f) => f.path === row.path);
        const newRecord: CacheEntry = {
          path: row.path,
          pdfName: row.pdfName,
          customerName: row.customerName,
          billNo: row.billNo,
          amount: row.amount,
          publicUrl: uploadedUrl,
          uploadedAt: new Date().toISOString(),
          size: file?.size || 0,
        };
        const newHistory: StorageHistory = {
          ...cacheHistory,
          records: { ...cacheHistory.records, [row.path]: newRecord },
        };
        setCacheHistory(newHistory);
        await window.electronAPI.saveHistory(newHistory);
        setRows((prev) => ({
          ...prev,
          [row.path]: { ...prev[row.path], uploadStatus: 'Uploaded', publicUrl: uploadedUrl },
        }));
      } else {
        setRows((prev) => ({
          ...prev,
          [row.path]: {
            ...prev[row.path],
            uploadStatus: 'Error',
            uploadError: upRes.error || 'Upload failed',
            whatsAppStatus: 'Error',
            whatsAppError: 'Upload failed — cannot send without PDF URL',
          },
        }));
        return;
      }
    }

    // Evaluate templateParams from active campaign
    const evaluatedParams = (activeCampaign.params || []).map((paramTag) =>
      paramTag
        .replace(/{{CustomerName}}/g, row.customerName || 'Customer')
        .replace(/{{BillNo}}/g, row.billNo || 'N/A')
        .replace(/{{Amount}}/g, cleanAmount(row.amount || '0'))
        .replace(/{{Date}}/g, row.date || 'N/A')
        .replace(/{{PublicUrl}}/g, uploadedUrl || '')
    );

    // Build clean media filename (CustomerName-BillNo, no extension)
    const mediaFilename = `${(row.customerName || 'Bill').replace(/[^a-zA-Z0-9 ]/g, '').trim()}-${(row.billNo || 'Invoice').replace(/[^a-zA-Z0-9\/\-]/g, '').trim()}`;

    const res = await window.electronAPI!.aisensySend({
      apiKey: settings.aisensyApiKey,
      campaignName: activeCampaign.templateName || settings.aisensyCampaignName,
      destination: row.customerNumber,
      customerName: row.customerName,
      billNo: row.billNo,
      amount: row.amount,
      pdfUrl: uploadedUrl,
      countryCode: settings.countryCode,
      templateParams: evaluatedParams,
      mediaFilename,
    });

    setRows((prev) => ({
      ...prev,
      [row.path]: {
        ...prev[row.path],
        whatsAppStatus: res.success ? 'Sent' : 'Error',
        whatsAppError: res.success ? undefined : (res.error || 'Delivery failed'),
      },
    }));
  };



  // ─── Inline Cell Editing ──────────────────────────────────────────────────
  const startEditing = (
    path: string,
    field: 'customerName' | 'customerNumber' | 'billNo' | 'amount',
    currentVal: string
  ) => {
    setEditingCell({ path, field });
    setEditValue(currentVal === '—' || currentVal === 'Not Found' ? '' : currentVal);
  };

  const saveEditing = () => {
    if (!editingCell) return;
    const { path, field } = editingCell;
    const clean = editValue.trim();

    setRows((prev) => {
      const existing = prev[path];
      if (!existing) return prev;

      const updated = {
        ...existing,
        [field]: clean || '—',
        isManuallyEdited: true,
      };

      if (field === 'customerNumber') {
        const isValidPhone = clean && clean.replace(/[^\d]/g, '').length >= 10;
        if (isValidPhone) {
          updated.extractStatus = 'OK';
          updated.extractError = undefined;
        } else {
          updated.extractStatus = 'Error';
          updated.extractError = 'Invalid or missing phone number';
        }
      }

      return { ...prev, [path]: updated };
    });

    setEditingCell(null);
  };

  // ─── Table Helpers ────────────────────────────────────────────────────────
  // Strip currency symbols from amount before sending to AiSensy templateParams.
  // The AiSensy template already has "Rs." hardcoded before {{4}}, so we send
  // only the numeric value e.g. "2520" not "Rs.2520" or "₹2520".
  const cleanAmount = (raw: string): string => {
    return raw.replace(/^(Rs\.?|₹|INR)\s*/i, '').trim();
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const handleSort = (f: keyof RowRecord) => {
    if (sortField === f) setSortAsc((a) => !a);
    else {
      setSortField(f);
      setSortAsc(true);
    }
  };

  const rowList = Object.values(rows)
    .filter(
      (r) =>
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
    sortField === f ? (
      sortAsc ? (
        <ChevronUp size={12} className="text-[#2383e2]" />
      ) : (
        <ChevronDown size={12} className="text-[#2383e2]" />
      )
    ) : (
      <ChevronDown size={12} className="text-[#d1d5db] group-hover:text-[#9b9a97]" />
    );

  // Statistics
  const totalLoaded = pdfFiles.length;
  const totalSelected = selected.size;
  const extractedOkCount = Object.values(rows).filter((r) => r.extractStatus === 'OK').length;
  const extractedWarnCount = Object.values(rows).filter((r) => r.extractStatus === 'Error').length;
  const uploadedCount = Object.values(rows).filter(
    (r) => r.uploadStatus === 'Uploaded' || r.uploadStatus === 'Cached'
  ).length;
  const whatsAppSentCount = Object.values(rows).filter((r) => r.whatsAppStatus === 'Sent').length;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-white text-[#37352f]">
      {/* Notion-style Sidebar Shell */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        cachedCount={Object.keys(cacheHistory.records).length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        
        {/* TAB 1: Bills & Extractor Main Workspace */}
        {activeTab === 'bills' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Notion Workspace Header */}
            <header className="h-14 px-6 border-b border-[#e9e9e7] bg-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧾</span>
                <div>
                  <h1 className="font-semibold text-xs leading-tight text-[#37352f]">
                    PDF Bill Extractor & Delivery
                  </h1>
                  <p className="text-[11px] text-[#9b9a97]">
                    {folderPath ? (
                      <span className="font-mono text-[#37352f] truncate max-w-md inline-block align-bottom">
                        📁 {folderPath}
                      </span>
                    ) : (
                      'Click "Select Folder" to load bills.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#2383e2] hover:bg-[#1a6bbf] shadow-xs transition-all active:scale-[0.98]"
                >
                  <FolderOpen size={13} />
                  {folderPath ? 'Change Folder' : 'Select Folder'}
                </button>
              </div>
            </header>

            {/* Metric KPI Cards (Notion Clean Cards) */}
            <div className="grid grid-cols-4 gap-3 px-6 py-2.5 bg-[#f7f6f3] border-b border-[#e9e9e7] flex-shrink-0">
              <div className="bg-white p-2.5 rounded-md border border-[#e9e9e7]">
                <span className="text-[10px] font-semibold text-[#9b9a97] uppercase tracking-wider">
                  Loaded / Selected
                </span>
                <div className="text-sm font-semibold text-[#37352f] mt-0.5">
                  {totalSelected} <span className="text-[11px] font-normal text-[#9b9a97]">/ {totalLoaded}</span>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-md border border-[#e9e9e7]">
                <span className="text-[10px] font-semibold text-[#9b9a97] uppercase tracking-wider">
                  Extracted
                </span>
                <div className="text-sm font-semibold text-[#2d7738] mt-0.5 flex items-center justify-between">
                  <span>{extractedOkCount} Ready</span>
                  {extractedWarnCount > 0 && (
                    <span className="text-[10px] font-medium text-[#d44c47] bg-[#fbe4e4] px-1 rounded">
                      {extractedWarnCount} Issues
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-md border border-[#e9e9e7]">
                <span className="text-[10px] font-semibold text-[#9b9a97] uppercase tracking-wider">
                  Cloud Uploaded
                </span>
                <div className="text-sm font-semibold text-[#2383e2] mt-0.5">
                  {uploadedCount} <span className="text-[11px] font-normal text-[#9b9a97]">/ {extractedOkCount}</span>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-md border border-[#e9e9e7]">
                <span className="text-[10px] font-semibold text-[#9b9a97] uppercase tracking-wider">
                  WhatsApp Delivered
                </span>
                <div className="text-sm font-semibold text-[#2d7738] mt-0.5 flex items-center justify-between">
                  <span>{whatsAppSentCount} Sent</span>
                  <span className="text-[10px] font-mono text-[#787774] bg-[#f1f1ef] px-1.5 py-0.2 rounded truncate max-w-[120px]">
                    {activeCampaign.templateName}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Split Body */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              
              {/* Left PDF File Selector */}
              <aside className="w-64 flex-shrink-0 flex flex-col h-full bg-[#f7f6f3] border-r border-[#e9e9e7]">
                <div className="px-3.5 py-2.5 border-b border-[#e9e9e7] flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#9b9a97]">
                    PDF Files ({selected.size}/{pdfFiles.length})
                  </span>
                  {pdfFiles.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium text-[#2383e2] flex items-center gap-1 hover:underline"
                    >
                      {selected.size === pdfFiles.length ? (
                        <>
                          <CheckSquare size={12} /> Deselect All
                        </>
                      ) : (
                        <>
                          <Square size={12} /> Select All
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
                  {isScanning ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-[#9b9a97]">
                      <RefreshCw size={18} className="animate-spin text-[#2383e2]" />
                      <span className="text-xs">Scanning PDF folder...</span>
                    </div>
                  ) : pdfFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center text-[#9b9a97]">
                      <span className="text-3xl opacity-30 mb-2">📂</span>
                      <p className="text-xs font-medium">No PDF files loaded</p>
                      <p className="text-[11px] text-[#9b9a97] mt-0.5">
                        Click "Select Folder" to start.
                      </p>
                    </div>
                  ) : (
                    pdfFiles.map((file) => {
                      const isSel = selected.has(file.path);
                      const row = rows[file.path];
                      const isCached = Boolean(cacheHistory.records[file.path]);

                      return (
                        <div
                          key={file.path}
                          onClick={() => toggleOne(file.path)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer select-none transition-colors ${
                            isSel
                              ? 'bg-[#e8f0fb] text-[#2383e2]'
                              : 'hover:bg-[#efefed] text-[#37352f]'
                          }`}
                        >
                          <div className={isSel ? 'text-[#2383e2]' : 'text-[#9b9a97]'}>
                            {isSel ? <CheckSquare size={13} /> : <Square size={13} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-medium truncate" title={file.name}>
                                {file.name}
                              </p>
                              {row?.uploadStatus === 'Uploaded' && (
                                <CheckCircle size={11} className="text-[#2d7738] flex-shrink-0" />
                              )}
                              {isCached && !row && (
                                <span className="text-[9px] font-mono text-[#2383e2]">⚡</span>
                              )}
                              {row?.extractStatus === 'Error' && (
                                <AlertCircle size={11} className="text-[#d44c47] flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-[10px] text-[#9b9a97]">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Primary Extract Action Button */}
                <div className="p-2.5 border-t border-[#e9e9e7] bg-white">
                  <button
                    onClick={handleRunExtraction}
                    disabled={isExtracting || selected.size === 0}
                    className="w-full py-2 px-3 rounded-md text-xs font-semibold text-white bg-[#2383e2] hover:bg-[#1a6bbf] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.99] disabled:opacity-40"
                  >
                    {isExtracting ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" /> Extracting Data...
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" /> Run Extraction Only ({selected.size})
                      </>
                    )}
                  </button>
                </div>
              </aside>

              {/* Right Panel: Data Table & 3-Stage Post-Extraction Controls */}
              <main className="flex-1 min-w-0 flex flex-col h-full bg-white">
                
                {/* Notion Post-Extraction Decision Banner */}
                {Object.keys(rows).length > 0 && (
                  <div className="px-6 py-2.5 bg-[#f7f6f3] border-b border-[#e9e9e7] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs text-[#37352f]">
                      <Sparkles size={14} className="text-[#2383e2]" />
                      <span>
                        <b>{extractedOkCount}</b> bills extracted & ready.
                        {extractedWarnCount > 0 && (
                          <span className="text-[#d44c47] ml-1 font-medium">
                            ({extractedWarnCount} have missing details — click cells to fix)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Button: Upload Only */}
                      <button
                        onClick={() => handleRunUpload()}
                        disabled={isUploading || isSendingWhatsApp}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-[#37352f] bg-white hover:bg-[#efefed] border border-[#e9e9e7] transition-colors shadow-xs disabled:opacity-40"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw size={12} className="animate-spin text-[#2383e2]" /> Uploading...
                          </>
                        ) : (
                          <>
                            <Upload size={12} /> Upload Only to Cloud
                          </>
                        )}
                      </button>

                      {/* Button: Upload & Send WhatsApp */}
                      <button
                        onClick={() => {
                          if (extractedOkCount === 0) {
                            showToast('No bills with valid phone numbers to send. Please edit the phone number in the table.', 'error');
                            return;
                          }
                          setShowWhatsAppConfirm(true);
                        }}
                        disabled={isUploading || isSendingWhatsApp || extractedOkCount === 0}
                        className="flex items-center gap-1.5 px-3.5 py-1 rounded-md text-xs font-semibold text-white bg-[#2d7738] hover:bg-[#235c2b] transition-all shadow-xs active:scale-[0.98] disabled:opacity-40"
                      >
                        {isSendingWhatsApp ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            Sending ({whatsAppProgress?.current}/{whatsAppProgress?.total})...
                          </>
                        ) : (
                          <>
                            <Send size={12} /> Upload & Send WhatsApp
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Table Header Controls */}
                <div className="h-11 px-6 border-b border-[#e9e9e7] flex items-center justify-between flex-shrink-0 bg-white">
                  <div className="flex items-center gap-2">
                    <FileCheck size={14} className="text-[#9b9a97]" />
                    <span className="text-xs font-semibold text-[#37352f]">Extracted Data</span>
                    {Object.keys(rows).length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[#f1f1ef] text-[#787774]">
                        {rowList.length} of {Object.keys(rows).length}
                      </span>
                    )}
                  </div>

                  {Object.keys(rows).length > 0 && (
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2 text-[#9b9a97]" />
                      <input
                        type="text"
                        placeholder="Filter rows..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-7 pr-3 py-1 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none w-44 text-[#37352f]"
                      />
                    </div>
                  )}
                </div>

                {/* Table View (Notion Clean Table) */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {Object.keys(rows).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#9b9a97]">
                      <FileSpreadsheet size={36} className="stroke-[1.2] mb-2 opacity-30" />
                      <p className="text-xs font-semibold text-[#37352f]">No Bill Results</p>
                      <p className="text-[11px] text-[#9b9a97] max-w-sm mt-0.5">
                        Select files from the left and click <b>Run Extraction Only</b> to begin.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#f7f6f3] border-b border-[#e9e9e7] select-none z-10 text-[11px] font-semibold text-[#787774] uppercase tracking-wider">
                        <tr>
                          {([
                            { label: '#', field: null },
                            { label: 'PDF Document', field: 'pdfName' },
                            { label: 'Customer Name', field: 'customerName' },
                            { label: 'Mobile No. (Editable)', field: 'customerNumber' },
                            { label: 'Bill No.', field: 'billNo' },
                            { label: 'Date', field: 'date' },
                            { label: 'Amount', field: 'amount' },
                            { label: 'Extraction', field: 'extractStatus' },
                            { label: 'Public Cloud URL', field: null },
                            { label: 'Upload State', field: 'uploadStatus' },
                            { label: 'WhatsApp', field: 'whatsAppStatus' },
                          ] as { label: string; field: keyof RowRecord | null }[]).map(
                            ({ label, field }) => (
                              <th
                                key={label}
                                onClick={() => field && handleSort(field)}
                                className={`px-3 py-2 whitespace-nowrap ${
                                  field ? 'cursor-pointer hover:bg-[#efefed]' : ''
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  {label}
                                  {field && <SortIcon f={field} />}
                                </span>
                              </th>
                            )
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[#e9e9e7] text-xs">
                        {rowList.map((row, i) => {
                          const isCached = row.uploadStatus === 'Cached';

                          return (
                            <tr
                              key={row.path}
                              className="hover:bg-[#f7f6f3] transition-colors"
                            >
                              <td className="px-3 py-2 text-[#9b9a97] font-mono">{i + 1}</td>

                              {/* PDF Name */}
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <FileText size={12} className="text-[#9b9a97] flex-shrink-0" />
                                  <span
                                    className="font-medium truncate max-w-[120px] text-[#37352f]"
                                    title={row.pdfName}
                                  >
                                    {row.pdfName}
                                  </span>
                                </div>
                              </td>

                              {/* Customer Name (Editable) */}
                              <td className="px-3 py-2">
                                {editingCell?.path === row.path &&
                                editingCell.field === 'customerName' ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEditing();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      onBlur={saveEditing}
                                      className="px-1.5 py-0.5 text-xs rounded border border-[#2383e2] outline-none w-28 bg-white"
                                    />
                                    <button onClick={saveEditing}>
                                      <Check size={11} className="text-[#2d7738]" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() =>
                                      startEditing(row.path, 'customerName', row.customerName)
                                    }
                                    className="group flex items-center gap-1 cursor-pointer"
                                    title="Click to edit name"
                                  >
                                    <span className="font-semibold text-[#37352f]">
                                      {row.customerName}
                                    </span>
                                    <Edit2
                                      size={10}
                                      className="opacity-0 group-hover:opacity-100 text-[#9b9a97]"
                                    />
                                  </div>
                                )}
                              </td>

                              {/* Customer Mobile (Editable) */}
                              <td className="px-3 py-2">
                                {editingCell?.path === row.path &&
                                editingCell.field === 'customerNumber' ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      placeholder="10-digit number"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEditing();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      onBlur={saveEditing}
                                      className="px-1.5 py-0.5 text-xs font-mono rounded border border-[#2383e2] outline-none w-28 bg-white"
                                    />
                                    <button onClick={saveEditing}>
                                      <Check size={11} className="text-[#2d7738]" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() =>
                                      startEditing(row.path, 'customerNumber', row.customerNumber)
                                    }
                                    className="group flex items-center gap-1 cursor-pointer"
                                    title="Click to edit mobile number"
                                  >
                                    <span
                                      className={`font-mono font-medium px-1.5 py-0.2 rounded border text-[11px] flex items-center gap-1 ${
                                        row.extractError?.includes('Phone') ||
                                        row.customerNumber === '—' ||
                                        row.customerNumber === 'Not Found'
                                          ? 'bg-[#fbe4e4] text-[#d44c47] border-[#f5c6cb]'
                                          : 'bg-[#edf6ed] text-[#2d7738] border-[#c3e6cb]'
                                      }`}
                                    >
                                      <Phone size={9} />
                                      {row.customerNumber}
                                    </span>
                                    <Edit2
                                      size={10}
                                      className="opacity-0 group-hover:opacity-100 text-[#9b9a97]"
                                    />
                                  </div>
                                )}
                              </td>

                              {/* Bill No */}
                              <td className="px-3 py-2 font-mono text-[#787774]">
                                {row.billNo}
                              </td>

                              {/* Date */}
                              <td className="px-3 py-2 text-[#787774]">{row.date}</td>

                              {/* Amount */}
                              <td className="px-3 py-2 font-semibold font-mono text-[#2d7738]">
                                {row.amount !== 'Not Found' && row.amount !== '—'
                                  ? row.amount.startsWith('₹')
                                    ? row.amount
                                    : `₹${row.amount}`
                                  : row.amount}
                              </td>

                              {/* Extraction Status */}
                              <td className="px-3 py-2">
                                {row.extractStatus === 'Extracting' ? (
                                  <span className="flex items-center gap-1 text-[#2383e2]">
                                    <RefreshCw size={11} className="animate-spin" /> Extracting
                                  </span>
                                ) : row.extractStatus === 'OK' ? (
                                  <span className="flex items-center gap-1 text-[#2d7738] font-medium">
                                    <CheckCircle size={11} /> Ready
                                  </span>
                                ) : (
                                  <div>
                                    <span className="flex items-center gap-1 text-[#d44c47] font-medium">
                                      <AlertCircle size={11} /> Issue
                                    </span>
                                    {row.extractError && (
                                      <p className="text-[10px] text-[#d44c47] leading-tight">
                                        {row.extractError}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Public Cloud URL */}
                              <td className="px-3 py-2">
                                {row.publicUrl ? (
                                  <div className="flex items-center gap-1">
                                    <a
                                      href={row.publicUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#2383e2] hover:underline flex items-center gap-1 truncate max-w-[110px]"
                                    >
                                      <ExternalLink size={10} />
                                      {row.publicUrl.replace('https://', '')}
                                    </a>
                                    <button
                                      onClick={() => copyUrl(row.publicUrl!)}
                                      className="p-1 rounded text-[#9b9a97] hover:text-[#37352f] hover:bg-[#efefed]"
                                      title="Copy URL"
                                    >
                                      <Copy size={10} />
                                    </button>
                                    {copiedUrl === row.publicUrl && (
                                      <span className="text-[10px] text-[#2d7738] font-bold">
                                        Copied
                                      </span>
                                    )}
                                  </div>
                                ) : row.uploadStatus === 'Uploading' ? (
                                  <span className="flex items-center gap-1 text-[#2383e2]">
                                    <RefreshCw size={10} className="animate-spin" /> Uploading
                                  </span>
                                ) : row.uploadError ? (
                                  <span className="text-[10px] text-[#d44c47]">{row.uploadError}</span>
                                ) : (
                                  <span className="text-[#d1d5db]">—</span>
                                )}
                              </td>

                              {/* Upload State & Re-upload Trigger */}
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  {row.uploadStatus === 'Uploaded' ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#2d7738] bg-[#edf6ed] px-1.5 py-0.2 rounded border border-[#c3e6cb]">
                                      <Upload size={10} /> Uploaded
                                    </span>
                                  ) : isCached ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#2383e2] bg-[#e8f0fb] px-1.5 py-0.2 rounded border border-[#2383e2]/30">
                                      ⚡ Cached
                                    </span>
                                  ) : row.uploadStatus === 'Uploading' ? (
                                    <span className="inline-flex items-center gap-1 text-[#2383e2]">
                                      <RefreshCw size={10} className="animate-spin" />
                                    </span>
                                  ) : row.uploadStatus === 'Error' ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#d44c47] bg-[#fbe4e4] px-1.5 py-0.2 rounded border border-[#f5c6cb]">
                                      Failed
                                    </span>
                                  ) : (
                                    <span className="text-[#9b9a97]">—</span>
                                  )}

                                  {(row.uploadStatus === 'Uploaded' || isCached) && (
                                    <button
                                      onClick={() => handleRunUpload([row.path])}
                                      className="p-1 rounded text-[#9b9a97] hover:text-[#2383e2] hover:bg-[#e8f0fb]"
                                      title="Force re-upload to cloud"
                                    >
                                      <RotateCcw size={10} />
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* WhatsApp Status + Individual Send Button */}
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {/* Status badge */}
                                  {row.whatsAppStatus === 'Sent' ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#2d7738] bg-[#edf6ed] px-1.5 py-0.2 rounded border border-[#c3e6cb]">
                                      <CheckCircle size={10} /> Sent
                                    </span>
                                  ) : row.whatsAppStatus === 'Sending' ? (
                                    <span className="inline-flex items-center gap-1 text-[#2383e2]">
                                      <RefreshCw size={10} className="animate-spin" /> Sending
                                    </span>
                                  ) : row.whatsAppStatus === 'Error' ? (
                                    <span
                                      className="inline-flex items-center gap-1 font-medium text-[#d44c47] bg-[#fbe4e4] px-1.5 py-0.2 rounded border border-[#f5c6cb]"
                                      title={row.whatsAppError || 'Delivery failed'}
                                    >
                                      <AlertCircle size={10} /> Error
                                    </span>
                                  ) : (
                                    <span className="text-[#d1d5db] text-[10px]">-</span>
                                  )}
                                  {/* Individual Send Button */}
                                  {row.extractStatus === 'OK' &&
                                    row.whatsAppStatus !== 'Sending' &&
                                    row.whatsAppStatus !== 'Sent' && (
                                      <button
                                        onClick={() => handleSendSingleRow(row)}
                                        disabled={isSendingWhatsApp}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#2d7738] bg-[#edf6ed] border border-[#c3e6cb] hover:bg-[#d4edda] hover:border-[#2d7738] transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                        title={`Send WhatsApp to ${row.customerName}`}
                                      >
                                        <Send size={9} />
                                        Send
                                      </button>
                                    )}
                                  {/* Retry button on error */}
                                  {row.whatsAppStatus === 'Error' && row.extractStatus === 'OK' && (
                                    <button
                                      onClick={() => handleSendSingleRow(row)}
                                      disabled={isSendingWhatsApp}
                                      className="p-0.5 rounded text-[#9b9a97] hover:text-[#d44c47] hover:bg-[#fbe4e4] transition-all disabled:opacity-40"
                                      title="Retry sending"
                                    >
                                      <RotateCcw size={9} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </main>
            </div>
          </div>
        )}

        {/* TAB 2: Campaigns & AiSensy Customizer */}
        {activeTab === 'campaigns' && (
          <CampaignsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {/* TAB 3: URL Cache & Ledger */}
        {activeTab === 'cache' && (
          <CacheLedgerView
            cacheRecords={cacheHistory.records}
            onClearCache={handleClearCache}
            onReupload={(p) => {
              setActiveTab('bills');
              handleRunUpload([p]);
            }}
          />
        )}

        {/* TAB 4: API & Credentials Settings */}
        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSave={handleSaveSettings}
            onClearCache={handleClearCache}
            cachedCount={Object.keys(cacheHistory.records).length}
          />
        )}

        {/* TAB 5: Daily Activity & Delivery Logs */}
        {activeTab === 'logs' && <DailyLogsView />}

      </div>

      {/* Notion Confirmation Modal for WhatsApp Batch Sending */}
      {showWhatsAppConfirm && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden border border-[#e9e9e7] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📢</span>
                <div>
                  <h3 className="text-xs font-semibold text-[#37352f]">Confirm WhatsApp Broadcast</h3>
                  <p className="text-[11px] text-[#9b9a97]">
                    Delivers invoice PDF cards directly to customer devices.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-md bg-[#f7f6f3] border border-[#e9e9e7] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#787774]">Campaign:</span>
                  <span className="font-mono font-medium text-[#37352f]">
                    {activeCampaign.templateName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#787774]">Eligible Customers:</span>
                  <span className="font-semibold text-[#2d7738]">
                    {extractedOkCount} Recipients
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#787774]">Missing Phone Numbers:</span>
                  <span className={`font-semibold ${extractedWarnCount > 0 ? 'text-[#d44c47]' : 'text-[#787774]'}`}>
                    {extractedWarnCount} (Will be skipped)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-[#787774] hover:bg-[#efefed] rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedWhatsAppBroadcast}
                  disabled={extractedOkCount === 0 || isSendingWhatsApp}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#2d7738] hover:bg-[#235c2b] rounded-md shadow-xs transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  <Send size={12} /> Confirm & Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Ready Banner */}
      {downloadedUpdate && (
        <div className="fixed top-4 right-5 z-50 px-4 py-2.5 rounded-lg shadow-xl border bg-[#edf6ed] border-[#c3e6cb] text-xs flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <Sparkles size={16} className="text-[#2d7738] shrink-0" />
          <div>
            <p className="font-semibold text-[#2d7738]">Update v{downloadedUpdate.version} ready!</p>
            <p className="text-[10px] text-[#787774]">Restart the app to apply the latest version.</p>
          </div>
          <button
            onClick={() => window.electronAPI?.installUpdate?.()}
            className="px-2.5 py-1 text-[11px] rounded bg-[#2d7738] text-white font-semibold hover:bg-[#235c2b] transition-colors shadow-2xs whitespace-nowrap"
          >
            Restart & Apply
          </button>
        </div>
      )}

      {/* Floating Non-Blocking Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-xl border text-xs flex items-center gap-2 transition-all ${
            toastMessage.type === 'error'
              ? 'bg-[#fbe4e4] text-[#d44c47] border-[#f5c6cb]'
              : 'bg-[#edf6ed] text-[#2d7738] border-[#c3e6cb]'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle size={14} className="shrink-0" />
          ) : (
            <CheckCircle size={14} className="shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
