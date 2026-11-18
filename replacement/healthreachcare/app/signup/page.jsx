import ClientApp from '../client-app';
import {safeReturnTo} from '../../lib/demo-access.mjs';
export default async function SignUp({searchParams}){const query=await searchParams;return <ClientApp initialEntry="signup" initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
