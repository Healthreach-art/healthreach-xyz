'use client';
import {ShieldCheck,ArrowLeft} from 'lucide-react';

/**
 * An unavailable homecare service is not an order. Do not create unpaid
 * availability requests or expose quotation workflows from checkout.
 */
export function HomecareAvailability({service,onBack}){
 return <section className="form homecare-unavailable" aria-live="polite">
  <div className="eyebrow">HOMECARE BOOKING</div>
  <h2>{service}</h2>
  <div className="notice"><ShieldCheck size={18}/><span>Currently unavailable for booking</span></div>
  <p>No approved care provider has published an available fixed-price offering for this service yet. You will not be charged or placed into an unpaid request.</p>
  <p>Please choose another care service or check back later.</p>
  {onBack&&<button type="button" className="outline" onClick={onBack}><ArrowLeft size={16}/> Choose another service</button>}
 </section>;
}
