/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Database, 
  Cpu, 
  Smartphone, 
  Bell, 
  Lock, 
  Server, 
  Truck, 
  GitBranch,
  Layers
} from 'lucide-react';

export default function InfrastructureInfo() {
  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-6 md:p-8 text-right dir-rtl font-sans" id="infrastructure-page">
      <div className="border-b border-slate-200 pb-5 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center justify-end gap-3 font-sans">
          <span>زیرساخت فنی مورد نیاز برای تجاری‌سازی سیستم</span>
          <Layers className="w-7 h-7 text-emerald-600" id="infra-icon-main" />
        </h2>
        <p className="text-slate-500 mt-2 text-sm">
          تحلیل الزامات سخت‌افزاری، نرم‌افزاری، پایگاه داده و راهکارهای مناسب جهت اجرای بدون نقص روی سیستم‌عامل‌های اندروید، iOS و دسکتاپ.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="infra-grid">
        {/* Box 1: Front-end */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-front">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">کلاینت و اپلیکیشن موبایل</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            بهترین گزینه برای دسترسی همزمان روی تمامی گوشی‌های <strong className="text-emerald-700">اندروید و آیفون</strong> بدون نیاز به گذر از سدهای تحریمی اپ‌استورها، استفاده از مکانیزم <strong className="text-slate-800">PWA (Progressive Web App)</strong> مبتنی بر React است. کاربران می‌توانند با قابلیت Add to Home Screen، اپلیکیشن را مستقیماً نصب کنند. برای نسخه تماماً بومی نیز فریم‌ورک‌های <strong className="text-slate-800">React Native</strong> یا <strong className="text-slate-800">Flutter</strong> پیشنهاد می‌شود.
          </p>
        </div>

        {/* Box 2: Back-end API */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-back">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">هسته پردازشی سرور (API)</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Server className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            طراحی لایه سرویس کارخانه با استفاده از فریم‌ورک‌های قدرتمند بک‌اند مانند <strong className="text-emerald-700">Node.js (NestJS یا Express)</strong> یا <strong className="text-slate-800">Go (Golang)</strong> برای پردازش سریع تراکنش‌ها و صف‌بندی سفارش‌ها. معماری RESTful API یا GraphQL پاسخگوی ارتباط میان کلاینت، پنل کارخانه و واحد حمل و نقل خواهد بود.
          </p>
        </div>

        {/* Box 3: Database */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-db">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">پایگاه داده (Database)</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            برای ثبت تراکنش‌های خرید، حساب‌های مالی نمایندگان و جزئیات تریلی‌ها، پایگاه داده رابطه‌ای (Relational) به علت تضمین یکپارچگی داده‌ها (ACID) ارجحیت دارد. پایگاه داده <strong className="text-emerald-700">PostgreSQL</strong> یا <strong className="text-slate-800">MySQL</strong> انتخاب فوق‌العاده‌ای است. همچنین می‌توان از سرویس‌های ابری مثل <strong className="text-slate-800">Firebase Firestore</strong> برای سینک آنی وضعیت‌ها استفاده کرد.
          </p>
        </div>

        {/* Box 4: Authentication & Security */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-auth">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">احراز هویت پیامکی و امنیتی</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            احراز هویت نمایندگان با شماره تماس همراه از طریق رمز یکبار مصرف <strong className="text-emerald-700">SMS OTP</strong> (با ادغام پنل‌های پیامکی ایرانی نظیر ملی‌پیامک یا کاوه‌نگار). امنیت APIها نیز از طریق مکانیزم <strong className="text-slate-800">JWT Token</strong> تامین شده و دسترسی‌ها به صورت مبتنی بر نقش (RBAC) کنترل خواهد شد.
          </p>
        </div>

        {/* Box 5: Dispatch & Queues */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-queues">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">مدیریت نوبت و صف بارگیری</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            جهت بهینه‌سازی نوبت‌های اختصاص حمل و نقل براساس ترتیب تایید سفارشات (FIFO)، نیاز به کارهای نوبتی در پس‌زمینه (Job Queue) داریم. استفاده از حافظه <strong className="text-emerald-700">Redis</strong> به همراه بورد پردازشی هماهنگ نظیر BullMQ تضمین می‌کند که وسایل نقلیه دقیقاً طبق صف زمانی سفارشات کارخانه فراخوانی شوند.
          </p>
        </div>

        {/* Box 6: Notifications */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm" id="infra-box-notif">
          <div className="flex items-center justify-end mb-3 gap-3">
            <span className="font-bold text-slate-800 text-lg">اطلاع‌رسانی لحظه‌ای راننده و نماینده</span>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Bell className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            هنگامی که واحد حمل و نقل بار را روی وسیله نقلیه بارگیری کرده و وضعیت را به «بارگیری شده» تغییر می‌دهد، با استفاده از پروتکل‌های <strong className="text-emerald-700">WebSockets</strong> یا ابزار <strong className="text-slate-800">Pusher / Firebase messaging</strong>، به طور آنی تغییر وضعیت و اطلاعات راننده (نام، شماره تماس، پلاک خودرو) در قالب پوش نوتیفیکیشن یا پیامک خودکار به ذینفعان ارسال می‌شود.
          </p>
        </div>
      </div>

      {/* Production Blueprint Diagram */}
      <div className="mt-8 bg-slate-900 text-slate-100 p-6 rounded-xl border border-slate-800 font-mono text-sm overflow-x-auto" id="infra-blueprint">
        <h3 className="text-brand-orange text-emerald-400 font-bold mb-4 font-sans text-base">🔧 نمودار جریان داده در معماری عملیاتی (Dataflow Blueprint):</h3>
        <pre className="text-xs leading-5">
{`   [ گوشی نمایندگی اندورید / آیفون ] <---- (بروزرسانی آنی وضعیت با نوتیفیکیشن / PWA)
                │ (ثبت سفارش)
                ▼
     [ API Gateway / لایه امنیتی ]
                │
                ├───> [ بک‌اند سرور: Node.js / NestJS ] ◄───► [ پایگاه داده: PostgreSQL ]
                │                 │                                  │ (ذخیره‌سازی اطلاعات)
                │                 ▼                                  ▼
                │       [ صف کارها: Redis ] ───> [ سیستم نوبت کارخانه و فاکتور ساز ]
                │
                ▼
     [ پنل وب مدیریت کارخانه و ترابری ] <─── (تایید مالی، ثبت راننده، شماره پلاک و ترخیص بار)`}
        </pre>
      </div>
    </div>
  );
}
