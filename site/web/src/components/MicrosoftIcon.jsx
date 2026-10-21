import React from "react";

export default function MicrosoftIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3h8v8H3z" fill="#F25022" />
      <path d="M13 3h8v8h-8z" fill="#7FBA00" />
      <path d="M3 13h8v8H3z" fill="#00A4EF" />
      <path d="M13 13h8v8h-8z" fill="#FFB900" />
    </svg>
  );
}