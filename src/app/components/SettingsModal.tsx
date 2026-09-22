'use client';

import { useState } from 'react';
import { Settings, X, Save, Key, Send, Upload, CheckCircle2, ShieldAlert } from 'lucide-react';

export interface AppSettings {
  uploadthingToken: string;
  aisensyApiKey: string;
  aisensyCampaignName: string;
  countryCode: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(form);
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-[#e9e9e7] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#f7f6f3] border-b border-[#e9e9e7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="size-5 text-[#2383e2]" />
            <h2 className="font-semibold text-sm text-[#37352f]">API Settings & Integrations</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#9b9a97] hover:text-[#37352f] hover:bg-[#eae8e1] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Uploadthing API Section */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-semibold text-[#37352f]">
              <span className="flex items-center gap-1.5">
                <Upload size={14} className="text-[#2383e2]" /> Uploadthing Secret Token
              </span>
              <span className="text-[10px] text-[#9b9a97] font-normal">Public PDF Links</span>
            </label>
            <input
              type="password"
              placeholder="sk_live_..."
              value={form.uploadthingToken}
              onChange={(e) => setForm({ ...form, uploadthingToken: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2383e2] outline-none font-mono"
            />
            <p className="text-[11px] text-[#9b9a97]">
              Used to upload bill PDFs & generate public URLs (<code className="font-mono bg-[#f0efe9] px-1 rounded">utfs.io</code>).
            </p>
          </div>

          <hr className="border-[#e9e9e7]" />

          {/* AiSensy WhatsApp API Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#37352f]">
              <Send size={14} className="text-[#2d7738]" /> AiSensy WhatsApp API Settings
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#6b7280]">AiSensy API Key</label>
              <input
                type="password"
                placeholder="Enter AiSensy API Key"
                value={form.aisensyApiKey}
                onChange={(e) => setForm({ ...form, aisensyApiKey: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none font-mono"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-[#6b7280]">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. bill_notification"
                  value={form.aisensyCampaignName}
                  onChange={(e) => setForm({ ...form, aisensyCampaignName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#6b7280]">Country Code</label>
                <input
                  type="text"
                  placeholder="91"
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[#e9e9e7] bg-[#fafaf9] focus:bg-white focus:border-[#2d7738] outline-none font-mono text-center"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#9b9a97]">
              Automatically prefixes country code (default: 91 for India) to 10-digit customer mobile numbers.
            </p>
          </div>

          {/* Save Footer */}
          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#6b7280] hover:text-[#37352f] rounded-md hover:bg-[#f0efe9] transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#2383e2] hover:bg-[#1a6bbf] rounded-md transition-all shadow-xs active:scale-95 disabled:opacity-50"
            >
              {savedSuccess ? (
                <><CheckCircle2 size={14} /> Saved!</>
              ) : (
                <><Save size={14} /> Save Configuration</>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
