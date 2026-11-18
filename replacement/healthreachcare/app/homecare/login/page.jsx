import ClientApp from '../../client-app';
import {safeReturnTo} from '../../../lib/demo-access.mjs';
export default async function HomecareStaffLogin({searchParams}){const query=await searchParams;return <ClientApp initialEntry="login" initialPartner initialHomecare initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
