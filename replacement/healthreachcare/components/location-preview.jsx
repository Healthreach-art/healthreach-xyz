'use client';
import {useEffect,useState} from 'react';
import {MapPin,ExternalLink} from 'lucide-react';
import {validMapPoint,mapEmbed} from '../lib/map-location.mjs';
export function LocationPreview({point,address=''}){
 const valid=validMapPoint(point);
 if(!valid&&!address.trim())return null;
 const query=valid?point.latitude+','+point.longitude:address;
 return <div className="location-preview"><div className="section-title"><h3><MapPin size={18}/> {valid?'Your location pin':'Find your address'}</h3>{valid&&<span>Accuracy: {Number.isFinite(point.accuracy)?Math.round(point.accuracy)+' m':'not supplied'}</span>}</div>{valid?<><p>Check that this pin matches your delivery address before saving.</p><MapFrame point={point}/></>:<p>Add your device location to show a precise pin, or open your entered address in maps.</p>}<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query)} target="_blank" rel="noopener noreferrer">Open in maps <ExternalLink size={14}/></a></div>;
}

function MapFrame({point}){
 const [mapFailed,setMapFailed]=useState(false);
 useEffect(()=>{const timeout=setTimeout(()=>setMapFailed(true),12000);return()=>clearTimeout(timeout);},[point.latitude,point.longitude]);
 return <><iframe title="Selected delivery location on OpenStreetMap" src={mapEmbed(point)} className="patient-street-map" referrerPolicy="no-referrer" loading="eager" onError={()=>setMapFailed(true)}/><small>{mapFailed?'Map preview is unavailable right now. Open the pin in your maps app.':'Map preview from OpenStreetMap. Loading it shares this map area and pin with OpenStreetMap.'}</small></>;
}
