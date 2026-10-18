// Made-up settings for tests. The real ones live only in the encrypted page (src/finance-redesign/fin-config.json, never committed).
globalThis.FIN_CONFIG={
 profiles:{jaimi:{name:'Alex',initial:'A',colour:'#FF9C8F'},matt:{name:'Sam',initial:'S',colour:'#8FCDF5'}},
 sharedAccounts:['everyday','bills','savings','house'],
 owners:{pocket:'jaimi',payl:'jaimi',shopacct:'jaimi',spare:'matt'},
 personalAccounts:['pocket','spare'],
 privateWords:'payl|pocket|shopfront|wishlist',
 shopName:'Test Shop',shopWords:'stickerco',
 goalSeed:{id:'goal_trip',type:'holiday',name:'Trip',emoji:'🏝️',owner:'shared',target:0,fundRule:{amount:120,freq:'weekly',dow:3,acct:'savings'}},
 buckets:[
  {key:'holiday',name:'Holiday fund',emoji:'🎄',amount:180,freq:'monthly',re:'holiday|xmas'},
  {key:'pet',name:'Pet emergency',emoji:'🐾',amount:45,freq:'weekly',re:'pet.*emergenc|emergenc.*pet'},
  {key:'ratescar',name:'Rates and car',emoji:'🏠',amount:90,freq:'weekly',re:'rates\\s*(and|&)\\s*car'}
 ],
 rules:[
  {id:'rule_trip',name:'$120 to Savings on Wednesdays → Trip',match:{acct:'savings',amount:120,tol:1,dow:3,dowTol:1,every:'weekly'},action:{kind:'goal',ref:'goal_trip',label:'Trip'}},
  {id:'rule_holiday',name:'$180 monthly → Holiday fund',match:{acct:'savings',amount:180,tol:1,every:'monthly'},action:{kind:'fund',re:'holiday|xmas',label:'Holiday fund'}},
  {id:'rule_pet',name:'$45 weekly → Pet emergency',match:{acct:'savings',amount:45,tol:0.5,every:'weekly'},action:{kind:'fund',re:'pet.*emergenc|emergenc.*pet',label:'Pet emergency'}},
  {id:'rule_ratescar',name:'$90 weekly → Rates and car',match:{acct:'savings',amount:90,tol:0.5,every:'weekly'},action:{kind:'fund',re:'rates\\s*(and|&)\\s*car',label:'Rates and car'}}
 ]
};
