import * as XLSX from 'xlsx';

export interface ParsedDriverRow {
  driverName: string;
  driverPhone: string;
  licensePlate: string;
  vehicleType: string;
  shippingAgency?: string;
  nationalCode?: string;
  smartCardNumber?: string;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV file containing driver records.
 * Flexibly matches header names in Persian and English.
 */
export async function parseDriversExcelFile(file: File): Promise<ParsedDriverRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to array of objects
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        const results: ParsedDriverRow[] = [];

        for (const row of rawJson) {
          // Find field values with flexible key lookup
          const driverName = String(
            findValue(row, ['نام و نام خانوادگی', 'نام راننده', 'نام', 'driverName', 'driver_name', 'name'])
          ).trim();

          const driverPhone = String(
            findValue(row, ['شماره تماس', 'تلفن', 'موبایل', 'شماره همراه', 'driverPhone', 'driver_phone', 'phone', 'mobile'])
          ).trim();

          const licensePlate = String(
            findValue(row, ['شماره پلاک', 'پلاک', 'پلاک خودرو', 'licensePlate', 'license_plate', 'plate'])
          ).trim();

          const vehicleType = String(
            findValue(row, ['نوع خودرو', 'نوع وسیله', 'نوع وسیله نقلیه', 'خودرو', 'vehicleType', 'vehicle_type', 'vehicle'])
          ).trim() || 'تریلی ۱۸ چرخ لبه‌دار';

          const shippingAgency = String(
            findValue(row, ['شرکت حمل و نقل', 'باربری', 'نام باربری', 'آژانس حمل', 'shippingAgency', 'shipping_agency', 'agency'])
          ).trim();

          const nationalCode = String(
            findValue(row, ['کد ملی', 'کدملی', 'شناسه ملی', 'nationalCode', 'national_code'])
          ).trim();

          const smartCardNumber = String(
            findValue(row, ['کارت هوشمند', 'شماره کارت هوشمند', 'کارت هوشمند راننده', 'smartCardNumber', 'smart_card'])
          ).trim();

          // Validation check
          let isValid = true;
          let errorMessage = '';

          if (!driverName) {
            isValid = false;
            errorMessage = 'نام راننده مشخص نشده است.';
          } else if (!driverPhone) {
            isValid = false;
            errorMessage = 'شماره تماس راننده ثبت نشده است.';
          } else if (!licensePlate) {
            isValid = false;
            errorMessage = 'شماره پلاک ثبت نشده است.';
          }

          results.push({
            driverName,
            driverPhone,
            licensePlate,
            vehicleType,
            shippingAgency: shippingAgency || undefined,
            nationalCode: nationalCode || undefined,
            smartCardNumber: smartCardNumber || undefined,
            isValid,
            errorMessage
          });
        }

        resolve(results);
      } catch (err: any) {
        reject(new Error('خطا در خواندن فایل اکسل. لطفاً از فرمت معتبر xlsx یا csv استفاده نمایید.'));
      }
    };

    reader.onerror = () => reject(new Error('خطا در بارگذاری فایل.'));
    reader.readAsArrayBuffer(file);
  });
}

function findValue(obj: Record<string, any>, candidateKeys: string[]): any {
  for (const key of Object.keys(obj)) {
    const cleanKey = key.trim().toLowerCase();
    for (const cand of candidateKeys) {
      if (cleanKey === cand.toLowerCase() || cleanKey.includes(cand.toLowerCase())) {
        return obj[key];
      }
    }
  }
  return '';
}

/**
 * Generates and triggers download of a standardized Excel template for driver bulk import.
 */
export function downloadDriversSampleExcel() {
  const sampleData = [
    {
      'نام و نام خانوادگی': 'کریم قنبری',
      'شماره تماس': '09117772222',
      'شماره پلاک': '۵۴ ع ۸۹۲ ایران ۷۲',
      'نوع خودرو': 'تریلی ۱۸ چرخ لبه‌دار',
      'شرکت حمل و نقل': 'باربری ترانزیت شمال',
      'کد ملی': '2081234567',
      'کارت هوشمند': '3849201'
    },
    {
      'نام و نام خانوادگی': 'غلامرضا صادقی',
      'شماره تماس': '09139998888',
      'شماره پلاک': '۷۲ ب ۵۵۱ ایران ۵۳',
      'نوع خودرو': 'کامیون جفت ۱۰ تن',
      'شرکت حمل و نقل': 'باربری زاینده‌رود',
      'کد ملی': '1289876543',
      'کارت هوشمند': '4920183'
    },
    {
      'نام و نام خانوادگی': 'مرتضی حسینی',
      'شماره تماس': '09112223344',
      'شماره پلاک': '۳۶ ج ۱۴۵ ایران ۶۲',
      'نوع خودرو': 'خاور مسقف',
      'شرکت حمل و نقل': 'باربری کاسپین',
      'کد ملی': '2093344556',
      'کارت هوشمند': '1092837'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 22 }, // نام و نام خانوادگی
    { wch: 15 }, // شماره تماس
    { wch: 20 }, // شماره پلاک
    { wch: 22 }, // نوع خودرو
    { wch: 25 }, // شرکت حمل و نقل
    { wch: 15 }, // کد ملی
    { wch: 15 }  // کارت هوشمند
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'لیست رانندگان');

  XLSX.writeFile(workbook, 'نمونه_الگوی_ثبت_رانندگان_طبرستان.xlsx');
}
