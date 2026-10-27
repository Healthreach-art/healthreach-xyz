import App from '../../page';
import {safeReturnTo} from '../../../lib/demo-access.mjs';
const roles=['Pharmacy','Doctor','Driver'];
export default async function PartnerLogin({searchParams}){const query=await searchParams;const role=roles.includes(query?.role)?query.role:'';return <App initialEntry="login" initialPartner initialPartnerRole={role} initialReturnTo={safeReturnTo(query?.returnTo)}/>;}
