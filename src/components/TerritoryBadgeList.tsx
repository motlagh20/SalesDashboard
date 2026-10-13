import React, { useState } from 'react';
import { MapPin, CheckCheck, Building2, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { TerritoryAssignment } from '../types';

interface TerritoryBadgeListProps {
  territories?: TerritoryAssignment[];
  fallbackArea?: string;
  maxVisibleCities?: number;
  className?: string;
  compact?: boolean;
}

export const TerritoryBadgeList: React.FC<TerritoryBadgeListProps> = ({
  territories,
  fallbackArea,
  maxVisibleCities = 3,
  className = '',
  compact = false,
}) => {
  const [expandedProvinces, setExpandedProvinces] = useState<Record<string, boolean>>({});

  const toggleExpand = (provName: string) => {
    setExpandedProvinces(prev => ({
      ...prev,
      [provName]: !prev[provName],
    }));
  };

  // Case 1: No structured territories defined
  if (!territories || territories.length === 0) {
    const displayText = fallbackArea && fallbackArea.trim() ? fallbackArea : 'سراسر کشور';
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`} dir="rtl">
        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200/80 text-[10px] px-2 py-0.5 rounded-md font-sans">
          <Globe className="w-3 h-3 text-slate-500" />
          <span>{displayText}</span>
        </span>
      </div>
    );
  }

  // Case 2: One or more provinces assigned
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} dir="rtl">
      {territories.map((t) => {
        const isAll = !!t.allCities;
        const cityList = t.cities || [];
        const isExpanded = !!expandedProvinces[t.province];

        if (isAll) {
          // Whole province badge
          return (
            <span
              key={t.province}
              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-md font-sans transition-all hover:bg-emerald-100"
              title={`پوشش تمام شهرهای استان ${t.province}`}
            >
              <CheckCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <strong className="font-bold">{t.province}</strong>
              <span className="text-emerald-700 font-medium">(کل استان)</span>
            </span>
          );
        }

        // Specific cities badge
        const hasCities = cityList.length > 0;
        if (!hasCities) {
          return (
            <span
              key={t.province}
              className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 text-[10px] px-2 py-0.5 rounded-md font-sans"
            >
              <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
              <strong className="font-bold">{t.province}</strong>
              <span className="text-amber-700">(بدون شهر منتسب)</span>
            </span>
          );
        }

        const showAll = isExpanded || cityList.length <= maxVisibleCities;
        const visibleCities = showAll ? cityList : cityList.slice(0, maxVisibleCities);
        const remainingCount = cityList.length - maxVisibleCities;

        return (
          <span
            key={t.province}
            className="inline-flex items-center flex-wrap gap-1 bg-sky-50 text-sky-950 border border-sky-200 text-[10px] px-2 py-0.5 rounded-md font-sans transition-all"
          >
            <Building2 className="w-3 h-3 text-sky-600 shrink-0" />
            <strong className="font-bold text-sky-900">{t.province}:</strong>
            <span className="text-sky-800">
              {visibleCities.join('، ')}
            </span>

            {!showAll && remainingCount > 0 && (
              <button
                type="button"
                onClick={() => toggleExpand(t.province)}
                className="inline-flex items-center gap-0.5 bg-sky-200/80 hover:bg-sky-300 text-sky-900 px-1 py-0.2 rounded text-[9px] font-bold transition-colors cursor-pointer mr-0.5"
                title="نمایش بقیه شهرهای این استان"
              >
                <span>+{remainingCount} شهر</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            )}

            {isExpanded && cityList.length > maxVisibleCities && (
              <button
                type="button"
                onClick={() => toggleExpand(t.province)}
                className="inline-flex items-center gap-0.5 bg-sky-200/80 hover:bg-sky-300 text-sky-900 px-1 py-0.2 rounded text-[9px] font-bold transition-colors cursor-pointer mr-0.5"
                title="بستن لیست کامل"
              >
                <span>بستن</span>
                <ChevronUp className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
};
