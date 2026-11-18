import ClientApp from '../client-app';
import {safeReturnTo} from '../../lib/demo-access.mjs';
export default async function Login({searchParams}){const query=await searchParams;return <ClientApp initialEntry="login" initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
