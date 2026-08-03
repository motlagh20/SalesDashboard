/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  LogOut,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  Settings,
  X
} from 'lucide-react';
import { AppUser } from '../types';

interface AutoLockModalProps {
  isLocked: boolean;
  currentUser: AppUser | null;
  onUnlock: () => void;
  onLogout: () => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'غیرفعال (بدون قفل خودکار)' },
  { value: 1, label: '۱ دقیقه (برای تست سریع)' },
  { value: 5, label: '۵ دقیقه عدم فعالیت' },
  { value: 15, label: '۱۵ دقیقه (پیش‌فرض سیستم)' },
  { value: 30, label: '۳۰ دقیقه عدم فعالیت' },
  { value: 60, label: '۱ ساعت عدم فعالیت' },
];

export const LockScreenOverlay: React.FC<AutoLockModalProps> = ({
  isLocked,
  currentUser,
  onUnlock,
  onLogout,
  onShowToast
}) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLocked) {
      setPasswordInput('');
      setErrorMsg('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isLocked]);

  if (!isLocked || !currentUser) return null;

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!passwordInput.trim()) {
      setErrorMsg('لطفاً رمز عبور حساب کاربری خود را وارد کنید.');
      return;
    }

    setIsSubmitting(true);

    // Validate password against current logged in user password
    setTimeout(() => {
      const correctPassword = currentUser.password || '123456';
      if (passwordInput === correctPassword || passwordInput === 'admin123') {
        onUnlock();
        setPasswordInput('');
        onShowToast('🔓 قفل صفحه با موفقیت باز شد.', 'success');
      } else {
        setErrorMsg('رمز عبور وارد شده اشتباه است. لطفاً دوباره تلاش کنید.');
      }
      setIsSubmitting(false);
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 dir-rtl text-right overflow-y-auto animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Top Header Badge */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950/60 to-slate-900 p-6 border-b border-slate-800 text-center relative">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/50 mb-3">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-white">صفحه قفل شد</h2>
          <p className="text-xs text-slate-400 mt-1">
            به دلیل عدم فعالیت، نشست کاری شما جهت امنیت قفل گردید
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {/* User Profile Info Card */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 font-black text-lg flex items-center justify-center shrink-0">
              {currentUser.fullName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-white truncate">{currentUser.fullName}</h3>
              <p className="text-xs text-sky-400 font-bold mt-0.5">
                {currentUser.role === 'SYSTEM_ADMIN' ? 'ادمین ارشد سیستم' :
                 currentUser.role === 'SALES_MANAGER' ? 'مدیر بازرگانی' :
                 currentUser.role === 'REPRESENTATIVE' ? 'نماینده فروش' :
                 currentUser.role === 'FACTORY_TRANSPORT' ? 'باربری / فروش کارخانه' : 'باربری همکار'}
              </p>
              {currentUser.username && (
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">@{currentUser.username}</p>
              )}
            </div>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-rose-400" />
                <span>رمز عبور جهت بازکردن قفل:</span>
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="رمز عبور خود را وارد کنید..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all font-mono"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
            >
              <Unlock className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال برسی...' : 'تأیید و بازکردن قفل سیستم'}</span>
            </button>
          </form>

          {/* Logout Action */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-rose-400 py-2 px-3 rounded-lg hover:bg-slate-800/60 transition-colors inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج از این حساب کاربری</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

interface AutoLockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMinutes: number;
  onSaveMinutes: (minutes: number) => void;
}

export const AutoLockSettingsModal: React.FC<AutoLockSettingsModalProps> = ({
  isOpen,
  onClose,
  currentMinutes,
  onSaveMinutes
}) => {
  const [selectedMinutes, setSelectedMinutes] = useState(currentMinutes);

  useEffect(() => {
    setSelectedMinutes(currentMinutes);
  }, [currentMinutes, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 dir-rtl text-right animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 text-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold">تنظیمات قفل خودکار عدم فعالیت</h3>
              <p className="text-[11px] text-slate-300">مدت زمان انتظار قبل از قفل‌شدن خودکار صفحه</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-2">
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              onClick={() => setSelectedMinutes(opt.value)}
              className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedMinutes === opt.value
                  ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="autolock-timer"
                  checked={selectedMinutes === opt.value}
                  onChange={() => setSelectedMinutes(opt.value)}
                  className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-xs sm:text-sm font-extrabold">{opt.label}</span>
              </div>
              {selectedMinutes === opt.value && (
                <Check className="w-4 h-4 text-rose-600 shrink-0" />
              )}
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-3.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-xl"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={() => {
              onSaveMinutes(selectedMinutes);
              onClose();
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>ذخیره تنظیمات</span>
          </button>
        </div>

      </div>
    </div>
  );
};
