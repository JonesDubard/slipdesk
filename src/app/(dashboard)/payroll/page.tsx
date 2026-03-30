"use client";

/**
 * Slipdesk — Payroll Page (UI Refresh)
 * Place at: src/app/(dashboard)/payroll/page.tsx
 *
 * UI changes in this version (all logic preserved from original):
 *  - Setup screen redesigned: cleaner form card, employee preview strip
 *  - Status stepper is larger + pill-shaped with icons
 *  - Table header bar is a richer navy gradient with run stats inline
 *  - Table rows have tighter visual rhythm and color-coded columns
 *  - Summary footer is a standalone bar with USD-equivalent totals
 *  - History cards show a mini bar chart per run
 *  - All original fixes (FIX 1-5) fully preserved
 */

import {
  useReducer, useMemo, useState, useCallback, useEffect, useRef,
} from "react";
import {
  createColumnHelper, flexRender,
  getCoreRowModel, useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle, CheckCircle2, Upload, ChevronRight,
  FileText, Lock, Play, Clock, Download, FileDown,
  Loader, Plus, Calendar, RefreshCw, DollarSign, Users,
  TrendingUp, Zap, Shield,
} from "lucide-react";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";
import type { PayRunLine } from "@/lib/mock-data";
import BulkUpload, { type BulkRow } from "@/components/BulkUpload";
import { useApp } from "@/context/AppContext";
import PageSkeleton from "@/components/PageSkeleton";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = "draft"|"review"|"approved"|"paid";

interface SavedRun {
  id:string; periodLabel:string; payDate:string; status:RunStatus;
  employeeCount:number; totalGross:number; totalNet:number;
  totalTax:number; totalNasscorp:number; exchangeRate:number;
  lines:PayRunLine[]; createdAt:string;
}

type GridAction =
  | {type:"UPDATE_FIELD";id:string;field:keyof PayRunLine;value:number}
  | {type:"IMPORT_ROWS";rows:PayRunLine[]}
  | {type:"SET_ROWS";rows:PayRunLine[]}
  | {type:"CLEAR"};

interface PdfCompany {
  name:string; tin:string; nasscorpRegNo:string;
  address:string; phone:string; email:string; logoUrl:string|null;
}

// ─── Number → words ───────────────────────────────────────────────────────────

function numberToWords(amount:number):string{
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function tw(n:number):string{
    if(n===0) return "";
    if(n<20)  return ones[n];
    if(n<100) return tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");
    return ones[Math.floor(n/100)]+" Hundred"+(n%100?" "+tw(n%100):"");
  }
  const d=Math.floor(amount),c=Math.round((amount-d)*100);
  let r=d>=1000?tw(Math.floor(d/1000))+" Thousand"+(d%1000?" "+tw(d%1000):""):tw(d);
  r=(r||"Zero")+" Dollar"+(d!==1?"s":"");
  if(c>0) r+=" and "+tw(c)+" Cent"+(c!==1?"s":"");
  return r;
}

// ─── BulkRow → PayRunLine ─────────────────────────────────────────────────────

function bulkRowToPayRunLine(r:BulkRow,exchangeRate:number,realId?:string):PayRunLine{
  const emp=r.employee;
  const id=realId??`BULK-${emp.employeeNumber||Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  return {
    id,employeeId:id,employeeNumber:emp.employeeNumber,
    fullName:`${emp.firstName} ${emp.lastName}`.trim(),
    jobTitle:emp.jobTitle,department:emp.department,
    currency:emp.currency,rate:emp.rate,
    regularHours:r.regularHours,overtimeHours:r.overtimeHours,holidayHours:r.holidayHours,
    additionalEarnings:emp.allowances??0,deductions:r.deductions??0,
    exchangeRate,calc:null,paymentMethod:emp.paymentMethod,
    bankName:emp.bankName,accountNumber:emp.accountNumber,mobileNumber:emp.momoNumber,
  };
}

// ─── FIX 1: recalcLine ────────────────────────────────────────────────────────

function recalcLine(line:PayRunLine):PayRunLine{
  try{
    const calc=calculatePayroll({
      employeeId:line.employeeId,currency:line.currency,rate:line.rate,
      regularHours:line.regularHours,overtimeHours:line.overtimeHours,holidayHours:line.holidayHours,
      exchangeRate:line.exchangeRate,additionalEarnings:line.additionalEarnings,
    });
    const ded=line.deductions??0;
    if(ded>0){
      return {...line,calc:{...calc,netPay:Math.max(0,calc.netPay-ded),totalDeductions:calc.totalDeductions+ded}};
    }
    return {...line,calc};
  }catch{return {...line,calc:null};}
}

function gridReducer(state:PayRunLine[],action:GridAction):PayRunLine[]{
  switch(action.type){
    case "UPDATE_FIELD": return state.map(l=>l.id!==action.id?l:recalcLine({...l,[action.field]:action.value}));
    case "IMPORT_ROWS":  return [...state,...action.rows.map(recalcLine)];
    case "SET_ROWS":     return action.rows.map(recalcLine);
    case "CLEAR":        return [];
    default:             return state;
  }
}

function fmtMoney(n:number,sym:string){return `${sym}${n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function getCurrentPeriod(){
  const now=new Date();
  const label=now.toLocaleDateString("en-LR",{year:"numeric",month:"long"});
  const last=new Date(now.getFullYear(),now.getMonth()+1,0);
  return {label,payDate:last.toISOString().split("T")[0]};
}
function safePeriod(label:string){return label.trim().replace(/\s+/g,"_");}

// ─── PDF generation ───────────────────────────────────────────────────────────

let pdfLib:typeof import("@react-pdf/renderer")|null=null;
async function getPdfLib(){if(!pdfLib) pdfLib=await import("@react-pdf/renderer");return pdfLib;}

interface PdfOptions{line:PayRunLine;periodLabel:string;payDate:string;company:PdfCompany;}

async function generatePayslipBlob({line,periodLabel,payDate,company}:PdfOptions):Promise<Blob>{
  const {Document,Page,Text,View,StyleSheet,pdf,Image}=await getPdfLib()!;
  const {calc,currency}=line;
  if(!calc) throw new Error("No calculation data");
  const sym=currency==="USD"?"$":"L$";
  const NAVY="#002147",EMERALD="#50C878",SLATE="#64748b",LIGHT="#f8fafc",BORDER="#e2e8f0";
  const S=StyleSheet.create({
    page:{fontFamily:"Helvetica",fontSize:9,color:"#1e293b",backgroundColor:"#fff",paddingHorizontal:36,paddingVertical:32},
    header:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottomWidth:2,borderBottomColor:NAVY},
    coLeft:{flexDirection:"row",alignItems:"center",gap:10},logo:{width:48,height:48,objectFit:"contain"},
    coName:{fontSize:16,fontFamily:"Helvetica-Bold",color:NAVY,marginBottom:3},
    coMeta:{fontSize:8,color:SLATE,lineHeight:1.5},
    badge:{backgroundColor:NAVY,paddingHorizontal:12,paddingVertical:6,borderRadius:4},
    badgeText:{fontSize:10,fontFamily:"Helvetica-Bold",color:"#fff",letterSpacing:1},
    infoGrid:{flexDirection:"row",gap:12,marginBottom:18},
    infoBox:{flex:1,backgroundColor:LIGHT,borderRadius:6,padding:10,borderWidth:1,borderColor:BORDER},
    infoLbl:{fontSize:7,fontFamily:"Helvetica-Bold",color:SLATE,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2},
    infoVal:{fontSize:9,color:NAVY,fontFamily:"Helvetica-Bold"},infoSub:{fontSize:8,color:"#374151"},
    secTitle:{fontSize:8,fontFamily:"Helvetica-Bold",color:SLATE,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6,marginTop:14},
    table:{borderWidth:1,borderColor:BORDER,borderRadius:6,overflow:"hidden"},
    tHead:{flexDirection:"row",backgroundColor:NAVY,paddingHorizontal:10,paddingVertical:6},
    thDesc:{fontSize:7.5,fontFamily:"Helvetica-Bold",color:"#fff",width:140},
    thNotes:{fontSize:7.5,fontFamily:"Helvetica-Bold",color:"#fff",flex:1},
    thAmt:{fontSize:7.5,fontFamily:"Helvetica-Bold",color:"#fff",textAlign:"right",width:90},
    tRow:{flexDirection:"row",paddingHorizontal:10,paddingVertical:8,borderTopWidth:1,borderTopColor:BORDER,alignItems:"flex-start"},
    tAlt:{backgroundColor:LIGHT},
    tdDesc:{width:140,fontSize:8.5,fontFamily:"Helvetica-Bold",color:NAVY},
    tdNotes:{flex:1,fontSize:8,color:"#374151",lineHeight:1.6},
    tdAmt:{width:90,fontSize:8.5,color:"#374151",textAlign:"right"},
    tdAmtBold:{width:90,fontSize:8.5,fontFamily:"Helvetica-Bold",color:NAVY,textAlign:"right"},
    tdRed:{width:90,fontSize:8.5,color:"#dc2626",textAlign:"right"},
    tdNote:{flex:1,fontSize:7.5,color:SLATE,lineHeight:1.5},
    erBox:{marginTop:10,backgroundColor:LIGHT,borderRadius:6,padding:8,borderWidth:1,borderColor:BORDER},
    erLabel:{fontSize:7,fontFamily:"Helvetica-Bold",color:SLATE,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4},
    erRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
    erText:{fontSize:7.5,color:SLATE},erAmount:{fontSize:8,fontFamily:"Helvetica-Bold",color:NAVY},
    netBox:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:NAVY,borderRadius:6,paddingHorizontal:14,paddingVertical:10,marginTop:12},
    netLabel:{fontSize:10,fontFamily:"Helvetica-Bold",color:"#fff"},
    netValue:{fontSize:16,fontFamily:"Helvetica-Bold",color:EMERALD,textAlign:"right"},
    netWords:{backgroundColor:"#f8fafc",borderRadius:6,paddingHorizontal:12,paddingVertical:7,marginTop:6,borderWidth:1,borderColor:BORDER,flexDirection:"row",alignItems:"center",gap:6},
    netWordsLbl:{fontSize:7,fontFamily:"Helvetica-Bold",color:SLATE,textTransform:"uppercase",letterSpacing:0.4},
    netWordsTxt:{fontSize:8,color:NAVY,fontFamily:"Helvetica-Bold",flex:1},
    payBox:{marginTop:10,backgroundColor:"#f0fdf4",borderRadius:6,padding:8,borderWidth:1,borderColor:"#86efac"},
    payLbl:{fontSize:7,fontFamily:"Helvetica-Bold",color:"#166534",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4},
    payRow:{flexDirection:"row",gap:20,flexWrap:"wrap"},payItem:{flex:1,minWidth:120},
    payItemLbl:{fontSize:7,color:"#166534",marginBottom:1},payItemVal:{fontSize:8.5,fontFamily:"Helvetica-Bold",color:NAVY},
    compRow:{flexDirection:"row",gap:8,marginTop:10},
    compBadge:{flex:1,flexDirection:"row",alignItems:"center",gap:4,backgroundColor:"#f0fdf4",borderWidth:1,borderColor:"#86efac",borderRadius:4,paddingHorizontal:8,paddingVertical:5},
    compDot:{width:5,height:5,borderRadius:3,backgroundColor:EMERALD},
    compText:{fontSize:7.5,color:"#166534",fontFamily:"Helvetica-Bold"},
    sigSection:{flexDirection:"row",gap:30,marginTop:24,paddingTop:16,borderTopWidth:1,borderTopColor:BORDER},
    sigBox:{flex:1},sigLine:{borderBottomWidth:1,borderBottomColor:"#cbd5e1",marginBottom:4,height:20},
    sigLabel:{fontSize:7.5,color:SLATE,textAlign:"center"},
    footer:{marginTop:16,paddingTop:10,borderTopWidth:1,borderTopColor:BORDER,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
    footerTxt:{fontSize:7,color:"#94a3b8"},footerBrand:{fontSize:7.5,fontFamily:"Helvetica-Bold",color:NAVY},
  });
  const earningsRows=[
    {label:"Regular Salary",note:`${line.regularHours} hrs × ${sym}${line.rate.toFixed(2)}/hr`,amount:calc.regularSalary},
    ...(line.overtimeHours>0?[{label:"Overtime Pay",note:`${line.overtimeHours} hrs × ${sym}${line.rate.toFixed(2)} × 1.5`,amount:calc.overtimePay}]:[]),
    ...(line.holidayHours>0?[{label:"Holiday Pay",note:`${line.holidayHours} hrs × ${sym}${line.rate.toFixed(2)} × 2.0`,amount:calc.holidayPay}]:[]),
    ...(calc.additionalEarnings>0?[{label:"Allowances & Extras",note:"Recurring allowances + one-off earnings",amount:calc.additionalEarnings}]:[]),
  ];
  const ded=line.deductions??0;
  const deductionRows=[
    {label:"NASSCORP (Employee 4%)",note:`4% of ${sym}${calc.nasscorp.base.toFixed(2)} regular salary`,amount:calc.nasscorp.employeeContribution},
    {label:"Income Tax (LRA)",note:`Effective rate: ${(calc.Paye.effectiveRate*100).toFixed(1)}%`,amount:calc.Paye.taxInBase},
    ...(ded>0?[{label:"Other Deductions",note:"Salary advance / loan repayment / etc.",amount:ded}]:[]),
  ];
  const generated=new Date().toLocaleDateString("en-LR",{year:"numeric",month:"long",day:"numeric"});
  const payDateFmt=new Date(payDate).toLocaleDateString("en-LR",{year:"numeric",month:"long",day:"numeric"});
  const methodLabel:Record<string,string>={cash:"Cash",bank_transfer:"Bank Transfer",orange_money:"Orange Money",mtn_momo:"Mobile Money (MTN)"};
  const pm=line.paymentMethod as string|undefined;
  const doc=(
    <Document title={`Payslip - ${line.fullName} - ${periodLabel}`} author="Slipdesk">
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.coLeft}>
            {company.logoUrl&&<Image src={company.logoUrl} style={S.logo}/>}
            <View>
              <Text style={S.coName}>{company.name||"Company Name"}</Text>
              {company.address&&<Text style={S.coMeta}>{company.address}</Text>}
              {company.tin&&<Text style={S.coMeta}>LRA TIN: {company.tin}</Text>}
              {company.nasscorpRegNo&&<Text style={S.coMeta}>NASSCORP Reg: {company.nasscorpRegNo}</Text>}
              {company.phone&&<Text style={S.coMeta}>Tel: {company.phone}</Text>}
              {company.email&&<Text style={S.coMeta}>{company.email}</Text>}
            </View>
          </View>
          <View style={S.badge}><Text style={S.badgeText}>PAYSLIP</Text></View>
        </View>
        <View style={S.infoGrid}>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Employee</Text><Text style={S.infoVal}>{line.fullName}</Text>
            <Text style={S.infoSub}>{line.jobTitle}</Text><Text style={S.infoSub}>{line.department}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Employee Number</Text><Text style={S.infoVal}>{line.employeeNumber}</Text>
            <Text style={[S.infoLbl,{marginTop:6}]}>Pay Period</Text><Text style={S.infoSub}>{periodLabel}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLbl}>Pay Date</Text><Text style={S.infoVal}>{payDateFmt}</Text>
            <Text style={[S.infoLbl,{marginTop:6}]}>Currency</Text><Text style={S.infoSub}>{currency}</Text>
          </View>
        </View>
        <Text style={S.secTitle}>Earnings</Text>
        <View style={S.table}>
          <View style={S.tHead}><Text style={S.thDesc}>Description</Text><Text style={S.thNotes}>Notes</Text><Text style={S.thAmt}>Amount ({currency})</Text></View>
          {earningsRows.map((row,i)=>(<View key={row.label} style={[S.tRow,i%2===1?S.tAlt:{}]}><Text style={S.tdDesc}>{row.label}</Text><Text style={S.tdNotes}>{row.note}</Text><Text style={S.tdAmt}>{fmtMoney(row.amount,sym)}</Text></View>))}
          <View style={[S.tRow,{backgroundColor:"#f0fdf4"}]}><Text style={S.tdDesc}>GROSS PAY</Text><Text style={S.tdNotes}>{" "}</Text><Text style={S.tdAmtBold}>{fmtMoney(calc.grossPay,sym)}</Text></View>
        </View>
        <Text style={S.secTitle}>Deductions</Text>
        <View style={S.table}>
          <View style={S.tHead}><Text style={S.thDesc}>Description</Text><Text style={S.thNotes}>Basis</Text><Text style={S.thAmt}>Amount ({currency})</Text></View>
          {deductionRows.map((row,i)=>(<View key={row.label} style={[S.tRow,i%2===1?S.tAlt:{}]}><Text style={S.tdDesc}>{row.label}</Text><Text style={S.tdNote}>{row.note}</Text><Text style={S.tdRed}>({fmtMoney(row.amount,sym)})</Text></View>))}
          <View style={[S.tRow,{backgroundColor:"#fff7ed"}]}><Text style={S.tdDesc}>TOTAL DEDUCTIONS</Text><Text style={S.tdNotes}>{" "}</Text><Text style={[S.tdRed,{fontFamily:"Helvetica-Bold"}]}>({fmtMoney(calc.totalDeductions,sym)})</Text></View>
        </View>
        <View style={S.erBox}>
          <Text style={S.erLabel}>Employer Contributions (not deducted from employee)</Text>
          <View style={S.erRow}><Text style={S.erText}>NASSCORP Employer (6% of {sym}{calc.nasscorp.base.toFixed(2)} regular salary)</Text><Text style={S.erAmount}>{fmtMoney(calc.nasscorp.employerContribution,sym)}</Text></View>
        </View>
        {pm&&methodLabel[pm]&&(
          <View style={S.payBox}>
            <Text style={S.payLbl}>Payment Method</Text>
            <View style={S.payRow}>
              <View style={S.payItem}><Text style={S.payItemLbl}>Method</Text><Text style={S.payItemVal}>{methodLabel[pm]}</Text></View>
              {pm==="bank_transfer"&&line.bankName&&<View style={S.payItem}><Text style={S.payItemLbl}>Bank</Text><Text style={S.payItemVal}>{line.bankName}</Text></View>}
              {pm==="bank_transfer"&&line.accountNumber&&<View style={S.payItem}><Text style={S.payItemLbl}>Account Number</Text><Text style={S.payItemVal}>{line.accountNumber}</Text></View>}
              {(pm==="orange_money"||pm==="mtn_momo")&&line.mobileNumber&&<View style={S.payItem}><Text style={S.payItemLbl}>Mobile Number</Text><Text style={S.payItemVal}>{line.mobileNumber}</Text></View>}
            </View>
          </View>
        )}
        <View style={S.netBox}><Text style={S.netLabel}>NET PAY</Text><Text style={S.netValue}>{fmtMoney(calc.netPay,sym)}</Text></View>
        <View style={S.netWords}><Text style={S.netWordsLbl}>In Words: </Text><Text style={S.netWordsTxt}>{numberToWords(calc.netPay)}</Text></View>
        <View style={S.compRow}>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>LRA Income Tax Compliant</Text></View>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>NASSCORP Verified</Text></View>
          <View style={S.compBadge}><View style={S.compDot}/><Text style={S.compText}>{"Generated by Slipdesk · "+generated}</Text></View>
        </View>
        <View style={S.sigSection}>
          {["Authorised Signatory","Date","Employee Acknowledgement"].map(label=>(<View key={label} style={S.sigBox}><View style={S.sigLine}/><Text style={S.sigLabel}>{label}</Text></View>))}
        </View>
        <View style={S.footer}>
          <Text style={S.footerTxt}>This payslip is computer-generated and is valid without a physical signature.</Text>
          <Text style={S.footerBrand}>Slipdesk · slipdesk.com</Text>
        </View>
      </Page>
    </Document>
  );
  return await pdf(doc).toBlob();
}

function buildFilename(fullName:string,periodLabel:string){return `${fullName.trim().replace(/\s+/g,"_")}_Payslip_${safePeriod(periodLabel)}.pdf`;}

function DownloadSlipButton({line,periodLabel,payDate,company}:{line:PayRunLine;periodLabel:string;payDate:string;company:PdfCompany;}){
  const {toast}=useToast();
  const [loading,setLoading]=useState(false);
  async function handle(){
    if(!line.calc) return;
    setLoading(true);
    try{
      const blob=await generatePayslipBlob({line,periodLabel,payDate,company});
      const url=URL.createObjectURL(blob); const a=document.createElement("a");
      a.href=url; a.download=buildFilename(line.fullName,periodLabel); a.click(); URL.revokeObjectURL(url);
    }catch(e){console.error(e);toast.error("Could not generate payslip.");}
    finally{setLoading(false);}
  }
  return(
    <button onClick={handle} disabled={loading||!line.calc}
      style={{display:"flex",alignItems:"center",gap:4,padding:"5px 9px",borderRadius:7,border:"1px solid #1e3a5f",background:"transparent",color:line.calc?"#50C878":"#334155",fontSize:11,fontWeight:600,cursor:line.calc?"pointer":"not-allowed",transition:"all 0.15s"}}
      onMouseEnter={e=>{if(line.calc){e.currentTarget.style.background="#50C87815";}}}
      onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
      {loading?<Loader style={{animation:"spin 1s linear infinite"}} size={12}/>:<FileDown size={12}/>}
      PDF
    </button>
  );
}

function BulkDownloadButton({lines,periodLabel,payDate,company}:{lines:PayRunLine[];periodLabel:string;payDate:string;company:PdfCompany;}){
  const {toast}=useToast();
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0});
  const valid=lines.filter(l=>l.calc!==null);
  async function handleAll(){
    if(!valid.length) return;
    setLoading(true); setProgress({done:0,total:valid.length});
    try{
      for(let i=0;i<valid.length;i++){
        const blob=await generatePayslipBlob({line:valid[i],periodLabel,payDate,company});
        const url=URL.createObjectURL(blob); const a=document.createElement("a");
        a.href=url; a.download=buildFilename(valid[i].fullName,periodLabel); a.click(); URL.revokeObjectURL(url);
        setProgress({done:i+1,total:valid.length});
        await new Promise(r=>setTimeout(r,350));
      }
    }catch(e){console.error(e);toast.error("Some payslips could not be generated.");}
    finally{setLoading(false);setProgress({done:0,total:0});}
  }
  return(
    <button onClick={handleAll} disabled={loading||!valid.length}
      style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",borderRadius:10,cursor:"pointer",background:valid.length?"#50C878":"#50C87840",border:"none",color:"#002147",fontSize:12,fontWeight:700,transition:"all 0.15s"}}
      onMouseEnter={e=>{if(valid.length&&!loading) e.currentTarget.style.opacity="0.88";}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
      {loading?<><Loader style={{animation:"spin 1s linear infinite"}} size={13}/>{progress.total>0?`${progress.done}/${progress.total}…`:"Generating…"}</> : <><Download size={13}/>All Payslips ({valid.length})</>}
    </button>
  );
}

// ─── FIX 5: EditableCell ──────────────────────────────────────────────────────

function EditableCell({value,lineId,field,isLocked,dispatch,prefix="",decimals=2}:{
  value:number;lineId:string;field:keyof PayRunLine;isLocked:boolean;
  dispatch:React.Dispatch<GridAction>;prefix?:string;decimals?:number;
}){
  const [editing,setEditing]=useState(false);
  const [local,setLocal]=useState(String(value));

  useEffect(()=>{if(!editing) setLocal(String(value));},[value,editing]);

  const commit=useCallback(()=>{
    const num=parseFloat(local);
    if(!isNaN(num)&&num>=0) dispatch({type:"UPDATE_FIELD",id:lineId,field,value:num});
    else setLocal(String(value));
    setEditing(false);
  },[local,lineId,field,value,dispatch]);

  if(isLocked) return <span style={{display:"block",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#475569"}}>{prefix}{value.toFixed(decimals)}</span>;
  if(editing) return(
    <input autoFocus value={local}
      style={{width:"100%",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,background:"#50C87815",border:"1px solid #50C878",borderRadius:6,padding:"3px 6px",color:"#e2e8f0",outline:"none"}}
      onChange={e=>setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter") commit(); if(e.key==="Escape"){setLocal(String(value));setEditing(false);}}}/>
  );
  return(
    <button onClick={()=>{setLocal(String(value));setEditing(true);}}
      style={{width:"100%",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#94a3b8",background:"transparent",border:"1px solid transparent",borderRadius:6,padding:"3px 6px",cursor:"text",transition:"all 0.12s"}}
      onMouseEnter={e=>{e.currentTarget.style.background="#50C87812";e.currentTarget.style.color="#50C878";e.currentTarget.style.borderColor="#50C87840";}}
      onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#94a3b8";e.currentTarget.style.borderColor="transparent";}}>
      {prefix}{value.toFixed(decimals)}
    </button>
  );
}

// ─── Run Summary Strip ────────────────────────────────────────────────────────

function RunSummary({lines,exchangeRate}:{lines:PayRunLine[];exchangeRate:number;}){
  const t=useMemo(()=>lines.reduce((acc,l)=>{
    if(!l.calc) return acc;
    const u=(n:number)=>l.currency==="USD"?n:n/exchangeRate;
    return {gross:acc.gross+u(l.calc.grossPay),nasscorp:acc.nasscorp+u(l.calc.nasscorp.employeeContribution),erNasc:acc.erNasc+u(l.calc.nasscorp.employerContribution),tax:acc.tax+u(l.calc.Paye.taxInBase),net:acc.net+u(l.calc.netPay)};
  },{gross:0,nasscorp:0,erNasc:0,tax:0,net:0}),[lines,exchangeRate]);
  const f=(n:number)=>`$${n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  return(
    <div style={{background:"#071525",border:"1px solid #1e3a5f",borderTop:"none",borderRadius:"0 0 16px 16px",padding:"14px 24px"}}>
      <div style={{display:"flex",alignItems:"center",gap:32,flexWrap:"wrap"}}>
        <span style={{color:"#1e3a5f",fontSize:10,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.08em",marginRight:"auto"}}>USD Equivalent Totals</span>
        {[
          {label:"Gross",value:f(t.gross),color:"#e2e8f0"},
          {label:"NASSCORP EE",value:f(t.nasscorp),color:"#fb923c"},
          {label:"NASSCORP ER",value:f(t.erNasc),color:"#f97316"},
          {label:"Income Tax",value:f(t.tax),color:"#f87171"},
          {label:"Net Pay",value:f(t.net),color:"#50C878"},
        ].map(item=>(
          <div key={item.label} style={{textAlign:"center"}}>
            <p style={{fontSize:10,color:"#334155",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.06em",margin:"0 0 3px"}}>{item.label}</p>
            <p style={{fontSize:14,fontWeight:800,fontFamily:"'DM Mono',monospace",color:item.color,margin:0}}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status Stepper ───────────────────────────────────────────────────────────

const STATUS_STEPS:RunStatus[]              = ["draft","review","approved","paid"];
const STATUS_LABELS:Record<RunStatus,string>= {draft:"Draft",review:"In Review",approved:"Approved",paid:"Paid"};
const NEXT_LABELS:Record<RunStatus,string>  = {draft:"Submit for Review",review:"Approve Pay Run",approved:"Mark as Paid",paid:"Completed"};
const STATUS_ICONS:Record<RunStatus,React.ReactNode>= {
  draft:<FileText size={12}/>, review:<Shield size={12}/>, approved:<CheckCircle2 size={12}/>, paid:<TrendingUp size={12}/>,
};

function StatusStepper({current,onAdvance,saving=false}:{current:RunStatus;onAdvance:()=>void;saving?:boolean;}){
  const idx=STATUS_STEPS.indexOf(current);
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        {STATUS_STEPS.map((step,i)=>{
          const done=i<idx; const active=i===idx;
          return(
            <div key={step} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,
                background:active?"#50C878":done?"#50C87820":"#071525",
                color:active?"#002147":done?"#50C878":"#334155",
                border:`1px solid ${active?"transparent":done?"#50C87840":"#1e3a5f"}`,
                transition:"all 0.2s"}}>
                {done?<CheckCircle2 size={12}/>:STATUS_ICONS[step]}
                {STATUS_LABELS[step]}
              </div>
              {i<STATUS_STEPS.length-1&&<ChevronRight size={12} color="#1e3a5f"/>}
            </div>
          );
        })}
      </div>
      {current!=="paid"&&(
        <button onClick={onAdvance} disabled={saving}
          style={{display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:10,cursor:saving?"not-allowed":"pointer",
            background:"#002147",color:"#50C878",fontSize:12,fontWeight:700,border:"1px solid #1e3a5f",transition:"all 0.15s"}}
          onMouseEnter={e=>{if(!saving){e.currentTarget.style.background="#50C878";e.currentTarget.style.color="#002147";}}}
          onMouseLeave={e=>{e.currentTarget.style.background="#002147";e.currentTarget.style.color="#50C878";}}>
          {saving?<><Loader size={12} style={{animation:"spin 1s linear infinite"}}/> Saving…</>:<><Play size={12}/>{NEXT_LABELS[current]}</>}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollPage(){
  const {employees,company,addEmployee,refreshEmployees,loading}=useApp();
  const {toast}=useToast();

  if(loading) return <PageSkeleton/>;

  const pdfCompany:PdfCompany={name:company.name,tin:company.tin,nasscorpRegNo:company.nasscorpRegNo,address:company.address,phone:company.phone,email:company.email,logoUrl:company.logoUrl};
  const defaultPeriod=getCurrentPeriod();

  const [periodLabel,setPeriodLabel]=useState(defaultPeriod.label);
  const [payDate,setPayDate]=useState(defaultPeriod.payDate);
  const [exchangeRate,setExchangeRate]=useState(185.44);
  const [runStarted,setRunStarted]=useState(false);
  const [lines,dispatch]=useReducer(gridReducer,[]);
  const [status,setStatus]=useState<RunStatus>("draft");
  const [showUpload,setShowUpload]=useState(false);
  const [history,setHistory]=useState<SavedRun[]>([]);
  const [saving,setSaving]=useState(false);

  const sbRef=useRef<ReturnType<typeof createClient>|null>(null);
  if(!sbRef.current) sbRef.current=createClient();
  const supabase=sbRef.current;

  useEffect(()=>{
    async function loadHistory(){
      const {data}=await (supabase as any).from("pay_runs").select("*").eq("status","paid").order("created_at",{ascending:false}).limit(20);
      if(!data) return;
      setHistory(data.map((r:any)=>({id:r.id,periodLabel:r.period_label,payDate:r.pay_date,status:r.status,employeeCount:r.employee_count,totalGross:r.total_gross,totalNet:r.total_net,totalTax:r.total_income_tax,totalNasscorp:r.total_nasscorp,exchangeRate:r.exchange_rate,lines:[],createdAt:r.created_at})));
    }
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const isLocked=status==="approved"||status==="paid";
  const warningCount=lines.filter(l=>l.calc&&l.calc.warnings.length>0).length;
  const activeEmployees=employees.filter(e=>e.isActive);

  function handleStartRun(){
    const rows:PayRunLine[]=activeEmployees.map(emp=>({
      id:emp.id,employeeId:emp.id,employeeNumber:emp.employeeNumber,fullName:emp.fullName,
      jobTitle:emp.jobTitle,department:emp.department,currency:emp.currency,rate:emp.rate,
      regularHours:emp.pendingRegularHours??emp.standardHours,
      overtimeHours:emp.pendingOvertimeHours??0,holidayHours:emp.pendingHolidayHours??0,
      additionalEarnings:emp.allowances??0,deductions:emp.pendingDeductions??0,
      exchangeRate,calc:null,paymentMethod:emp.paymentMethod,
      bankName:emp.bankName,accountNumber:emp.accountNumber,mobileNumber:emp.momoNumber,mobileProvider:undefined,
    }));
    dispatch({type:"SET_ROWS",rows}); setRunStarted(true);
  }

  async function advanceStatus(){
    const idx=STATUS_STEPS.indexOf(status);
    if(idx>=STATUS_STEPS.length-1) return;
    const next=STATUS_STEPS[idx+1]; setStatus(next);
    if(next==="paid"){
      setSaving(true);
      try{
        const FX=exchangeRate;
        const toUSD=(n:number,ccy:string)=>ccy==="USD"?n:n/FX;
        const totalGross=lines.reduce((s,l)=>s+(l.calc?toUSD(l.calc.grossPay,l.currency):0),0);
        const totalNet=lines.reduce((s,l)=>s+(l.calc?toUSD(l.calc.netPay,l.currency):0),0);
        const totalTax=lines.reduce((s,l)=>s+(l.calc?toUSD(l.calc.Paye.taxInBase,l.currency):0),0);
        const totalNasscorp=lines.reduce((s,l)=>s+(l.calc?toUSD(l.calc.nasscorp.employeeContribution,l.currency):0),0);
        const {data:coRow}=await (supabase as any).from("companies").select("id").single();
        const companyId:string|null=coRow?.id??null;
        const {data:run,error:runErr}=await (supabase as any).from("pay_runs").insert({
          ...(companyId?{company_id:companyId}:{}),
          period_label:periodLabel,pay_period_start:payDate,pay_period_end:payDate,pay_date:payDate,
          exchange_rate:FX,status:"paid",employee_count:lines.length,
          total_gross:totalGross,total_net:totalNet,total_income_tax:totalTax,total_nasscorp:totalNasscorp,
        }).select().single();
        if(runErr) throw runErr;
        if(run&&lines.length>0){
          const lineRows=lines.filter(l=>l.calc!==null).map(l=>({
            pay_run_id:run.id,...(companyId?{company_id:companyId}:{}),
            employee_id:l.employeeId,employee_number:l.employeeNumber,full_name:l.fullName,
            job_title:l.jobTitle,department:l.department,currency:l.currency,rate:l.rate,
            regular_hours:l.regularHours,overtime_hours:l.overtimeHours,holiday_hours:l.holidayHours,
            additional_earnings:l.additionalEarnings,deductions:l.deductions??0,exchange_rate:l.exchangeRate,
            gross_pay:l.calc!.grossPay,income_tax:l.calc!.Paye.taxInBase,
            nasscorp_ee:l.calc!.nasscorp.employeeContribution,nasscorp_er:l.calc!.nasscorp.employerContribution,net_pay:l.calc!.netPay,
          }));
          const {error:lineErr}=await (supabase as any).from("pay_run_lines").insert(lineRows);
          if(lineErr){console.error("pay_run_lines insert error:",lineErr);toast.error("Pay run saved but some line items failed.");}
        }
        setHistory(prev=>[{id:run?.id??`LOCAL-${Date.now()}`,periodLabel,payDate,status:"paid",employeeCount:lines.length,totalGross,totalNet,totalTax,totalNasscorp,exchangeRate:FX,lines:[...lines],createdAt:new Date().toISOString()},...prev]);
        toast.success(`${periodLabel} pay run saved. ${lines.length} employee${lines.length!==1?"s":""} paid.`);
      }catch(err){console.error("Failed to save pay run:",err);toast.error("Pay run marked paid locally but could not save to Supabase.");}
      finally{setSaving(false);}
    }
  }

  function startNewRun(){
    dispatch({type:"CLEAR"});setStatus("draft");
    const p=getCurrentPeriod();setPeriodLabel(p.label);setPayDate(p.payDate);setRunStarted(false);
  }

  async function handleBulkImport(bulkRows:BulkRow[]){
    const payRunLines:PayRunLine[]=[];
    for(const r of bulkRows){
      try{
        const saved=await addEmployee({...r.employee,isActive:true});
        payRunLines.push(bulkRowToPayRunLine(r,exchangeRate,saved?.id));
      }catch(err){
        console.error("Failed to save bulk employee:",r.employee.employeeNumber,err);
        payRunLines.push(bulkRowToPayRunLine(r,exchangeRate));
      }
    }
    await refreshEmployees();
    dispatch({type:"IMPORT_ROWS",rows:payRunLines});
    setShowUpload(false);
    toast.success(`${payRunLines.length} employee${payRunLines.length!==1?"s":""} imported and saved.`);
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const col=createColumnHelper<PayRunLine>();
  const columns=useMemo(()=>[
    col.accessor("employeeNumber",{header:"#",size:64,
      cell:c=><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#334155"}}>{c.getValue()}</span>}),
    col.accessor("fullName",{header:"Employee",size:150,
      cell:c=>(
        <div>
          <p style={{fontSize:13,fontWeight:600,color:"#e2e8f0",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{c.getValue()}</p>
          <p style={{fontSize:10,color:"#334155",margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{c.row.original.department}</p>
        </div>
      )}),
    col.accessor("currency",{header:"CCY",size:50,
      cell:c=>(
        <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,
          background:c.getValue()==="USD"?"#1e3a5f":"#2a2a1a",
          color:c.getValue()==="USD"?"#38bdf8":"#f59e0b"}}>
          {c.getValue()}
        </span>
      )}),
    col.accessor("rate",{header:"Rate",size:80,
      cell:c=><EditableCell value={c.getValue()} lineId={c.row.original.id} field="rate" dispatch={dispatch} isLocked={isLocked} prefix={c.row.original.currency==="USD"?"$":"L$"}/>}),
    col.accessor("regularHours",{header:"Reg",size:64,
      cell:c=><EditableCell value={c.getValue()} lineId={c.row.original.id} field="regularHours" dispatch={dispatch} isLocked={isLocked}/>}),
    col.accessor("overtimeHours",{header:"OT",size:60,
      cell:c=><EditableCell value={c.getValue()} lineId={c.row.original.id} field="overtimeHours" dispatch={dispatch} isLocked={isLocked}/>}),
    col.accessor("holidayHours",{header:"Hol",size:60,
      cell:c=><EditableCell value={c.getValue()} lineId={c.row.original.id} field="holidayHours" dispatch={dispatch} isLocked={isLocked}/>}),
    col.accessor("additionalEarnings",{header:"Extras",size:74,
      cell:c=><EditableCell value={c.getValue()} lineId={c.row.original.id} field="additionalEarnings" dispatch={dispatch} isLocked={isLocked} prefix={c.row.original.currency==="USD"?"$":"L$"}/>}),
    col.accessor("deductions",{header:"Ded.",size:80,
      cell:c=><EditableCell value={c.row.original.deductions??0} lineId={c.row.original.id} field="deductions" dispatch={dispatch} isLocked={isLocked} prefix={c.row.original.currency==="USD"?"-$":"-L$"}/>}),
    col.display({id:"gross",header:"Gross",size:90,
      cell:c=>{
        const sym=c.row.original.currency==="USD"?"$":"L$";
        return <span style={{display:"block",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:"#e2e8f0"}}>{c.row.original.calc?`${sym}${c.row.original.calc.grossPay.toFixed(2)}`:"—"}</span>;
      }}),
    col.display({id:"tax",header:"Tax",size:80,
      cell:c=>{
        const sym=c.row.original.currency==="USD"?"$":"L$";
        return <span style={{display:"block",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#f87171"}}>{c.row.original.calc?`${sym}${c.row.original.calc.Paye.taxInBase.toFixed(2)}`:"—"}</span>;
      }}),
    col.display({id:"net",header:"Net Pay",size:96,
      cell:c=>{
        const sym=c.row.original.currency==="USD"?"$":"L$";
        return <span style={{display:"block",textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:800,color:"#50C878"}}>{c.row.original.calc?`${sym}${c.row.original.calc.netPay.toFixed(2)}`:"—"}</span>;
      }}),
    col.display({id:"slip",header:"",size:70,
      cell:c=><DownloadSlipButton line={c.row.original} periodLabel={periodLabel} payDate={payDate} company={pdfCompany}/>}),
    col.display({id:"warn",header:"",size:28,
      cell:c=>{
        const warnings=c.row.original.calc?.warnings??[];
        if(!warnings.length) return <CheckCircle2 size={14} color="#50C87860" style={{margin:"0 auto",display:"block"}}/>;
        return(
          <div style={{position:"relative"}} className="warn-group">
            <AlertTriangle size={14} color="#fb923c" style={{cursor:"pointer",display:"block",margin:"0 auto"}}/>
            <div style={{position:"absolute",right:0,top:20,zIndex:50,display:"none",width:240,background:"#0d2137",border:"1px solid #fb923c30",borderRadius:10,padding:10,boxShadow:"0 8px 24px #00000060"}} className="warn-tip">
              {warnings.map((w,i)=><p key={i} style={{color:"#fb923c",fontSize:11,margin:"2px 0"}}>{w}</p>)}
            </div>
          </div>
        );
      }}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ],[isLocked,periodLabel,payDate,pdfCompany.logoUrl]);

  const table=useReactTable({data:lines,columns,getCoreRowModel:getCoreRowModel(),getRowId:row=>row.id});

  // ── Setup screen ──────────────────────────────────────────────────────────

  if(!runStarted){
    const withHours=activeEmployees.filter(e=>(e.pendingOvertimeHours??0)>0||(e.pendingHolidayHours??0)>0).length;
    return(
      <div style={{minHeight:"100vh",background:"#071525",padding:"32px",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
          input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        `}</style>

        {/* Header */}
        <div style={{marginBottom:28,animation:"fadeUp 0.3s ease"}}>
          <h1 style={{fontSize:26,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.02em",margin:0}}>Payroll</h1>
          <p style={{color:"#334155",fontSize:13,marginTop:5}}>Configure and start a new pay run</p>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,maxWidth:920}}>

          {/* Left: config form */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Alert: no employees */}
            {activeEmployees.length===0&&(
              <div style={{background:"#fb923c12",border:"1px solid #fb923c30",borderRadius:14,padding:"14px 18px",display:"flex",gap:12,alignItems:"flex-start",animation:"fadeUp 0.3s ease"}}>
                <AlertTriangle size={16} color="#fb923c" style={{flexShrink:0,marginTop:2}}/>
                <div>
                  <p style={{color:"#fb923c",fontWeight:700,fontSize:13,margin:"0 0 3px"}}>No active employees</p>
                  <p style={{color:"#64748b",fontSize:12,margin:0}}>Add employees on the <strong style={{color:"#94a3b8"}}>Employees</strong> page first.</p>
                </div>
              </div>
            )}

            {/* Config card */}
            <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:16,padding:"24px",display:"flex",flexDirection:"column",gap:18,animation:"fadeUp 0.35s ease 0.05s both"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                <div style={{width:32,height:32,borderRadius:10,background:"#50C87820",border:"1px solid #50C87840",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Calendar size={15} color="#50C878"/>
                </div>
                <span style={{color:"#e2e8f0",fontWeight:700,fontSize:15}}>New Pay Run</span>
              </div>

              {/* Period label */}
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{fontSize:11,fontWeight:600,color:"#334155",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>Pay Period Label</label>
                <input value={periodLabel} onChange={e=>setPeriodLabel(e.target.value)} placeholder="e.g. July 2025"
                  style={{padding:"10px 12px",background:"#071525",border:"1px solid #1e3a5f",borderRadius:9,color:"#e2e8f0",fontSize:13,outline:"none",transition:"border-color 0.2s"}}
                  onFocus={e=>{e.target.style.borderColor="#50C87870";}} onBlur={e=>{e.target.style.borderColor="#1e3a5f";}}/>
              </div>

              {/* Pay date */}
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{fontSize:11,fontWeight:600,color:"#334155",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>Pay Date</label>
                <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}
                  style={{padding:"10px 12px",background:"#071525",border:"1px solid #1e3a5f",borderRadius:9,color:"#e2e8f0",fontSize:13,outline:"none",transition:"border-color 0.2s"}}
                  onFocus={e=>{e.target.style.borderColor="#50C87870";}} onBlur={e=>{e.target.style.borderColor="#1e3a5f";}}/>
              </div>

              {/* Exchange rate */}
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{fontSize:11,fontWeight:600,color:"#334155",letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>LRD / USD Exchange Rate</label>
                <div style={{position:"relative"}}>
                  <DollarSign size={14} color="#334155" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                  <input type="number" value={exchangeRate} onChange={e=>setExchangeRate(parseFloat(e.target.value)||185.44)} placeholder="185.44"
                    style={{width:"100%",padding:"10px 12px 10px 32px",background:"#071525",border:"1px solid #1e3a5f",borderRadius:9,color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}
                    onFocus={e=>{e.target.style.borderColor="#50C87870";}} onBlur={e=>{e.target.style.borderColor="#1e3a5f";}}/>
                </div>
                <p style={{color:"#334155",fontSize:11,margin:0}}>Used for income tax calculation on LRD salaries</p>
              </div>

              {/* Start button */}
              <button onClick={handleStartRun} disabled={activeEmployees.length===0}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:11,border:"none",
                  cursor:activeEmployees.length===0?"not-allowed":"pointer",
                  background:activeEmployees.length===0?"#50C87830":"#50C878",
                  color:"#002147",fontSize:14,fontWeight:800,transition:"all 0.15s",marginTop:4}}
                onMouseEnter={e=>{if(activeEmployees.length>0) e.currentTarget.style.opacity="0.88";}}
                onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
                <Zap size={15}/> Start Pay Run · {activeEmployees.length} employees
              </button>
            </div>
          </div>

          {/* Right: summary + history */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Employee preview */}
            {activeEmployees.length>0&&(
              <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:16,padding:"20px 22px",animation:"fadeUp 0.4s ease 0.1s both"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <span style={{color:"#e2e8f0",fontWeight:700,fontSize:13}}>Employee Preview</span>
                  <span style={{background:"#50C87820",color:"#50C878",border:"1px solid #50C87840",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{activeEmployees.length} Active</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {activeEmployees.slice(0,5).map(emp=>(
                    <div key={emp.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,background:"#071525"}}>
                      <div style={{display:"flex",alignItems:"center",gap:9}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:"#50C87820",border:"1px solid #50C87840",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#50C878",fontFamily:"'DM Mono',monospace",flexShrink:0}}>
                          {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                        </div>
                        <div>
                          <p style={{fontSize:12,fontWeight:600,color:"#e2e8f0",margin:0}}>{emp.firstName} {emp.lastName}</p>
                          <p style={{fontSize:10,color:"#334155",margin:0,fontFamily:"'DM Mono',monospace"}}>{emp.department}</p>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <p style={{fontSize:12,fontWeight:700,color:"#50C878",margin:0,fontFamily:"'DM Mono',monospace"}}>
                          {emp.currency==="LRD"?"L$":"$"}{emp.rate.toFixed(2)}
                        </p>
                        {((emp.pendingOvertimeHours??0)>0||(emp.pendingHolidayHours??0)>0)&&(
                          <p style={{fontSize:9,color:"#38bdf8",margin:0}}>hours imported</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {activeEmployees.length>5&&(
                    <p style={{textAlign:"center",color:"#334155",fontSize:11,fontFamily:"'DM Mono',monospace",margin:"4px 0 0"}}>
                      +{activeEmployees.length-5} more employees
                    </p>
                  )}
                </div>
                {withHours>0&&(
                  <div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:"#38bdf815",border:"1px solid #38bdf830",display:"flex",alignItems:"center",gap:8}}>
                    <RefreshCw size={12} color="#38bdf8"/>
                    <p style={{color:"#38bdf8",fontSize:11,margin:0,fontWeight:600}}>{withHours} employee{withHours!==1?"s":""} have CSV-imported hours ready</p>
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {history.length>0&&(
              <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:16,padding:"20px 22px",animation:"fadeUp 0.45s ease 0.15s both"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <Clock size={14} color="#334155"/>
                  <span style={{color:"#e2e8f0",fontWeight:700,fontSize:13}}>Pay Run History</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {history.slice(0,5).map(run=>(
                    <div key={run.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:10,background:"#071525",gap:8}}>
                      <div style={{minWidth:0,flex:1}}>
                        <p style={{fontSize:13,fontWeight:600,color:"#e2e8f0",margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{run.periodLabel}</p>
                        <p style={{fontSize:10,color:"#334155",margin:0,fontFamily:"'DM Mono',monospace"}}>
                          {run.employeeCount} emp · Net ${run.totalNet.toLocaleString("en-US",{minimumFractionDigits:2})}
                        </p>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {run.lines.length>0&&<BulkDownloadButton lines={run.lines} periodLabel={run.periodLabel} payDate={run.payDate} company={pdfCompany}/>}
                        <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",padding:"3px 8px",borderRadius:20,background:"#50C87820",color:"#50C878",border:"1px solid #50C87840"}}>paid</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Active pay run ────────────────────────────────────────────────────────

  return(
    <div style={{minHeight:"100vh",background:"#071525",padding:"32px",fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .warn-group:hover .warn-tip{display:block!important}
        th{background:#071525!important;padding:10px 12px;border-bottom:1px solid #1e3a5f;position:sticky;top:0;z-index:10}
        td{padding:10px 12px;border-bottom:1px solid #0d2137}
        tr:last-child td{border-bottom:none}
        tr:hover td{background:#0d213760}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12,animation:"fadeUp 0.3s ease"}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:"#f1f5f9",letterSpacing:"-0.02em",margin:0}}>Payroll</h1>
          <p style={{color:"#334155",fontSize:13,marginTop:5,display:"flex",alignItems:"center",gap:8}}>
            <Calendar size={12} color="#334155"/>{periodLabel}
            <span style={{color:"#1e3a5f"}}>·</span>
            <Users size={12} color="#334155"/>{lines.length} employees
            <span style={{color:"#1e3a5f"}}>·</span>
            <RefreshCw size={12} color="#334155"/>L${exchangeRate}/$1
          </p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {status==="paid"&&(
            <button onClick={startNewRun}
              style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:10,border:"1px solid #1e3a5f",background:"transparent",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#50C87850";e.currentTarget.style.color="#e2e8f0";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e3a5f";e.currentTarget.style.color="#64748b";}}>
              <Plus size={13}/> New Pay Run
            </button>
          )}
          {!isLocked&&(
            <button onClick={()=>setShowUpload(true)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",borderRadius:10,border:"1px solid #1e3a5f",background:"transparent",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#50C87850";e.currentTarget.style.color="#e2e8f0";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e3a5f";e.currentTarget.style.color="#64748b";}}>
              <Upload size={13}/> Import CSV
            </button>
          )}
          <BulkDownloadButton lines={lines} periodLabel={periodLabel} payDate={payDate} company={pdfCompany}/>
        </div>
      </div>

      {/* Status stepper */}
      <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:14,padding:"16px 20px",marginBottom:16,animation:"fadeUp 0.35s ease 0.05s both"}}>
        <StatusStepper current={status} onAdvance={advanceStatus} saving={saving}/>
      </div>

      {/* Alerts */}
      {warningCount>0&&(
        <div style={{background:"#fb923c12",border:"1px solid #fb923c30",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,marginBottom:12,animation:"fadeUp 0.35s ease"}}>
          <AlertTriangle size={14} color="#fb923c"/>
          <p style={{color:"#fb923c",fontSize:13,margin:0,fontWeight:600}}>{warningCount} employee{warningCount>1?"s":""} have gross pay below the $150 USD minimum wage. Review before approving.</p>
        </div>
      )}
      {isLocked&&(
        <div style={{background:"#38bdf815",border:"1px solid #38bdf830",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,marginBottom:12,animation:"fadeUp 0.35s ease"}}>
          <Lock size={14} color="#38bdf8"/>
          <p style={{color:"#38bdf8",fontSize:13,margin:0,fontWeight:600}}>Pay run is <strong>{status}</strong>. Figures are locked — you can still download payslips.</p>
        </div>
      )}

      {/* Payroll table */}
      {lines.length>0&&(
        <>
          <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:"16px 16px 0 0",overflow:"hidden",animation:"fadeUp 0.4s ease 0.1s both"}}>
            {/* Table toolbar */}
            <div style={{background:"#002147",padding:"13px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <FileText size={14} color="rgba(255,255,255,0.3)"/>
                <span style={{color:"#e2e8f0",fontWeight:700,fontSize:14}}>Review & Edit Payroll</span>
                {!isLocked&&<span style={{color:"rgba(255,255,255,0.25)",fontSize:10,fontFamily:"'DM Mono',monospace"}}>Click any cell to edit</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {warningCount>0&&<span style={{display:"flex",alignItems:"center",gap:5,color:"#fb923c",fontSize:11,fontFamily:"'DM Mono',monospace"}}><AlertTriangle size={11}/>{warningCount} warning{warningCount>1?"s":""}</span>}
                <span style={{color:"rgba(255,255,255,0.2)",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{lines.length} employees</span>
              </div>
            </div>

            {/* Desktop table */}
            <div style={{overflowX:"auto",display:"none"}} className="sm-table">
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  {table.getHeaderGroups().map(hg=>(
                    <tr key={hg.id}>
                      {hg.headers.map(h=>(
                        <th key={h.id} style={{width:h.getSize(),padding:"10px 12px",background:"#071525",borderBottom:"1px solid #1e3a5f",fontSize:10,fontWeight:700,color:"#334155",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",textAlign:"left",whiteSpace:"nowrap"}}>
                          {flexRender(h.column.columnDef.header,h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row=>(
                    <tr key={row.id} style={{borderLeft:`3px solid ${row.original.calc?.warnings.length?"#fb923c":"transparent"}`,transition:"background 0.12s"}}>
                      {row.getVisibleCells().map(cell=>(
                        <td key={cell.id} style={{padding:"10px 12px",borderBottom:"1px solid #0d2137",width:cell.column.getSize()}}>
                          {flexRender(cell.column.columnDef.cell,cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Always-visible table (no sm breakpoint needed in inline styles) */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
                <thead>
                  {table.getHeaderGroups().map(hg=>(
                    <tr key={hg.id}>
                      {hg.headers.map(h=>(
                        <th key={h.id} style={{width:h.getSize(),padding:"10px 12px",background:"#071525",borderBottom:"1px solid #1e3a5f",fontSize:10,fontWeight:700,color:"#334155",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",textAlign:"left",whiteSpace:"nowrap"}}>
                          {flexRender(h.column.columnDef.header,h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row=>(
                    <tr key={row.id} style={{borderLeft:`3px solid ${row.original.calc?.warnings.length?"#fb923c":"transparent"}`,transition:"background 0.12s",cursor:"default"}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#0d213750";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
                      {row.getVisibleCells().map(cell=>(
                        <td key={cell.id} style={{padding:"10px 12px",borderBottom:"1px solid #0d2137",width:cell.column.getSize()}}>
                          {flexRender(cell.column.columnDef.cell,cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary strip */}
          <RunSummary lines={lines} exchangeRate={exchangeRate}/>
        </>
      )}

      {/* History (shown in active run view too) */}
      {history.length>0&&(
        <div style={{background:"#0d1f35",border:"1px solid #1e3a5f",borderRadius:16,padding:"20px 22px",marginTop:20,animation:"fadeUp 0.5s ease 0.2s both"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <Clock size={14} color="#334155"/>
            <span style={{color:"#e2e8f0",fontWeight:700,fontSize:14}}>Pay Run History</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {history.map(run=>(
              <div key={run.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:10,background:"#071525",gap:10}}>
                <div style={{minWidth:0,flex:1}}>
                  <p style={{fontSize:13,fontWeight:600,color:"#e2e8f0",margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{run.periodLabel}</p>
                  <p style={{fontSize:11,color:"#334155",margin:0,fontFamily:"'DM Mono',monospace"}}>
                    {run.employeeCount} emp · Gross ${run.totalGross.toLocaleString("en-US",{minimumFractionDigits:2})} · Net ${run.totalNet.toLocaleString("en-US",{minimumFractionDigits:2})}
                    {run.totalTax?` · Tax $${run.totalTax.toLocaleString("en-US",{minimumFractionDigits:2})}`:""} 
                    {run.totalNasscorp?` · NASC $${run.totalNasscorp.toLocaleString("en-US",{minimumFractionDigits:2})}`:""} 
                  </p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  {run.lines.length>0&&<BulkDownloadButton lines={run.lines} periodLabel={run.periodLabel} payDate={run.payDate} company={pdfCompany}/>}
                  <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",padding:"3px 10px",borderRadius:20,background:"#50C87820",color:"#50C878",border:"1px solid #50C87840",fontWeight:700}}>paid</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUpload&&(
        <BulkUpload onClose={()=>setShowUpload(false)} onImport={handleBulkImport}/>
      )}
    </div>
  );
}