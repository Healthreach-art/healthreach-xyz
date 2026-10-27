import App from '../../page';
import {safeReturnTo} from '../../../lib/demo-access.mjs';
export default async function HomecareStaffLogin({searchParams}){const query=await searchParams;return <App initialEntry="login" initialPartner initialHomecare initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
