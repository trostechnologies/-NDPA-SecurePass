import React from 'react';
import { NDPA_ORGANIZATION_INFO as info } from '../../utils/ndpaCompliance';
export const ConsentNoticeModal:React.FC<{isOpen:boolean;onClose:()=>void;onAccept:()=>void}>=({isOpen,onClose,onAccept})=>!isOpen?null:(
 <div className="fixed inset-0 z-50 bg-slate-950/90 p-8 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Facility privacy notice" className="max-w-xl bg-slate-900 p-6 rounded-xl space-y-4">
 <h2 className="text-xl">Facility privacy notice</h2><p className="whitespace-pre-wrap">{info.privacyNoticeText}</p><p>Version: {info.noticeVersion}. Retention: {info.dataRetentionDays} days. Contact: {info.dpoEmail||'Ask reception'}.</p>
 <button onClick={onClose} className="p-3">Close</button><button className="p-3 bg-emerald-700 rounded" onClick={()=>{onAccept();onClose();}}>I acknowledge this notice</button></div></div>);
