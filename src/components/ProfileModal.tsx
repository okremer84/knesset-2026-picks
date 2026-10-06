import React, { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { useAccount, User } from './AuthGate';
import { apiFetch } from '../lib/api';

export function Avatar({ name, url, large = false }: { name: string; url?: string | null; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`account-avatar ${large ? 'profile-avatar' : ''}`}>
    {url && url !== failedUrl ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)}/> : name.slice(0, 1)}
  </span>;
}

async function thumbnail(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('בחרו תמונת JPG, PNG או WebP בגודל עד 10MB.');
  }
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('לא ניתן להכין את התמונה.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob || blob.size > 256 * 1024) throw new Error('התמונה גדולה מדי. נסו תמונה אחרת.');
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally { image.close(); }
}

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateUser, logout, error: accountError } = useAccount();
  const [name, setName] = useState(user.name);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function choose(file?: File) {
    if (!file) return;
    setProcessing(true); setError('');
    try { setFile(await thumbnail(file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'לא ניתן לקרוא את התמונה.'); }
    finally { setProcessing(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = new FormData();
      data.set('name', name.trim());
      if (file) data.set('avatar', file);
      const response = await apiFetch('/api/auth/profile', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(Object.values(body.errors || {}).flat().join(' ') || body.message || 'לא ניתן לשמור את הפרופיל.');
      updateUser(body.user as User);
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open className="profile-dialog" onClose={() => { if (!busy && !processing) onClose(); }} label="הפרופיל שלי">
    <div className="profile-heading"><h2>הפרופיל שלי</h2><button aria-label="סגירה" disabled={busy || processing} onClick={onClose}><X size={20}/></button></div>
    <form onSubmit={save} className="profile-form">
      <div className="profile-photo-field">
        <Avatar name={name || user.name} url={preview || user.avatar_url} large/>
        <label className="photo-upload">{processing ? 'מכין תמונה…' : 'העלאת תמונה חדשה'}<input aria-label="העלאת תמונה חדשה" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || processing} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <span className="profile-help">JPG, PNG או WebP · עד 10MB</span>
      </div>
      <label htmlFor="profile-name">שם לתצוגה</label>
      <input id="profile-name" autoFocus required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)}/>
      <label htmlFor="profile-email">אימייל</label>
      <input id="profile-email" type="email" dir="ltr" value={user.email} readOnly/>
      {(error || accountError) && <p role="alert" className="text-red-700 text-sm">{error || accountError}</p>}
      <button className="button-primary" disabled={busy || processing || !name.trim() || (name.trim() === user.name && !file)}>{busy ? 'שומר…' : 'שמירת שינויים'}</button>
    </form>
    <button className="profile-logout" disabled={busy || processing} onClick={async () => { setBusy(true); await logout(); setBusy(false); }}><LogOut size={16}/>התנתקות</button>
  </Dialog>;
}
