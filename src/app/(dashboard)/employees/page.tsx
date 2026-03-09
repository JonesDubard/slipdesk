"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  X,
  ChevronDown,
  Users,
  Edit3,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { MOCK_EMPLOYEES, type Employee } from "@/lib/mock-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPARTMENTS = ["All", "Operations", "Finance", "Engineering", "Sales", "Human Resources"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contractor", "casual"] as const;
const COUNTIES = ["Montserrado", "Margibi", "Bong", "Nimba", "Lofa", "Grand Bassa", "Sinoe"];

const EMPTY_EMPLOYEE: Omit<Employee, "id" | "employeeNumber" | "fullName"> = {
  firstName: "",
  lastName: "",
  jobTitle: "",
  department: "Operations",
  email: "",
  phone: "",
  county: "Montserrado",
  startDate: "",
  employmentType: "full_time",
  currency: "USD",
  rate: 0,
  standardHours: 173.33,
  isActive: true,
  nasscorpNumber: "",
  bankName: "",
};

// ─── Badge helpers ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    full_time:  "bg-blue-100 text-blue-700",
    part_time:  "bg-purple-100 text-purple-700",
    contractor: "bg-orange-100 text-orange-700",
    casual:     "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full capitalize ${colors[type] ?? "bg-slate-100 text-slate-600"}`}>
      {type.replace("_", " ")}
    </span>
  );
}

// ─── Add/Edit Drawer ──────────────────────────────────────────────────────────

function EmployeeDrawer({
  employee,
  onClose,
  onSave,
}: {
  employee: Partial<Employee> | null;
  onClose: () => void;
  onSave: (data: Partial<Employee>) => void;
}) {
  const isNew = !employee?.id;
  const [form, setForm] = useState<Partial<Employee>>(
    employee ?? { ...EMPTY_EMPLOYEE }
  );

  const set = (field: keyof Employee, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const Field = ({
    label,
    field,
    type = "text",
    placeholder = "",
  }: {
    label: string;
    field: keyof Employee;
    type?: string;
    placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={String(form[field] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set(field, type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl
                   focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                   bg-white text-slate-800 placeholder-slate-300"
      />
    </div>
  );

  const Select = ({
    label,
    field,
    options,
  }: {
    label: string;
    field: keyof Employee;
    options: string[];
  }) => (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        <select
          value={String(form[field] ?? "")}
          onChange={(e) => set(field, e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                     focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                     bg-white text-slate-800"
        >
          {options.map((o) => (
            <option key={o} value={o}>{o.replace("_", " ")}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 text-base">
              {isNew ? "Add Employee" : "Edit Employee"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isNew ? "Fill in the details below" : `Editing ${employee?.fullName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Section: Personal */}
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Personal</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" field="firstName" placeholder="Moses" />
            <Field label="Last Name" field="lastName" placeholder="Kollie" />
          </div>
          <Field label="National ID / Passport" field="nasscorpNumber" placeholder="NSC-001-2024" />
          <Field label="Email" field="email" type="email" placeholder="m.kollie@company.lr" />
          <Field label="Phone" field="phone" placeholder="+231 770 000 000" />
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">County</label>
            <div className="relative">
              <select
                value={form.county ?? "Montserrado"}
                onChange={(e) => set("county", e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800"
              >
                {COUNTIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Section: Employment */}
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Employment</p>
          <Field label="Job Title" field="jobTitle" placeholder="Operations Manager" />
          <Field label="Department" field="department" placeholder="Operations" />
          <Field label="Start Date" field="startDate" type="date" />
          <Select label="Employment Type" field="employmentType" options={[...EMPLOYMENT_TYPES]} />

          {/* Section: Compensation */}
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Compensation</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Currency</label>
              <div className="flex gap-2">
                {(["USD", "LRD"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => set("currency", c)}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${
                      form.currency === c
                        ? "bg-[#002147] text-white border-[#002147]"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Hourly Rate" field="rate" type="number" placeholder="8.50" />
          </div>
          <Field label="Standard Monthly Hours" field="standardHours" type="number" placeholder="173.33" />
          <Field label="Bank Name" field="bankName" placeholder="Ecobank Liberia" />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl
                       text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(form);
              onClose();
            }}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl
                       bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors"
          >
            {isNew ? "Add Employee" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [drawerEmployee, setDrawerEmployee] = useState<Partial<Employee> | null | undefined>(undefined);

  // Filter
  const filtered = employees.filter((e) => {
    const matchSearch =
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.jobTitle.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === "All" || e.department === deptFilter;
    return matchSearch && matchDept;
  });

  const activeCount = employees.filter((e) => e.isActive).length;

  function handleSave(data: Partial<Employee>) {
    if (data.id) {
      // Edit existing
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === data.id
            ? { ...e, ...data, fullName: `${data.firstName} ${data.lastName}` }
            : e
        )
      );
    } else {
      // Add new
      const newEmp: Employee = {
        ...(data as Omit<Employee, "id" | "employeeNumber" | "fullName">),
        id: `EMP-${String(employees.length + 1).padStart(3, "0")}`,
        employeeNumber: `EMP-${String(employees.length + 1).padStart(3, "0")}`,
        fullName: `${data.firstName} ${data.lastName}`,
      };
      setEmployees((prev) => [...prev, newEmp]);
    }
  }

  function toggleActive(id: string) {
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isActive: !e.isActive } : e))
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} active · {employees.length} total
          </p>
        </div>
        <button
          onClick={() => setDrawerEmployee(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                     bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or title…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`px-3 py-2 text-xs font-mono rounded-xl border transition-all ${
                deptFilter === d
                  ? "bg-[#002147] text-white border-[#002147]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Full Time",   count: employees.filter((e) => e.employmentType === "full_time").length,  color: "bg-blue-100 text-blue-700" },
          { label: "Part Time",   count: employees.filter((e) => e.employmentType === "part_time").length,  color: "bg-purple-100 text-purple-700" },
          { label: "Contractors", count: employees.filter((e) => e.employmentType === "contractor").length, color: "bg-orange-100 text-orange-700" },
          { label: "Casual",      count: employees.filter((e) => e.employmentType === "casual").length,     color: "bg-slate-100 text-slate-600" },
        ].map((s) => (
          <div key={s.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${s.color}`}>
            <span className="text-xs font-mono font-semibold">{s.label}</span>
            <span className="text-lg font-bold">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["Employee", "Department", "Type", "Currency & Rate", "Hours/mo", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No employees found
                  </td>
                </tr>
              )}
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className={`border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/50
                    ${!emp.isActive ? "opacity-50" : ""}`}
                >
                  {/* Name */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#002147]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#002147] text-[10px] font-bold">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700">{emp.fullName}</p>
                        <p className="text-xs text-slate-400">{emp.employeeNumber} · {emp.jobTitle}</p>
                      </div>
                    </div>
                  </td>
                  {/* Department */}
                  <td className="px-4 py-3.5 text-slate-500">{emp.department}</td>
                  {/* Type */}
                  <td className="px-4 py-3.5"><TypeBadge type={emp.employmentType} /></td>
                  {/* Rate */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        emp.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}>{emp.currency}</span>
                      <span className="font-mono text-slate-700">
                        {emp.currency === "USD" ? "$" : "L$"}{emp.rate.toFixed(2)}/hr
                      </span>
                    </div>
                  </td>
                  {/* Hours */}
                  <td className="px-4 py-3.5 font-mono text-slate-500">{emp.standardHours}</td>
                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => toggleActive(emp.id)}
                      className="flex items-center gap-1.5 group"
                      title={emp.isActive ? "Click to deactivate" : "Click to activate"}
                    >
                      {emp.isActive
                        ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                        : <ToggleLeft className="w-5 h-5 text-slate-300" />
                      }
                      <span className={`text-xs font-mono ${emp.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                        {emp.isActive ? "Active" : "Inactive"}
                      </span>
                    </button>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setDrawerEmployee(emp)}
                      className="text-slate-400 hover:text-[#002147] transition-colors p-1 rounded-lg hover:bg-slate-100"
                      title="Edit employee"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NASSCORP reminder */}
      <p className="text-xs text-slate-400 font-mono text-center">
        All employees are enrolled in NASSCORP · Employer contributes 6% · Employee 4% of base salary
      </p>

      {/* Drawer */}
      {drawerEmployee !== undefined && (
        <EmployeeDrawer
          employee={drawerEmployee}
          onClose={() => setDrawerEmployee(undefined)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}