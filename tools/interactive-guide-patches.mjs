const assets='<!-- Interactive Money guide v1 -->\n<link rel="stylesheet" href="../finance/interactive-guide.css?v=20261010">\n<script src="../finance/interactive-guide.js?v=20261010"></script>\n';
const main=String.raw`function openMoneyGuide(mode='tour'){FinanceGuide.open({host:$('sheet'),show:openSheet,close:closeSheet,readEvidence:financeEvidence,transactions:()=>TXNS,navigate:v=>go(v,document.querySelector('[data-v="'+v+'"]')),account:id=>{go('accounts',document.querySelector('[data-v=accounts]'));openAcct(id);},edit:openEditTxn,backup:exportFinanceRecovery,recovery:openDataReview},mode);}
function openFinanceHelp(){openMoneyGuide();}
`;
const partner=String.raw`function openPartnerHelp(){FinanceGuide.open({host:$('sheet'),show:openSheet,close:closeSheet,partner:true,navigate:v=>go(v==='today'?'overview':v,document.querySelector('[data-v="'+(v==='today'?'overview':v)+'"]'))});}
`;
export function patchGuideFinance(source){if(source.includes('<!-- Interactive Money guide v1 -->'))return source;
 const start=source.indexOf('function openFinanceHelp(){'),end=source.indexOf('function billsTransferCheck(',start);if(start<0||end<0)throw new Error('Guide integration anchor missing');
 source=source.slice(0,start)+main+source.slice(end);
 source=source.replace('</head>',assets+'</head>');
 const needle='<button class="btn ghost" onclick="openDataReview()">Review data and recovery</button>';
 if(!source.includes(needle))throw new Error('Warning guide anchor missing');
 const warning=source.indexOf('function dataQualityCard()');if(warning<0)throw new Error('Data quality anchor missing');
 return source.slice(0,warning)+source.slice(warning).replace(needle,'<button class="btn dark" onclick="openMoneyGuide(\'attention\')">Help me fix this</button>'+needle);
}
export function patchGuidePartner(source){if(source.includes('<!-- Interactive Money guide v1 -->'))return source;
 const start=source.indexOf('function openPartnerHelp(){'),end=source.indexOf('function partnerBillsTransferCheck(',start);if(start<0||end<0)throw new Error('Partner guide integration anchor missing');
 return (source.slice(0,start)+partner+source.slice(end)).replace('</head>',assets+'</head>');
}
