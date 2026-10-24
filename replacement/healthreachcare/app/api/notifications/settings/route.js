import {env} from 'cloudflare:workers';
import {notificationSettings} from '../../../../lib/notification-delivery.mjs';
export const dynamic='force-dynamic';
export const GET=req=>notificationSettings(req,env);
export const POST=req=>notificationSettings(req,env);
