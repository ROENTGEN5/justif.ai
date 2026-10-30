const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const storage=new Map();let user='alice';const api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/conversationCache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports:api, require(name){
 if(name==='./supabase')return {supabase:{auth:{getSession:async()=>({data:{session:user?{user:{id:user}}:null}})}}};
 return {__esModule:true,default:{getAllKeys:async()=>[...storage.keys()],multiRemove:async keys=>keys.forEach(k=>storage.delete(k)),getItem:async key=>storage.get(key)||null,setItem:async(k,v)=>storage.set(k,v)}};
 }});
(async()=>{
 await api.writeCache('chats',[{id:'secret'}],'alice');
 user='bob';assert.equal((await api.readCache('chats')).length,0);
 await api.writeCache('chats',[{id:'late-response'}],'alice');assert.equal((await api.readCache('chats')).length,0);
 user='alice';assert.equal((await api.readCache('chats'))[0].id,'secret');
 storage.set('@justifai_cached_chats','legacy');await api.clearConversationCaches();assert.equal(storage.size,0);
 user=null;await api.writeCache('chats',[{id:'signed-out'}]);assert.equal(storage.size,0);
 console.log('PASS: account isolation, late response rejection, logout purge, legacy purge, signed-out writes');
})().catch(e=>{console.error(e);process.exitCode=1});
