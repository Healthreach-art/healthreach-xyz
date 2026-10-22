import App from '../page';
import {safeReturnTo} from '../../lib/demo-access.mjs';
export default async function Login({searchParams}){const query=await searchParams;return <App initialEntry="login" initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
