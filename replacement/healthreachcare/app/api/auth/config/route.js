import {env} from 'cloudflare:workers';
import {firebaseConnection} from '../../../../lib/firebase-connection.mjs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(firebaseConnection(env),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
