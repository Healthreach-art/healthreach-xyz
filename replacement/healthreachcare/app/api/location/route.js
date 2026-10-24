import {env} from 'cloudflare:workers';
import {addressGeocoding} from '../../../lib/address-geocoding.mjs';
export const dynamic='force-dynamic';
export const GET=req=>addressGeocoding(req,env);
export const POST=req=>addressGeocoding(req,env);
