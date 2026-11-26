import React from 'react';

export function Logo({ size = 'md', showTagline = false }) {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`${iconSize} rounded-lg bg-slate-900 flex items-center justify-center shadow-sm border border-slate-800 relative overflow-hidden`}
      >
        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5" width="18" height="16" rx="3" stroke="#94A3B8" strokeWidth="2" />
          <path
            d="M15 13L26 17.5L21 19.5L19 25L15 13Z"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="9" r="1.2" fill="#38BDF8" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className={`${textSize} font-bold tracking-tight text-slate-900`}>
          Revise<span className="text-blue-600">X</span>
        </span>
        {showTagline && (
          <span className="text-[11px] font-medium text-slate-500 mt-0.5">
            Visual Website Review
          </span>
        )}
      </div>
    </div>
  );
}
