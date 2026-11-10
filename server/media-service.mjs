import M from '../public/media-model.js';
const base={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
const reply=(value,status=200)=>Response.json(value,{status,headers:base});
async function prefix(owner){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));return 'media/'+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')+'/';}
export async function deleteMedia(bucket,owner){if(!bucket)return;const p=await prefix(owner);let cursor;do{const list=await bucket.list({prefix:p,limit:1000,...(cursor?{cursor}:{})});if(list.objects.length)await bucket.delete(list.objects.map(o=>o.key));cursor=list.truncated?list.cursor:null;}while(cursor);}
export function detectedType(bytes){
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 const text=new TextDecoder('latin1').decode(bytes.slice(0,32));
 if(text.startsWith('GIF87a')||text.startsWith('GIF89a'))return 'image/gif';
 if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
 if(text.slice(4,8)==='ftyp'&&/avif|avis/.test(text.slice(8)))return 'image/avif';
 if(text.startsWith('%PDF-'))return 'application/pdf';return null;
}
async function boundedBody(request,limit){const reader=request.body?.getReader();if(!reader)return null;const chunks=[];let length=0;try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
export async function handleMedia(request,db,bucket,user){
 if(!user)return reply({error:'Log ind for at dele filer mellem enheder.'},401);
 if(!bucket)return reply({error:'Fillageret er ikke tilgængeligt endnu.'},503);
 const a=await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(user.userId).first();
 if(a?.deleted)return reply({error:'Profilen er slettet.'},403);
 const u=new URL(request.url),id=u.searchParams.get('id'),p=await prefix(user.userId);
 if(request.method==='GET'){
   if(!/^[a-f0-9-]{36}$/.test(id||''))return reply({error:'Ugyldig fil.'},400);
   const variant=u.searchParams.get('variant')||'original';if(!['preview','original'].includes(variant))return reply({error:'Ugyldig visning.'},400);
   const object=await bucket.get(p+id+'/'+variant);if(!object)return reply({error:'Filen findes ikke.'},404);
   return new Response(object.body,{headers:{...base,'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':variant==='original'?'attachment':'inline','Content-Length':String(object.size),'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(request.method!=='POST')return reply({error:'Metoden understøttes ikke.'},405);
 if(request.headers.get('Origin')!==u.origin||!request.headers.get('Content-Type')?.startsWith('multipart/form-data;'))return reply({error:'Ugyldig forespørgsel.'},403);
 const generation=Number(u.searchParams.get('generation'));if(!a||a.generation!==generation)return reply({error:'Synkronisér profilen før upload.'},409);
 const max=M.limit+2*1024*1024;if(Number(request.headers.get('Content-Length'))>max)return reply({error:'Filen er for stor.'},413);
 const data=await boundedBody(request,max);if(!data)return reply({error:'Filen er for stor.'},413);
 let form,asset;try{form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('Content-Type')},body:data}).formData();asset=JSON.parse(form.get('asset'));}catch{return reply({error:'Ugyldig fil.'},400);}
 const file=form.get('file'),preview=form.get('preview');if(!M.validAsset(asset)||!file?.arrayBuffer||file.size!==asset.size||!preview?.arrayBuffer||preview.size>2*1024*1024||!preview.size)return reply({error:'Ugyldig fil.'},400);
 const original=new Uint8Array(await file.arrayBuffer()),thumb=new Uint8Array(await preview.arrayBuffer());
 if(detectedType(original)!==asset.type||!['image/jpeg','image/png'].includes(detectedType(thumb)))return reply({error:'Filtypen stemmer ikke med indholdet.'},400);
 await bucket.put(p+asset.id+'/original',original,{httpMetadata:{contentType:asset.type}});
 await bucket.put(p+asset.id+'/preview',thumb,{httpMetadata:{contentType:detectedType(thumb)}});
 // Account deletion/reset during upload must not resurrect files.
 const after=await db.prepare('SELECT generation,deleted FROM sync_accounts WHERE owner=?').bind(user.userId).first();
 if(!after||after.deleted||after.generation!==generation){if(!after||after.deleted)await bucket.delete([p+asset.id+'/original',p+asset.id+'/preview']);return reply({error:'Profilen blev ændret under upload.'},409);}
 return reply({id:asset.id});
}
