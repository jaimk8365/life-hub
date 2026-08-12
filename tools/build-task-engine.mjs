#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const src=join(root,'src','task-engine'), out=join(root,'task-engine');
mkdirSync(out,{recursive:true});
for(const name of ['models','logic','store','ui']){ rmSync(join(out,name),{recursive:true,force:true}); cpSync(join(src,name),join(out,name),{recursive:true}); }
cpSync(join(src,'index.html'),join(out,'index.html'));
console.log('task engine built: '+out);
