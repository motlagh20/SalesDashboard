import React, { useState } from 'react';

interface TabarestanLogoProps {
  className?: string;
  size?: number | string;
}

export default function TabarestanLogo({ className = "w-10 h-10 object-contain", size }: TabarestanLogoProps) {
  const [hasError, setHasError] = useState(false);
  const style = size ? { width: size, height: size } : undefined;

  if (hasError) {
    // Elegant typographic fallback if the file logo.png is not yet uploaded or found in the public folder
    return (
      <div 
        className={`${className} flex items-center justify-center bg-teal-500 text-white font-extrabold rounded-lg text-center select-none text-[10px] sm:text-xs shrink-0 whitespace-nowrap px-1.5`}
        style={style || { width: 36, height: 36 }}
      >
        طبرستان
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="سفال طبرستان"
      className={className}
      style={style}
      referrerPolicy="no-referrer"
      onError={() => {
        // If logo.png is not found, try to look for logo.svg or fall back to text label gracefully
        setHasError(true);
      }}
    />
  );
}

