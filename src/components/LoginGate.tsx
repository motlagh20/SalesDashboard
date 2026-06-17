import React, { useState } from 'react';
import { Smartphone, ShieldCheck, ArrowRight, Lock, Key, User } from 'lucide-react';
import { AppUser } from '../types';
import TabarestanLogo from './TabarestanLogo';

interface LoginGateProps {
  onLoginSuccess: (user: AppUser) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function LoginGate({ onLoginSuccess, showToast }: LoginGateProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'PHONE_INPUT' | 'OTP_INPUT'>('PHONE_INPUT');
  const [loading, setLoading] = useState(false);
  const [receivedOtp, setReceivedOtp] = useState<string | null>(null);

  // Password Login States
  const [loginMode, setLoginMode] = useState<'PASSWORD' | 'OTP' | 'RECOVERY' | 'RESET_PASS'>('PASSWORD');
  const [loginKey, setLoginKey] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Password Recovery States
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState<string | null>(null);

  // Default seeded users for Sandbox quick-access
  const defaultAccounts = [
    { name: 'آقای احمدی (مدیر بازرگانی)', phone: '09121111111', username: 'manager', role: 'SALES_MANAGER', icon: '👔' },
    { name: 'آقای حمیدرضا احمدی (نماینده تهران)', phone: '09120000001', username: 'rep_tehran', role: 'REPRESENTATIVE', icon: '📱' },
    { name: 'مسئول ترابری کارخانه', phone: '09110000005', username: 'factory', role: 'FACTORY_TRANSPORT', icon: '🏭' },
    { name: 'باربری ترانزیت همکار', phone: '09110000006', username: 'shipping_transit', role: 'SHIPPING_COMPANY', icon: '🚚' },
  ];

  // 1. Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginKey.trim() || !loginPassword.trim()) {
      showToast('لطفا نام کاربری/تلفن و رمز عبور را وارد کنید.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginKey, password: loginPassword })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`🌸 خوش آمدید، جناب ${data.user.fullName}`, 'success');
        onLoginSuccess(data.user);
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'رمز عبور یا نام کاربری نادرست است.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطا در برقراری ارتباط با وب‌سرور.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. OTP Code Request
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneNumber.trim()) {
      showToast('لطفا شماره تلفن همراه خود را وارد کنید.', 'error');
      return;
    }

    setLoading(true);
    setReceivedOtp(null);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });

      if (res.ok) {
        const data = await res.json();
        setStep('OTP_INPUT');
        setReceivedOtp(data.otp);
        showToast('🔑 کد تایید پیامکی (شبیه‌سازی) صادر شد.', 'success');
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'خطایی در ارسال کد تایید رخ داد.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ارتباط با سرور برقرار نشد.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. OTP Code Verification
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpCode.trim()) {
      showToast('لطفا کد تایید ۴ رقمی را وارد کنید.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, code: otpCode })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`🌸 خوش آمدید، جناب ${data.user.fullName}`, 'success');
        onLoginSuccess(data.user);
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'کد تایید وارد شده اشتباه است.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطایی در تایید کد رخ داد.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 4. Request Recovery SMS
  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryPhone.trim()) {
      showToast('لطفا شماره همراه خود را وارد کنید.', 'error');
      return;
    }

    setLoading(true);
    setRecoveryOtp(null);

    try {
      const res = await fetch('/api/auth/forgot-password-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: recoveryPhone })
      });

      if (res.ok) {
        const data = await res.json();
        setRecoveryOtp(data.otp);
        setLoginMode('RESET_PASS');
        showToast('🔑 پیامک شبیه‌ساز بازیابی با موفقیت ارسال شد.', 'success');
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'کاربری با این شماره همراه یافت نشد.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطا در وب‌سرور.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 5. Submit Recovery Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryCode.trim() || !recoveryNewPassword.trim()) {
      showToast('وارد کردن کد تایید و کلمه عبور جدید الزامی است.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: recoveryPhone,
          code: recoveryCode,
          newPassword: recoveryNewPassword
        }
      )});

      if (res.ok) {
        showToast('🔒 رمز عبور با موفقیت به روز گردید. هم‌اکنون وارد شوید.', 'success');
        setLoginKey(recoveryPhone);
        setLoginPassword(recoveryNewPassword);
        setLoginMode('PASSWORD');
        setRecoveryCode('');
        setRecoveryNewPassword('');
        setRecoveryOtp(null);
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'کد تایید پیامکی نادرست است.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('خطا در ثبت رمز عبور.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Quick sandbox helper login
  const handleQuickLogin = (acc: typeof defaultAccounts[0]) => {
    if (loginMode === 'PASSWORD') {
      setLoginKey(acc.username);
      setLoginPassword('123456');
    } else {
      setPhoneNumber(acc.phone);
      setStep('PHONE_INPUT');
      setOtpCode('');
      // Automatically trigger OTP send for that phone
      setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: acc.phone })
          });
          if (res.ok) {
            const data = await res.json();
            setStep('OTP_INPUT');
            setReceivedOtp(data.otp);
            setOtpCode(data.otp); // pre-populate inside the sandbox
            showToast(`🔑 پیامک موقت کاربر شبیه‌سازی شد (کد: ${data.otp})`, 'success');
          } else {
            const errData = await res.json();
            showToast(errData.error, 'error');
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      }, 150);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background visual graphics */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden z-10 text-right">
        
        {/* Top header branding */}
        <div className="bg-gradient-to-l from-slate-950 to-slate-800 p-6 text-center border-b border-slate-700/50">
          <div className="mx-auto flex items-center justify-center mb-3">
            <TabarestanLogo className="w-16 h-16 text-emerald-500" />
          </div>
          <h1 className="text-sm font-black text-white">سامانه هوشمند فروش سفال طبرستان</h1>
          <p className="text-[10px] text-slate-400 mt-1">پروسه تایید مالی، ترابری، صدور بارنامه و ترخیص کارخانه</p>
        </div>

        {/* Tab Selection */}
        {(loginMode === 'PASSWORD' || loginMode === 'OTP') && (
          <div className="flex border-b border-slate-700/50 p-1 bg-slate-950/40">
            <button
              onClick={() => setLoginMode('PASSWORD')}
              className={`flex-1 py-2 text-center text-xs font-extrabold transition-all cursor-pointer ${
                loginMode === 'PASSWORD'
                  ? 'border-b-2 border-amber-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>ورود با کلمه عبور</span>
            </button>
            <button
              onClick={() => {
                setLoginMode('OTP');
                setStep('PHONE_INPUT');
              }}
              className={`flex-1 py-2 text-center text-xs font-extrabold transition-all cursor-pointer ${
                loginMode === 'OTP'
                  ? 'border-b-2 border-amber-500 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>رمز یکبار مصرف پیامکی (OTP)</span>
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 space-y-5">
          
          {/* A. Password Login Mode */}
          {loginMode === 'PASSWORD' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-slate-300 text-xs font-bold">نام کاربری یا شماره همراه:</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="manager / rep_tehran یا 09121111111"
                    value={loginKey}
                    onChange={(e) => setLoginKey(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <User className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode('RECOVERY');
                      setRecoveryPhone('');
                    }}
                    className="text-[10px] text-amber-500 hover:underline cursor-pointer"
                  >
                    بازیابی رمز عبور (فراموشی کلمه عبور)
                  </button>
                  <label className="block text-slate-300 text-xs font-bold">کلمه عبور (پیش‌فرض: 123456):</label>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="******"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-xs text-white text-left font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 mt-2"
              >
                {loading ? 'در حال تایید...' : 'ورود امن به پنل طبرستان'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* B. OTP Logging Flow */}
          {loginMode === 'OTP' && step === 'PHONE_INPUT' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-slate-300 text-xs font-bold">شماره تلفن همراه:</label>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="مثال: 09121111111"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-xs text-white text-left font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Smartphone className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 px-4 rounded-lg text-xs tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
              >
                {loading ? 'در حال ارتباط...' : 'دریافت کد تایید یکبار مصرف (پیامک)'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* C. OTP Logging verification */}
          {loginMode === 'OTP' && step === 'OTP_INPUT' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              
              {receivedOtp && (
                <div className="bg-slate-950 border-r-4 border-amber-500 rounded p-3 text-right text-xs animate-bounce" id="simulated-sms-screen">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1 mb-1.5 font-sans">
                    <span>هم‌اکنون • ۱ دقیقه پیش</span>
                    <span className="font-bold text-amber-500 flex items-center gap-1">📱 پیامک شبیه‌سازی سیستم</span>
                  </div>
                  <p className="text-slate-300 font-sans leading-relaxed">
                    کد فعال‌سازی ورود شما به درگاه طبرستان: <span className="font-mono font-black text-amber-500 text-sm tracking-widest px-1 bg-slate-900 rounded">{receivedOtp}</span> می‌باشد.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('PHONE_INPUT');
                      setOtpCode('');
                    }}
                    className="text-[10px] text-amber-400 hover:underline cursor-pointer font-sans"
                  >
                    اصلاح شماره تلفن
                  </button>
                  <label className="block text-slate-300 text-xs font-bold">کد تایید ۴ رقمی پیامکی:</label>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="کد ۴ رقمی پیامک شده"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow"
              >
                {loading ? 'در حال احراز...' : 'ورود امن به پنل طبرستان'}
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* D. Recovery Code Request */}
          {loginMode === 'RECOVERY' && (
            <form onSubmit={handleRequestRecovery} className="space-y-4">
              <div className="bg-slate-900/50 p-3 rounded-lg text-slate-300 text-[10.5px] leading-relaxed border border-slate-700/50">
                <span className="font-extrabold text-amber-500">راهنمای بازیابی کلمه عبور:</span>
                <p className="mt-1">شماره تلفن همراه حساب خود را وارد سازید. سیستم به صورت شبیه‌سازی یک پیامک حاوی رمزارز OTP ارسال خواهد کرد تا بتوانید رمز عبور را بازنشانی کنید.</p>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 text-xs font-bold">شماره تلفن همراه حساب کاربری:</label>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="مثال: 09121111111"
                    value={recoveryPhone}
                    onChange={(e) => setRecoveryPhone(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Smartphone className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shadow-lg shadow-amber-500/10"
                >
                  {loading ? 'در حال ارسال...' : 'ارسال لینک/کد بازیابی'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('PASSWORD')}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-3 rounded-lg text-xs transition-all cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          )}

          {/* E. Input Code & Set New Password */}
          {loginMode === 'RESET_PASS' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              
              {recoveryOtp && (
                <div className="bg-slate-950 border-r-4 border-amber-500 rounded p-3 text-right text-xs animate-bounce">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1 mb-1.5 font-sans">
                    <span>هم‌اکنون • ۱ دقیقه پیش</span>
                    <span className="font-bold text-amber-500 flex items-center gap-1">📱 پیامک بازیابی کلمه عبور</span>
                  </div>
                  <p className="text-slate-300 font-sans leading-relaxed">
                    کد یکبار مصرف جهت تغییر و بازیابی رمز عبور: <span className="font-mono font-black text-amber-500 text-sm tracking-widest px-1 bg-slate-900 rounded">{recoveryOtp}</span> ثبت گردید.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-slate-300 text-xs font-bold">کد تایید ۴ رقمی بازیابی:</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="کد ۴ رقمی پیامک شده"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 text-xs font-bold">کلمه عبور جدید دلخواه شما:</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="رمز جدید عبور را وارد کنید"
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  {loading ? 'در حال تایید...' : 'تنظیم و ورود با رمز جدید'}
                  <ShieldCheck className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('PASSWORD')}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-3 rounded-lg text-xs transition-all cursor-pointer"
                >
                  بازگشت
                </button>
              </div>
            </form>
          )}

          {/* Sandbox Access Section */}
          <div className="pt-4 border-t border-slate-700/40 space-y-3">
            <span className="text-[10px] font-extrabold text-amber-400 block pb-1 border-b border-slate-700/20">⚒️ میانبر شبیه‌ساز ورود به عنوان تست (Sandbox):</span>
            <div className="grid grid-cols-2 gap-2">
              {defaultAccounts.map((acc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  className="bg-slate-700/50 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-300 hover:text-white p-2 text-right rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-xs">{acc.icon}</span>
                  <div className="leading-tight flex-1 font-sans">
                    <p className="font-bold opacity-90">{acc.name}</p>
                    <p className="font-mono text-[8px] text-slate-400 mt-0.5">
                      {loginMode === 'PASSWORD' ? `نام کاربری: ${acc.username}` : acc.phone}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[8px] text-slate-500 text-center leading-relaxed font-sans">
              در حالت امن، تمامی سطوح دسترسی بر اساس دیتابیس کاربری کنترل خواهند شد.
            </p>
          </div>

        </div>

      </div>

      {/* Floating System Status Alert */}
      <p className="text-[10px] text-slate-600 absolute bottom-4 text-center select-none font-mono">
        Tabarestan CMS • SSL Secured Connection • Version 2026.1
      </p>

    </div>
  );
}
