export interface PdfFile {
  name: string;
  path: string;
  size: number;
}

export interface RowRecord {
  path: string;
  pdfName: string;
  customerName: string;
  customerNumber: string;
  billNo: string;
  date: string;
  amount: string;
  confidence: string;
  pages: number;
  extractStatus: 'Idle' | 'Extracting' | 'OK' | 'Error';
  extractError?: string;
  uploadStatus: 'Idle' | 'Uploading' | 'Uploaded' | 'Cached' | 'Error';
  publicUrl?: string;
  uploadError?: string;
  whatsAppStatus?: 'Idle' | 'Sending' | 'Sent' | 'Error' | 'Skipped';
  whatsAppError?: string;
  isManuallyEdited?: boolean;
}

export interface CampaignConfig {
  id: string;
  name: string;
  templateName: string;
  params: string[]; // e.g. ['{{CustomerName}}', '{{BillNo}}', '{{Amount}}', '{{PublicUrl}}']
  customNote?: string;
  isActive: boolean;
}

export interface AppSettings {
  uploadthingToken: string;
  aisensyApiKey: string;
  aisensyCampaignName: string;
  countryCode: string;
  activeCampaignId?: string;
  campaigns?: CampaignConfig[];
}

export interface CacheEntry {
  path: string;
  pdfName: string;
  customerName: string;
  billNo: string;
  amount: string;
  publicUrl: string;
  uploadedAt: string;
  size: number;
}

export interface StorageHistory {
  lastProcessedPath: string | null;
  records: Record<string, CacheEntry>;
}

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>;
      scanPdfs: (p: string) => Promise<{ success: boolean; files: PdfFile[]; error?: string }>;
      extractPdfData: (paths: string[]) => Promise<any[]>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (s: AppSettings) => Promise<{ success: boolean }>;
      getHistory: () => Promise<StorageHistory>;
      saveHistory: (history: StorageHistory) => Promise<{ success: boolean }>;
      clearHistory: () => Promise<{ success: boolean }>;
      uploadthingUpload: (p: { filePath: string; uploadthingToken?: string }) => Promise<{ success: boolean; publicUrl?: string; error?: string }>;
      testUploadthingToken: (token: string) => Promise<{ success: boolean; message?: string; error?: string }>;
      aisensySend: (p: any) => Promise<{ success: boolean; response?: any; error?: string; warning?: string }>;
      testAiSensyKey: (p: { apiKey: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
      getTodayLogs: () => Promise<{ success: boolean; date: string; content: string; path: string; error?: string }>;
      openLogsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  }
}
