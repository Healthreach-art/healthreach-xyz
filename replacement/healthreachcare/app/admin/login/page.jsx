import App from '../../page';
import {safeReturnTo} from '../../../lib/demo-access.mjs';
export default async function AdminLogin({searchParams}){const query=await searchParams;return <App initialEntry="login" initialAdmin initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
