import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const firebaseConfig=JSON.parse(readFileSync(new URL('../config/firebase-web.json',import.meta.url),'utf8'));
export function configureDeployment(config) {
  if (!config.main || !config.assets?.directory) throw new Error('Expected a complete built Worker with client assets. Run the production build first.');
  return {
    ...config,
    name: 'healthreachcare',
    topLevelName: 'healthreachcare',
    keep_vars: true,
    vars:{...config.vars,FIREBASE_AUTH_ENABLED:'true',FIREBASE_REGISTRATION_ENABLED:'true',FIREBASE_GOOGLE_ENABLED:'true',HRC_DEMO_ENABLED:'false',HRC_HOMEBASE_ALLOWLIST:'true',HRC_SIMULATED_PAYMENTS_ENABLED:'true',FIREBASE_WEB_CONFIG:JSON.stringify(firebaseConfig)},
    d1_databases: [{ binding: 'DB', database_name: 'healthreachcare-app', database_id: 'aa78a384-cc38-4141-b550-fda0f34fb3a2' }],
    r2_buckets: [
      { binding: 'BUCKET', bucket_name: 'healthreachcare-documents' },
      { binding: 'DOCUMENTS_BUCKET', bucket_name: 'healthreachcare-documents' },
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/server/wrangler.json');
  if (!existsSync(target)) throw new Error('Missing build output. Run npm run build first.');
  const config = configureDeployment(JSON.parse(readFileSync(target, 'utf8')));
  writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
  if(process.argv.includes('--repository-root')){const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');const output=resolve(root,'wrangler.jsonc');const base=dirname(target);writeFileSync(output,JSON.stringify({...config,main:relative(root,resolve(base,config.main)),assets:{...config.assets,directory:relative(root,resolve(base,config.assets.directory)),binding:'ASSETS'}},null,2)+'\n');}
  console.log('Prepared Cloudflare build configuration. No deployment was performed.');
}
