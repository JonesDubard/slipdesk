const fs = require("fs");
const p = "src/app/(dashboard)/payroll/page.tsx";
let s = fs.readFileSync(p, "utf8");

const needle =
  '  if(!calc) throw new Error("No calculation data");\n  const sym=currency==="USD"?"$":"L$";\n\n  const buildDoc';
const repl =
  '  if(!calc) throw new Error("No calculation data");\n  const sym=currency==="USD"?"$":"L$";\n  const NAVY = company.brandPrimaryColor?.trim() || PDF_NAVY;\n  const EMERALD = company.brandSecondaryColor?.trim() || PDF_EMERALD;\n\n  const buildDoc';

if (!s.includes(needle)) {
  console.error("needle missing");
  process.exit(1);
}
s = s.replace(needle, repl);

const start = s.indexOf("const NAVY = company.brandPrimaryColor");
const end = s.indexOf("const earningsRows=[");
if (start < 0 || end < 0) {
  console.error("bounds fail", start, end);
  process.exit(1);
}
let mid = s.slice(start, end);
mid = mid.replaceAll("borderBottomColor:PDF_NAVY", "borderBottomColor:NAVY");
mid = mid.replaceAll("color:PDF_NAVY", "color:NAVY");
mid = mid.replaceAll("backgroundColor:PDF_NAVY", "backgroundColor:NAVY");
mid = mid.replaceAll("color:PDF_EMERALD", "color:EMERALD");
mid = mid.replaceAll("backgroundColor:PDF_EMERALD", "backgroundColor:EMERALD");
s = s.slice(0, start) + mid + s.slice(end);

const oldPdf =
  'payslipFooter: canUse("companyBranding", effectiveTier) ? company.payslipFooter : undefined,\n  };';
const newPdf =
  'payslipFooter: canUse("companyBranding", effectiveTier) ? company.payslipFooter : undefined,\n    brandPrimaryColor: canUse("companyBranding", effectiveTier) ? company.brandPrimaryColor : undefined,\n    brandSecondaryColor: canUse("companyBranding", effectiveTier) ? company.brandSecondaryColor : undefined,\n  };';
if (!s.includes(oldPdf)) {
  console.error("pdfCompany block missing");
  process.exit(1);
}
s = s.replace(oldPdf, newPdf);

fs.writeFileSync(p, s);
console.log("payroll branding patched");
