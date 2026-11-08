import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Sparkles, Tag, BookOpen, ArrowRight, Mail, Check,
  Code2, ShieldCheck, Network, Zap, FileCode,
} from 'lucide-react';
import Logo from '../components/Logo';
import AuthModal from '../components/AuthModal';
import { CursorFX, ParticleField, TiltCard, MagneticButton, Reveal } from '../components/Fx';
import { useAuth } from '../context/AuthContext';

const GithubIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

/* Headline words blur-in one after another */
const Words = ({ text, start = 0, className = '' }) =>
  text.split(' ').map((w, i) => (
    <Fragment key={i}>
      <span className={`word ${className}`} style={{ animationDelay: `${start + i * 90}ms` }}>{w}</span>{' '}
    </Fragment>
  ));

/* ---------- Interactive graph preview ---------- */
const COLORS = {
  safe: { stroke: '#10b981', fill: '#052e24', text: '#6ee7b7' },
  smell: { stroke: '#f59e0b', fill: '#2d1c04', text: '#fcd34d' },
  vuln: { stroke: '#ef4444', fill: '#2d0a0a', text: '#fca5a5' },
  core: { stroke: '#6366f1', fill: '#16164a', text: '#c7d2fe' },
};
const CENTER = { x: 300, y: 165 };
const GRAPH_NODES = [
  { id: 'auth', label: 'auth.js', sub: 'safe', kind: 'safe', x: 110, y: 50, d: '0s' },
  { id: 'routes', label: 'routes/index.js', sub: 'safe', kind: 'safe', x: 390, y: 45, d: '0.6s' },
  { id: 'ctrl', label: 'controllers/user.js', sub: 'safe', kind: 'safe', x: 85, y: 165, d: '1.1s' },
  { id: 'mail', label: 'services/email.js', sub: 'safe', kind: 'safe', x: 515, y: 120, d: '0.3s' },
  { id: 'model', label: 'models/user.js', sub: 'vulnerability', kind: 'vuln', x: 120, y: 285, d: '0.9s' },
  { id: 'db', label: 'db.js', sub: 'code smell', kind: 'smell', x: 300, y: 295, d: '1.5s' },
  { id: 'utils', label: 'utils/validators.js', sub: 'safe', kind: 'safe', x: 510, y: 245, d: '0.2s' },
];
const INSIGHTS = {
  server: 'server.js: entry point wiring 7 modules together.',
  auth: 'auth.js: token handling looks safe.',
  routes: 'routes/index.js: clean routing, no risky patterns found.',
  ctrl: 'controllers/user.js: input is validated before use.',
  mail: 'services/email.js: no hardcoded secrets detected.',
  model: 'models/user.js: raw query built from user input (injection risk).',
  db: 'db.js: connection logic is duplicated in 3 places.',
  utils: 'utils/validators.js: pure functions, easy to test.',
};

function GraphPreview() {
  const [hover, setHover] = useState(null);
  const lit = (id) => hover === id || hover === 'server';

  return (
    <TiltCard max={6} className="rounded-2xl border border-blue-500/50 bg-[#060b22] shadow-[0_0_50px_rgba(59,89,255,0.25)]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-500/20 text-xs">
        <div className="flex items-center gap-2 text-slate-200 font-medium">
          <Network className="w-4 h-4 text-blue-400" /> Code Architecture Graph
        </div>
        <div className="hidden sm:flex items-center gap-4 text-slate-300">
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-500" /> Safe</span>
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-amber-500" /> Code Smell</span>
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-red-500" /> Vulnerability</span>
        </div>
      </div>

      <div className="grid-bg">
        <svg viewBox="0 0 600 340" className="w-full h-auto" role="img" aria-label="Sample dependency graph">
          <defs>
            <linearGradient id="scanGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#6366f1" stopOpacity="0" />
              <stop offset="1" stopColor="#818cf8" stopOpacity="0.28" />
            </linearGradient>
          </defs>

          <rect className="scan-beam" x="0" y="0" width="70" height="340" fill="url(#scanGrad)" />

          {GRAPH_NODES.map((n, i) => {
            const c = COLORS[n.kind];
            const on = lit(n.id);
            const path = i % 2 ? `M${CENTER.x},${CENTER.y} L${n.x},${n.y}` : `M${n.x},${n.y} L${CENTER.x},${CENTER.y}`;
            return (
              <g key={n.id}>
                <line x1={CENTER.x} y1={CENTER.y} x2={n.x} y2={n.y} stroke={c.stroke}
                  strokeWidth={on ? 2.6 : 1.5} opacity={on ? 1 : 0.5} className="flow-line" />
                <circle r="3" fill={c.stroke}>
                  <animateMotion dur={`${n.kind === 'vuln' ? 1.6 : 2.4 + i * 0.25}s`} repeatCount="indefinite" path={path} />
                </circle>
              </g>
            );
          })}

          {GRAPH_NODES.map((n) => {
            const c = COLORS[n.kind];
            return (
              <g key={n.id} className="node-float" style={{ animationDelay: n.d }}>
                <g className="svg-node" data-cursor style={{ color: c.stroke }}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                  {n.kind === 'vuln' && (
                    <rect className="alert-ring" x={n.x - 72} y={n.y - 21} width="144" height="42" rx="9"
                      fill="none" stroke={c.stroke} strokeWidth="1.5" />
                  )}
                  <rect x={n.x - 72} y={n.y - 21} width="144" height="42" rx="9" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
                  <text x={n.x - 56} y={n.y - 2} fontSize="11" fontWeight="600" fill="#f1f5f9">{n.label}</text>
                  <text x={n.x - 56} y={n.y + 12} fontSize="9.5" fill={c.text}>({n.sub})</text>
                </g>
              </g>
            );
          })}

          <g className="svg-node" data-cursor style={{ color: COLORS.core.stroke }}
            onMouseEnter={() => setHover('server')} onMouseLeave={() => setHover(null)}>
            <circle className="orbit" cx={CENTER.x} cy={CENTER.y} r="48" fill="none" stroke="#6366f1"
              strokeWidth="1" strokeDasharray="4 6" opacity="0.7" />
            <rect x={CENTER.x - 62} y={CENTER.y - 23} width="124" height="46" rx="10"
              fill={COLORS.core.fill} stroke={COLORS.core.stroke} strokeWidth="2" />
            <text x={CENTER.x - 42} y={CENTER.y + 4} fontSize="13" fontWeight="700" fill="#fff">server.js</text>
            <circle cx={CENTER.x + 44} cy={CENTER.y} r="4.5" fill="#10b981" className="pulse-dot" />
          </g>
        </svg>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-blue-500/20 text-xs text-slate-300 min-h-[40px]">
        <span className="pulse-dot w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span key={hover || 'idle'} className="caption-in">
          {hover ? INSIGHTS[hover] : 'Live scan running. Hover a node to inspect it.'}
        </span>
      </div>
    </TiltCard>
  );
}

/* ---------- Features ---------- */
const FEATURES = [
  { icon: Code2, accent: 'indigo', title: 'AST Parsing', desc: 'Deep code analysis with Abstract Syntax Trees.',
    points: ['Language-agnostic support', 'Understand code structure', 'Enable intelligent analysis'] },
  { icon: ShieldCheck, accent: 'emerald', title: 'Multi-Agent Security Scanning', desc: 'Detect vulnerabilities with specialized AI agents.',
    points: ['Find security risks (OWASP, etc.)', 'Identify hardcoded secrets', 'Get actionable fixes'] },
  { icon: Network, accent: 'sky', title: 'Interactive Graphing', desc: 'Visualize your code architecture in real-time.',
    points: ['Dependency graphs', 'Explore relationships', 'Spot code smells & bottlenecks'] },
];
const ACCENTS = {
  indigo: 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300',
  emerald: 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300',
  sky: 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300',
};

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('signin');

  const openAuth = (m) => {
    if (user) return navigate('/app');
    setMode(m);
    setModalOpen(true);
  };

  return (
    <div className="relative min-h-screen bg-[#050816] text-slate-100 font-sans overflow-x-hidden">
      <ParticleField />
      <CursorFX />

      {/* Navbar */}
      <header className="sticky top-0 z-40 px-4 pt-3 bg-[#050816]/70 backdrop-blur">
        <nav className="max-w-7xl mx-auto flex items-center justify-between rounded-xl border border-blue-500/30 bg-[#070c24]/90 px-3 sm:px-5 py-3">
          <Logo size={34} />
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-300">
            <a href="#features" className="nav-link flex items-center gap-2 hover:text-white"><Sparkles className="w-4 h-4 text-indigo-300" /> Features</a>
            <span title="Coming soon" className="nav-link flex items-center gap-2 cursor-default"><Tag className="w-4 h-4" /> Pricing</span>
            <span title="Coming soon" className="nav-link flex items-center gap-2 cursor-default"><BookOpen className="w-4 h-4" /> Docs</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <MagneticButton onClick={() => navigate('/app')} className="h-10 px-3 sm:px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium flex items-center gap-2">
                Open Workspace <ArrowRight className="w-4 h-4" />
              </MagneticButton>
            ) : (
              <>
                <MagneticButton onClick={() => openAuth('signin')} className="h-10 px-3 sm:px-5 rounded-lg border border-blue-500/50 text-sm hover:bg-blue-500/10">Sign In</MagneticButton>
                <MagneticButton onClick={() => openAuth('signup')} className="btn-glow h-10 px-3 sm:px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium flex items-center gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </MagneticButton>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-14 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div className="aurora -z-10 w-[420px] h-[420px] bg-blue-600 -top-10 -left-24" />
        <div className="aurora -z-10 w-[380px] h-[380px] bg-indigo-500 top-40 right-0" style={{ animationDelay: '-6s' }} />

        <div>
          <div className="shine inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3.5 py-1.5 text-sm text-slate-200">
            <Rocket className="w-4 h-4 text-blue-300" /> AI-Powered Code Architecture Analysis &amp; Refactoring
          </div>

          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight">
            <Words text="Understand Your Code." />
            <br />
            <Words text="Build a Better Tomorrow." start={420} className="gradient-text" />
          </h1>

          <Reveal delay={900}>
            <p className="mt-6 max-w-xl text-slate-300 leading-relaxed">
              ArchitectAI analyzes your codebase, detects security vulnerabilities, visualizes architecture
              and suggests intelligent refactoring — all powered by advanced AI agents.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <MagneticButton onClick={() => openAuth('signin')} className="btn-glow h-12 px-6 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium flex items-center gap-3">
                <GithubIcon className="w-5 h-5" /> Continue with GitHub <ArrowRight className="w-4 h-4" />
              </MagneticButton>
              <MagneticButton onClick={() => openAuth('signup')} className="h-12 px-6 rounded-lg border border-blue-500/50 hover:bg-blue-500/10 font-medium flex items-center gap-3">
                <Mail className="w-5 h-5" /> Sign Up with Email
              </MagneticButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {['No credit card required', 'Free tier available', 'Get started in minutes'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="w-4 h-4 text-indigo-300" /> {t}</li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={600}><GraphPreview /></Reveal>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 pb-24 scroll-mt-24">
        <Reveal>
          <div className="flex items-center gap-4 mb-8">
            <Zap className="w-9 h-9 text-indigo-400 pulse-dot" />
            <div>
              <h2 className="text-2xl font-semibold">Powerful Features for Modern Development</h2>
              <p className="text-sm text-slate-400">Everything you need to analyze, secure and improve your codebase with AI.</p>
            </div>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, accent, title, desc, points }, i) => (
            <Reveal key={title} delay={i * 130}>
              <TiltCard className="h-full rounded-xl border border-blue-500/25 bg-[#070c24]/90 p-6">
                <div className="flex items-center gap-4">
                  <span className={`icon-box w-14 h-14 rounded-xl border flex items-center justify-center ${ACCENTS[accent]}`}>
                    <Icon className="w-7 h-7" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="text-sm text-slate-400">{desc}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                  {points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5"><Check className="w-4 h-4 text-indigo-300" /> {p}</li>
                  ))}
                </ul>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-800/80 py-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
        <FileCode className="w-4 h-4" /> © {new Date().getFullYear()} ArchitectAI
      </footer>

      <AuthModal open={modalOpen} mode={mode} setMode={setMode} onClose={() => setModalOpen(false)} />
    </div>
  );
}
