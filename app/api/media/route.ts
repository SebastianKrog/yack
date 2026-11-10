import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleMedia } from '../../../server/media-service.mjs';
export const dynamic='force-dynamic';
async function media(request:Request){try{return await handleMedia(request,env.DB,env.BUCKET,await getChatGPTUser());}catch{return Response.json({error:'Filen kunne ikke hentes eller gemmes. Prøv igen.'},{status:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=media;
export const POST=media;
