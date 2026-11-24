import { useEffect, useRef, useState } from 'react';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Constellation background: subtle ambient particles */
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
      const n = Math.min(80, Math.floor((w * h) / 18000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, 6.283);
        ctx.fillStyle = 'rgba(129,140,248,.6)';
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < 120) {
            ctx.strokeStyle = `rgba(99,102,241,${(1 - d / 120) * 0.22})`;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
        const dm = Math.hypot(pts[i].x - mouse.x, pts[i].y - mouse.y);
        if (dm < 150) {
          ctx.strokeStyle = `rgba(129,140,248,${(1 - dm / 150) * 0.45})`;
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

/* Card that tilts subtly in 3D on hover */
export function TiltCard({ children, className = '', max = 6 }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--px', `${px * 100}%`);
    el.style.setProperty('--py', `${py * 100}%`);
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max * 1.2}deg) translateY(-3px)`;
  };
  const onLeave = () => { ref.current.style.transform = ''; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`tilt-card ${className}`}>
      {children}
    </div>
  );
}

/* Button with smooth hover elevation */
export function MagneticButton({ children, className = '', ...props }) {
  return (
    <button className={`transition-all duration-200 active:scale-[0.98] ${className}`} {...props}>
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
    }, { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}