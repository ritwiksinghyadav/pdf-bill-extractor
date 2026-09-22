const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');

let mainWindow;

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
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

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    try {
      const buffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(buffer);
      const extracted = extractInfo(pdfData.text, fileName);

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
      return { success: false, error: response.error.message || 'Uploadthing upload failed' };
    }

    const publicUrl = response.data?.ufsUrl || response.data?.url;
    if (!publicUrl) {
      return { success: false, error: 'Uploadthing returned no URL. Check your token and app settings.' };
    }

    return { success: true, publicUrl, provider: 'Uploadthing' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


// ─── AiSensy WhatsApp API Handler ──────────────────────────────────────────
ipcMain.handle('aisensy:sendMessage', async (_, { apiKey, campaignName, destination, customerName, billNo, amount, pdfUrl, countryCode }) => {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'AiSensy API Key is missing. Please configure it in Settings.' };
    }
    if (!campaignName || !campaignName.trim()) {
      return { success: false, error: 'AiSensy Campaign Name is missing. Please configure it in Settings.' };
    }

    // Clean destination phone number
    let cleanNumber = String(destination || '').replace(/[^\d]/g, '');
    const cc = String(countryCode || '91').replace(/[^\d]/g, '');
    
    // Add country code if 10-digit number
    if (cleanNumber.length === 10) {
      cleanNumber = cc + cleanNumber;
    }
    if (!cleanNumber.startsWith('+')) {
      cleanNumber = '+' + cleanNumber;
    }

    const payload = {
      apiKey: apiKey.trim(),
      campaignName: campaignName.trim(),
      destination: cleanNumber,
      userName: customerName || 'Customer',
      templateParams: [
        customerName || 'Customer',
        billNo || 'N/A',
        amount || 'N/A',
        pdfUrl || '',
      ],
      media: pdfUrl ? {
        url: pdfUrl,
        filename: `${customerName || 'Bill'}_${billNo || 'Invoice'}.pdf`,
      } : undefined,
    };

    const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok && (data.success === true || data.status === 'success' || data.messageId || data.result)) {
      return { success: true, response: data };
    } else {
      return {
        success: false,
        error: data.message || data.error || data.reason || `AiSensy API Error (${res.status})`,
        response: data,
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

