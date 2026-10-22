// Binary reads can record an audit event; keep the next command on that saved version.
export function notifyBinaryVersion(response){const raw=response.headers.get('x-workspace-version');if(raw===null)return;const version=Number(raw);if(typeof window!=='undefined'&&Number.isSafeInteger(version)&&version>=0)window.dispatchEvent(new CustomEvent('healthreach:workspace-version',{detail:version}));}
