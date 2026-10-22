import App from '../../page';
import {getChatGPTUser} from '../../chatgpt-auth';
import {redirect} from 'next/navigation';
export default async function Dashboard({params,searchParams}:{params:Promise<{path:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const {path}=await params;const query=new URLSearchParams();for(const [key,value] of Object.entries(await searchParams||{}))for(const part of Array.isArray(value)?value:value?[value]:[])query.append(key,part);const returnTo='/dashboard/'+path.map(encodeURIComponent).join('/')+(query.size?'?'+query:'');if(!await getChatGPTUser())redirect('/login?returnTo='+encodeURIComponent(returnTo));return <App/>;}
