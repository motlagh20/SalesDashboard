import React, { useState } from 'react';

interface TabarestanLogoProps {
  className?: string;
  size?: number | string;
}

export default function TabarestanLogo({ className = "w-10 h-10 object-cover rounded-xl shadow-sm border border-slate-700/30", size }: TabarestanLogoProps) {
  const [hasError, setHasError] = useState(false);
  const style = size ? { width: size, height: size } : undefined;

  if (hasError) {
    return (
      <div 
        className={`${className} flex items-center justify-center bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700 text-white font-black rounded-xl text-center select-none text-[11px] sm:text-xs shrink-0 whitespace-nowrap shadow-md px-2 border border-amber-400/40`}
        style={style || { width: 40, height: 40 }}
      >
        سفال طبرستان
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="لوگوی شرکت صنایع سفال طبرستان"
      className={`${className} transition-transform hover:scale-105`}
      style={style}
      referrerPolicy="no-referrer"
      onError={() => {
        setHasError(true);
      }}
    />
  );
}


