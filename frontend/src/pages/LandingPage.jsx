import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Sparkles, Tag, ArrowRight, Mail, Check, Code2, ShieldCheck,
  Network, Zap, FileCode, GitPullRequest, Bot, FolderArchive, HelpCircle,
  Send, MapPin, Clock, CheckCircle2, Menu, X, ChevronDown, Layers,
} from 'lucide-react';
import Logo from '../components/Logo';
import AuthModal from '../components/AuthModal';
import { ParticleField, TiltCard, MagneticButton, Reveal } from '../components/Fx';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

const GithubIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const Words = ({ text, start = 0, className = '' }) =>
  text.split(' ').map((w, i) => (
    <Fragment key={i}>
      <span className={`word ${className}`} style={{ animationDelay: `${start + i * 90}ms` }}>{w}</span>{' '}
    </Fragment>
  ));

/* ---------- Interactive Graph Preview ---------- */
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
    <TiltCard max={5} className="rounded-2xl border border-blue-500/40 bg-[#060b22] shadow-[0_0_50px_rgba(59,89,255,0.22)]">
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
                <g className="svg-node" style={{ color: c.stroke }}
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

          <g className="svg-node" style={{ color: COLORS.core.stroke }}
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

/* ---------- Data ---------- */
const NAV_ITEMS = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

const FEATURES = [
  {
    icon: Code2,
    title: 'AST Codebase Parsing',
    desc: 'Deep structural analysis using Abstract Syntax Trees.',
    points: ['Multi-language file & import mapping', 'Automatic core hub detection', 'Clean architecture layer breakdown'],
  },
  {
    icon: ShieldCheck,
    title: 'Security & OSV Scanning',
    desc: 'Detect code vulnerabilities & risky dependencies instantly.',
    points: ['SQL/NoSQL injection & XSS checks', 'Hardcoded API key & secret alerts', 'Package vulnerability audit (OSV)'],
  },
  {
    icon: Network,
    title: 'Interactive Dependency Graph',
    desc: 'Visualize module relationships & API endpoint flows.',
    points: ['Real-time visual node & edge map', 'Endpoint-to-database flow tracer', 'Color-coded severity indicators'],
  },
  {
    icon: Sparkles,
    title: 'AI Refactoring (4 Modes)',
    desc: 'Fix Security, Clean & SOLID, Modernize, or Resilience.',
    points: ['Side-by-side visual line diff', 'Junior-friendly change explanations', 'Bilingual goal guide (English & සිංහල)'],
  },
  {
    icon: FolderArchive,
    title: 'Live Sandbox & ZIP Export',
    desc: 'Test refactored patches safely before committing.',
    points: ['Apply & revert patches in preview', 'Live security badge updates', 'Download patched project as .zip'],
  },
  {
    icon: GitPullRequest,
    title: 'One-Click GitHub PR Push',
    desc: 'Turn verified AI fixes into real GitHub Pull Requests.',
    points: ['Custom PR branch naming support', 'Automated commits on isolated branch', 'Direct link to open GitHub PR'],
  },
];

const STEPS = [
  {
    num: '01',
    icon: Layers,
    title: 'Import Your Project',
    desc: 'Connect directly with GitHub OAuth or upload a .zip archive of your project in seconds.',
  },
  {
    num: '02',
    icon: Network,
    title: 'Inspect Graph & Vulnerabilities',
    desc: 'Explore the interactive dependency graph, trace API routes, and review highlighted security risks.',
  },
  {
    num: '03',
    icon: GitPullRequest,
    title: 'AI Refactor & Push PR',
    desc: 'Generate clean AI patches, verify diffs in the sandbox, and push a Pull Request to a custom branch.',
  },
];

const PRICING_PLANS = [
  {
    name: 'Hobby / Free',
    price: '$0',
    period: '/month',
    desc: 'Ideal for students, open-source contributors, and quick security audits.',
    badge: null,
    cta: 'Start Free',
    highlight: false,
    features: [
      'Public GitHub repos & .zip uploads',
      'Interactive Dependency Graph & AST scan',
      'Security & OSV vulnerability detection',
      'AI Refactoring (4 modes) + Visual Diff',
      'Download patched project (.zip)',
    ],
  },
  {
    name: 'Pro Developer',
    price: '$19',
    period: '/month',
    desc: 'Built for full-stack developers shipping production code faster and safer.',
    badge: 'Most Popular',
    cta: 'Get Started with Pro',
    highlight: true,
    features: [
      'Everything in Hobby / Free',
      'Private GitHub repositories access',
      'One-click GitHub PR push & custom branches',
      'Codebase-Aware AI RAG Chat assistant',
      'Priority AI model routing & faster scans',
    ],
  },
  {
    name: 'Team / Enterprise',
    price: '$49',
    period: '/month',
    desc: 'For engineering teams needing custom AI keys, shared standards & support.',
    badge: null,
    cta: 'Contact Sales',
    highlight: false,
    features: [
      'Everything in Pro Developer',
      'Bring Your Own API Keys (Gemini / OpenRouter)',
      'Large monorepo AST & flow analysis',
      'Custom security & SOLID rule presets',
      'Dedicated onboarding & priority support',
    ],
  },
];

const FAQS = [
  {
    q: 'Is my source code stored permanently on ArchitectAI servers?',
    a: 'No. Uploaded ZIP files and cloned GitHub repositories are extracted into isolated temporary directories solely for AST parsing and are automatically deleted immediately after analysis.',
  },
  {
    q: 'Which languages and frameworks are supported?',
    a: 'ArchitectAI supports JavaScript, TypeScript, React (JSX/TSX), Node.js/Express, Python, and standard package manifests (package.json, requirements.txt) for dependency vulnerability scanning.',
  },
  {
    q: 'How does the GitHub Pull Request feature work?',
    a: 'When you sign in with GitHub OAuth, ArchitectAI creates a new branch (using your custom branch name or an auto-generated one), commits only the sandbox-verified patches, and opens a Pull Request against your base branch.',
  },
  {
    q: 'Can I test refactored code before pushing to GitHub?',
    a: 'Yes! You can apply multiple AI patches in the live sandbox preview, inspect the line-by-line visual diff, revert any file at any time, or export the patched codebase as a .zip archive.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('signin');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: 'General Inquiry', message: '' });
  const [contactBusy, setContactBusy] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState('');

  const openAuth = (m) => {
    if (user) return navigate('/app');
    setMode(m);
    setModalOpen(true);
  };

  const handlePlanClick = (planName) => {
    if (planName === 'Team / Enterprise') {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      setContactForm((prev) => ({ ...prev, subject: 'Team / Enterprise Plan' }));
      return;
    }
    openAuth('signup');
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (contactBusy) return;
    setContactBusy(true);
    setContactError('');
    setContactSent(false);
    try {
      const res = await api.post('/contact', contactForm);
      if (res.data?.success) {
        setContactSent(true);
        setContactForm({ name: '', email: '', subject: 'General Inquiry', message: '' });
        setTimeout(() => setContactSent(false), 6000);
      }
    } catch (err) {
      setContactError(err.response?.data?.error || 'Failed to send message. Please try again.');
    } finally {
      setContactBusy(false);
    }
  };

  return (
    <div id="home" className="relative min-h-screen bg-[#050816] text-slate-100 font-sans overflow-x-clip">
      <ParticleField />

      {/* Fixed Glassmorphism Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 pt-3 pointer-events-none">
        <nav className="pointer-events-auto max-w-7xl mx-auto rounded-2xl border border-blue-500/30 bg-[#070c24]/85 backdrop-blur-xl px-4 sm:px-6 py-3 shadow-[0_8px_32px_rgba(2,6,23,0.65)]">
          <div className="flex items-center justify-between">
            <a href="#home" className="shrink-0">
              <Logo size={34} />
            </a>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-7 text-sm text-slate-300">
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href} className="nav-link hover:text-white transition-colors">
                  {item.label}
                </a>
              ))}
            </div>

            {/* Desktop Auth CTA */}
            <div className="hidden sm:flex items-center gap-3">
              {user ? (
                <MagneticButton
                  onClick={() => navigate('/app')}
                  className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  Open Workspace <ArrowRight className="w-4 h-4" />
                </MagneticButton>
              ) : (
                <>
                  <MagneticButton
                    onClick={() => openAuth('signin')}
                    className="h-10 px-4 rounded-xl border border-blue-500/40 text-sm text-slate-200 hover:bg-blue-500/10"
                  >
                    Sign In
                  </MagneticButton>
                  <MagneticButton
                    onClick={() => openAuth('signup')}
                    className="btn-glow h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium flex items-center gap-2"
                  >
                    Get Started <ArrowRight className="w-4 h-4" />
                  </MagneticButton>
                </>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle Menu"
              className="lg:hidden p-2 rounded-lg border border-blue-500/30 text-slate-300 hover:text-white hover:bg-blue-500/10"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="lg:hidden mt-3 pt-3 border-t border-blue-500/20 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-blue-500/10"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="flex sm:hidden gap-2 pt-2">
                {user ? (
                  <button
                    onClick={() => navigate('/app')}
                    className="w-full h-10 rounded-xl bg-blue-600 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    Open Workspace <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setMobileMenuOpen(false); openAuth('signin'); }}
                      className="flex-1 h-10 rounded-xl border border-blue-500/40 text-sm"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => { setMobileMenuOpen(false); openAuth('signup'); }}
                      className="flex-1 h-10 rounded-xl bg-blue-600 text-sm font-medium"
                    >
                      Get Started
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-28 sm:pt-32 pb-20 grid lg:grid-cols-2 gap-12 items-center">
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

          <Reveal delay={700}>
            <p className="mt-6 max-w-xl text-slate-300 leading-relaxed">
              ArchitectAI analyzes your codebase, detects security vulnerabilities, visualizes architecture
              and suggests intelligent refactoring — all powered by advanced AI agents.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <MagneticButton
                onClick={() => openAuth('signin')}
                className="btn-glow h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 font-medium flex items-center gap-3"
              >
                <GithubIcon className="w-5 h-5" /> Continue with GitHub <ArrowRight className="w-4 h-4" />
              </MagneticButton>
              <MagneticButton
                onClick={() => openAuth('signup')}
                className="h-12 px-6 rounded-xl border border-blue-500/50 hover:bg-blue-500/10 font-medium flex items-center gap-3"
              >
                <Mail className="w-5 h-5" /> Sign Up with Email
              </MagneticButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {['No credit card required', 'Free tier available', 'Direct GitHub PR workflow'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-indigo-300" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={450}>
          <GraphPreview />
        </Reveal>
      </section>

      {/* Supported Ecosystem Strip */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-blue-500/20 bg-[#070c24]/70 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Built for Modern Codebases
          </span>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-slate-300 font-medium">
            {['JavaScript / ES6+', 'TypeScript', 'React & Vite', 'Node.js & Express', 'Python', 'GitHub OAuth'].map((tech) => (
              <span key={tech} className="px-3 py-1 rounded-lg border border-white/10 bg-white/[0.03]">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 pb-24 scroll-mt-24">
        <Reveal>
          <div className="flex items-center gap-4 mb-10">
            <Zap className="w-9 h-9 text-indigo-400 pulse-dot shrink-0" />
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold">Powerful Features for Modern Development</h2>
              <p className="text-sm text-slate-400 mt-1">
                Everything you need to analyze, secure, and refactor your codebase with AI.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, points }, i) => (
            <Reveal key={title} delay={i * 90}>
              <TiltCard className="h-full rounded-2xl border border-blue-500/25 bg-[#070c24]/90 p-6">
                <div className="flex items-center gap-4">
                  <span className="icon-box w-12 h-12 rounded-xl border bg-indigo-500/15 border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
                  {points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-indigo-300 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative z-10 max-w-7xl mx-auto px-6 pb-24 scroll-mt-24">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 font-medium">
              <Bot className="w-3.5 h-3.5" /> Seamless Developer Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-3">From Raw Repo to Verified PR in 3 Steps</h2>
            <p className="text-sm text-slate-400 mt-2">
              No complex CI/CD configuration required. Import, inspect, and ship cleaner code immediately.
            </p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map(({ num, icon: Icon, title, desc }, i) => (
            <Reveal key={num} delay={i * 120}>
              <div className="h-full rounded-2xl border border-blue-500/25 bg-[#070c24]/90 p-6 relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-3xl font-extrabold text-indigo-500/30 font-mono">{num}</span>
                </div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 pb-24 scroll-mt-24">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-xs text-blue-300 font-medium">
              <Tag className="w-3.5 h-3.5" /> Simple, Transparent Pricing
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-3">Start Free, Upgrade as You Scale</h2>
            <p className="text-sm text-slate-400 mt-2">
              Analyze public repos and ZIP archives for free. Unlock private repositories and team workflows anytime.
            </p>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-6 items-stretch">
          {PRICING_PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 120}>
              <div
                className={`h-full rounded-2xl p-6 flex flex-col justify-between border transition-all ${
                  plan.highlight
                    ? 'border-indigo-500 bg-gradient-to-b from-[#0d153d] to-[#070c24] shadow-[0_0_40px_rgba(99,102,241,0.22)]'
                    : 'border-blue-500/25 bg-[#070c24]/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                    {plan.badge && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-600 text-white">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm text-slate-400">{plan.period}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{plan.desc}</p>

                  <ul className="mt-6 space-y-3 text-sm text-slate-300 border-t border-white/10 pt-5">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <MagneticButton
                  onClick={() => handlePlanClick(plan.name)}
                  className={`mt-8 w-full h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                    plan.highlight
                      ? 'btn-glow bg-blue-600 hover:bg-blue-500 text-white'
                      : 'border border-blue-500/40 hover:bg-blue-500/10 text-slate-200'
                  }`}
                >
                  {plan.cta} <ArrowRight className="w-4 h-4" />
                </MagneticButton>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative z-10 max-w-4xl mx-auto px-6 pb-24 scroll-mt-24">
        <Reveal>
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 font-medium">
              <HelpCircle className="w-3.5 h-3.5" /> Frequently Asked Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-3">Got Questions? We Have Answers.</h2>
          </div>
        </Reveal>

        <div className="space-y-3">
          {FAQS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={item.q}
                className="rounded-xl border border-blue-500/25 bg-[#070c24]/90 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-white/[0.02]"
                >
                  <span className="font-medium text-sm sm:text-base text-slate-100">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-indigo-300 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed border-t border-white/5 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="relative z-10 max-w-7xl mx-auto px-6 pb-24 scroll-mt-24">
        <div className="rounded-3xl border border-blue-500/30 bg-[#070c24]/90 p-6 sm:p-10 grid lg:grid-cols-5 gap-10">
          {/* Contact Info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-xs text-blue-300 font-medium">
                <Mail className="w-3.5 h-3.5" /> Get in Touch
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold mt-3">Contact Us</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Have questions about enterprise deployment, custom security scanners, or feedback on ArchitectAI? Send us a message.
              </p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-medium text-slate-200">Email Support</p>
                  <p className="text-slate-400 text-xs mt-0.5">support@architectai.dev</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-medium text-slate-200">Response Time</p>
                  <p className="text-slate-400 text-xs mt-0.5">Usually within 24 hours on business days</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-medium text-slate-200">Developer Community</p>
                  <p className="text-slate-400 text-xs mt-0.5">Open for contributors &amp; early adopters worldwide</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <form onSubmit={handleContactSubmit} className="lg:col-span-3 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Your Name</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Thaksala Madhuwantha"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-700/80 bg-[#050816] text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="developer@example.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-700/80 bg-[#050816] text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Topic</label>
              <select
                value={contactForm.subject}
                onChange={(e) => setContactForm((p) => ({ ...p, subject: e.target.value }))}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-700/80 bg-[#050816] text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="General Inquiry">General Inquiry</option>
                <option value="Team / Enterprise Plan">Team / Enterprise Plan</option>
                <option value="Bug Report / Feature Request">Bug Report / Feature Request</option>
                <option value="Security & Privacy">Security &amp; Privacy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Message</label>
              <textarea
                rows={4}
                required
                value={contactForm.message}
                onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
                placeholder="Tell us about your project or how we can help..."
                className="w-full p-3.5 rounded-xl border border-slate-700/80 bg-[#050816] text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {contactError && (
              <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-300">
                {contactError}
              </div>
            )}

            {contactSent && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Thank you! Your message has been saved and sent to our team.
              </div>
            )}

            <MagneticButton
              type="submit"
              disabled={contactBusy}
              className="btn-glow h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {contactBusy ? 'Sending...' : 'Send Message'}
            </MagneticButton>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#040612]">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <span className="text-xs text-slate-500">AI-Powered Code Architecture &amp; Security</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-white transition-colors">
                {item.label}
              </a>
            ))}
          </div>

          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5" /> © {new Date().getFullYear()} ArchitectAI
          </p>
        </div>
      </footer>

      <AuthModal open={modalOpen} mode={mode} setMode={setMode} onClose={() => setModalOpen(false)} />
    </div>
  );
}