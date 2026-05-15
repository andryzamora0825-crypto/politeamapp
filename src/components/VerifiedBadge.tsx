"use client";

interface VerifiedBadgeProps {
  size?: number;
}

export function VerifiedBadge({ size = 16 }: VerifiedBadgeProps) {
  return (
    <svg
      className="verified-badge"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      title="Cuenta verificada"
    >
      <circle cx="12" cy="12" r="12" fill="#0ea5e9" />
      <path
        d="M9.5 12.5L11 14L15 10"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Outer spikes for premium look */}
      <path
        d="M12 0L13.8 3.6L17.5 2.5L16.5 6.2L20.2 7.2L18 10.2L21.2 12L18 13.8L20.2 16.8L16.5 17.8L17.5 21.5L13.8 20.4L12 24L10.2 20.4L6.5 21.5L7.5 17.8L3.8 16.8L6 13.8L2.8 12L6 10.2L3.8 7.2L7.5 6.2L6.5 2.5L10.2 3.6L12 0Z"
        fill="#0ea5e9"
      />
      <circle cx="12" cy="12" r="8.5" fill="#0ea5e9" />
      <path
        d="M8.5 12.5L10.8 14.8L15.5 9.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
