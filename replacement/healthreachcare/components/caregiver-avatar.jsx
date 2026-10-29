'use client';
import {useEffect,useState} from 'react';
import Image from 'next/image';
import {firebaseWorkspaceHeaders} from '../lib/firebase-client.mjs';

export function CaregiverAvatar({photo,name='',realAccount=false,size=52}){
 const [saved,setSaved]=useState('');
 useEffect(()=>{let active=true,url='';async function load(){setSaved('');if(!photo)return;try{const response=await fetch(photo,{headers:realAccount?await firebaseWorkspaceHeaders():{},cache:'no-store'});if(!response.ok)throw Error('Caregiver photo unavailable');url=URL.createObjectURL(await response.blob());if(active)setSaved(url);else URL.revokeObjectURL(url);}catch{if(active)setSaved('');}}void load();return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[photo,realAccount]);
 const initials=String(name||'Caregiver').trim().split(/\s+/).slice(0,2).map(value=>value[0]?.toUpperCase()).join('');
 return saved?<Image unoptimized src={saved} alt={name?name+' profile photo':'Caregiver profile photo'} width={size} height={size} style={{width:size,height:size,flex:'0 0 auto',borderRadius:'50%',objectFit:'cover'}}/>:<span aria-label={name?name+' profile photo unavailable':'Caregiver photo unavailable'} style={{width:size,height:size,flex:'0 0 auto',borderRadius:'50%',display:'grid',placeItems:'center',background:'#e5f6ed',color:'#08754e',fontWeight:700}}>{initials||'C'}</span>;
}
