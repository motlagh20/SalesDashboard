import React, { useState, useRef } from 'react';
import { PermanentDriver, ShippingCompany } from '../types';
import { 
  Truck, 
  Plus, 
  Search, 
  FileSpreadsheet, 
  Download, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  X, 
  Upload, 
  AlertCircle,
  Phone,
  CreditCard,
  Building2,
  Check,
  UserCheck
} from 'lucide-react';
import { parseDriversExcelFile, downloadDriversSampleExcel, ParsedDriverRow } from '../utils/excelHelper';

interface PermanentDriversManagerProps {
  permanentDrivers: PermanentDriver[];
  shippingCompanies?: ShippingCompany[];
  onAddDriver: (driver: Partial<PermanentDriver>) => Promise<boolean>;
  onBulkImport: (drivers: Partial<PermanentDriver>[]) => Promise<boolean>;
  onUpdateDriver: (driver: PermanentDriver) => Promise<boolean>;
  onToggleDriver: (driverId: string) => void;
  onDeleteDriver: (driverId: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function PermanentDriversManager({
  permanentDrivers = [],
  shippingCompanies = [],
  onAddDriver,
  onBulkImport,
  onUpdateDriver,
  onToggleDriver,
  onDeleteDriver,
  showToast,
  askConfirm,
}: PermanentDriversManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add / Edit Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<PermanentDriver | null>(null);
  
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('تریلی ۱۸ چرخ لبه‌دار');
  const [shippingAgency, setShippingAgency] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [smartCardNumber, setSmartCardNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Excel Upload Preview State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedDriverRow[] | null>(null);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');

  const openAddModal = () => {
    setEditingDriver(null);
    setDriverName('');
    setDriverPhone('');
    setLicensePlate('');
    setVehicleType('تریلی ۱۸ چرخ لبه‌دار');
    setShippingAgency('');
    setNationalCode('');
    setSmartCardNumber('');
    setIsFormOpen(true);
  };

  const openEditModal = (driver: PermanentDriver) => {
    setEditingDriver(driver);
    setDriverName(driver.driverName || '');
    setDriverPhone(driver.driverPhone || '');
    setLicensePlate(driver.licensePlate || '');
    setVehicleType(driver.vehicleType || 'تریلی ۱۸ چرخ لبه‌دار');
    setShippingAgency(driver.shippingAgency || '');
    setNationalCode(driver.nationalCode || '');
    setSmartCardNumber(driver.smartCardNumber || '');
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName.trim() || !driverPhone.trim() || !licensePlate.trim()) {
      showToast('لطفاً تمامی فیلدهای اجباری (نام، تلفن، پلاک) را تکمیل نمایید.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingDriver) {
        const updated: PermanentDriver = {
          ...editingDriver,
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          licensePlate: licensePlate.trim(),
          vehicleType: vehicleType.trim(),
          shippingAgency: shippingAgency.trim() || undefined,
          nationalCode: nationalCode.trim() || undefined,
          smartCardNumber: smartCardNumber.trim() || undefined,
        };
        const ok = await onUpdateDriver(updated);
        if (ok) setIsFormOpen(false);
      } else {
        const newDrv: Partial<PermanentDriver> = {
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          licensePlate: licensePlate.trim(),
          vehicleType: vehicleType.trim(),
          shippingAgency: shippingAgency.trim() || undefined,
          nationalCode: nationalCode.trim() || undefined,
          smartCardNumber: smartCardNumber.trim() || undefined,
        };
        const ok = await onAddDriver(newDrv);
        if (ok) setIsFormOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excel File Parsing Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportedFileName(file.name);
    try {
      const rows = await parseDriversExcelFile(file);
      if (rows.length === 0) {
        showToast('هیچ سطر اطلاعاتی در فایل اکسل یافت نشد.', 'error');
        return;
      }
      setParsedRows(rows);
      showToast(`فایل اکسل با موفقیت تحلیل شد. ${rows.length} راننده استخراج گردید.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'خطا در بارگذاری فایل اکسل', 'error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const confirmExcelImport = async () => {
    if (!parsedRows) return;
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      showToast('هیچ راننده معتبری جهت ثبت یافت نشد.', 'error');
      return;
    }

    setIsExcelImporting(true);
    try {
      const driversToImport: Partial<PermanentDriver>[] = validRows.map(r => ({
        driverName: r.driverName,
        driverPhone: r.driverPhone,
        licensePlate: r.licensePlate,
        vehicleType: r.vehicleType,
        shippingAgency: r.shippingAgency,
        nationalCode: r.nationalCode,
        smartCardNumber: r.smartCardNumber,
      }));

      const ok = await onBulkImport(driversToImport);
      if (ok) {
        setParsedRows(null);
        setImportedFileName('');
      }
    } finally {
      setIsExcelImporting(false);
    }
  };

  // Filter drivers list
  const filteredDrivers = permanentDrivers.filter(d => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (d.driverName && d.driverName.toLowerCase().includes(q)) ||
      (d.driverPhone && d.driverPhone.includes(q)) ||
      (d.licensePlate && d.licensePlate.toLowerCase().includes(q)) ||
      (d.vehicleType && d.vehicleType.toLowerCase().includes(q)) ||
      (d.shippingAgency && d.shippingAgency.toLowerCase().includes(q)) ||
      (d.nationalCode && d.nationalCode.includes(q)) ||
      (d.smartCardNumber && d.smartCardNumber.includes(q))
    );
  });

  return (
    <div className="space-y-5 text-right font-sans dir-rtl">
      {/* Top Action Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 p-5 rounded-2xl text-white shadow-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm sm:text-base font-black flex items-center justify-start gap-2 text-amber-400">
            <Truck className="w-5 h-5 text-amber-400 shrink-0" />
            <span>مدیریت و ثبت دائم رانندگان شرکت‌های حمل و نقل</span>
          </h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            جهت کاهش حجم کاری و ثبت سریع مشخصات در باربری، رانندگان دائمی را دستی تعریف کرده یا فایل اکسل آن‌ها را ایمپورت نمایید.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
          {/* Download Sample Excel Button */}
          <button
            type="button"
            onClick={downloadDriversSampleExcel}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700/80 flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="دانلود الگو فایل اکسل نمونه"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>دانلود الگوی اکسل</span>
          </button>

          {/* Excel Import Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
            id="excel-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ایمپورت از فایل اکسل</span>
          </button>

          {/* Manual Add Driver Button */}
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-950/40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن راننده جدید</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Count Badge */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام، تلفن، پلاک، خودرو..."
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
          <span>کل رانندگان ثبت‌شده:</span>
          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-mono text-xs font-black border border-indigo-150">
            {permanentDrivers.length} نفر
          </span>
        </div>
      </div>

      {/* Drivers List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredDrivers.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3">
            <Truck className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">هیچ راننده‌ای یافت نشد</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery ? 'با عبارت جستجو شده راننده‌ای پیدا نشد.' : 'هنوز راننده‌ای ثبت نشده است. می‌توانید به صورت دستی یا از طریق فایل اکسل رانندگان را اضافه کنید.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                  <th className="py-3 px-3 text-center w-12">#</th>
                  <th className="py-3 px-3">نام و نام خانوادگی راننده</th>
                  <th className="py-3 px-3">شماره تماس</th>
                  <th className="py-3 px-3">شماره پلاک</th>
                  <th className="py-3 px-3">نوع وسیله نقلیه</th>
                  <th className="py-3 px-3">باربری همکار</th>
                  <th className="py-3 px-3">کد ملی / هوشمند</th>
                  <th className="py-3 px-3 text-center">وضعیت</th>
                  <th className="py-3 px-3 text-center w-28">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDrivers.map((driver, idx) => (
                  <tr key={driver.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-extrabold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{driver.driverName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-mono dir-ltr text-right">
                      <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-slate-800 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{driver.driverPhone}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded text-[11px]">
                        {driver.licensePlate}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {driver.vehicleType}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {driver.shippingAgency ? (
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{driver.shippingAgency}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {driver.nationalCode || driver.smartCardNumber ? (
                        <div className="space-y-0.5">
                          {driver.nationalCode && <div>کد ملی: {driver.nationalCode}</div>}
                          {driver.smartCardNumber && <div className="text-indigo-600">هوشمند: {driver.smartCardNumber}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleDriver(driver.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                          driver.isEnabled !== false
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        {driver.isEnabled !== false ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>فعال</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>غیرفعال</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(driver)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="ویرایش مشخصات"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            askConfirm(
                              'حذف راننده دائمی',
                              `آیا از حذف اطلاعات راننده «${driver.driverName}» اطمینان دارید؟`,
                              () => onDeleteDriver(driver.id)
                            );
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="حذف راننده"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Driver Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 text-right font-sans dir-rtl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <span>{editingDriver ? 'ویرایش مشخصات راننده' : 'ثبت راننده دائمی جدید'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نام و نام خانوادگی راننده <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="مانند: جواد علوی"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    شماره همراه راننده <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="09112523456"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    شماره پلاک خودرو <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    placeholder="۶۲ ع ۴۸۱ ایران ۷۲"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع وسیله نقلیه <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="تریلی ۱۸ چرخ لبه‌دار">تریلی ۱۸ چرخ لبه‌دار</option>
                    <option value="کامیون جفت ۱۰ تن">کامیون جفت ۱۰ تن</option>
                    <option value="کامیون تک ۶ تن">کامیون تک ۶ تن</option>
                    <option value="خاور مسقف">خاور مسقف</option>
                    <option value="کامیونت ۹ تن">کامیونت ۹ تن</option>
                    <option value="تریلی کفی">تریلی کفی</option>
                    <option value="تریلی چادری">تریلی چادری</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    باربری همکار
                  </label>
                  <input
                    type="text"
                    value={shippingAgency}
                    onChange={(e) => setShippingAgency(e.target.value)}
                    placeholder="نام شرکت باربری..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    کد ملی راننده
                  </label>
                  <input
                    type="text"
                    value={nationalCode}
                    onChange={(e) => setNationalCode(e.target.value)}
                    placeholder="2081234567"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    کارت هوشمند
                  </label>
                  <input
                    type="text"
                    value={smartCardNumber}
                    onChange={(e) => setSmartCardNumber(e.target.value)}
                    placeholder="3849201"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingDriver ? 'ذخیره تغییرات' : 'ثبت راننده'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Upload Preview Modal */}
      {parsedRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 text-right font-sans dir-rtl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>پیش‌نمایش داده‌های استخراج‌شده از اکسل ({importedFileName})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تعداد کل سطرها: {parsedRows.length} | معتبر جهت ثبت: {parsedRows.filter(r => r.isValid).length} | غیرمعتبر: {parsedRows.filter(r => !r.isValid).length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setParsedRows(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 font-extrabold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 text-center">#</th>
                    <th className="py-2.5 px-3">نام و نام خانوادگی</th>
                    <th className="py-2.5 px-3">شماره تماس</th>
                    <th className="py-2.5 px-3">پلاک</th>
                    <th className="py-2.5 px-3">نوع خودرو</th>
                    <th className="py-2.5 px-3">باربری</th>
                    <th className="py-2.5 px-3 text-center">وضعیت صحت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/60 hover:bg-rose-100/60'}
                    >
                      <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{row.driverName || '—'}</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{row.driverPhone || '—'}</td>
                      <td className="py-2 px-3 font-bold text-amber-800">{row.licensePlate || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{row.vehicleType}</td>
                      <td className="py-2 px-3 text-slate-600">{row.shippingAgency || '—'}</td>
                      <td className="py-2 px-3 text-center">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>تایید</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold" title={row.errorMessage}>
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>{row.errorMessage}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setParsedRows(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmExcelImport}
                disabled={isExcelImporting || parsedRows.filter(r => r.isValid).length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/30 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>تایید و ثبت {parsedRows.filter(r => r.isValid).length} راننده معتبر</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
