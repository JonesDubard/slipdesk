"use client";

/**
 * Slipdesk — Support & Contact Page
 * Place at: src/app/(marketing)/support/page.tsx
 *
 * Matches the landing page aesthetic exactly:
 * Navy #002147 · Emerald #50C878 · DM Sans · DM Mono
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Mail, MessageSquare, ChevronDown, ChevronUp,
  ArrowRight, CheckCircle2, Phone, Clock,
  BookOpen, Zap, Shield, DollarSign,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FAQ {
  q: string;
  a: string;
  icon: React.ElementType;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const FAQS: FAQ[] = [
  {
    icon: DollarSign,
    q: "How does pricing work? Are there hidden fees?",
    a: "Slipdesk charges $0.75 per active employee per month — nothing else. No setup fee, no annual contract, no minimum. If you have 10 employees, you pay $7.50 that month. If you add 5 more mid-month, the next invoice reflects 15. You only pay for employees you actually run payroll for.",
  },
  {
    icon: Shield,
    q: "Is Slipdesk compliant with LRA and NASSCORP requirements?",
    a: "Yes. Slipdesk applies all four LRA income tax brackets (0%, 5%, 15%, 25%) using the official LRD thresholds, annualises gross pay correctly before applying brackets, and splits NASSCORP contributions exactly — 4% employee, 6% employer — applied to regular salary only, not overtime or holiday pay. Every payslip carries your LRA TIN and NASSCORP registration number.",
  },
  {
    icon: Zap,
    q: "My employees are paid in both USD and LRD. Can Slipdesk handle that?",
    a: "Yes, that is exactly what Slipdesk was built for. Each employee can be set to USD or LRD. For USD employees, Slipdesk converts to LRD using the exchange rate you set, applies the LRA brackets, then converts the tax back to USD for the deduction. You set the exchange rate at the start of each pay run so it always matches the current CBL rate.",
  },
  {
    icon: BookOpen,
    q: "What information do I need to get started?",
    a: "You need your company's LRA TIN and NASSCORP registration number, and for each employee: full name, employee number, job title, department, payment currency (USD or LRD), and hourly rate. You can add employees one by one or import them all at once using our CSV template.",
  },
  {
    icon: MessageSquare,
    q: "Can I preview the payslip calculations before paying for a subscription?",
    a: "Yes. The full payroll grid — gross pay, NASSCORP deductions, LRA income tax, and net pay — is always visible and recalculates in real time as you edit. You only need an active subscription to download the PDF payslips. This way you can verify every number is correct before you commit.",
  },
  {
    icon: Clock,
    q: "How long does it take to run payroll for my team?",
    a: "For a team already set up in Slipdesk, running a pay run takes under five minutes. You set the pay period, confirm or adjust hours, review the grid, and download all payslips at once. If you import hours via CSV it is even faster. First-time setup — adding your company details and employee records — takes about 15–20 minutes.",
  },
  {
    icon: Phone,
    q: "Do you support Orange Money and bank transfers on payslips?",
    a: "Yes. When you set up each employee you can choose their payment method: Cash, Bank Transfer (with bank name and account number), Orange Money, or MoMo. The payment details print directly on their payslip so there is no ambiguity on payday.",
  },
  {
    icon: Mail,
    q: "What happens if I have a question or something looks wrong?",
    a: "Email us at helloslipdesk@gmail.com or use the contact form on this page. We respond within one business day for all plan questions and within a few hours for anything that looks like a calculation error. We take compliance accuracy seriously — if something looks off, tell us immediately.",
  },
];

// ─── Nav (reused from landing page) ──────────────────────────────────────────

function Nav() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-md"
      style={{ backgroundColor: "rgba(0,33,71,0.95)" }}
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
          <Link href="/#features"   className="hover:text-white transition-colors">Features</Link>
          <Link href="/#compliance" className="hover:text-white transition-colors">Compliance</Link>
          <Link href="/#pricing"    className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/support"     className="text-[#50C878] font-medium">Support</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login"  className="text-sm text-white/70 hover:text-white transition-colors hidden md:inline">Sign in</Link>
          <Link href="/signup" className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors whitespace-nowrap">
            Start free →
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FAQItem({ faq, index }: { faq: FAQ; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const Icon = faq.icon;

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden
        ${open
          ? "border-emerald-200 bg-white shadow-sm shadow-emerald-50"
          : "border-slate-200 bg-white hover:border-slate-300"
        }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-4 px-5 py-5 text-left"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
          ${open ? "bg-[#002147]" : "bg-slate-100"}`}>
          <Icon className={`w-4 h-4 transition-colors ${open ? "text-[#50C878]" : "text-slate-400"}`} />
        </div>
        <span className={`flex-1 text-sm font-semibold leading-snug pt-1 transition-colors
          ${open ? "text-[#002147]" : "text-slate-700"}`}>
          {faq.q}
        </span>
        <div className="flex-shrink-0 mt-1">
          {open
            ? <ChevronUp   className="w-4 h-4 text-[#50C878]" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pl-[68px]">
          <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Contact Form ─────────────────────────────────────────────────────────────

function ContactForm() {
  const [form, setForm] = useState({
    name:    "",
    email:   "",
    company: "",
    topic:   "general",
    message: "",
  });
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: wire to your email service (Resend, Mailgun, etc.)
    // For now: simulate send
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1200);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-8 h-8 text-[#50C878]" />
        </div>
        <h3 className="text-xl font-bold text-[#002147] mb-2">Message sent!</h3>
        <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
          We&apos;ll get back to you at <strong>{form.email}</strong> within one business day.
        </p>
        <button
          onClick={() => { setSent(false); setForm({ name: "", email: "", company: "", topic: "general", message: "" }); }}
          className="mt-6 text-sm text-[#50C878] hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
            Your Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Moses Kollie"
            required
            className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                       bg-white text-slate-800 placeholder-slate-300"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
            Work Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@company.lr"
            required
            className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                       bg-white text-slate-800 placeholder-slate-300"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
          Company Name
        </label>
        <input
          type="text"
          value={form.company}
          onChange={(e) => set("company", e.target.value)}
          placeholder="Acme Trading Co."
          className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                     bg-white text-slate-800 placeholder-slate-300"
        />
      </div>

      <div>
        <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
          Topic
        </label>
        <select
          value={form.topic}
          onChange={(e) => set("topic", e.target.value)}
          className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                     bg-white text-slate-800 appearance-none"
        >
          <option value="general">General question</option>
          <option value="calculation">Calculation or compliance issue</option>
          <option value="billing">Billing or payment</option>
          <option value="setup">Getting started / setup help</option>
          <option value="bug">Something is broken</option>
          <option value="feedback">Feedback or feature request</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
          Message
        </label>
        <textarea
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="Describe your question or issue in as much detail as you can..."
          required
          rows={5}
          className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                     bg-white text-slate-800 placeholder-slate-300 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                   bg-[#002147] text-white font-bold text-sm
                   hover:bg-[#002147]/80 transition-colors disabled:opacity-60"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>Send message <ArrowRight className="w-4 h-4" /></>
        )}
      </button>

      <p className="text-center text-xs text-slate-300">
        We typically respond within one business day.
      </p>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:opsz,wght@9..40,400;9..40,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        .font-serif { font-family:'Libre Baskerville',Georgia,serif; }
        .font-mono  { font-family:'DM Mono',monospace; }
      `}</style>

      <Nav />

      <main className="pt-16">

        {/* ── Hero ── */}
        <section className="bg-[#002147] py-20 sm:py-24 relative overflow-hidden">
          {/* subtle grid background matching landing page */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#50C878" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
            <span className="inline-flex items-center gap-2 text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#50C878] animate-pulse" />
              We&apos;re here to help
            </span>
            <h1 className="font-serif text-white text-3xl sm:text-5xl leading-tight mb-4">
              Support &amp; Contact
            </h1>
            <p className="text-white/50 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
              Questions about payroll, compliance, or your account? We answer every message personally.
            </p>

            {/* Quick contact chips */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              <a
                href="mailto:helloslipdesk@gmail.com"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 border border-white/20
                           text-white/80 text-sm hover:bg-white/20 transition-colors"
              >
                <Mail className="w-4 h-4 text-[#50C878]" />
                helloslipdesk@gmail.com
              </a>
              <a
                href="https://wa.me/4915231657334"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 border border-white/20
                           text-white/80 text-sm hover:bg-white/20 transition-colors"
              >
                <Phone className="w-4 h-4 text-[#50C878]" />
                WhatsApp: +49 1523 1657 334
              </a>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 border border-white/20 text-white/50 text-sm">
                <Clock className="w-4 h-4 text-[#50C878]" />
                Mon – Fri · 8am – 6pm WAT
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact channels ── */}
        <section className="bg-slate-50 py-12 border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid sm:grid-cols-3 gap-4">

              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#002147] flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#50C878]" />
                </div>
                <div>
                  <p className="font-semibold text-[#002147] text-sm">Email Support</p>
                  <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                    Best for billing questions, account issues, and detailed compliance queries.
                  </p>
                </div>
                <a
                  href="mailto:helloslipdesk@gmail.com"
                  className="mt-auto text-[#50C878] text-sm font-semibold hover:underline flex items-center gap-1"
                >
                  helloslipdesk@gmail.com <ArrowRight className="w-3.5 h-3.5" />
                </a>
                <p className="text-xs text-slate-300 font-mono">Response within 1 business day</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#002147] flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#50C878]" />
                </div>
                <div>
                  <p className="font-semibold text-[#002147] text-sm">WhatsApp</p>
                  <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                    Fastest option for quick questions, screenshots of errors, or urgent payroll issues.
                  </p>
                </div>
                <a
                  href="https://wa.me/231777744331"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto text-[#50C878] text-sm font-semibold hover:underline flex items-center gap-1"
                >
                  +231 777 744 331 <ArrowRight className="w-3.5 h-3.5" />
                </a>
                <p className="text-xs text-slate-300 font-mono">Mon – Fri, 8am – 6pm WAT</p>
              </div>

              <div className="bg-[#002147] rounded-2xl p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#50C878]" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">New to Slipdesk?</p>
                  <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                    Create a free account and run your first payroll. No credit card needed — see the calculations before you pay anything.
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="mt-auto flex items-center gap-1.5 px-4 py-2.5 bg-[#50C878] text-[#002147] rounded-xl
                             text-sm font-bold hover:bg-[#3aa85f] transition-colors w-fit"
                >
                  Get started free <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

            </div>
          </div>
        </section>

        {/* ── FAQ + Form side by side ── */}
        <section className="py-16 sm:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">

              {/* FAQ */}
              <div>
                <p className="text-[#50C878] font-mono text-xs uppercase tracking-widest mb-3">
                  Common questions
                </p>
                <h2 className="font-serif text-[#002147] text-2xl sm:text-3xl mb-8 leading-tight">
                  Answers to what<br />people ask most
                </h2>
                <div className="space-y-3">
                  {FAQS.map((faq, i) => (
                    <FAQItem key={faq.q} faq={faq} index={i} />
                  ))}
                </div>
              </div>

              {/* Contact form */}
              <div>
                <p className="text-[#50C878] font-mono text-xs uppercase tracking-widest mb-3">
                  Send a message
                </p>
                <h2 className="font-serif text-[#002147] text-2xl sm:text-3xl mb-8 leading-tight">
                  Can&apos;t find<br />your answer?
                </h2>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 sm:p-8">
                  <ContactForm />
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── Bottom CTA strip ── */}
        <section className="bg-[#002147] py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-white font-semibold text-lg">Ready to simplify your payroll?</p>
              <p className="text-white/40 text-sm mt-1">
                Join Liberian businesses running error-free, compliant payroll with Slipdesk.
              </p>
            </div>
            <Link
              href="/signup"
              className="flex items-center gap-2 px-6 py-3 bg-[#50C878] text-[#002147] font-bold rounded-xl
                         hover:bg-[#3aa85f] transition-colors whitespace-nowrap flex-shrink-0"
            >
              Start free today <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-slate-900 py-10 border-t border-white/5">
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
                LRA & NASSCORP Compliant Payroll
              </span>
            </Link>
            <div className="flex gap-4 sm:gap-6 text-white/30 text-xs font-mono">
              <Link href="/legal?tab=privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
              <Link href="/legal"             className="hover:text-white/60 transition-colors">Terms</Link>
              <Link href="/#features"         className="hover:text-white/60 transition-colors">Features</Link>
              <Link href="/support"           className="text-[#50C878]">Support</Link>
            </div>
            <p className="text-white/20 text-xs font-mono">
              © {new Date().getFullYear()} Slipdesk · Monrovia, Liberia
            </p>
          </div>
        </footer>

      </main>
    </>
  );
}