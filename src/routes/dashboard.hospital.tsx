import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, Stethoscope, Clock,
  Plus, Activity, Heart
} from "lucide-react";

import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/dashboard/hospital")({
  head: () => ({ meta: [{ title: "Hospital Dashboard — HEALTHREACH" }] }),
  component: () => <RoleGuard allow="hospital"><HospitalDashboard /></RoleGuard>,
});

const mockPatients = [
  { id: "1", name: "Thabo Mokoena", age: 45, condition: "Type 2 Diabetes", lastVisit: "2026-04-10" },
  { id: "2", name: "Naledi Khumalo", age: 32, condition: "Hypertension", lastVisit: "2026-04-08" },
  { id: "3", name: "Sipho Dlamini", age: 58, condition: "Chronic Bronchitis", lastVisit: "2026-04-05" },
  { id: "4", name: "Zanele Mthembu", age: 27, condition: "Asthma", lastVisit: "2026-04-12" },
];

const mockPrescriptions = [
  { id: "RX-001", patient: "Thabo Mokoena", medication: "Metformin 850mg", doctor: "Dr. Nkosi", date: "2026-04-10", active: true },
  { id: "RX-002", patient: "Naledi Khumalo", medication: "Amlodipine 5mg", doctor: "Dr. van der Merwe", date: "2026-04-08", active: true },
  { id: "RX-003", patient: "Sipho Dlamini", medication: "Salbutamol Inhaler", doctor: "Dr. Nkosi", date: "2026-04-05", active: true },
];

function HospitalDashboard() {
  const { profile, approvalStatus, signOut } = useAuth();

  if (approvalStatus === "pending") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your hospital account is awaiting admin approval.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hospital Dashboard</h1>
          <p className="text-sm text-muted-foreground">{profile?.organization_name || "My Hospital"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { icon: Users, label: "Active Patients", value: "234", color: "text-primary" },
          { icon: FileText, label: "Prescriptions", value: "89", color: "text-healthcare-teal" },
          { icon: Stethoscope, label: "Doctors", value: "12", color: "text-healthcare-sky" },
          { icon: Activity, label: "Today's Visits", value: "18", color: "text-healthcare-green" },
        ].map((stat) => (
          <div key={stat.label} className="healthcare-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Patients */}
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Patients
            </h2>
            <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add Patient</Button>
          </div>
          <div className="space-y-3">
            {mockPatients.map((patient) => (
              <div key={patient.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">Age {patient.age} • {patient.condition}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Last visit</p>
                  <p className="text-xs font-medium text-foreground">{patient.lastVisit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prescriptions */}
        <div className="healthcare-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Recent Prescriptions
            </h2>
            <Button size="sm" variant="default"><Plus className="h-3 w-3 mr-1" /> New Prescription</Button>
          </div>
          <div className="space-y-3">
            {mockPrescriptions.map((rx) => (
              <div key={rx.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{rx.id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-healthcare-green/20 text-healthcare-green">Active</span>
                </div>
                <p className="text-sm font-medium text-foreground">{rx.medication}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Patient: {rx.patient} • {rx.doctor} • {rx.date}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
