export const ENGINE_VERSION="natural-language-payment-agent/1.0.0";
export const NETWORK={
  name:"Pharos Pacific Mainnet",chainId:1672,chainIdHex:"0x688",nativeSymbol:"PROS",nativeDecimals:18,
  mcpUrl:"https://mcp.pharos.xyz/mcp",rpcUrl:"https://rpc.pharos.xyz",explorer:"https://www.pharosscan.xyz",
  aliases:["pharos","pharos mainnet","pharos pacific","pharos pacific mainnet","pacific","pacific mainnet"]
};
export const USDC={
  address:"0xc879c018db60520f4355c26ed1a6d572cdac1815",symbol:"USDC",name:"USDC",decimals:6,
  source:"https://www.circle.com/blog/now-available-usdc-cctp-on-pharos"
};
export const LIMITS={instructionBytes:4096,ttlMs:5*60*1000,gasBufferBps:2000,maxHistory:40,ratePerMinute:30};
export const ERC20_ABI=[
  {type:"function",name:"name",stateMutability:"view",inputs:[],outputs:[{name:"",type:"string"}]},
  {type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{name:"",type:"string"}]},
  {type:"function",name:"decimals",stateMutability:"view",inputs:[],outputs:[{name:"",type:"uint8"}]},
  {type:"function",name:"balanceOf",stateMutability:"view",inputs:[{name:"account",type:"address"}],outputs:[{name:"",type:"uint256"}]},
  {type:"function",name:"transfer",stateMutability:"nonpayable",inputs:[{name:"to",type:"address"},{name:"value",type:"uint256"}],outputs:[{name:"",type:"bool"}]}
];
export const OFFICIAL_SOURCES=[
  {title:"Pharos MCP",url:"https://github.com/PharosNetwork/pharos-mcp"},
  {title:"USDC on Pharos",url:USDC.source}
];
