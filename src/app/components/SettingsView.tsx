'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  Upload,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
  onClearCache: () => Promise<void>;
  cachedCount: number;
}

export default function SettingsView({
  settings,
  onSave,
  onClearCache,
  cachedCount,
}: SettingsViewProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [showUploadthing, setShowUploadthing] = useState(false);
  const [showAiSensy, setShowAiSensy] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test states
  const [testingUploadthing, setTestingUploadthing] = useState(false);
  const [uploadthingTestResult, setUploadthingTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [testingAiSensy, setTestingAiSensy] = useState(false);
  const [aiSensyTestResult, setAiSensyTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    await onSave(form);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleTestUploadthing = async () => {
    if (!window.electronAPI?.testUploadthingToken) return;
    setTestingUploadthing(true);
    setUploadthingTestResult(null);
    try {
      const res = await window.electronAPI.testUploadthingToken(form.uploadthingToken);
      if (res.success) {
        setUploadthingTestResult({ success: true, message: res.message || 'Connected successfully!' });
      } else {
        setUploadthingTestResult({ success: false, message: res.error || 'Token validation failed.' });
      }
    } catch (err: any) {
      setUploadthingTestResult({ success: false, message: err.message });
    } finally {
      setTestingUploadthing(false);
    }
  };

  const handleTestAiSensy = async () => {
    if (!window.electronAPI?.testAiSensyKey) return;
    setTestingAiSensy(true);
    setAiSensyTestResult(null);
    try {
      const res = await window.electronAPI.testAiSensyKey({ apiKey: form.aisensyApiKey });
      if (res.success) {
        setAiSensyTestResult({ success: true, message: 'AiSensy credentials formatted and ready!' });
      } else {
        setAiSensyTestResult({ success: false, message: res.error || 'Key validation failed.' });
      }
    } catch (err: any) {
      setAiSensyTestResult({ success: false, message: err.message });
    } finally {
      setTestingAiSensy(false);
    }
  };

  const handleClearCacheConfirm = async () => {
    if (!confirm('Are you sure you want to clear the uploaded URL cache? Previously processed PDFs will no longer be marked as cached.')) {
      return;
    }
    setClearingCache(true);
    await onClearCache();
    setClearingCache(false);
    setCacheClearedSuccess(true);
    setTimeout(() => setCacheClearedSuccess(false), 2000);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e9e9e7]">
          <div>
            <h1 className="text-base font-semibold text-[#37352f] flex items-center gap-2">
              <KeyRound className="text-[#2383e2]" size={18} />
              API Secrets & Cloud Configuration
            </h1>
            <p className="text-xs text-[#9b9a97] mt-0.5">
              Securely store credentials for PDF cloud hosting and WhatsApp delivery.
            </p>
          </div>

          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2383e2] hover:bg-[#1a6bbf] text-white text-xs font-semibold rounded-md shadow-xs transition-all active:scale-[0.98] disabled:opacity-50"
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
                <Save size={13} /> Save Configuration
              </>
            )}
          </button>
        </div>

        {/* Section 1: UploadThing */}
        <div className="bg-white rounded-lg border border-[#e9e9e7] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e9e9e7] bg-[#f7f6f3] flex items-center gap-2.5">
            <Upload size={16} className="text-[#2383e2]" />
            <div>
              <h2 className="text-xs font-semibold text-[#37352f]">UploadThing Token (SDK v7+)</h2>
              <p className="text-[11px] text-[#9b9a97]">
                Used for generating public CDN URLs for customer invoice PDFs.
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#37352f] mb-1">
                Token
              </label>
              <div className="relative flex items-center">
                <input
                  type={showUploadthing ? 'text' : 'password'}
                  placeholder="eyJhcG1hb..."
                  value={form.uploadthingToken}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    if (val.startsWith('UPLOADTHING_TOKEN=')) {
                      val = val.replace(/^UPLOADTHING_TOKEN=/, '').trim();
                    }
                    val = val.replace(/^['"]|['"]$/g, '').trim();
                    setForm({ ...form, uploadthingToken: val });
                  }}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none transition-colors pr-10 text-[#37352f]"
                />
                <button
                  type="button"
                  onClick={() => setShowUploadthing(!showUploadthing)}
                  className="absolute right-2 text-[#9b9a97] hover:text-[#37352f] p-1"
                  title={showUploadthing ? 'Hide token' : 'Show token'}
                >
                  {showUploadthing ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-[#9b9a97] mt-1">
                Starts with <code className="bg-[#f1f1ef] px-1 py-0.5 rounded font-mono text-[#37352f]">eyJ...</code>. Legacy keys starting with <code className="bg-[#fbe4e4] text-[#d44c47] px-1 py-0.5 rounded font-mono">sk_live_</code> are not supported.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestUploadthing}
                disabled={testingUploadthing || !form.uploadthingToken.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#f7f6f3] hover:bg-[#efefed] text-[#37352f] border border-[#e9e9e7] rounded-md transition-colors disabled:opacity-40"
              >
                {testingUploadthing ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={12} className="text-[#2383e2]" /> Test Token
                  </>
                )}
              </button>

              {uploadthingTestResult && (
                <div
                  className={`text-xs flex items-center gap-1 font-medium ${
                    uploadthingTestResult.success ? 'text-[#2d7738]' : 'text-[#d44c47]'
                  }`}
                >
                  {uploadthingTestResult.success ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertCircle size={13} />
                  )}
                  {uploadthingTestResult.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: AiSensy WhatsApp API */}
        <div className="bg-white rounded-lg border border-[#e9e9e7] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e9e9e7] bg-[#f7f6f3] flex items-center gap-2.5">
            <Send size={16} className="text-[#2d7738]" />
            <div>
              <h2 className="text-xs font-semibold text-[#37352f]">AiSensy WhatsApp API</h2>
              <p className="text-[11px] text-[#9b9a97]">
                Connects to AiSensy campaigns for WhatsApp message automation.
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#37352f] mb-1">
                API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showAiSensy ? 'text' : 'password'}
                  placeholder="Paste your AiSensy API Key..."
                  value={form.aisensyApiKey}
                  onChange={(e) => setForm({ ...form, aisensyApiKey: e.target.value.trim() })}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none transition-colors pr-10 text-[#37352f]"
                />
                <button
                  type="button"
                  onClick={() => setShowAiSensy(!showAiSensy)}
                  className="absolute right-2 text-[#9b9a97] hover:text-[#37352f] p-1"
                  title={showAiSensy ? 'Hide key' : 'Show key'}
                >
                  {showAiSensy ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#37352f] mb-1">
                  Active Campaign Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. bill_notification"
                  value={form.aisensyCampaignName}
                  onChange={(e) => setForm({ ...form, aisensyCampaignName: e.target.value.trim() })}
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                />
                <p className="text-[10px] text-[#9b9a97] mt-1">
                  You can also manage templates dynamically under the "AiSensy Campaigns" tab.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#37352f] mb-1 flex items-center gap-1">
                  <Globe size={11} className="text-[#9b9a97]" /> Country Code
                </label>
                <input
                  type="text"
                  placeholder="91"
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value.trim() })}
                  className="w-full px-3 py-1.5 text-xs font-mono text-center rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none text-[#37352f]"
                />
                <p className="text-[10px] text-[#9b9a97] mt-1 text-center">
                  Prefix (91 = India)
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestAiSensy}
                disabled={testingAiSensy || !form.aisensyApiKey.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#f7f6f3] hover:bg-[#efefed] text-[#37352f] border border-[#e9e9e7] rounded-md transition-colors disabled:opacity-40"
              >
                {testingAiSensy ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={12} className="text-[#2d7738]" /> Test Credentials
                  </>
                )}
              </button>

              {aiSensyTestResult && (
                <div
                  className={`text-xs flex items-center gap-1 font-medium ${
                    aiSensyTestResult.success ? 'text-[#2d7738]' : 'text-[#d44c47]'
                  }`}
                >
                  {aiSensyTestResult.success ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertCircle size={13} />
                  )}
                  {aiSensyTestResult.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Cache Maintenance */}
        <div className="bg-white rounded-lg border border-[#e9e9e7] p-4 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-[#37352f] flex items-center gap-1.5">
              <Trash2 size={13} className="text-[#d44c47]" /> URL Cache Memory
            </h3>
            <p className="text-[11px] text-[#9b9a97] mt-0.5">
              Currently caching <b>{cachedCount}</b> document URLs to avoid duplicate uploads.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {cacheClearedSuccess && (
              <span className="text-xs text-[#2d7738] font-medium flex items-center gap-1">
                <CheckCircle2 size={12} /> Cleared
              </span>
            )}
            <button
              type="button"
              onClick={handleClearCacheConfirm}
              disabled={clearingCache || cachedCount === 0}
              className="px-2.5 py-1 text-xs font-medium text-[#d44c47] bg-[#fbe4e4] hover:bg-[#fad4d4] border border-[#f5c6cb] rounded-md transition-colors disabled:opacity-40"
            >
              {clearingCache ? 'Clearing...' : 'Clear Cache'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
