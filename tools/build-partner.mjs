#!/usr/bin/env node
/**
 * Encrypts Matthew's finance view (src/partner-finance.html) into
 * partner/index.html, using a SEPARATE passcode from the main hub
 * (.partner-key, gitignored) so it's genuinely independent of Jaimi's
 * own passcode. Same PBKDF2 + AES-256-GCM scheme as build-hub.mjs.
 *
 * Usage: node tools/build-partner.mjs [source-html] [output-html]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(root, 'src', 'partner-finance.html');
const out = process.argv[3] || join(root, 'partner', 'index.html');
const pass = readFileSync(join(root, '.partner-key'), 'utf8').trim();

let html = readFileSync(src, 'utf8')
  .replace(/<link rel="manifest"[^>]*>/, '');

const ITER = 300000;
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(html, 'utf8'), cipher.final(), cipher.getAuthTag()]);

const b64 = (b) => b.toString('base64');
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Our Money</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:'Hanken Grotesk',system-ui,sans-serif;background:#F7F3EC;color:#2B2722}
  .lock{width:min(340px,88vw);background:#fff;border:1px solid #E7E0D4;border-radius:20px;
    padding:30px 26px;box-shadow:0 8px 24px rgba(43,39,34,.07);text-align:center}
  .dot{width:52px;height:52px;border-radius:16px;margin:0 auto 14px;
    background:linear-gradient(135deg,#7FB79B,#8FA9C7);box-shadow:0 6px 16px rgba(143,169,199,.4)}
  h1{font-family:'Fraunces',serif;font-weight:600;font-size:21px;margin:0 0 4px}
  p{font-size:13px;color:#6B655C;margin:0 0 18px;line-height:1.5}
  input{width:100%;box-sizing:border-box;border:1px solid #E7E0D4;border-radius:12px;padding:12px 14px;
    font-size:16px;font-family:inherit;text-align:center;background:#FCFAF5;outline:none;letter-spacing:.08em}
  input:focus{border-color:#8FA9C7;box-shadow:0 0 0 3px rgba(143,169,199,.16)}
  button{width:100%;margin-top:12px;border:0;border-radius:12px;padding:12px;font-family:inherit;
    font-weight:700;font-size:14px;cursor:pointer;color:#fff;background:#2B2722}
  label{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12.5px;color:#6B655C;margin-top:13px;cursor:pointer}
  .err{color:#C75B45;font-size:12.5px;font-weight:600;margin-top:10px;min-height:16px}
</style>
</head>
<body>
<form class="lock" id="f">
  <div class="dot"></div>
  <h1>Our Money</h1>
  <p>The household finance view. Enter your passcode — each device only asks once.</p>
  <input id="pw" type="password" autocomplete="current-password" placeholder="Passcode" autofocus />
  <button type="submit">Unlock</button>
  <label><input type="checkbox" id="rem" checked style="width:auto" /> Remember on this device</label>
  <div class="err" id="err"></div>
</form>
<script>
const SALT = Uint8Array.from(atob('${b64(salt)}'), c => c.charCodeAt(0));
const IV   = Uint8Array.from(atob('${b64(iv)}'), c => c.charCodeAt(0));
const DATA = Uint8Array.from(atob('${b64(ct)}'), c => c.charCodeAt(0));
async function unlock(pass){
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:SALT, iterations:${ITER}, hash:'SHA-256'},
    raw, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:IV}, key, DATA);
  return new TextDecoder().decode(pt);
}
async function go(pass, remember){
  const html = await unlock(pass);                 // throws if the passcode is wrong
  if (remember) try{ localStorage.setItem('partner_key', pass); }catch(e){}
  document.open(); document.write(html); document.close();
}
document.getElementById('f').addEventListener('submit', async (e)=>{
  e.preventDefault();
  document.getElementById('err').textContent = '';
  try { await go(document.getElementById('pw').value, document.getElementById('rem').checked); }
  catch(_){ document.getElementById('err').textContent = "That's not it — try again."; }
});
const saved = (()=>{ try{ return localStorage.getItem('partner_key'); }catch(e){ return null; } })();
if (saved) go(saved, false).catch(()=>{ try{ localStorage.removeItem('partner_key'); }catch(e){} });
</script>
</body>
</html>
`;
writeFileSync(out, page);
console.log(`partner view built: ${out} (${(page.length/1024).toFixed(0)} KB, source ${(html.length/1024).toFixed(0)} KB)`);
