import {firebaseConnection} from './firebase-connection.mjs';
import {verifyFirebaseIdentity} from './firebase-server.mjs';
import {AccountValidationError,accountKey} from './real-account.mjs';
export async function accountIdentity(req,env){const header=req.headers.get('authorization')||'';if(!header.startsWith('Bearer '))throw Error('Sign in to continue');return verifyFirebaseIdentity(header.slice(7),env);}
export function accountPrefix(env){return 'firebase-account:'+firebaseConnection(env).config.projectId+':';}
export async function readAccount(env,uid){const key=accountKey(firebaseConnection(env).config.projectId,uid);const row=await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind(key).first();return {key,raw:row?.data||null,account:row?JSON.parse(row.data):null};}
export async function saveAccount(env,row,next){const raw=JSON.stringify(next),now=new Date().toISOString();const r=row.raw?await env.DB.prepare('UPDATE workspaces SET data=?,updated=? WHERE id=? AND data=?').bind(raw,now,row.key,row.raw).run():await env.DB.prepare('INSERT OR IGNORE INTO workspaces (id,data,updated) VALUES (?,?,?)').bind(row.key,raw,now).run();if(!r.meta.changes)throw new AccountValidationError('Your account changed in another session. Refresh and retry.');}
