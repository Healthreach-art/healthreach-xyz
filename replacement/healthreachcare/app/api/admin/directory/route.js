import {env} from 'cloudflare:workers';
import {adminDirectory} from '../../../../lib/admin-directory.mjs';
export const dynamic='force-dynamic';
export async function GET(req){return adminDirectory(req,env);}
