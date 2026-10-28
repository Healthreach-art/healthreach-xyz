'use client';
import {useRef,useState} from 'react';
import {CheckoutConsent} from './checkout-consent';
import {ArrowLeft,MapPin,ShieldCheck,CalendarDays,Clock3,HeartHandshake,Check} from 'lucide-react';
import {hasPatientBookableHomecareOffer} from '../lib/homecare-marketplace.mjs';

const money=value=>'R '+Number(value||0).toFixed(2);
const phases=['Care details','Review','Payment'];

export function HomecareBooking({s,service,serviceId,providerId,address,act,busy,onAddress,onBooked}){
 const offeringFor=provider=>provider.services?.find(value=>(serviceId?value.id===serviceId:value.name===service)&&value.active!==false&&Number(value.rate)>0);
 const candidates=s.providers.filter(provider=>provider.type==='Homecare'&&provider.status==='Approved'&&hasPatientBookableHomecareOffer(provider)&&offeringFor(provider));
 const [selected]=useState(providerId||candidates[0]?.id||''),[duration,setDuration]=useState(2),[step,setStep]=useState(0),[draft,setDraft]=useState(null),[saved,setSaved]=useState(null),[scenario,setScenario]=useState('Success'),[message,setMessage]=useState('');
 const paying=useRef(false),bookingKey=useRef(''),provider=candidates.find(value=>value.id===selected),offering=provider&&offeringFor(provider);
 const pricingModel=offering?.pricingModel||'hourly',minDuration=Number(offering?.minDuration||1),maxDuration=Number(offering?.maxDuration||24),visitDuration=Math.max(minDuration,Math.min(duration,maxDuration));
 const total=Math.round((offering?.rate||0)*(pricingModel==='hourly'?visitDuration:1)*100)/100,record=s.records?.find(value=>value.id===saved?.id)||saved;
 const priceLabel=pricingModel==='hourly'?'/ hour':pricingModel==='per-visit'?'/ visit':pricingModel==='daily'?'/ day':'/ package';
 const serviceAddress=address?.formatted||s.profile?.address||'';
 const canDemoPay=!s.realAccount||s.executionContext?.demoPayments===true;

 async function reserveBooking(){
  if(paying.current||record)return;
  paying.current=true;setMessage('');
  try{
   if(!bookingKey.current)bookingKey.current=crypto.randomUUID();
   const result=await act('request',{...draft,type:'Homecare',providerId:selected,service,serviceId:offering.id,duration:visitDuration,requestKey:bookingKey.current,expectedTotal:total,address:serviceAddress,addressDetails:address||undefined},'Homecare time reserved; payment pending');
   const id=result?.bookingId,booking=result?.records?.find(value=>value.id===id);
   if(!id||!booking){setMessage('We could not reserve this visit. Please review the date, time, address and published price, then try again.');return;}
   setSaved(booking);setStep(2);
  }catch(error){setMessage(error?.message||'We could not reserve this visit. Please try again.');}
  finally{paying.current=false;}
 }

 async function payAndConfirm(){
  if(paying.current||!record||!canDemoPay)return;
  paying.current=true;setMessage('');
  try{
   const result=await act('pay',{id:record.id,expectedTotal:record.total,scenario},'Homecare payment attempt saved');
   const updated=result?.records?.find(value=>value.id===record.id);
   if(updated?.payment==='Paid')onBooked(updated.id);
   else setMessage('Payment did not succeed. The booking remains unpaid and is not confirmed. Retry the payment or open the saved booking in Activities.');
  }catch(error){setMessage(error?.message||'Payment did not complete. The booking remains unpaid. Please retry.');}
  finally{paying.current=false;}
 }

 if(!provider||!offering)return <div className="form homecare-direct-checkout" role="status"><h2>Service booking unavailable</h2><p>This published service could not be matched to its saved provider price. Please return to Homecare and try again, or contact support. No request or payment was created.</p></div>;
 return <div className="form homecare-direct-checkout">
  <div className="eyebrow">HEALTHREACHCARE HOMECARE</div>
  <h2>{step===0?service:step===1?'Review your homecare booking':'Payment'}</h2>
  <ol className="homecare-checkout-steps" aria-label="Homecare booking progress">{phases.map((phase,index)=><li key={phase} className={index===step?'current':index<step?'complete':''} aria-current={index===step?'step':undefined}><span>{index<step?<Check size={14}/>:index+1}</span><small>{phase}</small></li>)}</ol>

  {step===0&&<form className="form" onSubmit={event=>{event.preventDefault();setDraft(Object.fromEntries(new FormData(event.currentTarget)));setMessage('');setStep(1);}}>
   <div className="notice"><HeartHandshake size={18}/><span>Coordinated by the HealthReachCare Homecare team</span></div>
   <p>{offering.description}</p><p className="journey-intro">Published price: <strong>{money(offering.rate)} {priceLabel}</strong></p>
   <label><CalendarDays size={15}/> Preferred date<input name="date" type="date" min={new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.serverTime))} defaultValue={draft?.date} required/></label>
   <label><Clock3 size={15}/> Start time (South Africa)<input name="time" type="time" defaultValue={draft?.time} required/></label>
   <label>Care duration<select value={visitDuration} onChange={event=>setDuration(Number(event.target.value))}>{Array.from({length:maxDuration-minDuration+1},(_,index)=>minDuration+index).map(hours=><option key={hours} value={hours}>{hours} {hours===1?'hour':'hours'}</option>)}</select></label>
   <label>Care requirements<textarea name="requirements" maxLength={1000} defaultValue={draft?.requirements} placeholder="Share only information relevant to this service"/></label>
   <div className="notice"><MapPin size={16}/><span>{serviceAddress||'Choose a service address'}</span></div>
   <button type="button" className="outline" onClick={onAddress}>Change service address</button>
   <div className="summary-line"><span>{pricingModel==='hourly'?money(offering.rate)+' × '+visitDuration+' hours':money(offering.rate)+' fixed '+(pricingModel==='per-visit'?'per visit':pricingModel==='daily'?'per day':'package')}</span><b>{money(total)}</b></div>
   <div className="summary-line total"><span>Final total</span><b>{money(total)}</b></div>
   <button disabled={busy||!visitDuration||!total||!serviceAddress}>Review booking</button>
  </form>}

  {step===1&&draft&&<>
   <p>Confirm your selected service, schedule and total before continuing.</p>
   <dl className="appointment-detail-list"><dt>Care service</dt><dd>{service}</dd><dt>Date & time</dt><dd>{draft.date} at {draft.time}</dd><dt>Duration</dt><dd>{visitDuration} hours</dd><dt>Address</dt><dd>{serviceAddress}</dd>{draft.requirements&&<><dt>Care requirements</dt><dd>{draft.requirements}</dd></>}<dt>Published price</dt><dd>{money(offering.rate)} {priceLabel}</dd></dl>
   <div className="summary-line total"><span>Final total</span><b>{money(total)}</b></div>
   <p className="notice"><ShieldCheck size={17}/> The date and time are checked against the saved service availability before a temporary payment reservation is created.</p>
   <button className="homecare-checkout-primary" disabled={busy} onClick={()=>setStep(0)}><ArrowLeft size={16}/> Edit care details</button>
   <button disabled={busy||!canDemoPay} onClick={()=>void reserveBooking()}>{busy?'Saving…':'Continue to payment'}</button>
   {!canDemoPay&&<p role="status" className="muted">Payment processing is not connected. No payment or booking confirmation will be created.</p>}
  </>}

  {step===2&&record&&<>
   <p>Review the reserved visit and choose the available payment step.</p>
   <dl className="appointment-detail-list"><dt>Care service</dt><dd>{record.title||service}</dd><dt>Date & time</dt><dd>{record.date} at {record.time}</dd><dt>Duration</dt><dd>{record.duration} hours</dd><dt>Address</dt><dd>{record.address||serviceAddress}</dd><dt>Payment status</dt><dd>{record.payment==='Paid'?'Paid · Demo':'Awaiting payment'}</dd></dl>
   <div className="summary-line total"><span>Amount due</span><b>{money(record.total)}</b></div>
   {canDemoPay?<><p className="notice"><ShieldCheck size={17}/> Demo payment only. No real money is collected. The booking is sent to Homecare after the payment is successfully saved.</p><details className="homecare-payment-test"><summary>Test payment outcome</summary><label>Outcome<select value={scenario} onChange={event=>setScenario(event.target.value)}><option value="Success">Successful</option><option value="Failure">Declined</option><option value="Cancel">Cancelled</option></select></label></details><CheckoutConsent s={s} act={act} busy={busy}/><button disabled={busy||record.payment==='Paid'} onClick={()=>void payAndConfirm()}>{busy?'Processing…':`Pay now (demo) ${money(record.total)}`}</button><p className="muted">A declined or cancelled payment leaves this booking unpaid. You can retry from this screen or Activities.</p></>:<p role="status" className="notice">Payment processing is not connected. This reservation is not confirmed.</p>}
  </>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
 </div>;
}
