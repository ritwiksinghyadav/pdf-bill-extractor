'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Trash2,
  Save,
  Check,
  CheckCircle2,
  Copy,
  Smartphone,
  FileCode,
  Tag,
  PlayCircle,
  RefreshCw,
  AlertCircle,
  FileText,
  Clock,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import { AppSettings, CampaignConfig } from '../types';

interface CampaignsViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
}

const defaultCampaigns: CampaignConfig[] = [
  {
    id: 'camp_standard',
    name: 'Standard Bill Notification',
    templateName: 'bill_notification_v2',
    // Order matches AiSensy template: {{1}}=Name, {{2}}=Date, {{3}}=BillNo, {{4}}=Amount
    // PDF is sent as media attachment — do NOT include {{PublicUrl}} here
    params: ['{{CustomerName}}', '{{Date}}', '{{BillNo}}', '{{Amount}}'],
    customNote: 'Dear {{CustomerName}}, your bill {{BillNo}} dated {{Date}} for {{Amount}} is attached.',
    isActive: true,
  },
  {
    id: 'camp_reminder',
    name: 'Payment Due Reminder',
    templateName: 'payment_reminder_v1',
    params: ['{{CustomerName}}', '{{Date}}', '{{BillNo}}', '{{Amount}}'],
    customNote: 'Reminder: Invoice {{BillNo}} dated {{Date}} for {{Amount}} is pending. PDF attached.',
    isActive: false,
  },
];


export default function CampaignsView({
  settings,
  onSaveSettings,
}: CampaignsViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignConfig[]>(() => {
    if (settings.campaigns && settings.campaigns.length > 0) {
      return settings.campaigns;
    }
    return defaultCampaigns;
  });

  const [selectedId, setSelectedId] = useState<string>(() => {
    const active = campaigns.find((c) => c.isActive);
    return active ? active.id : campaigns[0]?.id || 'camp_standard';
  });

  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'json'>('editor');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Test send state
  const [testNumber, setTestNumber] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedCampaign =
    campaigns.find((c) => c.id === selectedId) || campaigns[0] || defaultCampaigns[0];

  // Editable dummy test data for previews and live testing
  const [dummyData, setDummyData] = useState({
    customerName: 'Ishan Ahuja',
    billNo: 'HR/202509095',
    amount: '2,520',
    date: '23/09/2026',
    publicUrl: 'https://q506xfaz5a.ufs.sh/f/EzWMcMFDAMSxMVQ2u6CQ2kdpJh4ycwWi8ZjRFY6K7usn3mlC',
    time: '11:33 AM',
  });

  const systemChips = [
    { label: '+ Customer Name', value: '{{CustomerName}}' },
    { label: '+ Bill No', value: '{{BillNo}}' },
    { label: '+ Amount', value: '{{Amount}}' },
    { label: '+ Date', value: '{{Date}}' },
    { label: '+ Public PDF Link', value: '{{PublicUrl}}' },
  ];

  const updateCurrent = (field: keyof CampaignConfig, val: any) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === selectedCampaign.id ? { ...c, [field]: val } : c))
    );
  };

  const handleParamChange = (index: number, val: string) => {
    const newParams = [...selectedCampaign.params];
    newParams[index] = val;
    updateCurrent('params', newParams);
  };

  const handleAddParam = () => {
    updateCurrent('params', [...selectedCampaign.params, '{{CustomerName}}']);
  };

  const handleRemoveParam = (index: number) => {
    if (selectedCampaign.params.length <= 1) {
      return;
    }
    const newParams = selectedCampaign.params.filter((_, i) => i !== index);
    updateCurrent('params', newParams);
  };

  const handleInsertTag = (paramIndex: number, tagValue: string) => {
    const newParams = [...selectedCampaign.params];
    newParams[paramIndex] = tagValue;
    updateCurrent('params', newParams);
  };

  const handleCreateCampaign = () => {
    const newId = `camp_${Date.now()}`;
    const newCamp: CampaignConfig = {
      id: newId,
      name: `New Campaign ${campaigns.length + 1}`,
      templateName: 'custom_bill_template',
      params: ['{{CustomerName}}', '{{Date}}', '{{BillNo}}', '{{Amount}}'],
      customNote: 'Dear {{CustomerName}}, please find attached your bill {{BillNo}}.',
      isActive: false,
    };
    const updated = [...campaigns, newCamp];
    setCampaigns(updated);
    setSelectedId(newId);
  };

  const handleDeleteCampaign = (id: string) => {
    if (campaigns.length <= 1) {
      return;
    }
    const remaining = campaigns.filter((c) => c.id !== id);
    setCampaigns(remaining);
    setSelectedId(remaining[0].id);
  };

  const handleSetActive = async (id: string) => {
    const updated = campaigns.map((c) => ({
      ...c,
      isActive: c.id === id,
    }));
    setCampaigns(updated);
    const target = updated.find((c) => c.id === id);
    if (target) {
      await onSaveSettings({
        ...settings,
        aisensyCampaignName: target.templateName,
        activeCampaignId: id,
        campaigns: updated,
      });
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    await onSaveSettings({
      ...settings,
      aisensyCampaignName: selectedCampaign.isActive
        ? selectedCampaign.templateName
        : settings.aisensyCampaignName,
      campaigns,
    });
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Evaluate variable strings against sample data
  // Amount is sent WITHOUT currency prefix (AiSensy template has Rs. hardcoded before {{N}})
  const evaluateVar = (str: string) => {
    const cleanAmt = (dummyData.amount || '0').replace(/^(Rs\.?|₹|INR)\s*/i, '').trim();
    return str
      .replace(/{{CustomerName}}/g, dummyData.customerName || 'Customer')
      .replace(/{{BillNo}}/g, dummyData.billNo || 'N/A')
      .replace(/{{Amount}}/g, cleanAmt)
      .replace(/{{Date}}/g, dummyData.date || 'N/A')
      .replace(/{{PublicUrl}}/g, dummyData.publicUrl || '');
  };

  // Generate payload for preview / test
  const evaluatedParams = selectedCampaign.params.map((p) => evaluateVar(p));

  const generatePayload = () => ({
    apiKey: settings.aisensyApiKey ? '••••••••••••••••' : 'YOUR_API_KEY',
    campaignName: selectedCampaign.templateName,
    destination: `+${settings.countryCode || '91'}9876543210`,
    userName: dummyData.customerName || 'Customer',
    source: 'PDF Bill Extractor Desktop',
    templateParams: evaluatedParams,
    media: {
      url: dummyData.publicUrl,
      // No .pdf extension — AiSensy appends it automatically
      filename: `${(dummyData.customerName || 'Bill').replace(/[^a-zA-Z0-9 ]/g, '').trim()}-${(dummyData.billNo || 'Invoice').replace(/[^a-zA-Z0-9\/\-]/g, '').trim()}`,
    },
  });

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(generatePayload(), null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  const handleSendTestMessage = async () => {
    if (!testNumber.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter a WhatsApp phone number with country code (e.g. 919009264562).',
      });
      return;
    }
    if (!settings.aisensyApiKey?.trim()) {
      setTestResult({
        success: false,
        message: 'AiSensy API Key is missing. Please configure it in API & Credentials.',
      });
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      if (window.electronAPI?.aisensySend) {
        const cleanAmt = (dummyData.amount || '0').replace(/^(Rs\.?|₹|INR)\s*/i, '').trim();
        const currentEvaluatedParams = selectedCampaign.params.map((p) => evaluateVar(p));
        const cleanMediaName = `${(dummyData.customerName || 'Bill').replace(/[^a-zA-Z0-9 ]/g, '').trim()}-${(dummyData.billNo || 'Invoice').replace(/[^a-zA-Z0-9\/\-]/g, '').trim()}`;

        const res = await window.electronAPI.aisensySend({
          apiKey: settings.aisensyApiKey,
          campaignName: selectedCampaign.templateName,
          destination: testNumber.trim(),
          customerName: dummyData.customerName || 'Customer',
          billNo: dummyData.billNo || 'N/A',
          amount: cleanAmt,
          pdfUrl: dummyData.publicUrl || undefined,
          countryCode: settings.countryCode,
          templateParams: currentEvaluatedParams,
          mediaFilename: cleanMediaName,
        });

        if (res.success) {
          const msgId = res.response?.submitted_message_id;
          let msgText = `Live WhatsApp message sent to ${testNumber.trim()}!${msgId ? ` (AiSensy ID: ${msgId})` : ''}`;
          if (res.warning) {
            msgText += ` ⚠️ Note: ${res.warning}`;
          }
          setTestResult({
            success: true,
            message: msgText,
          });
        } else {
          setTestResult({
            success: false,
            message: res.error || 'Failed to dispatch test message.',
          });
        }
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="flex-1 h-full flex overflow-hidden bg-white text-[#37352f]">
      
      {/* Left Column: Campaigns List (Notion Sidebar Style) */}
      <div className="w-64 border-r border-[#e9e9e7] bg-[#f7f6f3] flex flex-col h-full flex-shrink-0">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e9e9e7] flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9b9a97]">
            Campaigns ({campaigns.length})
          </span>
          <button
            onClick={handleCreateCampaign}
            className="flex items-center gap-1 text-xs font-semibold text-[#2383e2] hover:text-[#1a6bbf]"
          >
            <Plus size={13} /> New
          </button>
        </div>

        {/* List of Campaigns */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {campaigns.map((camp) => {
            const isSel = camp.id === selectedCampaign.id;
            return (
              <div
                key={camp.id}
                onClick={() => setSelectedId(camp.id)}
                className={`p-2.5 rounded-md cursor-pointer select-none transition-colors border ${
                  isSel
                    ? 'bg-white border-[#e9e9e7] shadow-xs'
                    : 'border-transparent hover:bg-[#efefed]'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isSel ? 'text-[#2383e2]' : 'text-[#37352f]'
                      }`}
                    >
                      {camp.name}
                    </p>
                    <p className="text-[10px] text-[#9b9a97] font-mono truncate mt-0.5">
                      {camp.templateName}
                    </p>
                  </div>
                  {camp.isActive ? (
                    <span className="text-[10px] font-semibold text-[#2d7738] bg-[#edf6ed] px-1.5 py-0.5 rounded border border-[#c3e6cb]">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetActive(camp.id);
                      }}
                      className="text-[10px] text-[#9b9a97] hover:text-[#2383e2] px-1 py-0.5 rounded hover:bg-white"
                    >
                      Set Active
                    </button>
                  )}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#9b9a97]">
                  <span>{camp.params.length} Parameters</span>
                  {campaigns.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCampaign(camp.id);
                      }}
                      className="text-[#9b9a97] hover:text-[#d44c47] p-0.5 rounded"
                      title="Delete campaign"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Right Column: Campaign Customizer & Notion Preview */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        
        {/* Top Control Bar */}
        <div className="h-14 px-6 border-b border-[#e9e9e7] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">📢</span>
            <div>
              <h2 className="text-xs font-semibold text-[#37352f] flex items-center gap-2">
                {selectedCampaign.name}
                {selectedCampaign.isActive && (
                  <span className="text-[10px] font-bold text-[#2d7738] bg-[#edf6ed] px-1.5 py-0.2 rounded border border-[#c3e6cb]">
                    ● Active Delivery Template
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-[#9b9a97] font-mono">
                AiSensy Template: {selectedCampaign.templateName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-0.5 bg-[#f7f6f3] p-0.5 rounded-md border border-[#e9e9e7]">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'editor'
                    ? 'bg-white text-[#37352f] shadow-xs'
                    : 'text-[#787774] hover:text-[#37352f]'
                }`}
              >
                <Tag size={12} /> Parameters
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-white text-[#37352f] shadow-xs'
                    : 'text-[#787774] hover:text-[#37352f]'
                }`}
              >
                <Smartphone size={12} /> WhatsApp Preview
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'json'
                    ? 'bg-white text-[#37352f] shadow-xs'
                    : 'text-[#787774] hover:text-[#37352f]'
                }`}
              >
                <FileCode size={12} /> JSON Payload
              </button>
            </div>

            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2383e2] hover:bg-[#1a6bbf] text-white text-xs font-semibold rounded-md shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 ml-2"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={13} /> Saved
                </>
              ) : isSaving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save size={13} /> Save Campaign
                </>
              )}
            </button>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            {activeTab === 'editor' && (
              <div className="space-y-5">
                
                {/* Campaign Metadata Card */}
                <div className="p-4 rounded-lg border border-[#e9e9e7] bg-white space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#37352f] mb-1">
                        Campaign Display Name
                      </label>
                      <input
                        type="text"
                        value={selectedCampaign.name}
                        onChange={(e) => updateCurrent('name', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none text-[#37352f]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#37352f] mb-1">
                        AiSensy Template Name
                      </label>
                      <input
                        type="text"
                        value={selectedCampaign.templateName}
                        onChange={(e) => updateCurrent('templateName', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none text-[#37352f]"
                      />
                    </div>
                  </div>
                </div>

                {/* System Variable Tag Mapper */}
                <div className="p-4 rounded-lg border border-[#e9e9e7] bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#37352f]">
                        Template Parameters (templateParams)
                      </h3>
                      <p className="text-[11px] text-[#9b9a97]">
                        Variables extracted from your PDFs will dynamically replace these tags.
                      </p>
                    </div>
                    <button
                      onClick={handleAddParam}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2383e2] hover:underline"
                    >
                      <Plus size={12} /> Add Parameter
                    </button>
                  </div>

                  {/* System Variable Quick Insert Chips */}
                  <div className="p-2.5 rounded-md bg-[#f7f6f3] border border-[#e9e9e7] space-y-1.5">
                    <span className="text-[10px] font-semibold text-[#787774] uppercase tracking-wider block">
                      Quick System Variable Chips (Click to copy tag):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {systemChips.map((chip) => (
                        <button
                          key={chip.value}
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(chip.value);
                          }}
                          className="px-2 py-0.5 text-[11px] font-mono bg-white hover:bg-[#efefed] border border-[#e9e9e7] rounded text-[#37352f] transition-colors"
                          title="Click to copy tag"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Parameters List */}
                  <div className="space-y-2 pt-1">
                    {selectedCampaign.params.map((paramVal, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-md border border-[#e9e9e7] bg-white space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-20 text-xs font-mono font-semibold text-[#787774]">
                            Param [{idx + 1}]
                          </span>
                          <input
                            type="text"
                            value={paramVal}
                            onChange={(e) => handleParamChange(idx, e.target.value)}
                            placeholder="e.g. {{CustomerName}} or Custom text"
                            className="flex-1 px-2.5 py-1 text-xs font-mono rounded border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none text-[#37352f]"
                          />
                          {selectedCampaign.params.length > 1 && (
                            <button
                              onClick={() => handleRemoveParam(idx)}
                              className="text-[#9b9a97] hover:text-[#d44c47] p-1"
                              title="Remove parameter"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {/* Quick Chip selectors for this parameter */}
                        <div className="flex items-center justify-between text-[11px] pl-20">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[#9b9a97]">Set to:</span>
                            {systemChips.map((chip) => (
                              <button
                                key={chip.value}
                                type="button"
                                onClick={() => handleInsertTag(idx, chip.value)}
                                className={`text-[10px] px-1.5 py-0.2 rounded border transition-colors ${
                                  paramVal === chip.value
                                    ? 'bg-[#e8f0fb] text-[#2383e2] border-[#2383e2]/40 font-bold'
                                    : 'bg-[#f7f6f3] text-[#787774] border-[#e9e9e7] hover:bg-[#efefed]'
                                }`}
                              >
                                {chip.value.replace(/[{}]/g, '')}
                              </button>
                            ))}
                          </div>

                          <span className="text-[10px] text-[#2d7738] font-mono">
                            Preview: <b>{evaluateVar(paramVal)}</b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Test Send to Admin WhatsApp Number with Editable Dummy Data */}
                <div className="p-4 rounded-lg border border-[#e9e9e7] bg-white space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-[#37352f] flex items-center gap-1.5">
                        <PlayCircle size={14} className="text-[#2d7738]" /> Send Test WhatsApp Message
                      </h3>
                      <p className="text-[11px] text-[#9b9a97] mt-0.5">
                        Enter dummy test values below. They will be evaluated into your campaign template parameters and delivered to your phone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDummyData({
                          customerName: 'Ishan Ahuja',
                          billNo: 'HR/202509095',
                          amount: '2,520',
                          date: '23/09/2026',
                          publicUrl: 'https://q506xfaz5a.ufs.sh/f/EzWMcMFDAMSxMVQ2u6CQ2kdpJh4ycwWi8ZjRFY6K7usn3mlC',
                          time: '11:33 AM',
                        })
                      }
                      className="text-[10px] text-[#787774] hover:text-[#37352f] flex items-center gap-1 hover:underline"
                    >
                      <RotateCcw size={10} /> Reset Defaults
                    </button>
                  </div>

                  {/* Dummy Data Input Grid */}
                  <div className="bg-[#fafaf9] p-3 rounded-lg border border-[#e9e9e7] space-y-2.5">
                    <span className="text-[10px] font-semibold text-[#787774] uppercase tracking-wider block">
                      🧪 Test / Dummy Data Fields
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[10px] font-medium text-[#787774] block mb-1">
                          Customer Name
                        </label>
                        <input
                          type="text"
                          value={dummyData.customerName}
                          onChange={(e) =>
                            setDummyData((prev) => ({ ...prev, customerName: e.target.value }))
                          }
                          placeholder="e.g. Ishan Ahuja"
                          className="w-full px-2.5 py-1 text-xs rounded border border-[#e9e9e7] bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[#787774] block mb-1">
                          Bill Date
                        </label>
                        <input
                          type="text"
                          value={dummyData.date}
                          onChange={(e) =>
                            setDummyData((prev) => ({ ...prev, date: e.target.value }))
                          }
                          placeholder="e.g. 23/09/2026"
                          className="w-full px-2.5 py-1 text-xs rounded border border-[#e9e9e7] bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[#787774] block mb-1">
                          Bill Number
                        </label>
                        <input
                          type="text"
                          value={dummyData.billNo}
                          onChange={(e) =>
                            setDummyData((prev) => ({ ...prev, billNo: e.target.value }))
                          }
                          placeholder="e.g. HR/202509095"
                          className="w-full px-2.5 py-1 text-xs rounded border border-[#e9e9e7] bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[#787774] block mb-1">
                          Amount (Numeric)
                        </label>
                        <input
                          type="text"
                          value={dummyData.amount}
                          onChange={(e) =>
                            setDummyData((prev) => ({ ...prev, amount: e.target.value }))
                          }
                          placeholder="e.g. 2,520"
                          className="w-full px-2.5 py-1 text-xs rounded border border-[#e9e9e7] bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-[#787774] block mb-1">
                        Sample PDF Media URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={dummyData.publicUrl}
                        onChange={(e) =>
                          setDummyData((prev) => ({ ...prev, publicUrl: e.target.value }))
                        }
                        placeholder="https://q506xfaz5a.ufs.sh/f/sample.pdf"
                        className="w-full px-2.5 py-1 text-xs font-mono rounded border border-[#e9e9e7] bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                      />
                      <p className="text-[10px] text-[#9b9a97] mt-1">
                        ⚠️ <b>Important:</b> Must be a publicly accessible PDF link (HTTP 200). If the URL is broken or returns 404, WhatsApp Cloud API silently drops message delivery.
                      </p>
                    </div>

                    {/* Evaluated Live Parameters Preview */}
                    <div className="pt-2 border-t border-[#e9e9e7] flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[#787774]">Live Payload Params:</span>
                      {selectedCampaign.params.map((paramTag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#edf6ed] text-[#2d7738] border border-[#c3e6cb] font-mono"
                        >
                          <span className="opacity-70">{`{{${idx + 1}}}`}:</span>
                          <b>{evaluateVar(paramTag)}</b>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Phone Number Input & Send Button */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter mobile number with country code (e.g. 919009264562)"
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestMessage}
                      disabled={isSendingTest}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-[#2d7738] hover:bg-[#235c2b] rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs whitespace-nowrap"
                    >
                      {isSendingTest ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send size={12} /> Send Test
                        </>
                      )}
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`p-2.5 rounded-md text-xs flex items-center gap-1.5 font-medium ${
                        testResult.success
                          ? 'bg-[#edf6ed] text-[#2d7738] border border-[#c3e6cb]'
                          : 'bg-[#fbe4e4] text-[#d44c47] border border-[#f5c6cb]'
                      }`}
                    >
                      {testResult.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {testResult.message}
                    </div>
                  )}
                </div>


              </div>
            )}

            {/* View Mode: WhatsApp Bubble Preview */}
            {activeTab === 'preview' && (
              <div className="flex flex-col items-center justify-center p-6 bg-[#f7f6f3] rounded-xl border border-[#e9e9e7]">
                <div className="w-76 bg-white rounded-xl shadow-md overflow-hidden border border-[#e9e9e7]">
                  {/* WhatsApp Chat Header */}
                  <div className="bg-[#075e54] text-white px-3.5 py-2.5 flex items-center gap-2.5">
                    <div className="size-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                      🏢
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold leading-tight">Your Business</h4>
                      <p className="text-[9px] text-white/80">WhatsApp Official Delivery</p>
                    </div>
                  </div>

                  {/* Chat Message Area */}
                  <div className="p-3 bg-[#e5ddd5] min-h-[260px] flex flex-col justify-end space-y-2">
                    
                    {/* Message Bubble */}
                    <div className="bg-white rounded-lg p-2.5 shadow-xs max-w-[95%] text-xs space-y-2 border border-[#dedede] self-start">
                      
                      {/* PDF Card */}
                      <div className="bg-[#f0f2f5] p-2 rounded-md flex items-center gap-2 border border-[#e2e8f0]">
                        <div className="p-1.5 rounded bg-[#d44c47] text-white">
                          <FileText size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[11px] text-[#37352f] truncate">
                            {dummyData.customerName}_{dummyData.billNo}.pdf
                          </p>
                          <p className="text-[9px] text-[#9b9a97]">1 page · PDF Bill Document</p>
                        </div>
                      </div>

                      {/* Evaluated Text Parameters */}
                      <div className="text-[11px] text-[#37352f] space-y-1">
                        <p>Dear <b>{dummyData.customerName}</b>,</p>
                        <p>Your invoice <b>{dummyData.billNo}</b> dated <b>{dummyData.date}</b> for <b>Rs.{dummyData.amount.replace(/^(Rs\.?|₹|INR)\s*/i, '').trim()}</b> has been generated.</p>
                        {dummyData.publicUrl && (
                          <p className="text-[10px] text-[#2383e2] underline truncate">
                            {dummyData.publicUrl}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1 text-[9px] text-[#9b9a97]">
                        <span>{dummyData.time}</span>
                        <span className="text-[#2383e2]">✓✓</span>
                      </div>
                    </div>


                  </div>
                </div>

                <p className="text-[11px] text-[#9b9a97] mt-3">
                  Live simulation of WhatsApp message bubble delivered to customer.
                </p>
              </div>
            )}

            {/* View Mode: JSON Payload */}
            {activeTab === 'json' && (
              <div className="p-4 rounded-lg border border-[#e9e9e7] bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-[#37352f]">AiSensy v2 POST Payload</h3>
                    <p className="text-[11px] text-[#9b9a97] font-mono">
                      https://backend.aisensy.com/campaign/t1/api/v2
                    </p>
                  </div>
                  <button
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#37352f] bg-[#f7f6f3] hover:bg-[#efefed] border border-[#e9e9e7] rounded-md transition-colors"
                  >
                    <Copy size={12} /> {copiedJson ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>

                <pre className="p-3.5 rounded-md bg-[#f7f6f3] border border-[#e9e9e7] text-[#37352f] text-xs font-mono overflow-x-auto leading-relaxed">
                  {JSON.stringify(generatePayload(), null, 2)}
                </pre>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
