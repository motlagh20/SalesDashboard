/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OrderStatus = 'PENDING_APPROVAL' | 'APPROVED_BY_SALES' | 'SENT_TO_FACTORY' | 'VEHICLE_ASSIGNED' | 'LOADED_AND_DISPATCHED' | 'REJECTED';

export interface VehicleDetails {
  vehicleType: string; // e.g., تریلی، کامیون جفت، کامیون تک، خاور
  driverName: string;
  driverPhone: string;
  licensePlate: string;
  shippingAgency: string;
  estimatedArrival?: string;
  billOfLadingNumber?: string; // شماره بارنامه صادره از سیستم باربری صادرکننده
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string; // Name of the agent representative
  agentCode: string;
  productId: string;
  productName: string;
  quantity: number; // e.g., in tons or counts
  unit: string;
  destinationCity: string;
  exactAddress: string;
  phoneNumber: string;
  buyerName?: string;
  notes?: string;
  createdAt: string;
  sentToFactoryAt?: string; // زمان ارسال به خط کارخانه
  status: OrderStatus;
  priorityIndex?: number; // Sorting rank designated by the manager
  statusHistory: {
    status: OrderStatus;
    updatedAt: string;
    comment?: string;
  }[];
  vehicleDetails?: VehicleDetails;
  rejectionReason?: string;
  itemsJson?: string;
  paymentTrackingCode?: string;
  shippingCompanyId?: string; // شناسه شرکت حمل و نقل ارجاع شده
}

export interface Product {
  id: string;
  name: string;
  category: string;
  pricePerUnit: number;
  unit: string;
  description: string;
  weight?: string; // Weight in kg or gr (e.g. "۲.۵ کیلوگرم")
  dimensions?: string; // Dimensions (e.g. "۲۵ * ۴۰ سانتی‌متر")
  coverageInfo?: string; // Usage info e.g., "۱۴ عدد در هر مترمربع" or "۱۲ عدد در هر متر طول"
  isEnabled: boolean; // فعال/غیرفعال بودن محصول
  primaryUnit?: string;      // واحد اصلی / واحد تولید (مثال: قالب)
  secondaryUnit?: string;    // واحد فرعی / واحد فروش (مثال: مترمربع)
  conversionRatio?: number;  // هر ۱ واحد فروش معادل چند واحد تولید است (مثال: ۱۴)
}

export interface Agent {
  id: string;
  fullName: string; // نام و نام خانوادگی نماینده مسئول
  alias: string; // نام مستعار نمایندگی
  agentCode: string; // کد نمایندگی
  phoneNumber: string; // شماره تماس
  address: string; // آدرس مکتوب
  area: string; // محدوده فعالیت نمایندگی
  isEnabled: boolean; // فعال / غیرفعال بودن
}

export interface ShippingCompany {
  id: string;
  name: string;
  code: string;
  phoneNumber: string;
  managerName: string;
  isEnabled: boolean;
}

export type UserRole = 'REPRESENTATIVE' | 'SALES_MANAGER' | 'FACTORY_TRANSPORT' | 'SHIPPING_COMPANY';

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  agentCode?: string | null;
  shippingCompanyId?: string | null;
  isEnabled: boolean;
}
