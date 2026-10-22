import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const cwd=resolve('replacement/healthreachcare');
function run(command,args){const result=spawnSync(command,args,{cwd,stdio:'inherit',env:{...process.env,SITES_MANAGED_LINUX_CONTAINER:'0'}});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
if(!existsSync(resolve(cwd,'node_modules/vinext')))run('npm',['install','--legacy-peer-deps','--no-audit','--no-fund','--package-lock=false']);
run('npm',['run','build']);
run('node',['deployment/prepare-cloudflare.mjs','--repository-root']);
