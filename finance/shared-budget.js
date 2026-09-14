/* Shared budget projection. Contains no account data, credentials or network I/O.
 * Load as a classic script in either finance page: window.SharedBudget.
 * Only assignBudgetIds mutates its input; merge returns a new private master.
 */
(function(root){
  'use strict';
  const fields=['n','mo','freq','category'];
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function rules(allowedIds,privateRE){
    const allowed=new Set(allowedIds||[]);
    const pattern=privateRE?new RegExp(privateRE.source,privateRE.flags.replace(/[gy]/g,'')):null;
    return {allowed,privateText:value=>!!pattern&&pattern.test(String(value||''))};
  }
  function assignBudgetIds(groups,idFactory){
    if(!Array.isArray(groups)||typeof idFactory!=='function')throw new Error('Budget groups and an ID factory are required.');
    const used=new Set();let changed=false;
    for(const group of groups){
      for(const [record,kind] of [[group,'group'],...(group.items||[]).map(item=>[item,'line'])]){
        if(!validId(record.sharedId)||used.has(record.sharedId)){
          const next=idFactory(kind);
          if(!validId(next)||used.has(next))throw new Error('The budget ID factory must return unique opaque IDs.');
          record.sharedId=next;changed=true;
        }
        used.add(record.sharedId);
      }
    }
    return changed;
  }
  function visibleItem(item,group,r){
    return r.allowed.has(item.acct||group.acct)&&!r.privateText(item.n)&&!r.privateText(item.freq)&&!r.privateText(item.category);
  }
  function publicItem(item,group){
    if(!validId(item.sharedId))throw new Error('Assign shared budget IDs before publishing.');
    const value={sharedId:item.sharedId,n:String(item.n||'Budget line'),mo:Number(item.mo)||0,freq:String(item.freq||''),acct:item.acct||group.acct};
    if(item.category)value.category=String(item.category);
    return value;
  }
  function projectBudget(groups,allowedIds,privateRE){
    const r=rules(allowedIds,privateRE);
    return (groups||[]).flatMap(group=>{
      const items=(group.items||[]).filter(item=>visibleItem(item,group,r)).map(item=>publicItem(item,group));
      if(!items.length&&((group.items||[]).length||!r.allowed.has(group.acct)||r.privateText(group.sec)))return [];
      if(!validId(group.sharedId))throw new Error('Assign shared budget IDs before publishing.');
      return [{sharedId:group.sharedId,sec:r.privateText(group.sec)?'Shared budget':String(group.sec||'Shared budget'),acct:r.allowed.has(group.acct)?group.acct:items[0].acct,items}];
    });
  }
  function mergeSharedBudget(master,incoming,allowedIds,privateRE){
    if(!Array.isArray(master)||!Array.isArray(incoming))throw new Error('A complete shared budget list is required.');
    const r=rules(allowedIds,privateRE),publicMaster=projectBudget(master,allowedIds,privateRE);
    const existingGroups=new Map(master.map(g=>[g.sharedId,g]));
    const projectedGroups=new Map(publicMaster.map(g=>[g.sharedId,g]));
    const existingItems=new Map(master.flatMap(g=>(g.items||[]).map(i=>[i.sharedId,{item:i,group:g}])));
    const seen=new Set();
    const checkId=id=>{if(!validId(id)||seen.has(id))throw new Error('Shared budget IDs must be present and unique.');seen.add(id);};
    // Validate the whole incoming snapshot before modifying a copy. Reject,
    // rather than silently omit, invalid rows that could otherwise look deleted.
    const safeIncoming=incoming.map(group=>{
      checkId(group.sharedId);
      if(!r.allowed.has(group.acct)||r.privateText(group.sec)||!Array.isArray(group.items))throw new Error('This budget section is not shared.');
      if(existingItems.has(group.sharedId)||(existingGroups.has(group.sharedId)&&!projectedGroups.has(group.sharedId)))throw new Error('A private budget ID cannot be edited.');
      const items=group.items.map(item=>{
        checkId(item.sharedId);
        if(!visibleItem(item,group,r)||!Number.isFinite(item.mo)||item.mo<0)throw new Error('Shared budget amounts and accounts must be valid.');
        if(existingGroups.has(item.sharedId))throw new Error('A budget line cannot use a section ID.');
        const original=existingItems.get(item.sharedId);
        if(original&&(!visibleItem(original.item,original.group,r)||original.group.sharedId!==group.sharedId))throw new Error('A private or different section line cannot be replaced.');
        return publicItem(item,group);
      });
      return {sharedId:group.sharedId,sec:String(group.sec||'Shared budget'),acct:group.acct,items};
    });
    const nextById=new Map(safeIncoming.map(g=>[g.sharedId,g]));
    const result=[];
    for(const original of master){
      const projected=projectedGroups.get(original.sharedId),next=nextById.get(original.sharedId);
      if(!projected){result.push(clone(original));continue;}
      const privateItems=(original.items||[]).filter(i=>!visibleItem(i,original,r));
      if(!next){if(privateItems.length)result.push({...clone(original),items:clone(privateItems)});continue;}
      const group=clone(original);
      if(!r.privateText(original.sec)&&next.sec!==projected.sec)group.sec=next.sec;
      // Changing a mixed group's default must never move its hidden rows.
      if(!privateItems.length&&r.allowed.has(original.acct)&&next.acct!==projected.acct)group.acct=next.acct;
      const incomingItems=new Map(next.items.map(i=>[i.sharedId,i]));
      group.items=(original.items||[]).flatMap(item=>{
        if(!visibleItem(item,original,r))return [clone(item)];
        const update=incomingItems.get(item.sharedId);if(!update)return [];
        const merged=clone(item),before=publicItem(item,original);
        for(const field of fields){
          if(update[field]!==before[field]){
            if(update[field]===undefined)delete merged[field];else merged[field]=update[field];
          }
        }
        if(update.acct!==(merged.acct||group.acct))merged.acct=update.acct;
        return [merged];
      });
      for(const item of next.items)if(!existingItems.has(item.sharedId))group.items.push(clone(item));
      result.push(group);
    }
    for(const group of safeIncoming)if(!existingGroups.has(group.sharedId))result.push(clone(group));
    return result;
  }
  root.SharedBudget={assignBudgetIds,projectBudget,mergeSharedBudget};
})(typeof window!=='undefined'?window:globalThis);
