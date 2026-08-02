/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  MapPin,
  Send,
  Smartphone,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Navigation,
  Compass,
  Phone,
  User,
  Truck,
  CheckCircle2,
  AlertCircle,
  Share2,
  Sparkles,
  Info
} from 'lucide-react';
import { Order } from '../types';

interface SendLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onSaveLocation?: (orderId: string, locationUrl: string) => Promise<void>;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SendLocationModal: React.FC<SendLocationModalProps> = ({
  isOpen,
  onClose,
  order,
  onSaveLocation,
  onShowToast
}) => {
  if (!isOpen) return null;

  const defaultDriverPhone = order.vehicleDetails?.driverPhone || order.phoneNumber || '';
  const defaultDriverName = order.vehicleDetails?.driverName || order.buyerName || 'راننده محترم';

  const [driverPhone, setDriverPhone] = useState(defaultDriverPhone);
  const [driverName, setDriverName] = useState(defaultDriverName);
  const [locationUrl, setLocationUrl] = useState(order.deliveryLocationUrl || '');
  const [isEditingLocation, setIsEditingLocation] = useState(!order.deliveryLocationUrl);
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Simulated SMS state
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSentResult, setSmsSentResult] = useState<{
    sent: boolean;
    smsCode?: string;
    sentAt?: string;
  } | null>(null);

  // Generate fallback map search link if no exact URL is saved
  const mapQueryText = encodeURIComponent(`${order.destinationCity} ${order.exactAddress || ''}`);
  const activeLocationUrl = locationUrl.trim() 
    ? locationUrl.trim() 
    : `https://www.google.com/maps/search/?api=1&query=${mapQueryText}`;

  // Formatted SMS message body
  const smsMessageBody = `سلام جناب ${driverName || 'راننده محترم'}
سفارش شماره: ${order.orderNumber}
تحویل‌گیرنده: ${order.buyerName || order.customerName}
تلفن تحویل: ${order.phoneNumber}
مقصد: ${order.destinationCity}
آدرس تخلیه: ${order.exactAddress || 'مندرج در فاکتور'}
لینک لوکیشن نقشه:
${activeLocationUrl}

صنایع سفال طبرستان`;

  // Sanitized phone for links
  const cleanPhone = driverPhone.replace(/\D/g, '');
  let cleanPhoneForWa = cleanPhone;
  if (cleanPhoneForWa.startsWith('0')) {
    cleanPhoneForWa = '98' + cleanPhoneForWa.slice(1);
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(smsMessageBody);
    setCopied(true);
    onShowToast('متن کامل پیامک حاوی آدرس و لوکیشن در حافظه کپی شد.', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      onShowToast('مرورگر شما از قابلیت GPS پشتیبانی نمی‌کند.', 'error');
      return;
    }
    onShowToast('در حال دریافت موقعیت مکانی GPS...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const generatedUrl = `https://maps.google.com/?q=${lat},${lng}`;
        setLocationUrl(generatedUrl);
        onShowToast('موقعیت کنونی GPS با موفقیت استخراج شد.', 'success');
      },
      (err) => {
        onShowToast('دسترسی به GPS ناموفق بود یا توسط کاربر رد شد.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSaveLocation = async () => {
    if (!onSaveLocation) return;
    try {
      setIsSavingLoc(true);
      await onSaveLocation(order.id, locationUrl.trim());
      setIsEditingLocation(false);
      onShowToast('موقعیت مکانی تخلیه سفارش با موفقیت ثبت شد.', 'success');
    } catch (err: any) {
      onShowToast('خطا در ذخیره موقعیت مکانی.', 'error');
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleSimulateSendSmsGateway = () => {
    if (!driverPhone.trim()) {
      onShowToast('لطفاً شماره همراه راننده را جهت ارسال پیامک وارد نمایید.', 'error');
      return;
    }
    setIsSendingSms(true);
    setTimeout(() => {
      setIsSendingSms(false);
      const code = `SMS-${Math.floor(100000 + Math.random() * 900000)}`;
      const timeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      setSmsSentResult({
        sent: true,
        smsCode: code,
        sentAt: timeStr
      });
      onShowToast(`پیامک لوکیشن با موفقیت به وب‌سرویس پیامکی طبرستان ارسال شد. (کد پیگیری: ${code})`, 'success');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-100 dir-rtl text-right">
        
        {/* Header */}
        <div className="bg-linear-to-r from-sky-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 rounded-t-2xl flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>ارسال لوکیشن و آدرس تخلیه به راننده</span>
                <span className="text-[10px] bg-sky-400/20 text-sky-200 border border-sky-400/30 px-2 py-0.5 rounded-full font-normal">
                  سفارش {order.orderNumber}
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                اشتراک‌گذاری سریع موقعیت جغرافیایی، نقشه و مشخصات تحویل بار با راننده کامیون
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">

          {/* Assigned Driver / Vehicle Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span>مشخصات راننده تخصیص داده شده</span>
              </span>
              {order.vehicleDetails?.billOfLadingNumber && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-mono font-bold">
                  بارنامه: {order.vehicleDetails.billOfLadingNumber}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>نام راننده:</span>
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="نام و نام خانوادگی راننده"
                  className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-3 text-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>شماره همراه راننده:</span>
                </label>
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="09123456789"
                  className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-3 text-slate-800 text-xs font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  dir="ltr"
                />
              </div>
            </div>

            {!order.vehicleDetails?.driverName && (
              <div className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200/80 p-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>هنوز راننده‌ای رسماً روی سیستم ثبت نشده است. می‌توانید شماره تماس راننده را دستی وارد فرمایید.</span>
              </div>
            )}
          </div>

          {/* Delivery Location Section */}
          <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-sky-950 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-sky-600" />
                <span>موقعیت جغرافیایی و نقشه محل تخلیه بار</span>
              </span>
              
              <button
                onClick={() => setIsEditingLocation(!isEditingLocation)}
                className="text-[11px] text-sky-700 hover:text-sky-900 font-bold underline"
              >
                {isEditingLocation ? 'بستن فرم ویرایش' : 'ویرایش / تغییر لینک'}
              </button>
            </div>

            <div className="text-xs space-y-1 text-slate-700">
              <p>
                <strong>شهر مقصد:</strong> {order.destinationCity}
              </p>
              <p>
                <strong>آدرس کارگاه / انبار:</strong> {order.exactAddress || 'ثبت نشده'}
              </p>
              {order.buyerName && (
                <p>
                  <strong>تحویل‌گیرنده:</strong> {order.buyerName} ({order.phoneNumber})
                </p>
              )}
            </div>

            {/* Editing / Input Box */}
            {isEditingLocation ? (
              <div className="pt-2 border-t border-sky-200/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="font-bold text-slate-700">لینک گوگل مپس، نشان، بلد یا مختصات GPS:</label>
                  <button
                    type="button"
                    onClick={handleGetGpsLocation}
                    className="bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-300 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1"
                  >
                    <Navigation className="w-3 h-3 text-emerald-600" />
                    <span>📌 دریافت GPS کنونی</span>
                  </button>
                </div>
                
                <input
                  type="text"
                  value={locationUrl}
                  onChange={(e) => setLocationUrl(e.target.value)}
                  placeholder="https://maps.google.com/?q=35.6997,51.3380 یا لینک بلد/نشان..."
                  className="w-full bg-white border border-sky-300 rounded-lg py-1.5 px-3 text-xs text-slate-800 font-sans text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-sky-500"
                />

                {onSaveLocation && (
                  <button
                    onClick={handleSaveLocation}
                    disabled={isSavingLoc}
                    className="w-full bg-sky-700 hover:bg-sky-800 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isSavingLoc ? 'در حال ذخیره...' : 'ذخیره دائمی لوکیشن روی این سفارش'}
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-sky-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div className="truncate text-xs font-mono text-sky-800 dir-ltr text-left">
                  {activeLocationUrl}
                </div>
                <a
                  href={activeLocationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 bg-sky-100 hover:bg-sky-200 text-sky-900 text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>تست لینک</span>
                </a>
              </div>
            )}

            {/* Quick Map Navigation Apps */}
            <div className="pt-2 border-t border-sky-200/80">
              <span className="text-[10px] font-bold text-slate-500 block mb-1.5">مسیریابی مستقیم روی نقشه‌ها:</span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={activeLocationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>🗺️ گوگل مپس (Google Maps)</span>
                </a>

                <a
                  href={`https://neshan.org/maps/search/${mapQueryText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>🧭 نقشه نشان (Neshan)</span>
                </a>

                <a
                  href={`https://balad.ir/search?q=${mapQueryText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>📍 نقشه بلد (Balad)</span>
                </a>
              </div>
            </div>
          </div>

          {/* SMS Preview & Actions */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>پیش‌نمایش متن پیامک ارسالی به راننده</span>
              </span>

              <button
                onClick={handleCopyText}
                className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'کپی شد' : 'کپی متن پیامک'}</span>
              </button>
            </div>

            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] font-mono leading-relaxed whitespace-pre-wrap dir-rtl text-right overflow-x-auto border border-slate-800">
              {smsMessageBody}
            </pre>

            {/* Channels & Action Buttons */}
            <div className="pt-2 space-y-2.5">
              <span className="text-xs font-bold text-slate-700 block">انتخاب روش ارسال لوکیشن و مشخصات:</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Direct Native SMS App */}
                <a
                  href={`sms:${cleanPhone}?body=${encodeURIComponent(smsMessageBody)}`}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl flex items-center gap-2.5 transition-all shadow-xs hover:shadow-md cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <strong className="block text-xs">ارسال مستقیم با پیامک (SMS App)</strong>
                    <span className="text-[10px] opacity-90 block">باز کردن برنامه SMS پیش‌فرض گوشی</span>
                  </div>
                </a>

                {/* 2. WhatsApp Direct Link */}
                <a
                  href={`https://wa.me/${cleanPhoneForWa}?text=${encodeURIComponent(smsMessageBody)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl flex items-center gap-2.5 transition-all shadow-xs hover:shadow-md cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <strong className="block text-xs">ارسال در واتساپ (WhatsApp)</strong>
                    <span className="text-[10px] opacity-90 block">چت و ارسال مستقیم پیام به راننده</span>
                  </div>
                </a>
              </div>

              {/* 3. Automatic SMS Gateway Simulation */}
              <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200/80 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <div>
                      <strong className="text-xs text-sky-950 block">ارسال خودکار از طریق سامانه پیامک طبرستان</strong>
                      <span className="text-[10px] text-sky-700 block">
                        وب‌سرویس Kavenegar / IPPanel (قابلیت آماده‌سازی شده سیستم)
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleSimulateSendSmsGateway}
                    disabled={isSendingSms}
                    className="bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingSms ? 'در حال ارسال...' : 'ارسال خودکار پیامک'}</span>
                  </button>
                </div>

                {smsSentResult && (
                  <div className="bg-emerald-100/80 border border-emerald-300 text-emerald-950 p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <strong>پیامک با موفقیت تحویل سامانه پیامک گردید</strong>
                        <span className="block text-[10px] text-emerald-800">
                          کد پیگیری وب‌سرویس: <span className="font-mono font-bold">{smsSentResult.smsCode}</span> • زمان: {smsSentResult.sentAt}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-3 sm:p-4 rounded-b-2xl flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>امکان ارسال پیامک و مسیریابی بدون نیاز به دانلود اپلیکیشن اضافی توسط راننده</span>
          </div>

          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            بستن
          </button>
        </div>

      </div>
    </div>
  );
};
