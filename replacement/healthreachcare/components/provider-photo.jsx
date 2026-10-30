'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { firebaseWorkspaceHeaders } from '../lib/firebase-client.mjs';

export function useDoctorProfilePhoto(provider) {
  const pendingPhotoId = provider?.pendingPhotoId || '';
  const publishedPhoto = provider?.photoApproved === true
    && provider?.publication?.status === 'Published'
    && typeof provider?.photoURL === 'string'
    && provider.photoURL.startsWith('/api/product-image/')
    ? provider.photoURL : '';
  const [savedPhoto, setSavedPhoto] = useState({ id: '', url: '' });
  useEffect(() => {
    if (!pendingPhotoId) return;
    let active = true, objectUrl = '';
    async function loadSavedPhoto() {
      try {
        const response = await fetch('/api/product-image/' + encodeURIComponent(pendingPhotoId) + '?preview=1', {
          headers: await firebaseWorkspaceHeaders(),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Saved photo preview is unavailable.');
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSavedPhoto({ id: pendingPhotoId, url: objectUrl });
        else URL.revokeObjectURL(objectUrl);
      } catch {
        // Keep the last successful state; the ID check below prevents showing an older photo.
      }
    }
    void loadSavedPhoto();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pendingPhotoId]);
  const savedPreview = savedPhoto.id === pendingPhotoId ? savedPhoto.url : '';
  return { pendingPhotoId, savedPreview, publishedPhoto };
}

export function DoctorProfileAvatar({ provider, size = 72 }) {
  const { pendingPhotoId, savedPreview, publishedPhoto } = useDoctorProfilePhoto(provider);
  const source = savedPreview || publishedPhoto;
  const initials = String(provider?.name || 'Doctor').trim().split(/\\s+/).slice(0, 2).map(v => v[0]).join('').toUpperCase();
  return source
    ? <Image unoptimized src={source} width={size} height={size} alt={pendingPhotoId ? 'Doctor profile photo' : 'Published doctor profile photo'} style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}/>
    : <span className="doctor-profile-avatar-placeholder" aria-label="Doctor profile photo placeholder" style={{ width: size, height: size }}>{initials || 'DR'}</span>;
}

export function ProfilePhotoUpload({ act, busy, provider }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const { pendingPhotoId, savedPreview, publishedPhoto } = useDoctorProfilePhoto(provider);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const displayedPhoto = preview || savedPreview || (!pendingPhotoId ? publishedPhoto : '');
  const photoCaption = preview ? 'Selected photo preview'
    : pendingPhotoId ? (savedPreview ? 'Saved public-profile photo awaiting review' : 'Loading saved profile photo…')
    : publishedPhoto ? 'Current patient-visible photo' : '';

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const consent = new FormData(form).get('consent') === 'on';
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
    setStatus(saved ? '' : 'Photo was not saved. Resolve the error shown above and retry.');
    if (saved) {
      setFile(null);
      setPreview('');
      form.reset();
    }
  }

  return <form className="panel padded form section" onSubmit={submit}>
    <h2>Profile photo</h2>
    <p>Use one photo for your Public profile and doctor account. A replacement stays private until its review is approved for patients.</p>
    {displayedPhoto && <div className="doctor-profile-photo-preview" role="img" aria-label={photoCaption}>
      <Image unoptimized src={displayedPhoto} width={120} height={120} alt={pendingPhotoId ? 'Doctor profile photo' : preview ? 'Selected doctor profile photo preview' : 'Current published doctor profile photo'} style={{ objectFit: 'cover', borderRadius: '50%' }}/>
      <span>{photoCaption}</span>
    </div>}
    {pendingPhotoId && !savedPreview && !preview && <p role="status">Loading saved public-profile photo…</p>}
    <label>Upload a new profile photo
      <input type="file" accept="image/png,image/jpeg" required onChange={event => {
        const next = event.currentTarget.files?.[0] || null;
        setFile(next);
        setPreview(next ? URL.createObjectURL(next) : '');
        setStatus('');
      }}/>
    </label>
    <label className="checkbox"><input type="checkbox" name="consent" required/>I am authorised to publish this photograph on this profile.</label>
    <button disabled={busy || !file}>Save photo for review</button>
    <p role="status">{status}</p>
  </form>;
}
