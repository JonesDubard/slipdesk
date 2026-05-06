// "use client";

// import { motion, useInView, useScroll, useTransform, type Variants } from "framer-motion";
// import {
//   AlertTriangle,
//   ArrowRight,
//   BadgeCheck,
//   BarChart3,
//   Calculator,
//   CheckCircle2,
//   ChevronRight,
//   FileText,
//   Globe2,
//   Lock,
//   RefreshCw,
//   ShieldCheck,
//   Zap,
// } from "lucide-react";
// import Image from "next/image";
// import Link from "next/link";
// import { useRef } from "react";

// const fadeUp: Variants = {
//   hidden: { opacity: 0, y: 32 },
//   show: (i = 0) => ({
//     opacity: 1,
//     y: 0,
//     transition: {
//       duration: 0.6,
//       ease: [0.22, 1, 0.36, 1] as const,
//       delay: i * 0.1,
//     },
//   }),
// };

// const stagger: Variants = {
//   hidden: {},
//   show: { transition: { staggerChildren: 0.09 } },
// };

// function AnimateIn({
//   children,
//   className,
//   delay = 0,
// }: {
//   children: React.ReactNode;
//   className?: string;
//   delay?: number;
// }) {
//   const ref    = useRef(null);
//   const inView = useInView(ref, { once: true, margin: "-80px" });
//   return (
//     <motion.div
//       ref={ref}
//       className={className}
//       initial="hidden"
//       animate={inView ? "show" : "hidden"}
//       variants={fadeUp}
//       custom={delay}
//     >
//       {children}
//     </motion.div>
//   );
// }

// const FONT_LINK = (
//   <style>{`
//     @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:opsz,wght@9..40,400;9..40,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
//     :root { --navy:#002147; --emerald:#50C878; --em-dark:#3aa85f; }
//     .font-serif  { font-family:'Libre Baskerville',Georgia,serif; }
//     .font-mono   { font-family:'DM Mono',monospace; }
//     .text-navy   { color:var(--navy); }
//     .bg-navy     { background-color:var(--navy); }
//     .text-em     { color:var(--emerald); }
//     .bg-em       { background-color:var(--emerald); }
//     .hover-em:hover { background-color:var(--em-dark); }
//     @keyframes shimmer {
//       0%   { background-position:200% center }
//       100% { background-position:-200% center }
//     }
//     .shimmer-text {
//       background:linear-gradient(90deg,var(--emerald) 25%,#a7f3c4 50%,var(--emerald) 75%);
//       background-size:200% auto;
//       -webkit-background-clip:text;
//       -webkit-text-fill-color:transparent;
//       animation:shimmer 3s linear infinite;
//     }
//     .noise::before {
//       content:'';position:absolute;inset:0;pointer-events:none;
//       background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
//       opacity:0.3;z-index:1;
//     }
//     .noise > * { position:relative;z-index:2; }
//   `}</style>
// );

// // ─── Nav ──────────────────────────────────────────────────────────────────────

// function Nav() {
//   return (
//     <header
//       className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-md"
//       style={{ backgroundColor: "rgba(0,33,71,0.92)" }}
//     >
//       <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
//         <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
//           <Image
//             src="/Slipdesk_Logo_.png"
//             alt="Slipdesk"
//             width={32}
//             height={32}
//             className="rounded-md object-contain"
//             style={{ background: "white", padding: "2px" }}
//           />
//           <span className="text-white font-semibold text-base tracking-tight">Slipdesk</span>
//         </Link>

//         <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
//           {["Features", "Compliance", "Pricing"].map((n) => (
//             <a key={n} href={`#${n.toLowerCase()}`} className="hover:text-white transition-colors">
//               {n}
//             </a>
//           ))}
//         </nav>

//         <div className="flex items-center gap-3">
//           {/* ── ADDED: Interactive demo link ── */}
//           <Link href="/demo" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors hidden md:inline font-mono">
//             Interactive demo →
//           </Link>
//           <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors hidden md:inline">
//             Sign in
//           </Link>
//           <Link
//             href="/signup"
//             className="text-sm font-semibold px-4 py-2 rounded-lg bg-em text-navy hover-em transition-colors whitespace-nowrap"
//           >
//             Start free →
//           </Link>
//         </div>
//       </div>
//     </header>
//   );
// }

// // ─── Hero ─────────────────────────────────────────────────────────────────────

// function Hero() {
//   const ref = useRef(null);
//   const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
//   const yParallax = useTransform(scrollYProgress, [0, 1], [0, 120]);

//   return (
//     <section ref={ref} className="relative min-h-screen bg-navy noise overflow-hidden flex items-center pt-16">
//       <motion.div style={{ y: yParallax }} className="absolute inset-0 pointer-events-none">
//         <div
//           className="absolute -right-64 -top-64 w-[700px] h-[700px] rounded-full border border-emerald-500/10"
//           style={{ background: "radial-gradient(circle, rgba(80,200,120,0.06) 0%, transparent 70%)" }}
//         />
//         <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
//           <defs>
//             <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
//               <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#50C878" strokeWidth="0.5" />
//             </pattern>
//           </defs>
//           <rect width="100%" height="100%" fill="url(#grid)" />
//         </svg>
//       </motion.div>

//       <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
//         <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-3xl">

//           {/* ── Badge ── */}
//           <motion.div variants={fadeUp} custom={0}>
//             <span className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-4 py-1.5 mb-6">
//               <span className="w-1.5 h-1.5 rounded-full bg-em animate-pulse" />
//               🇱🇷 Built in Liberia · For Liberian SMEs
//             </span>
//           </motion.div>

//           {/* ── Headline — matches brand image exactly ── */}
//           <motion.h1
//             variants={fadeUp}
//             custom={1}
//             className="font-serif text-white leading-[1.12] mb-6"
//             style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}
//           >
//             Beautiful payslips.{" "}
//             <em className="not-italic shimmer-text">No confusion.</em>
//             <br className="hidden sm:block" />
//             Less stress.
//           </motion.h1>

//           {/* ── Sub — empathy-first, mirrors the brand message ── */}
//           <motion.p
//             variants={fadeUp}
//             custom={2}
//             className="text-white/60 text-base sm:text-lg leading-relaxed mb-10 max-w-xl font-light"
//           >
//             Generate LRA compliant, dual currency payslips in minutes.
//             No spreadsheets, no manual calculations, no after‑payday panic.
//           </motion.p>

//           {/* ── CTAs ── */}
//           <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row gap-4">
//             <Link
//               href="/signup"
//               className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-em text-navy font-semibold rounded-xl hover-em transition-colors text-base"
//             >
//               Generate your first payslip free
//               <ArrowRight className="w-4 h-4" />
//             </Link>
//             <Link
//               href="/demo"
//               className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-emerald-500/40 text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors text-base"
//             >
//               See a sample payslip
//               <ChevronRight className="w-4 h-4" />
//             </Link>
//           </motion.div>

//           {/* ── Trust line ── */}
//           <motion.p variants={fadeUp} custom={4} className="mt-8 text-white/35 text-sm font-mono">
//             No setup fees · Cancel anytime · Plans from $50/month
//           </motion.p>
//         </motion.div>

//         <motion.div
//           initial={{ opacity: 0, x: 80 }}
//           animate={{ opacity: 1, x: 0 }}
//           transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay: 0.5 }}
//           className="hidden xl:block absolute right-6 top-1/2 -translate-y-1/2 w-80"
//         >
//           <PayslipCard />
//         </motion.div>
//       </div>
//     </section>
//   );
// }

// // ─── Payslip card — updated values to match the brand image ──────────────────
// function PayslipCard() {
//   const lines = [
//     { label: "Basic Salary",             value: "$1,500.00",  color: "text-white/70"  },
//     { label: "Housing Allowance",        value: "$300.00",    color: "text-white/70"  },
//     { label: "Transportation Allowance", value: "$200.00",    color: "text-white/70"  },
//     { label: "NASSCORP Employee (5%)",   value: "–$100.00",   color: "text-orange-400" },
//     { label: "LRA Withholding Tax",      value: "–$150.00",   color: "text-red-400"    },
//   ];
//   return (
//     <div
//       className="rounded-2xl overflow-hidden shadow-2xl border border-white/10"
//       style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
//     >
//       <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
//         <div>
//           <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest">April 2026 Payslip</p>
//           <p className="text-white font-semibold text-sm mt-0.5">James M. Doe · SLD-00123</p>
//           <p className="text-white/40 text-[10px] font-mono">Operations Manager</p>
//         </div>
//         <div className="w-8 h-8 rounded-lg bg-em/20 flex items-center justify-center">
//           <FileText className="w-4 h-4 text-em" />
//         </div>
//       </div>
//       <div className="px-5 py-4 space-y-3">
//         {lines.map((l, i) => (
//           <motion.div
//             key={l.label}
//             initial={{ opacity: 0, x: 20 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ delay: 0.8 + i * 0.08 }}
//             className="flex justify-between items-center"
//           >
//             <span className="text-white/50 text-xs font-mono">{l.label}</span>
//             <span className={`text-xs font-mono font-semibold ${l.color}`}>{l.value}</span>
//           </motion.div>
//         ))}
//         <div className="border-t border-white/10 pt-3">
//           <div className="flex justify-between items-center">
//             <span className="text-white/70 text-xs font-mono font-bold">NET PAY</span>
//             <span className="font-mono font-bold text-em text-base">$1,700.00</span>
//           </div>
//           <p className="text-white/25 text-[9px] font-mono text-right mt-1">LRD 255,000.00 @ 150.00</p>
//         </div>
//       </div>
//       <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
//         <BadgeCheck className="w-4 h-4 text-em" />
//         <span className="text-em text-[10px] font-mono">LRA Compliant · NASSCORP Verified</span>
//       </div>
//     </div>
//   );
// }

// // ─── Pain Banner — mirrors the brand message pain points exactly ──────────────
// function PainBanner() {
//   const pains = [
//   "Paying extra just to get LRA right",
//   "Messing up USD ↔ LRD conversions",
//   "Double‑checking deductions late at night",
//   "Fixing mistakes after payday",
// ];
//   return (
//     <div className="bg-amber-950/80 border-y border-amber-800/50 py-4">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6">
//         <div className="flex flex-wrap gap-x-8 gap-y-2 items-center justify-center">
//           <span className="text-amber-400/70 text-xs font-mono uppercase tracking-widest">That frustrating moment →</span>
//           {pains.map((p) => (
//             <div key={p} className="flex items-center gap-2">
//               <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
//               <span className="text-amber-200/70 text-sm">{p}</span>
//             </div>
//           ))}
//         </div>
//       </div>
//     </div>
//   );
// }

// // ─── Features — rewritten to match actual product + brand image copy ──────────
// const FEATURES = [
//   {
//     icon: Globe2,
//     title: "Dual‑Currency Payslips",
//     desc: "Every payslip shows USD and LRD side by side. No manual conversion, no separate spreadsheets.",
//     tag: "USD ↔ LRD",
//   },
//   {
//     icon: Calculator,
//     title: "LRA Income Tax, Autopilotped",
//     desc: "The four‑tier LRA tax schedule applied correctly on every payslip. Effective tax rate displayed per employee.",
//     tag: "LRA Compliant",
//   },
//   {
//     icon: ShieldCheck,
//     title: "NASSCORP Deductions Built‑In",
//     desc: "Edit an allowance, a rate, or hours – the whole payslip updates immediately. Catch errors before payday, not after.",
//     tag: "Live Preview",
//   },
//   {
//     icon: FileText,
//     title: "From Zero to Payslip in Minutes",
//     desc: "Import employees, set their salaries, generate all payslips for the month. Average run: under 10 minutes.",
//     tag: "PDF · Email · Share",
//   },
//   {
//     icon: BarChart3,
//     title: "No More Spreadsheet Mistakes",
//     desc: "Edit hours, rates, or allowances and watch every figure recalculate instantly. Catch errors before payday, not after.",
//     tag: "Live Preview",
//   },
//   {
//     icon: RefreshCw,
//     title: "Quick & Easy to Run",
//     desc: "From zero to a complete, compliant payroll run in under 10 minutes. Designed for busy HR teams and business owners — not accountants.",
//     tag: "10-Minute Payroll",
//   },
// ];

// function Features() {
//   return (
//     <section id="features" className="py-20 sm:py-28 bg-slate-50">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6">
//         <AnimateIn className="text-center mb-16">
//           <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">Features</p>
//           <h2 className="font-serif text-navy text-3xl sm:text-4xl leading-tight mb-4">
//             Payroll that works.<br />Without the stress.
//           </h2>
//           <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-base">
//             Slipdesk was built specifically for how Liberian businesses pay people —
//             dual currencies, LRA compliance, NASSCORP deductions, all handled automatically.
//           </p>
//         </AnimateIn>
//         <motion.div
//           initial="hidden"
//           whileInView="show"
//           viewport={{ once: true, margin: "-60px" }}
//           variants={stagger}
//           className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
//         >
//           {FEATURES.map((f) => (
//             <motion.div
//               key={f.title}
//               variants={fadeUp}
//               suppressHydrationWarning
//               className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all group"
//             >
//               <div className="flex items-start justify-between mb-5">
//                 <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center group-hover:bg-em/10 transition-colors">
//                   <f.icon className="w-5 h-5 text-navy/60 group-hover:text-em transition-colors" />
//                 </div>
//                 <span className="text-[10px] font-mono text-em bg-emerald-50 px-2 py-0.5 rounded-full">
//                   {f.tag}
//                 </span>
//               </div>
//               <h3 className="font-semibold text-navy text-base mb-2">{f.title}</h3>
//               <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
//             </motion.div>
//           ))}
//         </motion.div>
//       </div>
//     </section>
//   );
// }

// // ─── Compliance ───────────────────────────────────────────────────────────────

// function Compliance() {
//   const brackets = [
//     { range: "L$0 – L$70,000",        rate: "0%",  tax: "Tax-free",    bg: "bg-slate-100"    },
//     { range: "L$70,001 – L$200,000",  rate: "5%",  tax: "Excess only", bg: "bg-emerald-50"   },
//     { range: "L$200,001 – L$800,000", rate: "15%", tax: "+ L$6,500",   bg: "bg-emerald-100"  },
//     { range: "Over L$800,000",        rate: "25%", tax: "+ L$96,500",  bg: "bg-emerald-200"  },
//   ];
//   return (
//     <section id="compliance" className="py-20 sm:py-28 bg-navy noise">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6">
//         <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
//           <AnimateIn>
//             <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">LRA · NASSCORP · Compliance</p>
//             <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight mb-6">
//               The heavy lifting is done.<br />
//               <em className="not-italic text-em">Your payslips are always compliant.</em>
//             </h2>
//             <p className="text-white/60 leading-relaxed mb-8 text-sm sm:text-base">
//               Slipdesk embeds every LRA income tax bracket and NASSCORP contribution rule directly into the payslip engine.
// Every payslip you generate is a precise, auditable record, no rounding errors, no forgotten thresholds..
//             </p>
//             <div className="space-y-3">
//               {[
//                 "NASSCORP: 4% Employee · 6% Employer, applied only on base salary",
//                 "Income converted to LRD before tax bracket calculation",
//                 "Tax converted back to employee's currency on the final payslip",
//                 "Minimum‑wage guardrail flags under‑threshold earnings",
//                 "Every payslip is LRA‑ready from day one",
//               ].map((t) => (
//                 <div key={t} className="flex items-start gap-3">
//                   <CheckCircle2 className="w-4 h-4 text-em flex-shrink-0 mt-0.5" />
//                   <span className="text-white/70 text-sm">{t}</span>
//                 </div>
//               ))}
//             </div>
//           </AnimateIn>
//           <AnimateIn delay={1} className="space-y-2 mt-8 lg:mt-0">
//             <p className="text-white/40 font-mono text-[10px] uppercase tracking-widest mb-4">
//               LRA Monthly Income Tax Brackets (LRD) · 2026
//             </p>
//             {brackets.map((b, i) => (
//               <motion.div
//                 key={b.range}
//                 initial={{ opacity: 0, x: 40 }}
//                 whileInView={{ opacity: 1, x: 0 }}
//                 viewport={{ once: true }}
//                 transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
//                 className={`flex items-center justify-between rounded-xl px-4 sm:px-5 py-3 sm:py-4 ${b.bg}`}
//               >
//                 <div>
//                   <p className="font-mono text-[10px] text-navy/60 mb-0.5">Income range</p>
//                   <p className="font-mono text-xs sm:text-sm font-medium text-navy">{b.range}</p>
//                 </div>
//                 <div className="text-right">
//                   <p className="font-mono text-[10px] text-navy/60 mb-0.5">Rate</p>
//                   <p className="font-mono text-lg sm:text-xl font-bold text-navy">{b.rate}</p>
//                   <p className="font-mono text-[10px] text-navy/50">{b.tax}</p>
//                 </div>
//               </motion.div>
//             ))}
//           </AnimateIn>
//         </div>
//       </div>
//     </section>
//   );
// }

// // ─── Stats — updated to reflect the product promise not pricing model ─────────
// const STATS = [
//   { value: "2",     unit: "currencies",  label: "USD & LRD on every payslip" },
//   { value: "4",     unit: "tax brackets", label: "LRA brackets, applied right" },
//   { value: "<10",   unit: "minutes",      label: "From zero to full payslip run" },
//   { value: "Zero",  unit: "spreadsheets", label: "Manual sheets. Ever again." },
// ];

// function Stats() {
//   return (
//     <section className="py-14 sm:py-16 bg-em">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6">
//         <motion.div
//           initial="hidden"
//           whileInView="show"
//           viewport={{ once: true }}
//           variants={stagger}
//           className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8"
//         >
//           {STATS.map((s) => (
//             <motion.div key={s.value} variants={fadeUp} className="text-center">
//               <p className="font-serif text-navy text-3xl sm:text-4xl font-bold leading-none mb-1">
//                 {s.value}
//               </p>
//               <p className="font-mono text-navy/60 text-[10px] sm:text-xs uppercase tracking-widest mb-1">
//                 {s.unit}
//               </p>
//               <p className="text-navy/70 text-xs sm:text-sm">{s.label}</p>
//             </motion.div>
//           ))}
//         </motion.div>
//       </div>
//     </section>
//   );
// }

// // ─── Pricing — updated to match actual tiered model ───────────────────────────
// function Pricing() {
//   const tiers = [
//     {
//       name:  "Basic",
//       price: "$50",
//       unit:  "/ month",
//       limit: "Up to 80 employees",
//       color: "#3B82F6",
//       features: [
//         "Unlimited pay runs",
//         "LRA income tax auto-calculation",
//         "NASSCORP compliance built-in",
//         "PDF payslip generation",
//         "CSV bulk employee import",
//         "Email support (48hr response)",
//       ],
//     },
//     {
//       name:    "Standard",
//       price:   "$300",
//       unit:    "/ month",
//       limit:   "Up to 499 employees",
//       color:   "#50C878",
//       popular: true,
//       features: [
//         "Everything in Basic",
//         "Dual-currency USD & LRD payroll",
//         "Company logo on all payslips",
//         "Department-level reporting",
//         "Bulk payslip download",
//         "Priority email support (24hr)",
//       ],
//     },
//     {
//       name:  "Premium",
//       price: "$500",
//       unit:  "/ month",
//       limit: "Unlimited employees",
//       color: "#8B5CF6",
//       features: [
//         "Everything in Standard",
//         "Unlimited active employees",
//         "Dedicated account manager",
//         "Custom onboarding session",
//         "Priority phone support",
//         "Custom report exports",
//       ],
//     },
//   ];

//   return (
//     <section id="pricing" className="py-20 sm:py-28 bg-slate-50">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6">
//         <AnimateIn className="text-center mb-14">
//           <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">Pricing</p>
//           <h2 className="font-serif text-navy text-3xl sm:text-4xl mb-4">
//             Simple. Transparent. No surprises.
//           </h2>
//           <p className="text-slate-500 max-w-md mx-auto text-sm sm:text-base">
//             Pick the plan that fits your team. All plans include a 30-day free trial —
//             no credit card needed.
//           </p>
//         </AnimateIn>

//         <AnimateIn delay={1}>
//           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
//             {tiers.map((tier) => (
//               <div
//                 key={tier.name}
//                 className="bg-navy rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col relative"
//               >
//                 {tier.popular && (
//                   <div
//                     className="absolute top-0 left-0 right-0 text-center py-1.5 text-xs font-mono font-bold tracking-widest"
//                     style={{ background: tier.color, color: "#002147" }}
//                   >
//                     MOST POPULAR
//                   </div>
//                 )}
//                 <div className={`px-6 sm:px-7 pb-6 text-white ${tier.popular ? "pt-10" : "pt-8"}`}>
//                   <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: tier.color }}>
//                     {tier.name}
//                   </p>
//                   <div className="flex items-end gap-1 mb-1">
//                     <span className="font-serif text-4xl sm:text-5xl font-bold">{tier.price}</span>
//                     <span className="text-white/50 font-mono text-sm mb-1">{tier.unit}</span>
//                   </div>
//                   <p className="font-mono text-xs text-white/40 mb-6">{tier.limit}</p>
//                   <div className="space-y-2.5">
//                     {tier.features.map((f) => (
//                       <div key={f} className="flex items-center gap-3">
//                         <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: tier.color }} />
//                         <span className="text-white/70 text-sm">{f}</span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//                 <div className="px-6 sm:px-7 pb-8 mt-auto">
//                   <Link
//                     href="/signup"
//                     className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold transition-colors text-sm"
//                     style={{
//                       background: tier.popular ? tier.color : "rgba(255,255,255,0.08)",
//                       color: tier.popular ? "#002147" : "#fff",
//                     }}
//                   >
//                     Start free trial
//                     <ArrowRight className="w-4 h-4" />
//                   </Link>
//                 </div>
//               </div>
//             ))}
//           </div>

//           <p className="text-center text-slate-400 text-xs font-mono mt-8">
//             All plans include unlimited payslip runs, LRA & NASSCORP compliance, dual‑currency, and PDF generation.
// Payroll management tools (automatic deductions, multi‑period reporting, direct deposit) coming later this year.
//           </p>
//         </AnimateIn>
//       </div>
//     </section>
//   );
// }

// // ─── CTA — updated to match brand message tone ────────────────────────────────
// function CTA() {
//   return (
//     <section className="py-20 sm:py-24 bg-navy noise text-center">
//       <div className="max-w-2xl mx-auto px-4 sm:px-6">
//         <AnimateIn>
//           <Zap className="w-10 h-10 text-em mx-auto mb-5" />
//           <h2 className="font-serif text-white text-3xl sm:text-4xl mb-5 leading-tight">
//             Generate your first payslip today.<br />
//             <em className="not-italic shimmer-text">Free. No risk.</em>
//           </h2>
//           <p className="text-white/50 mb-8 leading-relaxed text-sm sm:text-base">
//             Join Liberian businesses that have replaced messy spreadsheets with Slipdesk.
//             {/* Your first month is on us. */}
//           </p>
//           <div className="flex flex-col sm:flex-row gap-4 justify-center">
//             <Link
//               href="/signup"
//               className="inline-flex items-center justify-center gap-2 px-7 sm:px-8 py-3.5 sm:py-4 bg-em text-navy font-bold rounded-xl hover-em transition-colors text-base sm:text-lg"
//             >
//               Generate your first payslip today
//               <ArrowRight className="w-5 h-5" />
//             </Link>
//             <Link
//               href="/demo"
//               className="inline-flex items-center justify-center gap-2 px-7 sm:px-8 py-3.5 sm:py-4 border border-emerald-500/40 text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors text-base sm:text-lg"
//             >
//               View sample payslip
//               <ChevronRight className="w-5 h-5" />
//             </Link>
//           </div>
//           <p className="mt-6 text-white/30 text-sm font-mono">
//             <Lock className="w-3 h-3 inline mr-1" />
//             Built in Liberia · Data encrypted · Pay via MTN Mobile Money
//           </p>
//             <p className="mt-4 text-white/20 text-xs font-mono">
//             Full payroll tools coming soon 👀
//             </p>
//         </AnimateIn>
//       </div>
//     </section>
//   );
// }

// // ─── Footer ───────────────────────────────────────────────────────────────────
// function Footer() {
//   return (
//     <footer className="bg-slate-900 py-10 sm:py-12 border-t border-white/5">
//       <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
//         <Link href="/" className="flex items-center gap-2">
//           <Image
//             src="/Slipdesk_Logo_.png"
//             alt="Slipdesk"
//             width={24}
//             height={24}
//             className="rounded object-contain"
//             style={{ background: "white", padding: "2px" }}
//           />
//           <span className="text-white/60 text-sm font-mono">Slipdesk</span>
//           <span className="text-white/20 text-sm mx-1">·</span>
//           {/* ── Updated tagline ── */}
//           <span className="text-white/30 text-xs font-mono hidden sm:inline">
//             LRA & NASSCORP Compliant Payslips
//           </span>
//         </Link>
//         <div className="flex gap-4 sm:gap-6 text-white/30 text-xs font-mono">
//           <Link href="/legal?tab=privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
//           <Link href="/legal"             className="hover:text-white/60 transition-colors">Terms</Link>
//           <Link href="/demo"              className="hover:text-white/60 transition-colors">Demo</Link>
//           <a    href="#features"          className="hover:text-white/60 transition-colors">Features</a>
//           {/* ── Fixed email typo (was hello@slipdesk@gmail.com) ── */}
//           <a    href="mailto:hello@slipdesk.com" className="hover:text-white/60 transition-colors">Support</a>
//         </div>
//         <p className="text-white/20 text-xs font-mono">
//           © {new Date().getFullYear()} Slipdesk · Monrovia, Liberia
//         </p>
//       </div>
//     </footer>
//   );
// }

// // ─── Export ───────────────────────────────────────────────────────────────────
// export default function LandingPageClient() {
//   return (
//     <>
//       {FONT_LINK}
//       <Nav />
//       <main>
//         <Hero />
//         <PainBanner />
//         <Features />
//         <Compliance />
//         <Stats />
//         <Pricing />
//         <CTA />
//       </main>
//       <Footer />
//     </>
//   );
// }

"use client";

import { motion, useInView, useScroll, useTransform, type Variants } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

// ─── Motion Variants ─────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
      delay: i * 0.1,
    },
  }),
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

function AnimateIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={fadeUp}
      custom={delay}
    >
      {children}
    </motion.div>
  );
}

// ─── Fonts + CSS vars ─────────────────────────────────────────────────────────

const FONT_LINK = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:opsz,wght@9..40,400;9..40,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
    :root {
      --navy:   #002147;
      --emerald:#50C878;
      --em-dark:#3aa85f;
    }
    .font-serif  { font-family: 'Libre Baskerville', Georgia, serif; }
    .font-mono   { font-family: 'DM Mono', monospace; }
    .text-navy   { color: var(--navy); }
    .bg-navy     { background-color: var(--navy); }
    .text-em     { color: var(--emerald); }
    .bg-em       { background-color: var(--emerald); }
    .hover-em:hover { background-color: var(--em-dark); }

    @keyframes shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    .shimmer-text {
      background: linear-gradient(90deg, var(--emerald) 25%, #a7f3c4 50%, var(--emerald) 75%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer 3s linear infinite;
    }
    .noise::before {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
      opacity: 0.3; z-index: 1;
    }
    .noise > * { position: relative; z-index: 2; }
  `}</style>
);

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-md"
      style={{ backgroundColor: "rgba(0,33,71,0.92)" }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <Image
            src="/Slipdesk_Logo_.png"
            alt="Slipdesk"
            width={32}
            height={32}
            className="rounded-md object-contain"
            style={{ background: "white", padding: "2px" }}
          />
          <span className="text-white font-semibold text-base tracking-tight">Slipdesk</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          {["Features", "Compliance", "Pricing"].map((n) => (
            <a key={n} href={`#${n.toLowerCase()}`} className="hover:text-white transition-colors">
              {n}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/demo" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors hidden md:inline font-mono">
            Interactive demo →
          </Link>
          <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors hidden md:inline">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-em text-navy hover-em transition-colors whitespace-nowrap"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yParallax = useTransform(scrollYProgress, [0, 1], [0, 120]);

  return (
    <section ref={ref} className="relative min-h-screen bg-navy noise overflow-hidden flex items-center pt-16">
      <motion.div style={{ y: yParallax }} className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -right-64 -top-64 w-[700px] h-[700px] rounded-full border border-emerald-500/10"
          style={{ background: "radial-gradient(circle, rgba(80,200,120,0.06) 0%, transparent 70%)" }}
        />
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#50C878" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </motion.div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-3xl">
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-em animate-pulse" />
              🇱🇷 Built in Liberia · For Liberian SMEs
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-serif text-white leading-[1.12] mb-6"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}
          >
            Beautiful payslips.{" "}
            <em className="not-italic shimmer-text">No confusion.</em>
            <br className="hidden sm:block" />
            Less stress.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-white/60 text-base sm:text-lg leading-relaxed mb-10 max-w-xl font-light"
          >
            Generate LRA‑compliant, dual‑currency payslips in minutes.
            No spreadsheets, no manual calculations, no after‑payday panic.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-em text-navy font-semibold rounded-xl hover-em transition-colors text-base"
            >
              Get started today
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-emerald-500/40 text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors text-base"
            >
              See a sample payslip
              <ChevronRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.p variants={fadeUp} custom={4} className="mt-8 text-white/35 text-sm font-mono">
            No setup fees · Cancel anytime · Plans from $50/month
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay: 0.5 }}
          className="hidden xl:block absolute right-6 top-1/2 -translate-y-1/2 w-80"
        >
          <PayslipCard />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Payslip card ────────────────────────────────────────────────────────────
function PayslipCard() {
  const lines = [
    { label: "Basic Salary",             value: "$1,500.00",  color: "text-white/70"  },
    { label: "Housing Allowance",        value: "$300.00",    color: "text-white/70"  },
    { label: "Transportation Allowance", value: "$200.00",    color: "text-white/70"  },
    { label: "NASSCORP Employee (5%)",   value: "–$100.00",   color: "text-orange-400" },
    { label: "LRA Withholding Tax",      value: "–$150.00",   color: "text-red-400"    },
  ];
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl border border-white/10"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest">April 2026 Payslip</p>
          <p className="text-white font-semibold text-sm mt-0.5">James M. Doe · SLD-00123</p>
          <p className="text-white/40 text-[10px] font-mono">Operations Manager</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-em/20 flex items-center justify-center">
          <FileText className="w-4 h-4 text-em" />
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {lines.map((l, i) => (
          <motion.div
            key={l.label}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 + i * 0.08 }}
            className="flex justify-between items-center"
          >
            <span className="text-white/50 text-xs font-mono">{l.label}</span>
            <span className={`text-xs font-mono font-semibold ${l.color}`}>{l.value}</span>
          </motion.div>
        ))}
        <div className="border-t border-white/10 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-white/70 text-xs font-mono font-bold">NET PAY</span>
            <span className="font-mono font-bold text-em text-base">$1,700.00</span>
          </div>
          <p className="text-white/25 text-[9px] font-mono text-right mt-1">LRD 255,000.00 @ 150.00</p>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
        <BadgeCheck className="w-4 h-4 text-em" />
        <span className="text-em text-[10px] font-mono">LRA Compliant · NASSCORP Verified</span>
      </div>
    </div>
  );
}

// ─── Pain Banner ─────────────────────────────────────────────────────────────

function PainBanner() {
  const pains = [
    "Paying extra just to get LRA right",
    "Messing up USD ↔ LRD conversions",
    "Double‑checking deductions late at night",
    "Fixing mistakes after payday",
  ];
  return (
    <div className="bg-amber-950/80 border-y border-amber-800/50 py-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap gap-x-8 gap-y-2 items-center justify-center">
          <span className="text-amber-400/70 text-xs font-mono uppercase tracking-widest">
            That frustrating moment →
          </span>
          {pains.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-amber-200/70 text-sm">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Globe2,
    title: "Dual‑Currency Payslips",
    desc: "Every payslip shows USD and LRD side by side. No manual conversion, no separate spreadsheets.",
    tag: "USD ↔ LRD",
  },
  {
    icon: Calculator,
    title: "LRA Income Tax, Autopilot",
    desc: "The four‑tier LRA tax schedule applied correctly on every payslip. Effective tax rate displayed per employee.",
    tag: "LRA Compliant",
  },
  {
    icon: ShieldCheck,
    title: "NASSCORP Deductions Built‑In",
    desc: "Employee 4% and employer 6% contributions calculated from base salary, automatically separated from allowances.",
    tag: "NASSCORP Ready",
  },
  {
    icon: FileText,
    title: "Professional PDF Payslips",
    desc: "One‑click PDF generation. Branded, dated, and auditable, ready to print, email, or file with LRA.",
    tag: "PDF / Email",
  },
  {
    icon: RefreshCw,
    title: "Instant Recalculation",
    desc: "Edit an allowance, a rate, or hours, the whole payslip updates immediately. Catch errors before payday, not after.",
    tag: "Live Preview",
  },
  {
    icon: Zap,
    title: "From Zero to Payslip in Minutes",
    desc: "Import employees, set their salaries, generate all payslips for the month. Average run: under 10 minutes.",
    tag: "10‑Minute Setup",
  },
];

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <AnimateIn className="text-center mb-16">
          <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">Features</p>
          <h2 className="font-serif text-navy text-3xl sm:text-4xl leading-tight mb-4">
            Everything you need,<br />nothing you don’t.
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-base">
            Slipdesk was built specifically for how Liberian businesses pay people,
            dual currencies, LRA compliance, NASSCORP deductions, all handled automatically.
          </p>
        </AnimateIn>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center group-hover:bg-em/10 transition-colors">
                  <f.icon className="w-5 h-5 text-navy/60 group-hover:text-em transition-colors" />
                </div>
                <span className="text-[10px] font-mono text-em bg-emerald-50 px-2 py-0.5 rounded-full">
                  {f.tag}
                </span>
              </div>
              <h3 className="font-semibold text-navy text-base mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Compliance ───────────────────────────────────────────────────────────────

function Compliance() {
  const brackets = [
    { range: "L$0 – L$70,000",        rate: "0%",  tax: "Tax-free",    bg: "bg-slate-100"    },
    { range: "L$70,001 – L$200,000",  rate: "5%",  tax: "Excess only", bg: "bg-emerald-50"   },
    { range: "L$200,001 – L$800,000", rate: "15%", tax: "+ L$6,500",   bg: "bg-emerald-100"  },
    { range: "Over L$800,000",        rate: "25%", tax: "+ L$96,500",  bg: "bg-emerald-200"  },
  ];
  return (
    <section id="compliance" className="py-20 sm:py-28 bg-navy noise">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <AnimateIn>
            <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">LRA · NASSCORP · Compliance</p>
            <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight mb-6">
              The heavy lifting is done.<br />
              <em className="not-italic text-em">Your payslips are always compliant.</em>
            </h2>
            <p className="text-white/60 leading-relaxed mb-8 text-sm sm:text-base">
              Slipdesk embeds every LRA income tax bracket and NASSCORP contribution rule directly into the payslip engine.
              Every payslip you generate is a precise, auditable record, no rounding errors, no forgotten thresholds.
            </p>
            <div className="space-y-3">
              {[
                "NASSCORP: 4% Employee · 6% Employer, applied only on base salary",
                "Income converted to LRD before tax bracket calculation",
                "Tax converted back to employee's currency on the final payslip",
                "Minimum‑wage guardrail flags under‑threshold earnings",
                "Every payslip is LRA‑ready from day one",
              ].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-em flex-shrink-0 mt-0.5" />
                  <span className="text-white/70 text-sm">{t}</span>
                </div>
              ))}
            </div>
          </AnimateIn>
          <AnimateIn delay={1} className="space-y-2 mt-8 lg:mt-0">
            <p className="text-white/40 font-mono text-[10px] uppercase tracking-widest mb-4">
              LRA Monthly Income Tax Brackets (LRD) · 2026
            </p>
            {brackets.map((b, i) => (
              <motion.div
                key={b.range}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
                className={`flex items-center justify-between rounded-xl px-4 sm:px-5 py-3 sm:py-4 ${b.bg}`}
              >
                <div>
                  <p className="font-mono text-[10px] text-navy/60 mb-0.5">Income range</p>
                  <p className="font-mono text-xs sm:text-sm font-medium text-navy">{b.range}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] text-navy/60 mb-0.5">Rate</p>
                  <p className="font-mono text-lg sm:text-xl font-bold text-navy">{b.rate}</p>
                  <p className="font-mono text-[10px] text-navy/50">{b.tax}</p>
                </div>
              </motion.div>
            ))}
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "2",     unit: "currencies",  label: "USD & LRD on every payslip"      },
  { value: "4",     unit: "tax brackets",label: "LRA brackets, applied right"     },
  { value: "<10",   unit: "minutes",     label: "From zero to full payslip run"   },
  { value: "Zero",  unit: "spreadsheets",label: "Manual sheets. Ever again."      },
];

function Stats() {
  return (
    <section className="py-14 sm:py-16 bg-em">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={stagger}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8"
        >
          {STATS.map((s) => (
            <motion.div key={s.value} variants={fadeUp} className="text-center">
              <p className="font-serif text-navy text-3xl sm:text-4xl font-bold leading-none mb-1">
                {s.value}
              </p>
              <p className="font-mono text-navy/60 text-[10px] sm:text-xs uppercase tracking-widest mb-1">
                {s.unit}
              </p>
              <p className="text-navy/70 text-xs sm:text-sm">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Pricing (no free trial) ─────────────────────────────────────────────────

function Pricing() {
  const tiers = [
    {
      name:  "Basic",
      price: "$50",
      unit:  "/ month",
      limit: "Up to 80 employees",
      color: "#3B82F6",
      features: [
        "Unlimited pay runs",
        "LRA income tax auto-calculation",
        "NASSCORP compliance built-in",
        "PDF payslip generation",
        "CSV bulk employee import",
        "Email support (48hr response)",
      ],
    },
    {
      name:    "Standard",
      price:   "$300",
      unit:    "/ month",
      limit:   "Up to 499 employees",
      color:   "#50C878",
      popular: true,
      features: [
        "Everything in Basic",
        "Dual-currency USD & LRD payslips",
        "Company logo on all payslips",
        "Department-level reporting",
        "Bulk payslip download",
        "Priority email support (24hr)",
      ],
    },
    {
      name:  "Premium",
      price: "$500",
      unit:  "/ month",
      limit: "Unlimited employees",
      color: "#8B5CF6",
      features: [
        "Everything in Standard",
        "Unlimited active employees",
        "Dedicated account manager",
        "Custom onboarding session",
        "Priority phone support",
        "Custom report exports",
      ],
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <AnimateIn className="text-center mb-14">
          <p className="text-em font-mono text-xs uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="font-serif text-navy text-3xl sm:text-4xl mb-4">
            Simple, flat monthly plans
          </h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm sm:text-base">
            No free trial, but you can explore the interactive demo before you sign up.
            All plans billed monthly, cancel anytime.
          </p>
        </AnimateIn>

        <AnimateIn delay={1}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className="bg-navy rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col relative"
              >
                {tier.popular && (
                  <div
                    className="absolute top-0 left-0 right-0 text-center py-1.5 text-xs font-mono font-bold tracking-widest"
                    style={{ background: tier.color, color: "#002147" }}
                  >
                    MOST POPULAR
                  </div>
                )}
                <div className={`px-6 sm:px-7 pb-6 text-white ${tier.popular ? "pt-10" : "pt-8"}`}>
                  <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: tier.color }}>
                    {tier.name}
                  </p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="font-serif text-4xl sm:text-5xl font-bold">{tier.price}</span>
                    <span className="text-white/50 font-mono text-sm mb-1">{tier.unit}</span>
                  </div>
                  <p className="font-mono text-xs text-white/40 mb-6">{tier.limit}</p>
                  <div className="space-y-2.5">
                    {tier.features.map((f) => (
                      <div key={f} className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: tier.color }} />
                        <span className="text-white/70 text-sm">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-6 sm:px-7 pb-8 mt-auto">
                  <Link
                    href="/signup"
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold transition-colors text-sm"
                    style={{
                      background: tier.popular ? tier.color : "rgba(255,255,255,0.08)",
                      color: tier.popular ? "#002147" : "#fff",
                    }}
                  >
                    Choose {tier.name}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-slate-400 text-xs font-mono mt-8">
            All plans include unlimited payslip runs, LRA & NASSCORP compliance, dual‑currency, and PDF generation.
            <br />
            Payroll management tools (multi‑period reporting, direct deposit, disbursements) coming later this year.
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="py-20 sm:py-24 bg-navy noise text-center">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <AnimateIn>
          <Zap className="w-10 h-10 text-em mx-auto mb-5" />
          <h2 className="font-serif text-white text-3xl sm:text-4xl mb-5 leading-tight">
            Ready to generate accurate payslips?
          </h2>
          <p className="text-white/50 mb-8 leading-relaxed text-sm sm:text-base">
            Join Liberian businesses that have replaced messy spreadsheets with Slipdesk.
           Just a tool you can rely on from day one.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-7 sm:px-8 py-3.5 sm:py-4 bg-em text-navy font-bold rounded-xl hover-em transition-colors text-base sm:text-lg"
            >
              Sign up and start today
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 px-7 sm:px-8 py-3.5 sm:py-4 border border-emerald-500/40 text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors text-base sm:text-lg"
            >
              Try the demo first
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="mt-6 text-white/30 text-sm font-mono">
            <Lock className="w-3 h-3 inline mr-1" />
            Built in Liberia · Data encrypted · Pay via MTN Mobile Money
          </p>
          <p className="mt-4 text-white/20 text-xs font-mono">
            Full payroll tools coming soon 👀
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-slate-900 py-10 sm:py-12 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/Slipdesk_Logo_.png"
            alt="Slipdesk"
            width={24}
            height={24}
            className="rounded object-contain"
            style={{ background: "white", padding: "2px" }}
          />
          <span className="text-white/60 text-sm font-mono">Slipdesk</span>
          <span className="text-white/20 text-sm mx-1">·</span>
          <span className="text-white/30 text-xs font-mono hidden sm:inline">
            LRA & NASSCORP Compliant Payslips
          </span>
        </Link>
        <div className="flex gap-4 sm:gap-6 text-white/30 text-xs font-mono">
          <Link href="/legal?tab=privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
          <Link href="/legal"             className="hover:text-white/60 transition-colors">Terms</Link>
          <Link href="/demo"              className="hover:text-white/60 transition-colors">Demo</Link>
          <a    href="#features"          className="hover:text-white/60 transition-colors">Features</a>
          <a    href="mailto:hello@slipdesk.com" className="hover:text-white/60 transition-colors">Support</a>
        </div>
        <p className="text-white/20 text-xs font-mono">
          © {new Date().getFullYear()} Slipdesk · Monrovia, Liberia
        </p>
      </div>
    </footer>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function LandingPageClient() {
  return (
    <>
      {FONT_LINK}
      <Nav />
      <main>
        <Hero />
        <PainBanner />
        <Features />
        <Compliance />
        <Stats />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </>
  );
}