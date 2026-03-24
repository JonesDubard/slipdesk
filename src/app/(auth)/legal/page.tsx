"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Shield, FileText } from "lucide-react";

type Tab = "terms" | "privacy";

const EFFECTIVE_DATE = "1 March 2026";
const COMPANY_NAME   = "Slipdesk Technologies";
const CONTACT_EMAIL  = "helloslipdesk@gmail.com";
const JURISDICTION   = "the Republic of Liberia";

function LegalContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("terms");

  useEffect(() => {
    if (searchParams.get("tab") === "privacy") setTab("privacy");
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'DM Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'DM Mono', monospace; }
        .prose h2 { font-size: 1rem; font-weight: 700; color: #1e293b; margin: 1.75rem 0 0.5rem; }
        .prose h3 { font-size: 0.875rem; font-weight: 600; color: #334155; margin: 1.25rem 0 0.375rem; }
        .prose p  { font-size: 0.875rem; color: #475569; line-height: 1.7; margin-bottom: 0.75rem; }
        .prose ul { margin: 0.5rem 0 0.75rem 1.25rem; list-style: disc; }
        .prose ul li { font-size: 0.875rem; color: #475569; line-height: 1.65; margin-bottom: 0.25rem; }
        .prose a  { color: #002147; text-decoration: underline; }
      `}</style>

      <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#002147] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5"/> Back to sign in
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#50C878] flex items-center justify-center">
              <Image src="/Slipdesk_Logo_.png" alt="Slipdesk" width={14} height={14}
                className="object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
            </div>
            <span className="text-sm font-bold text-[#002147]">Slipdesk</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Legal</h1>
          <p className="text-sm text-slate-400 mt-1">Effective {EFFECTIVE_DATE} · {COMPANY_NAME}</p>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-8">
          <button onClick={() => setTab("terms")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${tab === "terms" ? "bg-white text-[#002147] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <FileText className="w-3.5 h-3.5"/> Terms of Service
          </button>
          <button onClick={() => setTab("privacy")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${tab === "privacy" ? "bg-white text-[#002147] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Shield className="w-3.5 h-3.5"/> Privacy Policy
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          {tab === "terms" && (
            <div className="prose">
              <h2>1. Acceptance of Terms</h2>
              <p>By accessing or using Slipdesk (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service. These Terms constitute a legally binding agreement between you and {COMPANY_NAME} ("we", "us", or "our").</p>
              <h2>2. Description of Service</h2>
              <p>Slipdesk is a cloud-based payroll management platform designed for businesses operating in {JURISDICTION}. The Service provides payroll calculations, payslip generation, and compliance assistance with the Liberia Revenue Authority (LRA) PAYE regulations and NASSCORP contribution requirements.</p>
              <p><strong>Important:</strong> Slipdesk is a software tool only. We do not provide legal, tax, or accounting advice. Payroll calculations are provided as a convenience. You remain solely responsible for verifying compliance with applicable Liberian law and remitting taxes and contributions to the relevant authorities.</p>
              <h2>3. Account Registration</h2>
              <p>You must register for an account to use the Service. You agree to provide accurate, current, and complete information during registration, and to keep your account information updated. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.</p>
              <h2>4. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul>
                <li>Use the Service for any unlawful purpose or in violation of any applicable regulation</li>
                <li>Upload false employee data or use the Service to facilitate payroll fraud</li>
                <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Resell or sublicense access to the Service without our written consent</li>
              </ul>
              <h2>5. Subscription and Payment</h2>
              <p>Slipdesk is offered on a subscription basis. Pricing is displayed within the application and is subject to change with 30 days' notice. All fees are in United States Dollars (USD) unless otherwise stated. Subscriptions are billed monthly and are non-refundable except as required by applicable law.</p>
              <p>Your free trial, if applicable, will automatically convert to a paid subscription unless you cancel before the trial period ends. We reserve the right to suspend access to the Service if payment is not received within 7 days of the due date.</p>
              <h2>6. Data Ownership</h2>
              <p>You retain full ownership of all employee data, payroll records, and other content you upload to the Service ("Your Data"). By using the Service, you grant us a limited licence to store, process, and display Your Data solely to provide the Service to you.</p>
              <p>We will not sell, share, or use Your Data for any purpose other than providing and improving the Service, except as required by law.</p>
              <h2>7. Service Availability</h2>
              <p>We strive to maintain high availability but do not guarantee uninterrupted access. We may perform scheduled or emergency maintenance that results in temporary downtime. We will provide reasonable advance notice of scheduled maintenance where practicable.</p>
              <h2>8. Limitation of Liability</h2>
              <p>To the maximum extent permitted by applicable law, {COMPANY_NAME} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to errors in payroll calculations, tax penalties, or losses arising from system downtime.</p>
              <p>Our total aggregate liability to you shall not exceed the total fees paid by you to us in the twelve (12) months preceding the event giving rise to the claim.</p>
              <h2>9. Termination</h2>
              <p>Either party may terminate this agreement at any time. Upon termination, you may request an export of Your Data within 30 days. After that period, we reserve the right to delete Your Data from our systems in accordance with our data retention policy.</p>
              <p>We reserve the right to suspend or terminate accounts that violate these Terms immediately and without notice.</p>
              <h2>10. Governing Law</h2>
              <p>These Terms are governed by and construed in accordance with the laws of {JURISDICTION}. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of {JURISDICTION}.</p>
              <h2>11. Changes to Terms</h2>
              <p>We may update these Terms from time to time. We will notify you of material changes by email or by displaying a notice within the Service at least 14 days before the changes take effect. Continued use of the Service after that date constitutes acceptance of the updated Terms.</p>
              <h2>12. Contact</h2>
              <p>Questions about these Terms? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
            </div>
          )}

          {tab === "privacy" && (
            <div className="prose">
              <h2>1. Introduction</h2>
              <p>{COMPANY_NAME} ("we", "us", "our") is committed to protecting the personal information of our customers and their employees. This Privacy Policy explains what data we collect, how we use it, and your rights in relation to it.</p>
              <h2>2. Data We Collect</h2>
              <h3>Account Data</h3>
              <p>When you register, we collect your email address, company name, and any other information you provide during onboarding (e.g. TIN, NASSCORP number, company logo).</p>
              <h3>Employee Data</h3>
              <p>You may upload personal data about your employees including names, job titles, salary information, payment method details, and government identification numbers. This data is processed solely on your instruction to deliver the payroll service.</p>
              <h3>Usage Data</h3>
              <p>We collect standard server logs including IP addresses, browser type, pages visited, and timestamps. This data is used for security monitoring and service improvement.</p>
              <h2>3. How We Use Your Data</h2>
              <ul>
                <li>To provide, maintain, and improve the Service</li>
                <li>To send transactional emails (e.g. invoices, password resets)</li>
                <li>To detect and prevent fraud and abuse</li>
                <li>To comply with legal obligations</li>
              </ul>
              <p>We do <strong>not</strong> sell personal data to third parties. We do not use employee data for advertising or profiling.</p>
              <h2>4. Data Storage and Security</h2>
              <p>Your data is stored on servers provided by Supabase, Inc., which maintains SOC 2 Type II compliance. Data is encrypted at rest and in transit using industry-standard encryption. We apply row-level security controls to ensure each company can only access its own data.</p>
              <p>Despite these measures, no system is completely secure. We cannot guarantee absolute security and are not liable for unauthorised access that is beyond our reasonable control.</p>
              <h2>5. Data Retention</h2>
              <p>We retain Your Data for as long as your account is active, plus a grace period of 30 days after termination during which you may request an export. Payroll records may be retained for up to 7 years to comply with Liberian tax record-keeping requirements unless you request earlier deletion where legally permissible.</p>
              <h2>6. Third-Party Services</h2>
              <p>We use the following third-party services to operate the platform:</p>
              <ul>
                <li><strong>Supabase</strong> — database, authentication, and file storage</li>
                <li><strong>Flutterwave</strong> — payment processing (billing only, not payroll)</li>
                <li><strong>Vercel</strong> — application hosting</li>
              </ul>
              <p>Each of these providers has their own privacy policy. We select providers that meet appropriate data protection standards.</p>
              <h2>7. Your Rights</h2>
              <p>You have the right to:</p>
              <ul>
                <li>Access the personal data we hold about you</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data (subject to legal retention obligations)</li>
                <li>Export your data in a machine-readable format</li>
                <li>Object to certain processing activities</li>
              </ul>
              <p>To exercise any of these rights, email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within 30 days.</p>
              <h2>8. Cookies</h2>
              <p>Slipdesk uses strictly necessary cookies for authentication (session tokens). We do not use advertising cookies or third-party tracking cookies. You cannot opt out of strictly necessary cookies without losing access to the Service.</p>
              <h2>9. Children</h2>
              <p>The Service is intended for business use only and is not directed at individuals under 18 years of age. We do not knowingly collect data from minors.</p>
              <h2>10. Changes to This Policy</h2>
              <p>We may update this Privacy Policy periodically. We will notify you of material changes by email or in-app notice. Continued use of the Service after the effective date of any changes constitutes acceptance of the updated policy.</p>
              <h2>11. Contact</h2>
              <p>Data protection queries can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
            </div>
          )}
        </div>

        <div className="text-center mt-8">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#002147] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5"/> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LegalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <LegalContent />
    </Suspense>
  );
}