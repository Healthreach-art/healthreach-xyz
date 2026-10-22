'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
export function ProfilePhotoUpload({ act, busy }) { const [file, setFile] = useState(null), [preview, setPreview] = useState(''), [status, setStatus] = useState(''); useEffect(() => () => { if (preview)
    URL.revokeObjectURL(preview); }, [preview]); return <form className="panel padded form section" onSubmit={async (e) => { e.preventDefault(); const consent = new FormData(e.currentTarget).get('consent') === 'on'; if (!file)
    return; if (file.size > 2097152) {
    setStatus('Choose an image under 2 MB.');
    return;
} const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192)); setStatus('Saving photograph…'); const d = await act('uploadProfilePhoto', { base64: btoa(raw), consent }, 'Photograph saved for publication review'); setStatus(d ? 'Saved for review. Submit the profile for publication; the photo is not public until approved.' : 'Photograph was not saved. Resolve the error and retry.'); }}><h2>Professional profile photograph</h2><label>PNG or JPEG, 32–4096 pixels, under 2 MB<input type="file" accept="image/png,image/jpeg" required onChange={e => { const next = e.target.files?.[0]; setFile(next || null); setPreview(next ? URL.createObjectURL(next) : ''); }}/></label>{preview && <Image unoptimized src={preview} width={120} height={120} alt="Selected profile photograph preview" style={{ objectFit: 'cover', borderRadius: 16 }}/>}<label className="checkbox"><input type="checkbox" name="consent" required/>I am authorised to publish this photograph on this profile.</label><button disabled={busy || !file}>Upload photograph for review</button><p role="status">{status}</p></form>; }
