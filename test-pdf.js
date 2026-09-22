const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function inspectPdf() {
  const targetDir = __dirname;
  const files = fs.readdirSync(targetDir);
  const pdfFile = files.find(f => f.toLowerCase().includes('hariram') && f.endsWith('.pdf')) || files.find(f => f.endsWith('.pdf'));

  if (!pdfFile) {
    console.log('No PDF found in folder:', targetDir);
    return;
  }

  const filePath = path.join(targetDir, pdfFile);
  console.log('Inspecting PDF:', filePath);

  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);

  console.log('--- RAW PDF TEXT START ---');
  console.log(JSON.stringify(pdfData.text));
  console.log('--- RAW PDF TEXT END ---');
}

inspectPdf().catch(console.error);
