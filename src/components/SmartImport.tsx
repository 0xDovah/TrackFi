'use client';

import { useState, useRef } from 'react';
import type { DbHouseholdMember, DbCategory } from '@/lib/types';
import { formatCategory } from '@/lib/utils';

type ExtractedTransaction = {
  date: string;
  description: string;
  amount: number;
  category: string;
  expense_type: string;
  payment_method: string;
  is_income: boolean;
  notes: string;
};

type SmartImportProps = {
  members: DbHouseholdMember[];
  categories: DbCategory[];
  onImport: (transactions: Array<ExtractedTransaction & { paid_by: string }>) => Promise<void>;
  onClose: () => void;
};

export default function SmartImport({ members, categories, onImport, onClose }: SmartImportProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'done'>('upload');
  const [extracted, setExtracted] = useState<ExtractedTransaction[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paidBy, setPaidBy] = useState<string>(members[0]?.id ?? '');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('processing');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to process file');
        setStep('upload');
        return;
      }

      setExtracted(data.transactions);
      setSummary(data.summary);
      // Select all by default
      setSelected(new Set(data.transactions.map((_: unknown, i: number) => i)));
      setStep('review');
    } catch {
      setError('Failed to process file. Please try again.');
      setStep('upload');
    }

    e.target.value = '';
  };

  const toggleTransaction = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === extracted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(extracted.map((_, i) => i)));
    }
  };

  const handleConfirmImport = async () => {
    const toImport = extracted
      .filter((_, i) => selected.has(i))
      .map(t => ({ ...t, paid_by: paidBy }));

    if (toImport.length === 0) return;

    setStep('processing');
    await onImport(toImport);
    setStep('done');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-800">Smart Import</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-medium underline">dismiss</button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="text-center py-8">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">Upload a bank statement, receipt, or expense report</p>
          <p className="text-sm text-gray-400 mb-4">Supports PDF, CSV, PNG, JPEG, WebP, HEIC (max 10MB)</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Choose File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.png,.jpg,.jpeg,.webp,.heic"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 'processing' && (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Analyzing document with AI...</p>
          <p className="text-sm text-gray-400">This may take a few seconds</p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <>
          <p className="text-sm text-gray-500 mb-3">{summary}</p>

          {/* Default paid by */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <label className="text-sm font-medium text-gray-700">Default &quot;Paid By&quot;:</label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">Applied to all selected transactions</span>
          </div>

          {/* Select all / none */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={toggleAll}
              className="text-sm text-blue-600 hover:underline"
            >
              {selected.size === extracted.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-sm text-gray-400">
              {selected.size} of {extracted.length} selected
            </span>
          </div>

          {/* Transaction list */}
          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {extracted.map((t, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(i) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleTransaction(i)}
                  className="mt-1 h-4 w-4 text-blue-600 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-500">{t.date}</span>
                    {t.is_income ? (
                      <span className="px-2 py-0.5 text-xs rounded font-medium bg-emerald-100 text-emerald-700">income</span>
                    ) : (
                      <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                        t.expense_type === 'shared' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>{t.expense_type}</span>
                    )}
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{formatCategory(t.category)}</span>
                  </div>
                  <p className="text-gray-800 font-medium text-sm mt-1">{t.description}</p>
                  {t.notes && <p className="text-xs text-gray-400 mt-0.5">{t.notes}</p>}
                </div>
                <span className={`text-lg font-bold shrink-0 ${t.is_income ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {t.is_income ? '+' : ''}&euro;{t.amount.toFixed(2)}
                </span>
              </label>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleConfirmImport}
              disabled={selected.size === 0}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              Import {selected.size} Transaction{selected.size !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => { setStep('upload'); setExtracted([]); }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Try Another File
            </button>
          </div>
        </>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">&#10003;</div>
          <p className="text-gray-800 font-medium mb-1">Import Complete!</p>
          <p className="text-sm text-gray-500 mb-4">{selected.size} transactions added to your household.</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => { setStep('upload'); setExtracted([]); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Import Another
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
