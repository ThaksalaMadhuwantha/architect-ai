import { useEffect, useRef, useState } from 'react';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

/* Custom cursor: dot + lagging ring + page spotlight + click burst */
export function CursorFX() {
  const dot = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    if (coarse() || reduced()) return;
    const root = document.documentElement;
    let x = innerWidth / 2, y = innerHeight / 3, rx = x, ry = y, raf;

    const place = (el, px, py) => {
      if (!el) return;
      el.style.opacity = 1;
      el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    };
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      place(dot.current, x, y);
      root.style.setProperty('--mx', `${x}px`);
      root.style.setProperty('--my', `${y}px`);
      ring.current?.classList.toggle('is-active', !!e.target.closest?.('a,button,input,label,[data-cursor]'));
    };
    const click = (e) => {
      const b = document.createElement('span');
      b.className = 'click-burst';
      b.style.left = `${e.clientX}px`;
      b.style.top = `${e.clientY}px`;
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 650);
    };
    const loop = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      place(ring.current, rx, ry);
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('click', click);
    loop();
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('click', click);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="spotlight" />
      <div ref={ring} className="cursor-ring" />
      <div ref={dot} className="cursor-dot" />
    </>
  );
}

/* Constellation background: particles link up and connect to the cursor */
export function ParticleField() {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const mouse = { x: -999, y: -999 };
    let w, h, pts = [], raf;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(90, Math.floor((w * h) / 16000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy) || 1;
        if (d < 70) { p.x += (dx / d) * 1.4; p.y += (dy / d) * 1.4; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, 6.283);
        ctx.fillStyle = 'rgba(129,140,248,.7)';
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < 120) {
            ctx.strokeStyle = `rgba(99,102,241,${(1 - d / 120) * 0.25})`;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
        const dm = Math.hypot(pts[i].x - mouse.x, pts[i].y - mouse.y);
        if (dm < 170) {
          ctx.strokeStyle = `rgba(167,139,250,${(1 - dm / 170) * 0.6})`;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
    };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    const move = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };

    resize();
    if (reduced()) draw(); else loop();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', move);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', move);
    };
  }, []);

  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none z-0" />;
}

/* Card that tilts in 3D and lights up under the cursor */
export function TiltCard({ children, className = '', max = 8 }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--px', `${px * 100}%`);
    el.style.setProperty('--py', `${py * 100}%`);
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max * 1.25}deg) translateY(-4px)`;
  };
  const onLeave = () => { ref.current.style.transform = ''; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`tilt-card ${className}`}>
      {children}
    </div>
  );
}

/* Button that leans toward the cursor */
export function MagneticButton({ children, className = '', ...props }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.25;
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.35;
    ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onLeave = () => { ref.current.style.transform = ''; };
  return (
    <button ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`magnetic ${className}`} {...props}>
      {children}
    </button>
  );
}

/* Fade/slide in when scrolled into view */
export function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
