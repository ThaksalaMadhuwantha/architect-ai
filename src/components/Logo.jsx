export default function Logo({ size = 36, text = true }) {
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="logoGrad" x1="6" y1="44" x2="42" y2="4">
            <stop stopColor="#6366f1" />
            <stop offset="0.55" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <path
          d="M24 5 L6 43 H14 L24 21 L34 43 H42 Z M20 34 H28 L24 26 Z"
          fill="url(#logoGrad)"
          fillRule="evenodd"
        />
      </svg>
      {text && (
        <span className="text-2xl font-semibold text-white tracking-tight">
          Architect<span className="text-blue-400">AI</span>
        </span>
      )}
    </div>
  );
}
