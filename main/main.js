const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');

let mainWindow;

// ─── Daily Activity Logger ─────────────────────────────────────────────────
function getLogsDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function writeDailyLog(level, category, message, details = null) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logDir = getLogsDir();
    const logFile = path.join(logDir, `${today}.log`);
    const timestamp = new Date().toISOString();
    let detailStr = '';
    if (details !== null && details !== undefined) {
      detailStr = ` | Details: ${typeof details === 'object' ? JSON.stringify(details) : details}`;
    }
    const logLine = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${detailStr}\n`;
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (err) {
    console.error('Logging error:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 880,
    minWidth: 1000,
    minHeight: 650,
    title: 'PDF Bill Extractor',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenu(null);

  // In dev mode load Next.js dev server, in production load built files
  const startUrl = process.env.NODE_ENV === 'production'
    ? `file://${path.join(__dirname, '../out/index.html')}`
    : 'http://localhost:3000';

  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();
  writeDailyLog('INFO', 'System', 'PDF Bill Extractor application started');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  writeDailyLog('INFO', 'System', 'Application closing');
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Open Folder Dialog ────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder Containing PDF Bills',
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─── IPC: Scan PDFs in Folder ───────────────────────────────────────────────
ipcMain.handle('fs:scanPdfs', async (_, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    const pdfFiles = files
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => {
        const fullPath = path.join(folderPath, f);
        const stat = fs.statSync(fullPath);
        return { name: f, path: fullPath, size: stat.size };
      });
    return { success: true, files: pdfFiles };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

// ─── PDF Extraction Logic ────────────────────────────────────────────────────
function extractInfo(text, fileName) {
  const cleanText = text.replace(/\r\n/g, '\n');

  // 1. Customer Name
  let customerName = 'Not Found';
  let custIndex = -1;

  // Search for Customer Name pattern
  const custNameRegexes = [
    /Customer\s*:\s*([A-Za-z\s'.\-]{2,35})(?=\s*Mob|\s*Date|\s*Time|\n|$)/i,
    /(?:customer[\s_-]*name|cust[\s_-]*name|billed[\s_-]*to|bill[\s_-]*to)\s*[:#\-]?\s*([A-Za-z\s'.\-]{2,35})/i,
    /(?:m\/s|mr|mrs|ms)\.?\s+([A-Za-z][A-Za-z\s'.\-]{2,30})/i,
  ];

  for (const rx of custNameRegexes) {
    const match = cleanText.match(rx);
    if (match && match[1]) {
      customerName = match[1].trim().replace(/\s+/g, ' ').replace(/\s+Mob\.?.*$/i, '');
      custIndex = match.index ?? -1;
      break;
    }
  }

  // 2. Customer Mobile Number: Search AFTER Customer Name in text
  let customerNumber = 'Not Found';

  if (custIndex !== -1) {
    // Slice text starting from Customer Name position
    const textAfterCustomer = cleanText.substring(custIndex);
    
    // Find first 10-digit mobile number starting with 6-9 AFTER Customer Name
    const mobMatch = textAfterCustomer.match(/Mob\.?\s*:\s*([6-9][0-9]{9})/i)
                  || textAfterCustomer.match(/\b([6-9][0-9]{9})\b/);
    if (mobMatch && mobMatch[1]) {
      customerNumber = mobMatch[1].trim();
    }
  }

  // Fallback if no Customer Name was found or mobile not found after customer
  if (customerNumber === 'Not Found') {
    const directMob = cleanText.match(/Mob\.?\s*:\s*([6-9][0-9]{9})/i)
                   || cleanText.match(/Customer:[\s\S]*?([6-9][0-9]{9})/i);
    if (directMob && directMob[1]) {
      customerNumber = directMob[1].trim();
    }
  }

  // 3. Bill No. (e.g. HR/202509095)
  let billNo = 'Not Found';
  const billMatch = cleanText.match(/Bill\s*No\.?\s*:\s*([A-Z0-9\/-]+)/i)
                 || cleanText.match(/\b([A-Z]{2,5}\/[0-9]{6,12})\b/i);
  if (billMatch && billMatch[1] && billMatch[1].toUpperCase() !== 'AMOUNT') {
    billNo = billMatch[1].trim();
  } else {
    const hrMatch = cleanText.match(/\b([A-Z0-9]{2,6}\/\d{6,12})\b/i);
    if (hrMatch) billNo = hrMatch[1].trim();
  }

  // 4. Date (e.g. Date:09/09/2025, Date: 09/09/2025, 09/09/2025)
  let date = 'Not Found';
  const dateLabelMatch = cleanText.match(/(?:Date|Dated|Dt|Bill\s*Date|Inv\s*Date)[\s:#.-]*([0-3]?[0-9][\/\.-][0-1]?[0-9][\/\.-](?:20)?[0-9]{2})/i)
                      || cleanText.match(/(?:Date|Dated|Dt)[\s:#.-]*([0-3]?[0-9]\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20[0-9]{2})/i);
  
  if (dateLabelMatch && dateLabelMatch[1]) {
    date = dateLabelMatch[1].trim();
  } else {
    // Search entire text for any valid date format (DD/MM/YYYY or YYYY-MM-DD)
    const anyDateMatch = cleanText.match(/([0-3]?[0-9][\/\.-][0-1]?[0-9][\/\.-]20[0-9]{2})/)
                      || cleanText.match(/(20[0-9]{2}[\/\.-][0-1]?[0-9][\/\.-][0-3]?[0-9])/);
    if (anyDateMatch && anyDateMatch[1]) {
      date = anyDateMatch[1].trim();
    }
  }

  // 5. Net Bill Amount (e.g. NET BILL AMOUNT 2,520)
  let amount = 'Not Found';
  const amountMatch = cleanText.match(/NET\s*BILL\s*AMOUNT\s*[:#\-]?\s*([₹\s0-9,.]+)/i)
                   || cleanText.match(/(?:TOTAL\s*AMOUNT|NET\s*AMOUNT)\s*[:#\-]?\s*([0-9,.]+)/i);
  if (amountMatch && amountMatch[1]) {
    const rawAmt = amountMatch[1].trim().replace(/[^\d,.]/g, '');
    if (rawAmt) amount = rawAmt;
  }

  let confidence = 'Low';
  if (customerName !== 'Not Found' && customerNumber !== 'Not Found') {
    confidence = 'High';
  }

  return { customerName, customerNumber, billNo, date, amount, confidence };
}

// ─── IPC: Extract Data from PDFs ────────────────────────────────────────────
ipcMain.handle('pdf:extractData', async (_, filePaths) => {
  const results = [];
  writeDailyLog('INFO', 'Extraction', `Starting extraction batch of ${filePaths.length} PDF(s)`);

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    try {
      const buffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(buffer);
      const extracted = extractInfo(pdfData.text, fileName);

      writeDailyLog('INFO', 'Extraction', `Extracted: ${fileName}`, {
        customer: extracted.customerName,
        phone: extracted.customerNumber,
        billNo: extracted.billNo,
        amount: extracted.amount,
        confidence: extracted.confidence,
      });

      results.push({
        path: filePath,
        pdfName: fileName,
        customerName: extracted.customerName,
        customerNumber: extracted.customerNumber,
        billNo: extracted.billNo,
        date: extracted.date,
        amount: extracted.amount,
        confidence: extracted.confidence,
        pages: pdfData.numpages,
        status: 'Success',
      });
    } catch (err) {
      writeDailyLog('ERROR', 'Extraction', `Failed parsing ${fileName}: ${err.message}`);
      results.push({
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
        error: err.message,
      });
    }
  }

  return results;
});

// ─── Local Storage & Settings Handlers ─────────────────────────────────────
const getSettingsPath = () => path.join(app.getPath('userData'), 'pdf_extractor_config.json');
const getHistoryPath = () => path.join(app.getPath('userData'), 'pdf_extractor_history.json');

ipcMain.handle('storage:getSettings', async () => {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading settings:', err);
  }
  return {
    uploadthingToken: '',
    aisensyApiKey: '',
    aisensyCampaignName: '',
    countryCode: '91',
  };
});

ipcMain.handle('storage:saveSettings', async (_, settings) => {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:getHistory', async () => {
  try {
    const p = getHistoryPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading history:', err);
  }
  return { lastProcessedPath: null, records: {} };
});

ipcMain.handle('storage:saveHistory', async (_, history) => {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:clearHistory', async () => {
  try {
    const p = getHistoryPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Uploadthing PDF Upload Handler (UTApi - server-side) ────────────────────
ipcMain.handle('uploadthing:uploadFile', async (_, { filePath, uploadthingToken }) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist: ' + filePath };
    }
    if (!uploadthingToken || !uploadthingToken.trim()) {
      return { success: false, error: 'No Uploadthing token configured.' };
    }

    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    let cleanToken = uploadthingToken.trim();
    // Auto-strip environment variable syntax if copied directly from dashboard
    if (cleanToken.startsWith('UPLOADTHING_TOKEN=')) {
      cleanToken = cleanToken.replace(/^UPLOADTHING_TOKEN=/, '').trim();
    }
    // Remove surrounding single or double quotes
    cleanToken = cleanToken.replace(/^['"]|['"]$/g, '').trim();

    // Check if user accidentally pasted a legacy secret key
    if (cleanToken.startsWith('sk_live_')) {
      return {
        success: false,
        error: 'You pasted a Legacy Secret Key (starts with sk_live_). Please click the "SDK v7+" tab on UploadThing and copy the UPLOADTHING_TOKEN (starts with eyJhc...).'
      };
    }

    // Use UTApi from the uploadthing package (correct server-side upload)
    const { UTApi } = require('uploadthing/server');
    const utapi = new UTApi({ token: cleanToken });

    // Wrap buffer as a File object (supported in Node 20+ and Electron)
    const file = new File([fileBuffer], fileName, { type: 'application/pdf' });

    const response = await utapi.uploadFiles(file);

    if (response.error) {
      writeDailyLog('ERROR', 'UploadThing', `Failed ${fileName}: ${response.error.message}`);
      return { success: false, error: response.error.message || 'Uploadthing upload failed' };
    }

    const publicUrl = response.data?.ufsUrl || response.data?.url;
    if (!publicUrl) {
      writeDailyLog('ERROR', 'UploadThing', `No URL returned for ${fileName}`);
      return { success: false, error: 'Uploadthing returned no URL. Check your token and app settings.' };
    }

    writeDailyLog('SUCCESS', 'UploadThing', `Uploaded ${fileName}`, { url: publicUrl });
    return { success: true, publicUrl, provider: 'Uploadthing' };
  } catch (err) {
    writeDailyLog('ERROR', 'UploadThing', `Exception uploading: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ─── AiSensy WhatsApp API Handler (Official v2 spec) ─────────────────────────
// Ref: https://wiki.aisensy.com/en/articles/11501889-api-reference-docs
// - destination: digits only e.g. "+917498526205" (+CountryCode+Number)
// - templateParams: array of ACTUAL evaluated string values (not placeholders)
// - media.filename: clean name WITHOUT file extension (AiSensy appends .pdf)
// - HTTP 200 = success
ipcMain.handle('aisensy:sendMessage', async (_, {
  apiKey, campaignName, destination, customerName,
  billNo, amount, pdfUrl, countryCode, templateParams, mediaFilename,
}) => {
  try {
    if (!apiKey || !apiKey.trim()) {
      writeDailyLog('ERROR', 'AiSensy', 'Failed: API Key is missing');
      return { success: false, error: 'AiSensy API Key is missing. Please configure it in API & Credentials.' };
    }
    if (!campaignName || !campaignName.trim()) {
      writeDailyLog('ERROR', 'AiSensy', 'Failed: Campaign Name is missing');
      return { success: false, error: 'AiSensy Campaign Name is missing. Please configure it in API & Credentials.' };
    }
    if (!destination) {
      writeDailyLog('ERROR', 'AiSensy', 'Failed: Destination number is missing');
      return { success: false, error: 'Destination phone number is missing.' };
    }

    // Build destination: strip non-digits, prepend country code if 10 digits
    const cc = String(countryCode || '91').replace(/[^\d]/g, '');
    let cleanNumber = String(destination).replace(/[^\d]/g, '');
    if (cleanNumber.startsWith('0')) cleanNumber = cleanNumber.slice(1);
    if (cleanNumber.length === 10) cleanNumber = cc + cleanNumber;
    const formattedNumber = '+' + cleanNumber; // e.g. +917498526205

    // templateParams must be actual values, not placeholders
    const resolvedParams = (Array.isArray(templateParams) && templateParams.length > 0)
      ? templateParams
      : [
          customerName || 'Customer',
          billNo || 'N/A',
          amount || 'N/A',
          pdfUrl || '',
        ];

    // Check media URL reachability if provided
    let mediaWarning = null;
    if (pdfUrl) {
      try {
        const headCheck = await fetch(pdfUrl, { method: 'HEAD' });
        if (!headCheck.ok) {
          mediaWarning = `Media URL returned HTTP ${headCheck.status} (${headCheck.statusText}). If this file is not public, WhatsApp Cloud API will drop message delivery!`;
          writeDailyLog('WARN', 'AiSensy', mediaWarning, { url: pdfUrl });
        }
      } catch (headErr) {
        mediaWarning = `Media URL reachability warning: ${headErr.message}`;
        writeDailyLog('WARN', 'AiSensy', mediaWarning, { url: pdfUrl });
      }
    }

    const payload = {
      apiKey: apiKey.trim(),
      campaignName: campaignName.trim(),
      destination: formattedNumber,
      userName: customerName || 'Customer',
      source: 'PDF Bill Extractor Desktop',
      templateParams: resolvedParams,
    };

    // Attach media PDF if URL is provided
    if (pdfUrl) {
      const safeName = mediaFilename
        || `${(customerName || 'Bill').replace(/[^a-zA-Z0-9 ]/g, '').trim()}-${(billNo || 'Invoice').replace(/[^a-zA-Z0-9\/\-]/g, '').trim()}`;
      payload.media = { url: pdfUrl, filename: safeName };
    }

    writeDailyLog('INFO', 'AiSensy', `Dispatching to ${formattedNumber}`, {
      campaign: campaignName,
      customer: customerName,
      billNo: billNo,
      amount: amount,
      params: resolvedParams,
      mediaUrl: pdfUrl || 'None',
      mediaName: payload.media?.filename || 'None',
    });

    const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // AiSensy docs: HTTP 200 = success
    if (res.status === 200) {
      let data = {};
      try { data = await res.json(); } catch (_) {}
      writeDailyLog('SUCCESS', 'AiSensy', `Accepted by AiSensy for ${formattedNumber}`, {
        submitted_message_id: data.submitted_message_id,
        warning: mediaWarning,
      });
      return { success: true, response: data, warning: mediaWarning };
    }

    let errData = {};
    try { errData = await res.json(); } catch (_) {}
    const errText = errData.message || errData.error || errData.reason || `AiSensy returned HTTP ${res.status}`;
    writeDailyLog('ERROR', 'AiSensy', `AiSensy rejected for ${formattedNumber} (${res.status}): ${errText}`, errData);
    return {
      success: false,
      error: errText,
      response: errData,
      statusCode: res.status,
    };
  } catch (err) {
    writeDailyLog('ERROR', 'AiSensy', `Exception sending to ${destination}: ${err.message}`, { stack: err.stack });
    return { success: false, error: err.message };
  }
});

// ─── Daily Activity Log Handlers ───────────────────────────────────────────
ipcMain.handle('logs:getToday', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logFile = path.join(getLogsDir(), `${today}.log`);
    if (fs.existsSync(logFile)) {
      return { success: true, date: today, content: fs.readFileSync(logFile, 'utf8'), path: logFile };
    }
    return { success: true, date: today, content: 'No log entries recorded today yet.', path: logFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('logs:openFolder', async () => {
  try {
    const dir = getLogsDir();
    await shell.openPath(dir);
    return { success: true, path: dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


// ─── Token & Credentials Verification Handlers ─────────────────────────────
ipcMain.handle('uploadthing:testToken', async (_, token) => {
  try {
    if (!token || !token.trim()) {
      return { success: false, error: 'Token is empty.' };
    }
    let cleanToken = token.trim();
    if (cleanToken.startsWith('UPLOADTHING_TOKEN=')) {
      cleanToken = cleanToken.replace(/^UPLOADTHING_TOKEN=/, '').trim();
    }
    cleanToken = cleanToken.replace(/^['"]|['"]$/g, '').trim();

    if (cleanToken.startsWith('sk_live_')) {
      return {
        success: false,
        error: 'Legacy Secret Key detected. Please use SDK v7+ Token (starts with eyJ...).',
      };
    }

    const { UTApi } = require('uploadthing/server');
    const utapi = new UTApi({ token: cleanToken });
    const res = await utapi.listFiles({ limit: 1 });
    if (res.error) {
      return { success: false, error: res.error.message || 'Verification failed.' };
    }
    return { success: true, message: 'Connected to UploadThing successfully!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('aisensy:testKey', async (_, { apiKey }) => {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API key is empty.' };
    }
    return { success: true, message: 'API key format valid.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


