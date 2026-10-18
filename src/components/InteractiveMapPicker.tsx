/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode, checkCityInTerritory, ReverseGeocodeResult } from '../utils/reverseGeocode';
import { TerritoryAssignment } from '../types';
import {
  resolveLocationCoordinates,
  IRAN_PROVINCE_CENTERS,
  IRAN_CITIES_COORDINATES,
  normalizeLocationName
} from '../data/iranCoordinates';
import {
  X,
  MapPin,
  Check,
  Navigation,
  Search,
  Compass,
  Crosshair,
  Layers,
  FileText,
  AlertTriangle,
  LocateFixed,
  Building2
} from 'lucide-react';

interface InteractiveMapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLocation: (
    locationUrl: string,
    lat: number,
    lng: number,
    addressText?: string,
    detectedCity?: string,
    detectedProvince?: string
  ) => void;
  initialLat?: number;
  initialLng?: number;
  cityHint?: string;
  provinceHint?: string;
  destinationSummary?: string;
  agentTerritories?: TerritoryAssignment[];
}

export const InteractiveMapPicker: React.FC<InteractiveMapPickerProps> = ({
  isOpen,
  onClose,
  onConfirmLocation,
  initialLat,
  initialLng,
  cityHint = '',
  provinceHint = '',
  destinationSummary = '',
  agentTerritories = []
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);

  // Compute resolved target coordinates based on selected city & province
  const resolvedTarget = useMemo(() => {
    return resolveLocationCoordinates(cityHint, provinceHint, destinationSummary);
  }, [cityHint, provinceHint, destinationSummary]);

  const targetLat = initialLat !== undefined && initialLat !== 35.6892 ? initialLat : resolvedTarget.lat;
  const targetLng = initialLng !== undefined && initialLng !== 51.3890 ? initialLng : resolvedTarget.lng;
  const targetZoom = resolvedTarget.zoom || 13;

  const [currentLat, setCurrentLat] = useState<number>(targetLat);
  const [currentLng, setCurrentLng] = useState<number>(targetLng);
  const [isLocatingGps, setIsLocatingGps] = useState(false);

  // Address and Location state for reverse geocoding
  const [geocodeResult, setGeocodeResult] = useState<ReverseGeocodeResult | null>(null);
  const [fetchedAddress, setFetchedAddress] = useState<string>('');
  const [isFetchingAddress, setIsFetchingAddress] = useState<boolean>(false);
  const [autoFillAddress, setAutoFillAddress] = useState<boolean>(true);

  // Relevant quick-access cities for this province / selection
  const relevantCities = useMemo(() => {
    const normProv = normalizeLocationName(provinceHint);
    if (normProv) {
      const inProv = IRAN_CITIES_COORDINATES.filter(c => {
        const pNorm = normalizeLocationName(c.province);
        return pNorm === normProv || pNorm.includes(normProv) || normProv.includes(pNorm);
      });
      if (inProv.length > 0) return inProv;
    }
    // Fallback: provincial capitals
    return IRAN_CITIES_COORDINATES.filter(c => c.isProvinceCapital).slice(0, 16);
  }, [provinceHint]);

  // Check territory limit
  const territoryCheck = geocodeResult
    ? checkCityInTerritory(geocodeResult.city || '', geocodeResult.province, agentTerritories)
    : { isAllowed: true };

  // Custom DivIcon for high-visibility pulse red pin
  const createCustomPinIcon = () => {
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; items-center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; background-color: rgba(225, 29, 72, 0.25); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #e11d48, #be123c); border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
            <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });
  };

  // Initialize and update Leaflet map whenever modal opens or city/province changes
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) return;

    setCurrentLat(targetLat);
    setCurrentLng(targetLng);

    // If map does not exist or container changed, create fresh map
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [targetLat, targetLng],
        zoom: targetZoom,
        zoomControl: false
      });

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Add Marker
      const marker = L.marker([targetLat, targetLng], {
        draggable: true,
        icon: createCustomPinIcon()
      }).addTo(map);

      markerInstanceRef.current = marker;

      // Marker drag listener
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setCurrentLat(Number(pos.lat.toFixed(6)));
        setCurrentLng(Number(pos.lng.toFixed(6)));
      });

      // Map click listener
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        setCurrentLat(lat);
        setCurrentLng(lng);
        marker.setLatLng([lat, lng]);
      });

      mapInstanceRef.current = map;
    } else {
      // Reposition and zoom cleanly to the newly selected city/province
      mapInstanceRef.current.setView([targetLat, targetLng], targetZoom);
      if (markerInstanceRef.current) {
        markerInstanceRef.current.setLatLng([targetLat, targetLng]);
      }
    }

    // Force map invalidateSize after render to fix grey tile issue
    const timer1 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);

    const timer2 = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([targetLat, targetLng], targetZoom);
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([targetLat, targetLng]);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
    };
  }, [isOpen, targetLat, targetLng, targetZoom]);

  // Fetch address automatically when coordinates change
  useEffect(() => {
    if (!isOpen) return;
    setIsFetchingAddress(true);
    const timer = setTimeout(async () => {
      const result = await reverseGeocode(currentLat, currentLng);
      setGeocodeResult(result);
      setFetchedAddress(result.addressText);
      setIsFetchingAddress(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentLat, currentLng, isOpen]);

  if (!isOpen) return null;

  const handleCitySelect = (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 14);
    }
    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([lat, lng]);
    }
  };

  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      alert('مرورگر شما از قابلیت GPS پشتیبانی نمی‌کند.');
      return;
    }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCurrentLat(lat);
        setCurrentLng(lng);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16);
        }
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([lat, lng]);
        }
        setIsLocatingGps(false);
      },
      () => {
        alert('خطا در دریافت GPS کنونی دستگاه.');
        setIsLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    const generatedUrl = `https://maps.google.com/?q=${currentLat},${currentLng}`;
    onConfirmLocation(
      generatedUrl,
      currentLat,
      currentLng,
      autoFillAddress ? fetchedAddress : undefined,
      geocodeResult?.city,
      geocodeResult?.province
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col border border-slate-200 dir-rtl text-right overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold">
                  انتخاب دقیق محل تخلیه بار روی نقشه تعاملی
                </h3>
                {resolvedTarget.matchedName && (
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-emerald-300" />
                    <span>محدوده هدف: {resolvedTarget.matchedName}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                نقشه مستقیماً بر روی شهر انتخابی متمرکز شده است؛ با کلیک روی نقشه یا کشیدن نشانگر محل دقیق انبار/پروژه را تعیین کنید.
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

        {/* Quick Toolbar with City Jump Buttons */}
        <div className="bg-slate-100 border-b border-slate-200 p-2.5 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          <button
            onClick={handleGetGpsLocation}
            disabled={isLocatingGps}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
          >
            <Crosshair className="w-4 h-4 text-emerald-200" />
            <span>{isLocatingGps ? 'در حال دریافت GPS...' : '📍 موقعیت GPS من'}</span>
          </button>

          <span className="text-slate-300">|</span>

          <span className="text-[11px] text-slate-600 font-bold shrink-0 flex items-center gap-1">
            <LocateFixed className="w-3.5 h-3.5 text-emerald-600" />
            <span>پرش سریع به شهرهای منطقه:</span>
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {relevantCities.map((c) => {
              const isCurrent = normalizeLocationName(c.name) === normalizeLocationName(cityHint);
              return (
                <button
                  key={`${c.province}-${c.name}`}
                  type="button"
                  onClick={() => handleCitySelect(c.lat, c.lng)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-md shrink-0 transition-colors cursor-pointer border ${
                    isCurrent
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white hover:bg-slate-200 border-slate-300 text-slate-700'
                  }`}
                  title={`پرش به ${c.name} (${c.province})`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map Canvas Container */}
        <div className="relative flex-1 w-full bg-slate-200">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

          {/* Coordinate & City Badge Overlay */}
          <div className="absolute top-3 right-3 z-20 bg-slate-900/90 backdrop-blur-md text-white p-2.5 rounded-xl border border-slate-700/80 shadow-lg text-xs space-y-1.5 dir-ltr text-left">
            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-300 font-sans border-b border-slate-700/80 pb-1">
              <span>{resolvedTarget.matchedName}</span>
              <span className="text-emerald-400 font-bold">🎯 مرکز هدف</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-rose-400 font-bold">LAT:</span>
              <span>{currentLat}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-sky-400 font-bold">LNG:</span>
              <span>{currentLng}</span>
            </div>
          </div>
        </div>

        {/* Reverse Geocoded Address Bar */}
        <div className="bg-sky-50 border-t border-sky-200 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            <FileText className="w-4 h-4 text-sky-700 shrink-0" />
            <span className="font-bold text-sky-950 shrink-0">آدرس متنی نقطه انتخابی:</span>
            <span className="text-slate-800 font-medium truncate">
              {isFetchingAddress ? (
                <span className="text-sky-600 animate-pulse">در حال تبدیل لوکیشن نقشه به آدرس متنی...</span>
              ) : (
                fetchedAddress || 'آدرسی یافت نشد'
              )}
            </span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold shrink-0 bg-white px-2.5 py-1 rounded-lg border border-sky-200 text-[11px] hover:bg-sky-100/50 transition-colors">
            <input
              type="checkbox"
              checked={autoFillAddress}
              onChange={(e) => setAutoFillAddress(e.target.checked)}
              className="w-3.5 h-3.5 text-emerald-600 rounded focus:ring-emerald-500 accent-emerald-600"
            />
            <span>قرار دادن آدرس در قسمت آدرس تخلیه</span>
          </label>
        </div>

        {/* Territory Limit Warning Banner */}
        {!territoryCheck.isAllowed && (
          <div className="bg-rose-50 border-t border-rose-200 px-3.5 py-2 flex items-center gap-2 text-rose-800 text-xs font-bold shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 animate-bounce" />
            <span>⚠️ <strong>هشدار محدوده نمایندگی:</strong> {territoryCheck.message}</span>
          </div>
        )}

        {/* Footer Confirmation Bar */}
        <div className="bg-white border-t border-slate-200 p-3 sm:p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="hidden md:block text-xs text-slate-600">
            <strong>مختصات ثبت‌شده:</strong>{' '}
            <span className="font-mono text-sky-700 text-[11px] dir-ltr inline-block">
              {currentLat}, {currentLng}
            </span>
          </div>

          <div className="flex items-center gap-2 mr-auto w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تأیید و انتخاب این موقعیت روی نقشه</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
