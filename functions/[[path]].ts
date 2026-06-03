
////<https://github.com/cloudflare/workers-types/blob/master/index.d.ts>
 
 function baseHeaders(contentType :string= "application/json") {
   return { "content-type": contentType,
            "access-control-allow-origin": "*" };              }
 
 function resJson(status :number= 200) { return function(obj :any) {
   return new Response(JSON.stringify(obj, null, 2), { status,
                     headers: baseHeaders("application/json"), }); }; }

 function mutateShareUrl(url :string) {
   // Enhance with discovered patterns eg `/shared/...' -> `/api/...'
  
   if (url.includes("/shares/")) { /* MS CoPilot */
     return url.replace("/shares/", "/c/api/conversations/shares/");
   }
   if (url.includes("/share/")) { /* Anthropic */
     return url.replace("/share/", "/api/chat_snapshots/");
   }
   // Fallback: return as-is /* ChatGPT? */
   return url;
 }

 function maybeChronOrder(messages :any, mode :any) {
   if (mode === "none") {
     return { messages, changed: false };
   }
 
   if (!Array.isArray(messages) || messages.length < 2) {
     return { messages, changed: false };
   }
 
   const first = Date.parse(messages[0]?.createdAt || 0);
   const last  = Date.parse(messages[messages.length - 1]?.createdAt || 0);
 
   if (isNaN(first) || isNaN(last)) {
     return { messages, changed: false };
   }
 
   let shouldReverse = false;
 
   if (mode === "auto") {
     shouldReverse = first > last;
   } else if (mode === "asc") {
     shouldReverse = first > last;
   } else if (mode === "desc") {
     shouldReverse = first < last;
   }
 
   if (shouldReverse) {
     return {
       messages: [...messages].reverse(),
       changed: true
     };
   }
 
   return { messages, changed: false };
 }

 const worker_export_default= {
   async fetch(request :Request, env :Record<string, string>, ctx :EventContext<Record<string, string>, any, Record<string, unknown>>) {
     try {
       const url = new URL(request.url);
       const sourceUrl = url.searchParams.get("url");
       const orderMode = url.searchParams.get("order") || "auto";
 
       if (!sourceUrl) {
         return resJson(400)({
           ok: false,
           error: "Missing ?url parameter"
         });
       }
 
       let resolvedUrl;
       try {
         resolvedUrl = mutateShareUrl(sourceUrl);
       } catch (e :any) {
         return resJson(400)({
           ok: false,
           error: "URL mutation failed",
           details: e.message
         });
       }
 
       let upstreamRes;
       try {
         upstreamRes = await fetch(resolvedUrl, {
           headers: {
//"Accept": "application/json",
             "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
           }
         });
       } catch (e :any) {
         return resJson(502)({
           ok: false,
           error: "Fetch failed",
           details: e.message,
           resolved: resolvedUrl
         });
       }
 
       let rawText = await upstreamRes.text();
 
       let data;
       try {
         data = JSON.parse(rawText);
       } catch (e) {
         // Not JSON? Return raw.
         return new Response(rawText, {
           status: 200,
           headers: baseHeaders("text/plain")
         });
       }
 
       let messages = data?.messages;
 
       let ordered = false;
 
       if (Array.isArray(messages)) {
         const result = maybeChronOrder(messages, orderMode);
         messages = result.messages;
         ordered = result.changed;
       }
 
       return resJson(200)({
         ok: true,
         source: sourceUrl,
         resolved: resolvedUrl,
         ordered,
         messageCount: Array.isArray(messages) ? messages.length : null,
         messages: messages || data || rawText,
       });
 
     } catch (err :any) {
       return resJson(500)({
         ok: false,
         error: "Unhandled exception",
         details: err.message
       });
     }
   }
 };
 /**\
 export default {
   async onRequest(ctx :EventContext<Record<string, string>, any, Record<string, unknown>>) {
     return await worker_export_default.fetch(ctx.request, ctx.env, ctx)                    }
                }
 /**/
 export async function onRequest(ctx :EventContext<Record<string, string>, any, Record<string, unknown>>) {
     return await worker_export_default.fetch(ctx.request, ctx.env, ctx)                                  }
 
