import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Stethoscope, Home, ChevronLeft, ChevronRight, Bell, Search, Heart, SlidersHorizontal, Star,
  User, Baby, HeartPulse, Brain, Microscope, Check, CheckCircle2, Calendar, Clock, MapPin,
  Video, Phone, Mic, Lock, Zap, Eye, History, MessageCircle, CreditCard, Clock3, Hand,
  UsersRound, Bandage, Accessibility, Pill, Sparkles, ShieldCheck,
} from "lucide-react";
import doctorImg from "@/assets/role-doctor.jpg";
import homecareImg from "@/assets/role-homecare.jpg";

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-[220px] shrink-0 rounded-[2rem] border-[6px] border-foreground/90 bg-card shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-2 text-[9px] font-semibold text-foreground">
        <span>9:41</span><span className="h-3 w-14 rounded-full bg-foreground/90" /><span>●●●</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold text-primary">HealthReachCare</span>
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="h-[380px] overflow-hidden px-3 pb-3 text-[10px] text-foreground">{children}</div>
    </div>
  );
}

const Btn = ({ children, outline }: { children: ReactNode; outline?: boolean }) => (
  <div className={`mt-2 rounded-lg py-2 text-center text-[10px] font-semibold ${outline ? "border border-primary text-primary" : "bg-primary text-primary-foreground"}`}>{children}</div>
);
const Row = ({ icon: I, t, s }: { icon: typeof User; t: string; s: string }) => (
  <div className="flex items-center gap-2 border-b border-border py-1.5">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10"><I className="h-3 w-3 text-primary" /></span>
    <div className="flex-1"><p className="font-semibold">{t}</p><p className="text-[8px] text-muted-foreground">{s}</p></div>
    <ChevronRight className="h-3 w-3 text-muted-foreground" />
  </div>
);
const KV = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-2 py-0.5"><span className="w-14 text-muted-foreground">{k}</span><span>{v}</span></div>
);
const Tick = ({ t }: { t: string }) => <p className="flex items-center gap-1.5 py-0.5"><Check className="h-3 w-3 text-primary" />{t}</p>;
const Toggle = ({ label }: { label: string }) => (
  <div className="mt-2 flex items-center justify-between font-semibold">{label}<span className="flex h-4 w-7 items-center justify-end rounded-full bg-primary p-0.5"><span className="h-3 w-3 rounded-full bg-card" /></span></div>
);
const Lead = ({ title, sub }: { title: string; sub: string }) => (
  <div className="flex items-center gap-2 py-1">
    <div className="h-10 w-10 rounded-lg bg-muted" />
    <div><p className="text-[11px] font-bold">{title}</p><p className="text-[8px] text-muted-foreground">{sub}</p><p className="text-[8px]"><Star className="inline h-2.5 w-2.5 fill-current text-amber-500" /> 4.9 (130 reviews)</p></div>
  </div>
);
const Favourite = ({ who, label, perks }: { who: string; label: string; perks: Array<[typeof Lock, string]> }) => (
  <>
    <Lead title={who} sub={label} />
    <div className="mt-2 flex gap-2 rounded-lg bg-primary/10 p-2"><Lock className="h-4 w-4 text-primary" /><p className="font-semibold">Make this your preferred {label.includes("Care") ? "caregiver" : "doctor"}</p></div>
    <Toggle label={`Set as preferred ${label.includes("Care") ? "caregiver" : "doctor"}`} />
    <div className="mt-2 space-y-1">{perks.map(([I, t]) => <p key={t} className="flex items-center gap-1.5"><I className="h-3 w-3 text-primary" />{t}</p>)}</div>
    <Btn>Save as Preferred</Btn>
    <p className="mt-1 text-center text-[8px] text-muted-foreground">You can still book other providers anytime.</p>
  </>
);

const doctorSteps: Array<[string, ReactNode]> = [
  ["Choose Your Need", <>
    <p className="text-sm font-bold">Book a Doctor</p>
    <p className="text-[8px] text-muted-foreground">Get professional medical care from trusted doctors.</p>
    <div className="my-2 flex items-center gap-1 rounded-lg bg-muted px-2 py-1.5 text-muted-foreground"><Search className="h-3 w-3" />What do you need help with?</div>
    <Row icon={Stethoscope} t="General Consultation" s="Common health concerns" />
    <Row icon={User} t="Women's Health" s="Female health and wellness" />
    <Row icon={Baby} t="Child Health" s="Paediatric care" />
    <Row icon={HeartPulse} t="Chronic Condition Review" s="Diabetes, hypertension, etc." />
    <Row icon={Brain} t="Mental Health" s="Counselling and support" />
    <Row icon={Microscope} t="Specialist Consultation" s="E.g. Cardiology, Dermatology" />
  </>],
  ["Find & Compare Doctors", <>
    <p className="text-sm font-bold">Available Doctors</p>
    <p className="text-[8px] text-muted-foreground">General Consultation</p>
    <div className="my-2 flex gap-1">{["Near me", "Today", "This week"].map((c) => <span key={c} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{c}</span>)}<SlidersHorizontal className="h-3.5 w-3.5 text-primary" /></div>
    {["Approved doctor", "Approved doctor", "Approved doctor", "Approved doctor"].map((n, i) => (
      <div key={i} className="flex gap-2 border-b border-border py-1.5">
        <div className="h-9 w-9 rounded-lg bg-muted" />
        <div className="flex-1"><p className="font-semibold">{n}</p><p className="text-[8px] text-muted-foreground">Specialty</p>
          <div className="mt-0.5 flex gap-1"><span className="rounded bg-primary/10 px-1 text-[8px] text-primary">In-person</span><span className="rounded bg-primary/10 px-1 text-[8px] text-primary">Online</span></div></div>
        <Heart className="h-3 w-3 text-muted-foreground" />
      </div>))}
  </>],
  ["Select Date & Time", <>
    <Lead title="Your doctor" sub="General Practitioner" />
    <div className="flex gap-1"><span className="rounded bg-primary/10 px-1.5 text-primary">In-person</span><span className="rounded bg-primary/10 px-1.5 text-primary">Online</span></div>
    <p className="mt-2 font-semibold">Select a date</p>
    <div className="mt-1 grid grid-cols-5 gap-1">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => <div key={d} className={`rounded-md border py-1 text-center ${i === 2 ? "bg-primary text-primary-foreground" : "border-border"}`}>{d}<br /><b>{14 + i}</b></div>)}</div>
    <p className="mt-2 font-semibold">Available time slots</p>
    <div className="mt-1 grid grid-cols-3 gap-1">{["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:30", "16:00"].map((t, i) => <div key={t} className={`rounded-md border py-1 text-center ${[2, 3, 4].includes(i) ? "bg-primary text-primary-foreground" : "border-border"}`}>{t}</div>)}</div>
    <Btn>Continue</Btn>
  </>],
  ["Review & Pay", <>
    <Lead title="Your Appointment" sub="General Practitioner" />
    <KV k="Date" v="Selected date" /><KV k="Time" v="Selected slot (30 min)" /><KV k="Type" v="In-person consultation" /><KV k="Location" v="Doctor's practice" />
    <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Consultation fee</span><span>Doctor's fee</span></div>
    <div className="mt-2 rounded-lg bg-primary/10 p-2"><p className="font-semibold">Cancellation Policy</p><p className="text-[8px]">Free cancellation up to 24 hours before your appointment.</p></div>
    <p className="mt-2 font-semibold">Payment Method</p>
    <div className="mt-1 flex items-center gap-1.5 rounded-md border border-primary p-1.5"><CheckCircle2 className="h-3 w-3 text-primary" />Pay with Card<CreditCard className="ml-auto h-3 w-3" /></div>
    <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border p-1.5"><span className="h-3 w-3 rounded-full border" />Pay with EFT</div>
    <Btn>Pay Securely</Btn>
  </>],
  ["Booking Confirmed", <div className="text-center">
    <CheckCircle2 className="mx-auto mt-2 h-10 w-10 text-primary" />
    <p className="mt-2 text-sm font-bold">Appointment Confirmed!</p>
    <p className="text-[8px] text-muted-foreground">Your appointment has been booked.</p>
    <div className="mt-2 space-y-1 rounded-lg bg-primary/10 p-2 text-left">
      <p className="flex gap-1.5"><Calendar className="h-3 w-3 text-primary" />Your date</p><p className="flex gap-1.5"><Clock className="h-3 w-3 text-primary" />30 minutes</p>
      <p className="flex gap-1.5"><User className="h-3 w-3 text-primary" />In-person consultation</p><p className="flex gap-1.5"><MapPin className="h-3 w-3 text-primary" />Practice address</p>
    </div>
    <Btn outline>Add to Calendar</Btn><Btn>View Appointment</Btn>
    <p className="mt-2 text-[8px] text-muted-foreground">You can chat with your doctor in the app.</p>
    <Btn outline><MessageCircle className="mr-1 inline h-3 w-3" />Message Doctor</Btn>
  </div>],
  ["Receive Care", <div className="relative -mx-3 -mb-3 h-[392px]">
    <img src={doctorImg} alt="Video consultation with a doctor" className="h-full w-full object-cover" loading="lazy" />
    <div className="absolute right-2 top-2 h-16 w-12 rounded-lg border-2 border-card bg-muted" />
    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
      <span className="rounded-full bg-foreground/70 p-2"><Video className="h-4 w-4 text-background" /></span>
      <span className="rounded-full bg-primary p-2"><Phone className="h-4 w-4 text-primary-foreground" /></span>
      <span className="rounded-full bg-foreground/70 p-2"><Mic className="h-4 w-4 text-background" /></span>
    </div>
  </div>],
  ["Lock Favourite Provider", <Favourite who="Your doctor" label="General Practitioner" perks={[[Zap, "Priority booking"], [Eye, "View future availability"], [Clock3, "Faster booking process"], [History, "Keep your medical history with them"]]} />],
];

const homecareSteps: Array<[string, ReactNode]> = [
  ["Choose a Service", <>
    <p className="text-sm font-bold">Book Home Care</p>
    <p className="text-[8px] text-muted-foreground">Professional care and support in the comfort of your home.</p>
    <div className="mt-2" />
    <Row icon={Hand} t="Personal Care" s="Assistance with daily living" />
    <Row icon={UsersRound} t="Elderly Care" s="Companionship and support" />
    <Row icon={Bandage} t="Post-Surgery Care" s="Recovery and rehabilitation" />
    <Row icon={Accessibility} t="Mobility Assistance" s="Help with movement and transfers" />
    <Row icon={Pill} t="Medication Support" s="Reminders and basic assistance" />
    <Row icon={Sparkles} t="Specialised Care" s="Additional support needs" />
  </>],
  ["Tell Us What You Need", <>
    <p className="text-sm font-bold">Service Details</p>
    <img src={homecareImg} alt="Caregiver with patient" className="my-2 h-24 w-full rounded-lg object-cover" loading="lazy" />
    <p className="text-[8px]">Compassionate care for loved ones, including personal care, companionship, meal preparation and mobility assistance.</p>
    <p className="mt-2 font-semibold">Service includes</p>
    <Tick t="Personal care assistance" /><Tick t="Companionship" /><Tick t="Meal preparation support" /><Tick t="Mobility assistance" /><Tick t="Medication reminders" />
    <p className="mt-1 font-semibold">Price set by quotation</p>
    <Btn>Continue</Btn>
  </>],
  ["Review & Submit", <>
    <p className="text-sm font-bold">Your Requirements</p>
    {[["Preferred Date", "Choose date", Calendar], ["Preferred Time", "09:00", Clock], ["Duration", "2 hours", Clock3], ["Your Address", "Your saved address", MapPin]].map(([l, v, I]) => {
      const Icon = I as typeof Calendar;
      return <div key={l as string} className="mt-1.5"><p className="font-semibold">{l as string}</p><div className="flex items-center justify-between rounded-md border border-border px-2 py-1">{v as string}<Icon className="h-3 w-3 text-muted-foreground" /></div></div>;
    })}
    <p className="mt-1.5 font-semibold">Additional Needs (Optional)</p>
    <div className="h-12 rounded-md bg-primary/10 p-1.5 text-[8px] text-muted-foreground">Tell us anything the caregiver should know.</div>
    <Btn>Continue</Btn>
  </>],
  ["Receive Quotation", <div>
    <Clock3 className="mx-auto mt-2 h-10 w-10 text-primary" />
    <p className="mt-1 text-center text-sm font-bold">Request Submitted</p>
    <p className="text-center text-[8px] text-muted-foreground">Your request has been sent to our support team. We will send you a quotation shortly.</p>
    <div className="mt-2 rounded-lg bg-primary/10 p-2">
      <p className="font-semibold">What happens next?</p>
      {[["Support reviews your request", "We check details and match the right caregiver"], ["Receive a quotation", "You'll get a detailed price and service plan"], ["Review and pay", "Once you accept, you can pay securely"], ["Service booked", "We will confirm the schedule with you"]].map(([t, s], i) => (
        <div key={t} className="mt-1.5 flex gap-1.5"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground">{i + 1}</span><div><p className="font-semibold">{t}</p><p className="text-[8px] text-muted-foreground">{s}</p></div></div>
      ))}
    </div>
  </div>],
  ["Pay & Confirm", <>
    <p className="text-sm font-bold">Quotation from Support</p>
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/10 p-2"><ShieldCheck className="h-4 w-4 text-primary" /><div><p className="font-semibold">HealthReachCare Support</p><p className="text-[8px]">Service Quotation</p></div></div>
    <div className="mt-2"><KV k="Service" v="Elderly Care" /><KV k="Date" v="Your date" /><KV k="Time" v="Your time" /><KV k="Caregiver" v="Assigned caregiver" /></div>
    <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Total Price</span><span>As quoted</span></div>
    <Btn outline>View Full Details</Btn>
    <p className="mt-1 text-center text-[8px] text-muted-foreground">This quotation is valid for 48 hours.</p>
    <Btn>Accept & Pay</Btn><Btn outline>Decline</Btn>
  </>],
  ["Service Day", <div className="-mx-3">
    <img src={homecareImg} alt="Caregiver visiting a patient at home" className="h-40 w-full object-cover" loading="lazy" />
    <div className="px-3">
      <p className="mt-2 flex items-center gap-1.5 font-bold"><CheckCircle2 className="h-4 w-4 text-primary" />Care in Progress</p>
      <p className="text-[8px] text-muted-foreground">Your caregiver has arrived and the service is in progress.</p>
      {["Caregiver on the way", "Arrived at your home", "Services in progress", "Service completed"].map((t, i) => (
        <p key={t} className={`mt-2 flex items-center gap-1.5 ${i === 2 ? "font-bold" : ""}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full ${i < 3 ? "bg-primary" : "bg-muted"}`}><Check className="h-2.5 w-2.5 text-primary-foreground" /></span>{t}</p>
      ))}
    </div>
  </div>],
  ["Lock Favourite Caregiver", <Favourite who="Your caregiver" label="Home Care Professional" perks={[[Zap, "Priority booking"], [UsersRound, "Request the same caregiver"], [Clock3, "Easier and faster booking"], [History, "Keep your care history with them"]]} />],
];

function Journey({ icon: I, title, sub, steps, to, cta }: { icon: typeof Home; title: string; sub: string; steps: Array<[string, ReactNode]>; to: "/doctors" | "/dashboard/patient/homecare"; cta: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <I className="h-9 w-9 text-primary" />
        <div><h2 className="text-2xl font-bold text-primary md:text-3xl">{title}</h2><p className="text-sm text-muted-foreground">{sub}</p></div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
        {steps.map(([label, body], i) => (
          <div key={label} className="flex shrink-0 snap-start items-center gap-1">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>{label}</p>
              <PhoneFrame>{body}</PhoneFrame>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-5 w-5 text-primary" />}
          </div>
        ))}
      </div>
      <Link to={to} className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">{cta}</Link>
    </section>
  );
}

export function BookingJourney() {
  return (
    <div className="space-y-10">
      <Journey icon={Stethoscope} title="Doctor Booking Process" sub="Find the right doctor, book with confidence, and receive quality care." steps={doctorSteps} to="/doctors" cta="Book a Doctor" />
      <Journey icon={Home} title="Home Care Booking Process" sub="Get trusted home care services, tailored to your needs, with compassionate professionals." steps={homecareSteps} to="/dashboard/patient/homecare" cta="Book Home Care" />
    </div>
  );
}
