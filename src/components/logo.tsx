export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <path fill="white" fillRule="evenodd" d="M8.5 7h7.4C21.2 7 24.5 10.4 24.5 16S21.2 25 15.9 25H8.5V7zm3.3 3.3v11.4h3.8c2.7 0 4.5-1.9 4.5-5.7s-1.8-5.7-4.5-5.7h-3.8z" />
      <circle cx="26.2" cy="6.4" r="2.2" fill="#A3D65C" />
    </svg>
  );
}
