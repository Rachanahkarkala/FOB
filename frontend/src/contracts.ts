
export const CONTRACTS = {
  hook: '0x6409304B29F26502099b7a7F8419A71F8de5d080',
  registry: '0x2d6574C11a80e563adcC5705B1EB1044A0C12147',
  oracle: '0xDA0F8Df6F5dB15b346f4B8D1156722027E194E60',
  router: '0xB61598fa7E856D43384A8fcBBAbF2Aa6aa044FfC',
  poolManager: '0x0D9BAf34817Fccd3b3068768E5d20542B66424A5',
  usd: '0xDa50315d5B224d4B6B51e1017aBeDE54a30219cC',
  inr: '0xE7d940d3721Ef8168fCDf5711c27495F44c364e3',
} as const;

export const ANVIL_CHAIN_ID = 31337;
export const DYNAMIC_FEE_FLAG = 8388608;
export const TICK_SPACING = 60;

export const POOL_KEY = {
  currency0: CONTRACTS.usd,
  currency1: CONTRACTS.inr,
  fee: DYNAMIC_FEE_FLAG,
  tickSpacing: TICK_SPACING,
  hooks: CONTRACTS.hook,
} as const;

export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export const hookAbi = [
  {
    type: 'function',
    name: 'quoteFee',
    stateMutability: 'view',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
    outputs: [
      { name: 'fee', type: 'uint24' },
      { name: 'poolPriceWad', type: 'uint256' },
      { name: 'oraclePriceWad', type: 'uint256' },
      { name: 'deviationBps', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'baseFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
  {
    type: 'function',
    name: 'maxFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
  {
    type: 'function',
    name: 'feePerDeviationBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
  {
    type: 'function',
    name: 'maxOracleAge',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'SwapFeeApplied',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'wallet', type: 'address' },
      { indexed: false, name: 'poolPriceWad', type: 'uint256' },
      { indexed: false, name: 'oraclePriceWad', type: 'uint256' },
      { indexed: false, name: 'deviationBps', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint24' },
    ],
  },
] as const;

export const registryAbi = [
  {
    type: 'function',
    name: 'isApproved',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'approveWallet',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeWallet',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'WalletApproved',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'wallet', type: 'address' },
      { indexed: true, name: 'admin', type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'WalletRevoked',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'wallet', type: 'address' },
      { indexed: true, name: 'admin', type: 'address' },
    ],
  },
] as const;

export const oracleAbi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

export const routerAbi = [
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'zeroForOne', type: 'bool' },
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'hookData', type: 'bytes' },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'int256' }],
  },
] as const;
