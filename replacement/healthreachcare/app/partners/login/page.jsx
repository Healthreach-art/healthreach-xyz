import App from '../../page';
const roles=['Pharmacy','Doctor','Driver'];
export default async function PartnerLogin({searchParams}){const query=await searchParams;const role=roles.includes(query?.role)?query.role:'';return <App initialEntry="login" initialPartner initialPartnerRole={role}/>;}
