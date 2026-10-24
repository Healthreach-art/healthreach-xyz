import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
 metadataBase:new URL('https://healthreachcare.co.za'),
 title:{default:'HealthReachCare | Healthcare, within reach.',template:'%s | HealthReachCare'},
 description:'Order medication, book doctor appointments and find homecare services with HealthReachCare.',
 applicationName:'HealthReachCare',manifest:'/site.webmanifest',appleWebApp:{capable:true,title:'HealthReachCare',statusBarStyle:'default'},
 icons:{icon:[{url:'/brand-icon-48.png',sizes:'48x48',type:'image/png'},{url:'/brand-icon-96.png',sizes:'96x96',type:'image/png'}],shortcut:'/favicon.ico',apple:'/brand-icon-180.png'},
 openGraph:{type:'website',siteName:'HealthReachCare',title:'HealthReachCare',description:'Healthcare, within reach.',url:'https://healthreachcare.co.za',images:[{url:'/healthreachcare-logo.png',width:768,height:768,alt:'HealthReachCare logo'}]},
 twitter:{card:'summary',title:'HealthReachCare',description:'Healthcare, within reach.',images:['/healthreachcare-logo.png']},
};
export const viewport={themeColor:'#13A673'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className="antialiased"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Organization",name:"HealthReachCare",url:"https://healthreachcare.co.za",logo:"https://healthreachcare.co.za/healthreachcare-logo.png",email:"support@healthreachcare.co.za",telephone:"+27 79 728 5078"})}}/>{children}</body></html>;}
