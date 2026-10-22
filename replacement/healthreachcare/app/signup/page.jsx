import App from '../page';
import {safeReturnTo} from '../../lib/demo-access.mjs';
export default async function SignUp({searchParams}){const query=await searchParams;return <App initialEntry="signup" initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
