import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleSync } from '../../../server/sync-service.mjs';
export const dynamic = 'force-dynamic';
async function sync(request:Request){
  try{return await handleSync(request,env.DB,await getChatGPTUser(),env.BUCKET);}
  catch{return Response.json({error:'Sync temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=sync;
export const POST=sync;
