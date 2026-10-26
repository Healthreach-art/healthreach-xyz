'use client';
import {useRef,useState} from 'react';
import {CheckoutConsent} from './checkout-consent';
import {HomecareAvailability} from './homecare-availability';
import {ArrowLeft,MapPin,ShieldCheck,CalendarDays,Clock3,HeartHandshake} from 'lucide-react';
const money=v=>'R '+Number(v||0).toFixed(2);
export function HomecareBooking({s,service,providerId,address,act,busy,onAddress,onBooked}){
 const candidates=s.providers.filter(d=>d.type==='Homecare'&&d.status==='Approved'&&d.acceptingOrders!==false&&d.services?.some(v=>v.name===service&&v.active!==false&&v.rate>0));
 const [selected]=useState(providerId||candidates[0]?.id||''),[duration,setDuration]=useState(2),[review,setReview]=useState(false),[draft,setDraft]=useState(null),[saved,setSaved]=useState(null),[scenario,setScenario]=useState('Success'),[message,setMessage]=useState('');
 const paying=useRef(false),bookingKey=useRef(''),provider=candidates.find(d=>d.id===selected),offering=provider?.services.find(v=>v.name===service);
 const pricingModel=offering?.pricingModel||'hourly',minDuration=Number(offering?.minDuration||1),maxDuration=Number(offering?.maxDuration||24),visitDuration=Math.max(minDuration,Math.min(duration,maxDuration));
 const total=Math.round((offering?.rate||0)*(pricingModel==='hourly'?visitDuration:1)*100)/100,record=s.records?.find(r=>r.id===saved?.id)||saved;
 const priceLabel=pricingModel==='hourly'?'/ hour':pricingModel==='per-visit'?'/ visit':pricingModel==='daily'?'/ day':'/ package';
 async function bookAndPay(){if(paying.current)return;paying.current=true;setMessage('');try{if(!bookingKey.current)bookingKey.current=crypto.randomUUID();let booking=record;if(!booking){const result=await act('request',{...draft,type:'Homecare',providerId:selected,service,serviceId:offering.id,duration:visitDuration,requestKey:bookingKey.current,expectedTotal:total,address:address?.formatted||s.profile.address,addressDetails:address||undefined},'Homecare time reserved; payment pending');if(!result?.bookingId)return;booking=result.records?.find(r=>r.id===result.bookingId);if(!booking){setMessage('Reservation saved. Open Activities to continue payment.');return;}setSaved(booking);}const result=await act('pay',{id:booking.id,expectedTotal:booking.total,scenario},'Homecare payment attempt saved');if(result){const confirmed=result.records?.find(r=>r.id===booking.id);if(confirmed?.payment==='Paid'){onBooked(confirmed.id);}else setMessage('Payment did not succeed. Your booking is unpaid; no service has been confirmed. Retry payment or open the saved booking in Activities.');}}finally{paying.current=false;}}
 if(!provider||!offering)return <HomecareAvailability s={s} service={service} address={address} act={act} busy={busy} onAddress={onAddress} onBooked={onBooked}/>;
 return <div className="form homecare-direct-checkout"><div className="eyebrow">HEALTHREACHCARE HOMECARE</div><h2>{review?'Review your homecare booking':service}</h2>
 {!review?<form className="form" onSubmit={e=>{e.preventDefault();setDraft(Object.fromEntries(new FormData(e.currentTarget)));setReview(true);}}>
  <div className="notice"><HeartHandshake size={18}/><span>Coordinated by the HealthReachCare Homecare team</span></div><p>{offering.description}</p>
  <p className="journey-intro">Published fixed price: <strong>{money(offering.rate)} {priceLabel}</strong></p>
  <label><CalendarDays size={15}/> Preferred date<input name="date" type="date" min={new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.serverTime))} defaultValue={draft?.date} required/></label>
  <label><Clock3 size={15}/> Start time (South Africa)<input name="time" type="time" defaultValue={draft?.time} required/></label>
  <label>Care duration<select value={visitDuration} onChange={e=>setDuration(Number(e.target.value))}>{Array.from({length:maxDuration-minDuration+1},(_,i)=>minDuration+i).map(h=><option key={h} value={h}>{h} {h===1?'hour':'hours'}</option>)}</select></label>
  <label>Care requirements<textarea name="requirements" required maxLength={1000} defaultValue={draft?.requirements} placeholder="Only information relevant to this service"/></label>
  <div className="notice"><MapPin size={16}/> {address?.formatted||s.profile.address||'Choose a service address'}</div><button type="button" className="outline" onClick={onAddress}>Change service address</button>
  <div className="summary-line"><span>{pricingModel==='hourly'?money(offering.rate)+' × '+visitDuration+' hours':money(offering.rate)+' fixed '+(pricingModel==='per-visit'?'per visit':pricingModel==='daily'?'per day':'package')}</span><b>{money(total)}</b></div>
  <div className="summary-line total"><span>Final total</span><b>{money(total)}</b></div><button disabled={busy||!visitDuration||!total||!(address?.formatted||s.profile.address)}>Review booking</button>
 </form>:<>
  <p>{service} · HealthReachCare coordinated homecare</p><dl className="appointment-detail-list"><dt>Date & time</dt><dd>{draft.date} at {draft.time}</dd><dt>Duration</dt><dd>{visitDuration} hours</dd><dt>Address</dt><dd>{address?.formatted||s.profile.address}</dd><dt>Published price</dt><dd>{money(record?.priceSnapshot?.rate??offering.rate)} {priceLabel}</dd></dl>
  <div className="summary-line total"><span>Final total</span><b>{money(record?.total??total)}</b></div><p className="notice"><ShieldCheck size={17}/> {s.realAccount&&!s.executionContext?.demoPayments?'Payment processing is not connected yet. No payment or booking confirmation will be created.':'Demo payment only. No real money is collected. The provider receives the booking after the simulated payment is saved.'}</p>
  {(!s.realAccount||s.executionContext?.demoPayments)&&<details><summary>Test payment outcome</summary><label>Outcome<select value={scenario} onChange={e=>setScenario(e.target.value)}><option>Success</option><option value="Failure">Declined</option><option value="Cancel">Cancelled</option></select></label></details>}
  <CheckoutConsent s={s} act={act} busy={busy}/><button disabled={s.realAccount&&!s.executionContext?.demoPayments||busy||record?.payment==='Paid'} onClick={bookAndPay}>Book & pay (demo) {money(record?.total??total)}</button>
  {!record&&<button className="outline" disabled={busy} onClick={()=>setReview(false)}><ArrowLeft size={16}/> Edit booking</button>}{record&&<p>Reservation saved in Activities. A failed or cancelled payment never confirms the service.</p>}
 </>}{message&&<p role="status">{message}</p>}</div>;
}
