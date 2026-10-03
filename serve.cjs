const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep) || pathname.includes('/.')) { res.writeHead(403); res.end(); return; }
  fs.readFile(target,(error,data)=>{
    if(error) { res.writeHead(404); res.end('No encontrado'); return; }
    res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  });
}).listen(3456,'127.0.0.1',()=>console.log('Coach de Teo: http://localhost:3456'));
