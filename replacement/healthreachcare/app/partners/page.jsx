import App from '../page';
const roles=['Pharmacy','Doctor','Driver','Homecare'];
export default async function Partners({searchParams}){const query=await searchParams;const selectedRole=roles.includes(query?.role)?query.role:'';return <App initialPartnerHub initialPartnerRole={selectedRole}/>;}
