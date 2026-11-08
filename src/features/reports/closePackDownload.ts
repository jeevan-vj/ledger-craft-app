import { readApiFailure } from '@/lib/api/readApiError';
export async function downloadClosePack(from:string,to:string):Promise<void>{
 const response=await fetch(`/api/reports/close-pack?${new URLSearchParams({from,to})}`,{credentials:'include'});
 if(!response.ok){const error=await readApiFailure(response);throw new Error(error.message);}
 if(!response.headers.get('Content-Type')?.includes('application/zip'))throw new Error('The close pack was not returned as an archive. Try again.');
 const blob=await response.blob();if(!blob.size)throw new Error('The close pack is empty. Try again.');
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`Close-pack-${from}-${to}.zip`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
