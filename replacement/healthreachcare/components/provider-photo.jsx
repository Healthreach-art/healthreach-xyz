'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export function ProfilePhotoUpload({ act, busy, provider }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const publishedPhoto = provider?.photoApproved === true
    && provider?.publication?.status === 'Published'
    && typeof provider?.photoURL === 'string'
    && provider.photoURL.startsWith('/api/product-image/');

  async function submit(event) {
    event.preventDefault();
    const consent = new FormData(event.currentTarget).get('consent') === 'on';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 2097152) {
      setStatus('Choose a PNG or JPEG image under 2 MB.');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    setStatus('Saving photograph securely…');
    const saved = await act('uploadProfilePhoto', { base64: btoa(raw), consent }, 'Photograph saved for publication review');
    setStatus(saved
      ? 'Photo saved for review. It will appear to patients after your public profile is approved.'
      : 'Photo was not saved. Resolve the error shown above and retry.');
  }

  return <form className="panel padded form section" onSubmit={submit}>
    <h2>Profile photo</h2>
    <p>Upload a clear PNG or JPEG (32–4096 pixels per side, maximum 2 MB). A new photo is private until the profile review is approved.</p>
    {publishedPhoto && !preview && <div style={{display:"flex",alignItems:"center",gap:14,padding:12,background:"#f2f8f5",borderRadius:12}}>
      <Image unoptimized src={provider.photoURL} width={120} height={120} alt="Current published doctor profile photo" style={{ objectFit: 'cover', borderRadius: '50%' }}/>
      <span>Current patient-visible photo</span>
    </div>}
    {provider?.pendingPhotoId && <p role="status">A profile photo is saved and awaiting publication review.</p>}
    <label>Upload a new profile photo
      <input type="file" accept="image/png,image/jpeg" required onChange={event => {
        const next = event.currentTarget.files?.[0] || null;
        setFile(next);
        setPreview(next ? URL.createObjectURL(next) : '');
        setStatus('');
      }}/>
    </label>
    {preview && <div className="doctor-profile-photo-preview">
      <Image unoptimized src={preview} width={120} height={120} alt="Selected doctor profile photo preview" style={{ objectFit: 'cover', borderRadius: '50%' }}/>
      <span>Preview</span>
    </div>}
    <label className="checkbox"><input type="checkbox" name="consent" required/>I am authorised to publish this photograph on this profile.</label>
    <button disabled={busy || !file}>Save photo for review</button>
    <p role="status">{status}</p>
  </form>;
}
