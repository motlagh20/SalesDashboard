import React, { useState } from 'react';
import { 
  MapPin, 
  Plus, 
  Trash2, 
  Check, 
  CheckCheck, 
  RotateCcw, 
  Search, 
  Building2, 
  Globe2, 
  Layers
} from 'lucide-react';
import { IRAN_PROVINCES, getCitiesForProvince, formatTerritoriesSummary } from '../data/iranLocations';
import { TerritoryAssignment } from '../types';

interface TerritorySelectorProps {
  value: TerritoryAssignment[];
  onChange: (territories: TerritoryAssignment[]) => void;
  onSummaryChange?: (summary: string) => void;
  className?: string;
}

export const TerritorySelector: React.FC<TerritorySelectorProps> = ({
  value,
  onChange,
  onSummaryChange,
  className = '',
}) => {
  const [selectedProvinceToAdd, setSelectedProvinceToAdd] = useState<string>('');
  const [provinceSearchQuery, setProvinceSearchQuery] = useState<string>('');
  const [citySearchQueries, setCitySearchQueries] = useState<Record<string, string>>({});

  // Synchronize summary text whenever territories change
  const updateTerritories = (newTerritories: TerritoryAssignment[]) => {
    onChange(newTerritories);
    if (onSummaryChange) {
      onSummaryChange(formatTerritoriesSummary(newTerritories));
    }
  };

  // List of provinces not yet added
  const availableProvinces = IRAN_PROVINCES.filter(
    p => !value.some(t => t.province === p.name)
  );

  // Filter available provinces by search query if typed
  const filteredAvailableProvinces = availableProvinces.filter(p =>
    p.name.includes(provinceSearchQuery.trim())
  );

  // Add a new province with DEFAULT = whole province (allCities: true)
  const handleAddProvince = (provinceName: string) => {
    if (!provinceName) return;
    if (value.some(t => t.province === provinceName)) return;

    const newRule: TerritoryAssignment = {
      province: provinceName,
      allCities: true, // Default as specified: Whole province
      cities: undefined,
    };

    const updated = [...value, newRule];
    updateTerritories(updated);
    setSelectedProvinceToAdd('');
    setProvinceSearchQuery('');
  };

  // Remove a province
  const handleRemoveProvince = (provinceName: string) => {
    const updated = value.filter(t => t.province !== provinceName);
    updateTerritories(updated);
    // Cleanup city search query for that province
    setCitySearchQueries(prev => {
      const next = { ...prev };
      delete next[provinceName];
      return next;
    });
  };

  // Toggle coverage mode for a province (All Cities vs Specific Cities)
  const handleToggleMode = (provinceName: string, allCities: boolean) => {
    const provinceCities = getCitiesForProvince(provinceName);
    const updated = value.map(t => {
      if (t.province === provinceName) {
        return {
          ...t,
          allCities,
          // When switching to specific cities for the first time, populate with all cities so user can exclude
          cities: allCities ? undefined : (t.cities && t.cities.length > 0 ? t.cities : [...provinceCities])
        };
      }
      return t;
    });
    updateTerritories(updated);
  };

  // Toggle a single city within a specific province
  const handleToggleCity = (provinceName: string, cityName: string) => {
    const updated = value.map(t => {
      if (t.province === provinceName) {
        const currentCities = t.cities || [];
        const isSelected = currentCities.includes(cityName);
        const nextCities = isSelected
          ? currentCities.filter(c => c !== cityName)
          : [...currentCities, cityName];
        return {
          ...t,
          allCities: false,
          cities: nextCities,
        };
      }
      return t;
    });
    updateTerritories(updated);
  };

  // Select all cities for a province
  const handleSelectAllCities = (provinceName: string) => {
    const allCitiesList = getCitiesForProvince(provinceName);
    const updated = value.map(t => {
      if (t.province === provinceName) {
        return {
          ...t,
          allCities: false,
          cities: [...allCitiesList],
        };
      }
      return t;
    });
    updateTerritories(updated);
  };

  // Deselect / clear all cities for a province
  const handleClearCities = (provinceName: string) => {
    const updated = value.map(t => {
      if (t.province === provinceName) {
        return {
          ...t,
          allCities: false,
          cities: [],
        };
      }
      return t;
    });
    updateTerritories(updated);
  };

  // Clear all assigned territories
  const handleResetAll = () => {
    updateTerritories([]);
    setCitySearchQueries({});
  };

  return (
    <div className={`space-y-4 font-sans ${className}`} dir="rtl">
      {/* Top Controller Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/10 text-emerald-700 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                تعیین حوزه سرپرستی و استان‌های تحت پوشش
              </h4>
              <p className="text-[10px] text-slate-500 mt-0.5">
                ابتدا استان‌ها را انتخاب نمایید، سپس شهرهای مجاز هر استان در کارت‌های تفکیک‌شده قابل مدیریت هستند.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] px-2.5 py-1 rounded-md font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              {value.length === 0 ? 'سراسر کشور (بدون محدودیت)' : `${value.length} استان تخصیص‌یافته`}
            </span>
            {value.length > 0 && (
              <button
                type="button"
                onClick={handleResetAll}
                className="text-[10px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                title="پاکسازی همه و بازگشت به حالت سراسر کشور"
              >
                پاکسازی کل حوزه
              </button>
            )}
          </div>
        </div>

        {/* Province Selection Input & Dropdown */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-slate-700">
            افزودن استان جدید به حوزه سرپرستی:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <select
                value={selectedProvinceToAdd}
                onChange={(e) => setSelectedProvinceToAdd(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer font-sans"
              >
                <option value="">-- انتخاب استان از لیست ({availableProvinces.length} استان باقی‌مانده) --</option>
                {availableProvinces.map(p => (
                  <option key={p.name} value={p.name}>
                    استان {p.name} ({p.cities.length} شهر)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={!selectedProvinceToAdd}
              onClick={() => handleAddProvince(selectedProvinceToAdd)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 ${
                selectedProvinceToAdd
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>افزودن استان به کارت‌ها</span>
            </button>
          </div>

          {/* Quick-add pills for frequent provinces */}
          {availableProvinces.length > 0 && (
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                <Layers className="w-3 h-3 text-slate-400" />
                دسترسی سریع به استان‌ها:
              </span>
              {availableProvinces.slice(0, 7).map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleAddProvince(p.name)}
                  className="text-[10px] bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>+ {p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty State Indicator */}
      {value.length === 0 && (
        <div className="bg-slate-50/50 border border-dashed border-slate-300 rounded-xl p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Globe2 className="w-5 h-5 text-slate-400" />
          </div>
          <h5 className="text-xs font-bold text-slate-700">حوزه نمایندگی تعریف نشده (سراسر کشور)</h5>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
            در صورت عدم تعیین استان، این نماینده به تمام شهرهای ایران دسترسی خواهد داشت. برای محدود کردن دسترسی، یک یا چند استان از کادر بالا اضافه نمایید.
          </p>
        </div>
      )}

      {/* Cards for each selected province */}
      {value.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-slate-600 px-1">
            <span className="text-[11px] font-bold flex items-center gap-1.5 text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              کارت‌های تفکیک‌شده استان‌های تحت سرپرستی ({value.length} استان):
            </span>
            <span className="text-[10px] text-slate-500">
              پیش‌فرض هر استان: «کل استان» با امکان انتخاب شهرهای خاص
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {value.map((t) => {
              const allProvinceCities = getCitiesForProvince(t.province);
              const selectedCities = t.allCities ? allProvinceCities : (t.cities || []);
              const currentQuery = citySearchQueries[t.province] || '';
              const filteredCities = allProvinceCities.filter(c => c.includes(currentQuery.trim()));

              return (
                <div
                  key={t.province}
                  className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden transition-all hover:border-slate-300"
                >
                  {/* Card Header */}
                  <div className="bg-slate-50/90 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200"></span>
                      <h4 className="text-sm font-bold text-slate-800">
                        استان {t.province}
                      </h4>

                      {/* Coverage status tag */}
                      {t.allCities ? (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <CheckCheck className="w-3 h-3 text-emerald-600" />
                          کل استان (تمامی {allProvinceCities.length} شهر)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <span>شهرهای خاص:</span>
                          <span className="font-mono">{selectedCities.length}</span>
                          <span>از</span>
                          <span className="font-mono">{allProvinceCities.length}</span>
                        </span>
                      )}
                    </div>

                    {/* Remove province button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveProvince(t.province)}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                      title={`حذف استان ${t.province} از حوزه سرپرستی`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3.5">
                    {/* Coverage Mode Radio Buttons */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                        نوع پوشش مجاز برای استان {t.province}:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Radio 1: All Cities */}
                        <label
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            t.allCities
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`coverage-mode-${t.province}`}
                            checked={t.allCities}
                            onChange={() => handleToggleMode(t.province, true)}
                            className="w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer"
                          />
                          <div className="text-xs">
                            <div className="font-bold">کل استان (تمام شهرها)</div>
                            <div className="text-[10px] text-slate-500 font-normal">
                              پوشش خودکار تمام {allProvinceCities.length} شهر این استان
                            </div>
                          </div>
                        </label>

                        {/* Radio 2: Specific Cities */}
                        <label
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            !t.allCities
                              ? 'bg-sky-50/70 border-sky-300 text-sky-950 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`coverage-mode-${t.province}`}
                            checked={!t.allCities}
                            onChange={() => handleToggleMode(t.province, false)}
                            className="w-4 h-4 text-sky-600 accent-sky-600 cursor-pointer"
                          />
                          <div className="text-xs">
                            <div className="font-bold">شهرهای خاص (انتخاب موردی)</div>
                            <div className="text-[10px] text-slate-500 font-normal">
                              تعیین شهرهای مجاز به صورت تک‌به‌تک
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Specific Cities Picker Section */}
                    {!t.allCities && (
                      <div className="bg-slate-50/60 border border-slate-200 rounded-lg p-3 space-y-2.5">
                        {/* Subheader and actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-700">
                              فهرست شهرهای استان {t.province}:
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({selectedCities.length} شهر انتخاب شده)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Search within cities */}
                            <div className="relative">
                              <Search className="w-3 h-3 text-slate-400 absolute right-2 top-2" />
                              <input
                                type="text"
                                placeholder="جستجوی شهر..."
                                value={currentQuery}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCitySearchQueries(prev => ({ ...prev, [t.province]: val }));
                                }}
                                className="w-32 bg-white border border-slate-200 rounded-md pr-6 pl-2 py-1 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectAllCities(t.province)}
                              className="text-[10px] text-emerald-700 hover:bg-emerald-50 border border-emerald-200 px-2 py-1 rounded transition-colors cursor-pointer font-bold"
                            >
                              انتخاب همه
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearCities(t.province)}
                              className="text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded transition-colors cursor-pointer font-bold"
                            >
                              پاکسازی
                            </button>
                          </div>
                        </div>

                        {/* City Chips */}
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-white rounded border border-slate-100">
                          {filteredCities.map((cityName) => {
                            const isSelected = selectedCities.includes(cityName);
                            return (
                              <button
                                type="button"
                                key={cityName}
                                onClick={() => handleToggleCity(t.province, cityName)}
                                className={`text-[11px] px-2.5 py-1 rounded-md border transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                <span>{cityName}</span>
                              </button>
                            );
                          })}

                          {filteredCities.length === 0 && (
                            <div className="w-full text-center py-3 text-[10px] text-slate-400">
                              شهری با عبارت جستجو یافت نشد.
                            </div>
                          )}
                        </div>

                        {/* Warning if no cities selected */}
                        {selectedCities.length === 0 && (
                          <div className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 p-2 rounded-md font-medium">
                            ⚠️ در حال حاضر هیچ شهری برای استان {t.province} انتخاب نشده است. حداقل یک شهر را انتخاب کنید یا وضعیت را به «کل استان» تغییر دهید.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Footer */}
      {value.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>خلاصه حوزه سرپرستی:</span>
            <span className="font-normal text-emerald-900 mr-1 leading-relaxed">
              {formatTerritoriesSummary(value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
