/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, Order, Agent, ShippingCompany } from './types';

export const CATEGORIES = [
  { id: 'roofing', name: 'سفال سقف' },
  { id: 'bricks', name: 'آجر و بلوک سفالی' },
  { id: 'facade', name: 'آجر نما و نسوز' },
];

export const PRESET_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'سفال سقف طبرستان (طرح کلاسیک)',
    category: 'roofing',
    pricePerUnit: 145000,
    unit: 'عدد',
    description: 'مقاومت بسیار بالا در برابر تغییرات جوی و یخبندان، عایق حرارتی و رطوبتی فوق‌العاده با لعاب طبیعی.',
    weight: '۳.۱ کیلوگرم',
    dimensions: '۳۰ × ۴۲ سانتی‌متر',
    coverageInfo: '۱۴ عدد در هر مترمربع',
    isEnabled: true,
  },
  {
    id: 'prod-2',
    name: 'آجر سفال ۱۰ سانتی طبرستان (تیغه)',
    category: 'bricks',
    pricePerUnit: 3400,
    unit: 'قالب',
    description: 'جهت دیوارهای داخلی و فضاهای کم‌عرض، پخت با کوره تمام اتوماتیک هافمن و ابعاد کاملاً گونیا.',
    weight: '۲.۲ کیلوگرم',
    dimensions: '۱۰ × ۲۰ × ۲۰ سانتی‌متر',
    coverageInfo: '۲۵ قالب در هر مترمربع تیغه',
    isEnabled: true,
  },
  {
    id: 'prod-3',
    name: 'آجر سفال ۱۵ سانتی درجه یک طبرستان',
    category: 'bricks',
    pricePerUnit: 4800,
    unit: 'قالب',
    description: 'بهترین گزینه برای دیوارهای خارجی باغ، ویلا و آپارتمان جهت عایق‌بندی صوتی و حرارتی پیشرفته.',
    weight: '۳.۳ کیلوگرم',
    dimensions: '۱۵ × ۲۰ × ۲۰ سانتی‌متر',
    coverageInfo: '۲۵ قالب در هر مترمربع دیوار',
    isEnabled: true,
  },
  {
    id: 'prod-4',
    name: 'آجر نما نسوز سموتی طبرستان',
    category: 'facade',
    pricePerUnit: 12500,
    unit: 'قالب',
    description: 'مقاومت حرارتی بیش از ۱۲۰۰ درجه سانتی‌گراد، رنگ ثابت و مقاوم در برابر باران‌های اسیدی و شوره‌زدگی.',
    weight: '۰.۸ کیلوگرم',
    dimensions: '۵.۵ × ۲.۵ × ۲۶ سانتی‌متر',
    coverageInfo: '۴۰ قالب در هر مترمربع با بندکشی',
    isEnabled: true,
  },
  {
    id: 'prod-5',
    name: 'تیغه سفال سقفی ۲۵ طبرستان (بلوک سقفی)',
    category: 'bricks',
    pricePerUnit: 9500,
    unit: 'قالب',
    description: 'تولید شده با رس مرغوب شسته شده، مقاومت فشاری بالا و ایده آل برای سقف‌های تیرچه بلوک صنعتی.',
    weight: '۷.۵ کیلوگرم',
    dimensions: '۲۵ × ۲۰ × ۴۰ سانتی‌متر',
    coverageInfo: '۱۰ قالب در هر مترمربع سقف',
    isEnabled: true,
  }
];

export const PRESET_AGENTS: Agent[] = [
  {
    id: 'ag-1',
    fullName: 'آقای حمیدرضا احمدی',
    alias: 'نمایندگی تهران (احمدی)',
    agentCode: 'AG-9081',
    phoneNumber: '09121111111',
    address: 'تهران، ابتدای جاده قدیم کرج، مجتمع تجاری پایتخت، پلاک ۱۲',
    area: 'استان تهران و حومه البرز',
    isEnabled: true,
  },
  {
    id: 'ag-2',
    fullName: 'آقای علیرضا رجایی',
    alias: 'نمایندگی اصفهان (رجایی)',
    agentCode: 'AG-6055',
    phoneNumber: '09132222222',
    address: 'اصفهان، بلوار فرودگاه، نرسیده به شهرک صنعتی جی، پلاک ۴۶',
    area: 'استان اصفهان و یزد',
    isEnabled: true,
  },
  {
    id: 'ag-3',
    fullName: 'آقای سهراب پوربخش',
    alias: 'نمایندگی رشت (پوربخش)',
    agentCode: 'AG-2019',
    phoneNumber: '09113333333',
    address: 'گیلان، رشت، کیلومتر ۵ جاده انزلی، جنب انبار فومن‌شیمی',
    area: 'استان گیلان و غربی مازندران',
    isEnabled: true,
  },
  {
    id: 'ag-4',
    fullName: 'آقای کریم نمازی',
    alias: 'نمایندگی شیراز (نمازی)',
    agentCode: 'AG-7023',
    phoneNumber: '09174444444',
    address: 'فارس، شیراز، بلوار امیرکبیر، روبروی باغ جنت، مجتمع سفال',
    area: 'استان فارس و استان بوشهر',
    isEnabled: true,
  }
];

export const PRESET_ORDERS: Order[] = [
  {
    id: 'ord-101',
    orderNumber: 'TCL-1402-01',
    customerName: 'نمایندگی تهران (احمدی)',
    agentCode: 'AG-9081',
    productId: 'prod-1',
    productName: 'سفال سقف طبرستان (طرح کلاسیک)',
    quantity: 12000,
    unit: 'عدد',
    destinationCity: 'تهران - شهریار',
    exactAddress: 'سایت پروژه تفریحی دیپلمات، میدان نماز، انتهای بلوار کلهر، پلاک ۶۴',
    phoneNumber: '09121111111',
    notes: 'تحویل اضطراری تا پایان هفته. هماهنگی قبل از ارسال الزامی است.',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    status: 'LOADED_AND_DISPATCHED',
    statusHistory: [
      { status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), comment: 'ثبت سفارش توسط نمایندگی احمدی' },
      { status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(), comment: 'تایید حجم سفارش توسط واحد مالی و فروش تهران' },
      { status: 'VEHICLE_ASSIGNED', updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), comment: 'اختصاص تریلی ۱۸ چرخ البرز به رانندگی قنبری' },
      { status: 'LOADED_AND_DISPATCHED', updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), comment: 'بارگیری انجام شد و کامیون به مقصد حرکت کرد.' }
    ],
    vehicleDetails: {
      vehicleType: 'تریلی ۱۸ چرخ لبه‌دار',
      driverName: 'کریم قنبری',
      driverPhone: '09117772222',
      licensePlate: '۵۴ ع ۸۹۲ ایران ۷۲',
      shippingAgency: 'باربری ترانزیت شمال',
      estimatedArrival: '۲۴ ساعت آینده'
    }
  },
  {
    id: 'ord-102',
    orderNumber: 'TCL-1402-02',
    customerName: 'نمایندگی اصفهان (رجایی)',
    agentCode: 'AG-6055',
    productId: 'prod-3',
    productName: 'آجر سفال ۱۵ سانتی درجه یک طبرستان',
    quantity: 18000,
    unit: 'قالب',
    destinationCity: 'اصفهان - شهرک صنعتی جی',
    exactAddress: 'انبار مرکزی نمایندگی رجایی، خیابان دهم، پلاک ۲',
    phoneNumber: '09132222222',
    notes: 'لطفاً بارگیری از کوره تمام اتوماتیک شماره ۲ باشد.',
    createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), // 1.5 days ago
    status: 'VEHICLE_ASSIGNED',
    statusHistory: [
      { status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), comment: 'سفارش جدید نمایندگی اصفهان' },
      { status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), comment: 'تایید سقف اعتباری و حواله مالی' },
      { status: 'VEHICLE_ASSIGNED', updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), comment: 'معرفی کامیون جفت جهت بارگیری فردا صبح' }
    ],
    vehicleDetails: {
      vehicleType: 'کامیون جفت ۱۰ تن',
      driverName: 'غلامرضا صادقی',
      driverPhone: '09139998888',
      licensePlate: '۷۲ ب ۵۵۱ ایران ۵۳',
      shippingAgency: 'باربری زاینده‌رود',
      estimatedArrival: 'فردا صبح ساعت ۸'
    }
  },
  {
    id: 'ord-103',
    orderNumber: 'TCL-1402-03',
    customerName: 'نمایندگی رشت (پوربخش)',
    agentCode: 'AG-2019',
    productId: 'prod-2',
    productName: 'آجر سفال ۱۰ سانتی طبرستان (تیغه)',
    quantity: 25000,
    unit: 'قالب',
    destinationCity: 'گیلان - رشت',
    exactAddress: 'پروژه تعاونی فرهنگیان، جاده انزلی، نرسیده به پلیس راه',
    phoneNumber: '09113333333',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    status: 'APPROVED_BY_SALES',
    statusHistory: [
      { status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), comment: 'ثبت سیستم شد' },
      { status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), comment: 'مدیریت فروش سفارش را به کارخانه ارجاع داد.' }
    ]
  },
  {
    id: 'ord-104',
    orderNumber: 'TCL-1402-04',
    customerName: 'نمایندگی شیراز (نمازی)',
    agentCode: 'AG-7023',
    productId: 'prod-4',
    productName: 'آجر نما نسوز سموتی طبرستان',
    quantity: 8000,
    unit: 'قالب',
    destinationCity: 'فارس - شیراز',
    exactAddress: 'بلوار معالی آباد، کوچه ۱۲، پلاک آخر سمت چپ',
    phoneNumber: '09174444444',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    status: 'PENDING_APPROVAL',
    statusHistory: [
      { status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), comment: 'در انتظار بررسی بخش مدیریت مالی و فروش' }
    ]
  }
];

export const PRESET_SHIPPING_COMPANIES: ShippingCompany[] = [
  {
    id: 'sc-1',
    name: 'باربری ترانزیت طبرستان',
    code: 'SC-101',
    phoneNumber: '01133334444',
    managerName: 'آقای صالحی',
    isEnabled: true
  },
  {
    id: 'sc-2',
    name: 'باربری زاینده‌رود طبرستان',
    code: 'SC-102',
    phoneNumber: '01133335555',
    managerName: 'آقای صادقی',
    isEnabled: true
  },
  {
    id: 'sc-3',
    name: 'اتوبار کاسپین طبرستان',
    code: 'SC-103',
    phoneNumber: '01133336666',
    managerName: 'آقای احمدی',
    isEnabled: true
  }
];
