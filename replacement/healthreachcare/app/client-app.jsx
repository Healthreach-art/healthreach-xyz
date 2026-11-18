'use client';
import dynamic from 'next/dynamic';

const HealthReachApp=dynamic(()=>import('./page'),{
 ssr:false,
 loading:()=> <main className="min-h-screen bg-white px-6 py-20 text-center text-gray-600" role="status">Loading HealthReachCare…</main>,
});

export default function ClientApp(props){return <HealthReachApp {...props}/>;}
