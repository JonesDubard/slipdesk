"use client";

import { useEffect, useState } from "react";
import { Loader, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ChangeRequestFieldType, ChangeRequestRecord } from "@/lib/employee-portal/change-requests";
import type { LinkedEmployee } from "@/lib/employee-portal/session";

export default function PortalRequestsPage() {
  const [employee, setEmployee] = useState<LinkedEmployee | null>(null);
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [fieldType, setFieldType] = useState<ChangeRequestFieldType>("address");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [momoNumber, setMomoNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    const [meRes, reqRes] = await Promise.all([
      fetch("/api/employee/me"),
      fetch("/api/employee/change-requests"),
    ]);
    const me = await meRes.json();
    const req = await reqRes.json();
    if (me.employee) {
      setEmployee(me.employee);
      setAddress(me.employee.address || "");
      setPhone(me.employee.phone || "");
      setPaymentMethod(me.employee.paymentMethod || "bank_transfer");
      setBankName(me.employee.bankName || "");
      setAccountNumber(me.employee.accountNumber || "");
      setBankBranch(me.employee.bankBranch || "");
      setMomoNumber(me.employee.momoNumber || "");
    }
    setRequests(req.requests ?? []);
  }

  useEffect(() => {
    refresh()
      .catch(() => setError("Could not load requests."))
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      let newValue: Record<string, unknown> = {};
      if (fieldType === "address") newValue = { address };
      else if (fieldType === "phone") newValue = { phone };
      else {
        newValue = { paymentMethod, bankName, accountNumber, bankBranch, momoNumber };
      }

      const res = await fetch("/api/employee/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldType, newValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not submit request.");
        return;
      }
      setSuccess("Request submitted. HR must approve before any change is applied.");
      await refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">Change requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Updates never apply automatically — they go to an HR approval queue and are audited.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {success}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          What do you want to update?
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as ChangeRequestFieldType)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="address">Address</option>
            <option value="bank_details">Bank / payment details</option>
            <option value="phone">Phone number</option>
          </select>
        </label>

        {fieldType === "address" && (
          <label className="block text-sm font-medium text-slate-700">
            New address
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
        )}

        {fieldType === "phone" && (
          <label className="block text-sm font-medium text-slate-700">
            New phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
        )}

        {fieldType === "bank_details" && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="mtn_momo">MTN MoMo</option>
                <option value="orange_money">Orange Money</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            {paymentMethod === "bank_transfer" && (
              <>
                <Field label="Bank name" value={bankName} onChange={setBankName} />
                <Field label="Account number" value={accountNumber} onChange={setAccountNumber} />
                <Field label="Bank branch" value={bankBranch} onChange={setBankBranch} />
              </>
            )}
            {(paymentMethod === "mtn_momo" || paymentMethod === "orange_money") && (
              <Field label="Mobile money number" value={momoNumber} onChange={setMomoNumber} />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !employee}
          className="w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader className="w-4 h-4 animate-spin" />}
          Submit for HR approval
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Your requests</h2>
        {!requests.length ? (
          <p className="text-sm text-slate-400">No requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-800 capitalize">{r.fieldType.replace("_", " ")}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                {r.rejectionReason && (
                  <p className="text-xs text-red-500 mt-1">{r.rejectionReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "bg-red-50 text-red-600"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${styles}`}>
      {status}
    </span>
  );
}
