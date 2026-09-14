/* Shared keyboard support and visible estimate caveats; no data writes. */
(function(){
 let previous=null;
 window.FinanceUI={
  open(scrim,sheet){previous=document.activeElement;scrim.classList.add('on');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',sheet.querySelector('h2')?.textContent||'Money details');sheet.setAttribute('tabindex','-1');document.body.style.overflow='hidden';(sheet.querySelector('button,input,select,textarea')||sheet).focus();},
  close(scrim){scrim.classList.remove('on');document.body.style.overflow='';if(previous?.isConnected)previous.focus();},
 };
 document.addEventListener('keydown',e=>{const scrim=document.getElementById('scrim'),sheet=document.getElementById('sheet');if(!scrim?.classList.contains('on')||!sheet)return;
  if(e.key==='Escape'){e.preventDefault();window.closeSheet();return;}
  if(e.key==='Tab'){const nodes=[...sheet.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();sheet.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
})();
