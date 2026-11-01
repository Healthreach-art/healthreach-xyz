'use client';
import {DoctorPracticeAddress} from './doctor-practice-address';

export function ProviderApplicationForm({account,busy,onSubmit,onUpload,uploadProgress,onOpenDocument}){
 const role=account.role,profile=account.application?.publicProfile||{},simple=['Pharmacy','Driver'].includes(role);
 if(simple)return <>
  <h2>Public profile</h2>
  <p>Complete this short profile before admin review. No document upload is needed here. After approval you can start using your dashboard.</p>
  <form className="form" onSubmit={onSubmit}>
   <label>{role==='Pharmacy'?'Pharmacy name':'Public display name'}<input name="name" defaultValue={profile.name||account.application?.businessName||account.fullName} required maxLength={120}/></label>
   <label>Short description<textarea name="description" defaultValue={profile.description||account.application?.experience||''} required maxLength={600} rows={3}/></label>
   {role==='Pharmacy'?<DoctorPracticeAddress provider={{location:profile.location||'',coordinates:profile.coordinates||{}}} busy={busy}/>:<label>Base area / service area<input name="serviceArea" defaultValue={profile.serviceArea||account.application?.serviceArea||''} required maxLength={240} placeholder="Cape Town"/></label>}
   {role==='Pharmacy'&&<label>Service areas<input name="serviceArea" defaultValue={profile.serviceArea||'Cape Town'} required maxLength={240} placeholder="Cape Town suburbs"/></label>}
   {role==='Driver'&&<><label>Vehicle type<input name="vehicle" defaultValue={profile.vehicle||''} required maxLength={80} placeholder="Car, motorcycle, bicycle"/></label><label>Licence class (optional)<input name="licenceClass" defaultValue={profile.licenceClass||''} maxLength={50}/></label></>}
   <label>Contact phone<input name="phone" type="tel" defaultValue={profile.phone||account.application?.phone||account.phone||''} required maxLength={40}/></label>
   {role==='Pharmacy'&&<><label>Opening time<input name="openTime" type="time" defaultValue={profile.openTime||'08:00'} required/></label><label>Closing time<input name="closeTime" type="time" defaultValue={profile.closeTime||'18:00'} required/></label></>}
   <button disabled={busy}>{account.status==='Rejected'?'Update profile and resubmit':'Save public profile for review'}</button>
  </form>
 </>;
 return <>
  <h2>Provider application</h2><p><strong>Status: {account.status}</strong></p>
  <form className="form" onSubmit={onSubmit}>{[['businessName','Practice, business or service name',180],['registration','Professional or business registration reference',180],['serviceArea','Service area',240],['phone','Contact phone',40]].map(([key,label,max])=><label key={key}>{label}<input name={key} defaultValue={(account.application||{})[key]||''} required maxLength={max}/></label>)}<label>Services, qualifications and experience<textarea name="experience" defaultValue={account.application.experience||''} maxLength={2000} rows={4} required/></label><button disabled={busy}>Submit application for review</button></form>
  <form onSubmit={onUpload}><h3>Supporting documents</h3><p>Only upload documents requested for this professional account.</p><label htmlFor="provider-file">Choose a document</label><input id="provider-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required/><button disabled={busy}>Upload document</button>{uploadProgress!==null&&<p role="status">Uploading: {uploadProgress}%</p>}</form>
  {(account.documents||[]).map(doc=><button className="outline" disabled={busy} key={doc.id} onClick={()=>onOpenDocument(doc,account.uid)}>{doc.name} · Download</button>)}
 </>;
}
