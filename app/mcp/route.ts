import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../chatgpt-auth';
import { handleMCP } from '../../server/reminder-mcp.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request){
  try{return await handleMCP(request,env.DB,await getChatGPTUser());}
  catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32603,message:'Reminder service temporarily unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}
