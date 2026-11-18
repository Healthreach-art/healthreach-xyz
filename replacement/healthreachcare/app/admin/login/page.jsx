import ClientApp from '../../client-app';
import {safeReturnTo} from '../../../lib/demo-access.mjs';
export default async function AdminLogin({searchParams}){const query=await searchParams;return <ClientApp initialEntry="login" initialAdmin initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
