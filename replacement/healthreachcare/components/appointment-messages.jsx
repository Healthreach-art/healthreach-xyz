'use client';
import { MessageCircle, ChevronRight, Stethoscope, UserRound } from 'lucide-react';

// Only a successfully paid appointment can open a patient/doctor conversation.
// Accepted is a normal doctor workflow status too, so keep that chat available.
const activeAppointment = record => record?.type === 'Doctor' && record.payment === 'Paid' && ['Confirmed', 'Accepted', 'In consultation'].includes(record.status);
const appointmentDate = record => {
  if (!record?.date) return 'Appointment time not set';
  const date = new Date(`${record.date}T${record.time || '12:00'}:00+02:00`);
  return `${new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short' }).format(date)}${record.time ? ` · ${record.time}` : ''}`;
};

/** Appointment-scoped entry points for the shared patient/doctor service chat. */
export function AppointmentMessages({ s, role, records = [], onOpen }) {
  if (!['Patient', 'Doctor'].includes(role)) return null;
  const accountId = s?.session?.accountId;
  const appointments = records.filter(activeAppointment).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const conversations = s?.conversations || [];
  const providers = s?.providers || [];
  return <section className="panel padded section appointment-messages" aria-labelledby="appointment-messages-title">
    <div className="section-title"><div><h2 id="appointment-messages-title">Doctor appointment messages</h2><p>Open the saved conversation for a confirmed appointment.</p></div><MessageCircle size={20} aria-hidden="true"/></div>
    {!appointments.length ? <div className="appointment-messages-empty"><Stethoscope size={20}/><p>Messages are available here after an appointment is paid and confirmed.</p></div> : <div className="appointment-message-list">{appointments.map(record => {
      const thread = conversations.find(c => c.recordId === record.id && c.channel === 'doctor' && !c.archived);
      const messages = thread?.messages || [];
      const unread = messages.filter(m => m.senderId !== accountId && !(m.readBy || []).includes(accountId)).length;
      const provider = providers.find(p => p.id === record.providerId);
      const participant = role === 'Patient' ? provider?.name || record.doctorName || 'Your doctor' : record.patientName || 'Patient';
      const latest = messages.at(-1);
      const preview = latest?.body || (latest?.attachment ? `Attachment: ${latest.attachment.filename}` : 'Start a conversation about this appointment');
      const Icon = role === 'Patient' ? Stethoscope : UserRound;
      return <article className="appointment-message-row" key={record.id}>
        <span className="appointment-message-avatar" aria-hidden="true"><Icon size={18}/></span>
        <div className="appointment-message-copy"><b>{participant}</b><small>{record.title || 'Doctor appointment'} · {appointmentDate(record)} · {record.status}</small><span>{preview}</span></div>
        <div className="appointment-message-action">{unread > 0 && <span className="badge green">{unread} unread</span>}<button type="button" className="outline" aria-label={`Open conversation with ${participant}`} onClick={() => onOpen?.(record)}>Message</button></div>
        <ChevronRight size={16} aria-hidden="true"/>
      </article>;
    })}</div>}
  </section>;
}
