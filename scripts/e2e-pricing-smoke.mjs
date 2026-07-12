const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

const starter = [
  "Employee Management",
  "Payroll Management",
  "Unlimited Payroll Runs",
  "Payroll History",
  "PDF Payslips",
  "LRA Calculations",
  "NASSCORP Calculations",
  "CSV Employee Import",
  "Basic Dashboard",
  "Email Support",
];
const pro = [
  "Department Management",
  "Branch Management",
  "Payroll Approval Workflow",
  "Payroll Analytics",
  "Company Branding",
  "Bulk Payslip Generation",
  "Compliance Dashboard",
  "Department Reports",
  "Payroll Calendar",
  "Priority Support",
];
const ent = [
  "Multi-branch Organizations",
  "Advanced Role Permissions",
  "Audit Trail",
  "Executive Analytics",
  "Compliance History",
  "API Access",
  "Custom Reports",
  "Dedicated Onboarding",
  "Dedicated Account Manager",
  "Priority Phone Support",
];

const extras = [
  "$50",
  "$300",
  "$500",
  "Up to 80 employees",
  "Up to 500 employees",
  "Unlimited employees",
];

const routes = [
  "/",
  "/support",
  "/login",
  "/signup",
  "/dashboard",
  "/employees",
  "/payroll",
  "/analytics",
  "/compliance",
  "/reports",
  "/audit",
  "/team",
  "/settings",
  "/billing",
];

const res = await fetch(`${BASE}/`);
if (!res.ok) {
  console.error("HOME_FAIL", res.status);
  process.exit(1);
}
const html = await res.text();
const missing = [];
for (const f of [...starter, ...pro, ...ent, ...extras]) {
  if (!html.includes(f)) missing.push(f);
}

console.log(
  JSON.stringify(
    {
      homeStatus: res.status,
      missingFeatures: missing,
      hasPricingSection: html.includes("Pricing") && html.includes("Starter"),
    },
    null,
    2,
  ),
);

const routeResults = [];
for (const r of routes) {
  const rr = await fetch(`${BASE}${r}`, { redirect: "manual" });
  routeResults.push({
    route: r,
    status: rr.status,
    location: rr.headers.get("location"),
  });
}
console.log(JSON.stringify({ routes: routeResults }, null, 2));

if (missing.length) process.exit(2);
console.log("LIVE_PRICING_SMOKE_OK");
