'use client';
import {useState} from 'react';
import {MapPin,ExternalLink} from 'lucide-react';
import {validMapPoint,mapEmbed} from '../lib/map-location.mjs';
export function LocationPreview({point,address=''}){
 const [expanded,setExpanded]=useState(false);
 const valid=validMapPoint(point);
 if(!valid&&!address.trim())return null;
 const query=valid?point.latitude+','+point.longitude:address;
 return <div className="location-preview"><div className="section-title"><h3><MapPin size={18}/> {valid?'Your location pin':'Find your address'}</h3>{valid&&<span>Accuracy: {Number.isFinite(point.accuracy)?Math.round(point.accuracy)+' m':'not supplied'}</span>}</div>{valid?<><p>Confirm that the street address matches this pin before saving. Your location does not verify the street address.</p>{expanded?<iframe title="Selected delivery location on OpenStreetMap" src={mapEmbed(point)} className="patient-street-map" referrerPolicy="no-referrer" loading="lazy"/>:<button className="outline" type="button" onClick={()=>setExpanded(true)}>Show location map</button>}<small>Loading the map shares this map area and pin with OpenStreetMap.</small></>:<p>Add your device location to show a precise pin, or open your entered address in maps.</p>}<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query)} target="_blank" rel="noopener noreferrer">Open in maps <ExternalLink size={14}/></a></div>;
}
