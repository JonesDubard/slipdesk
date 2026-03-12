"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Employee } from "@/lib/mock-data";

interface AppState {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  companyName: string;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);

  return (
    <AppContext.Provider
      value={{
        employees,
        setEmployees,
        companyName: "Demo Company Ltd.", // swap from Supabase later
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}