const utils = require('../utils');
const BigNumber = require("bignumber.js");
//https://coins.llama.fi/prices/current/aptos:0x1::aptos_coin::AptosCoin
const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';

const APT_ADDR = "0x1::aptos_coin::AptosCoin";
const APT_PRICE_ID = 'coingecko:aptos';
const CELL_fungible_asset_address = '0x2ebb2ccac5e027a87fa0e2e5f656a3a4238d6a48d93ec9b610d570fc0aa0df12'
const APT_fungible_asset_address = '0xedc2704f2cef417a06d1756a04a16a9fa6faaed13af469be9cdfcac5a21a8e2e'
const RESOURCE_CONTRACT = '0x4bf51972879e3b95c4781a5cdcb9e1ee24ef483e7d22f2d903626f126df62bd1'
async function getResources(account) {
    let url = `${NODE_URL}/accounts/${account}/resources?limit=9999`
    const res = await utils.getData(url)
    return res
}
async function getWrapper(address) {
    const payload = {
        function: `${RESOURCE_CONTRACT}::coin_wrapper::get_original`,
        type_arguments: [],
        arguments: [address],
    };
    try {
        const data = (await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, payload)) || []
        return data[0]
    } catch (e) {
        console.log(e)
        return null;
    }
}
async function getTokenPrice(tokenAddr) {
    const price = (await utils.getData(`${COINS_LLAMA_PRICE_URL}aptos:${tokenAddr}`))
    // console.log(tokenAddr, price)
    return [price?.coins["aptos:" + tokenAddr]?.price, price?.coins["aptos:" + tokenAddr]?.symbol,
    price?.coins["aptos:" + tokenAddr]?.decimals
    ]
}
async function main() {
    const aptRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${APT_PRICE_ID}`)
    const aptPrice = aptRes['coins'][APT_PRICE_ID]['price']
    const cellPrice = await getCELLPrice(aptPrice)
    let poolResource = await getResources("0x4bf51972879e3b95c4781a5cdcb9e1ee24ef483e7d22f2d903626f126df62bd1");
    const poolsAddresses = poolResource.find(i => i.type.includes('::liquidity_pool::LiquidityPoolConfigs'))?.data.all_pools?.inline_vec
    return Promise.all(poolsAddresses.map(async ({ inner }) => await calculateRewardApy(inner, aptPrice, cellPrice)));

}
async function getReserve(lpAddress) {

    const fungibleAssetPoolStore = (await getResources(lpAddress)).find(i => i.type.includes('liquidity_pool::LiquidityPool'))?.data
    const fungibleAssetAddressToken1 = fungibleAssetPoolStore?.token_store_1?.inner
    const fungibleAssetAddressToken2 = fungibleAssetPoolStore?.token_store_2?.inner
    const fungibleAssetTokenStore_1 = (await getResources(fungibleAssetAddressToken1)).find(i => i.type.includes('fungible_asset::FungibleStore'))?.data
    const fungibleAssetTokenStore_2 = (await getResources(fungibleAssetAddressToken2)).find(i => i.type.includes('fungible_asset::FungibleStore'))?.data
    // reserve0Address = fungibleAssetTokenStore_1?.metadata?.inner
    // reserve1Address = fungibleAssetTokenStore_2?.metadata?.inner

    const reserve0Address = await getWrapper(fungibleAssetTokenStore_1?.metadata?.inner)
    const reserve1Address = await getWrapper(fungibleAssetTokenStore_2?.metadata?.inner)
    const reserve0 = fungibleAssetTokenStore_1?.balance;
    const reserve1 = fungibleAssetTokenStore_2?.balance;
    return { reserve0, reserve1, reserve0Address, reserve1Address }



}

async function getCELLPrice(aptosPrice) {
    const balances = {}
    const data = await getResources('0x4bf51972879e3b95c4781a5cdcb9e1ee24ef483e7d22f2d903626f126df62bd1')
    const poolsAddresses = data.find(i => i.type.includes('::liquidity_pool::LiquidityPoolConfigs'))?.data.all_pools?.inline_vec
    for (const pool of poolsAddresses) {
        const fungibleAssetPoolStore = (await getResources(pool.inner)).find(i => i.type.includes('liquidity_pool::LiquidityPool'))?.data
        const fungibleAssetAddressToken1 = fungibleAssetPoolStore?.token_store_1?.inner
        const fungibleAssetAddressToken2 = fungibleAssetPoolStore?.token_store_2?.inner
        const fungibleAssetTokenStore_1 = (await getResources(fungibleAssetAddressToken1)).find(i => i.type.includes('fungible_asset::FungibleStore'))?.data
        const fungibleAssetTokenStore_2 = (await getResources(fungibleAssetAddressToken2)).find(i => i.type.includes('fungible_asset::FungibleStore'))?.data
        const token_1_address = fungibleAssetTokenStore_1?.metadata?.inner
        const token_2_address = fungibleAssetTokenStore_2?.metadata?.inner
        if (token_1_address == CELL_fungible_asset_address) {
            const cell_balance = fungibleAssetTokenStore_1?.balance;

            //caculator CELL price
            if (token_2_address == APT_fungible_asset_address) {
                const apt_balance = fungibleAssetTokenStore_2?.balance;
                const cell_price = (new BigNumber(apt_balance)).div(new BigNumber(cell_balance)).toNumber() * aptosPrice
                return cell_price

            }

        } else if (token_2_address == CELL_fungible_asset_address) {
            const cell_balance = fungibleAssetTokenStore_2?.balance;
            if (token_1_address == APT_fungible_asset_address) {
                const apt_balance = fungibleAssetTokenStore_1?.balance;
                const cell_price = (new BigNumber(apt_balance)).div(new BigNumber(cell_balance)).toNumber() * aptosPrice
                return cell_price

            }

        }


    }


}

async function getGaugeAddress(poolAddress) {
    try {
        const payload = {
            function: `${RESOURCE_CONTRACT}::vote_manager::get_gauge`,
            type_arguments: [],
            arguments: [poolAddress],
        };
        const data = (await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, payload)) || []
        return data[0]?.inner
    } catch (e) {
        console.log(e)
        return null
    }

};
async function getRewardsPool(gaugeAddress) {
    try {
        const payload = {
            function: `${RESOURCE_CONTRACT}::gauge::rewards_pool`,
            type_arguments: [],
            arguments: [gaugeAddress],
        };
        const data = (await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, payload)) || []

        return data[0]?.inner;
    } catch (e) {

        console.log(e)
        return null
    }

};
async function getRewardRate(poolAddress) {
    try {
        const payload = {
            function: `0x4bf51972879e3b95c4781a5cdcb9e1ee24ef483e7d22f2d903626f126df62bd1::rewards_pool_continuous::reward_rate`,
            type_arguments: [],
            arguments: [poolAddress],
        };
        const data = (await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, payload)) || [0];

        return data[0];
    } catch (e) {
        console.log(e)
        return 0

    }

}

async function calculateRewardApy(poolAddress, aptPrice, cellPrice) {
    let gauge = await getGaugeAddress(poolAddress)
    let rewardPoolAddress = await getRewardsPool(gauge)
    let rewardperSecond = await getRewardRate(rewardPoolAddress)
    let rewardPerDay = (new BigNumber(rewardperSecond)).div((new BigNumber(10)).pow(8)).toNumber() * 24*60*60
    let { reserve0, reserve1, reserve0Address, reserve1Address } = await getReserve(poolAddress)
    let price0, price1, coinSymbol0, coinSymbol1, decimals1, decimals0;
    if (reserve0Address == CELL_fungible_asset_address) {
        price0 = cellPrice;
        coinSymbol0 = 'CELL'
        decimals0 = 8;
        [price1, coinSymbol1, decimals1] = await getTokenPrice(reserve1Address);
    }
    else if (reserve1Address == CELL_fungible_asset_address) {
        price1 = cellPrice
        coinSymbol1 = 'CELL';
        decimals1 = 8;
        [price0, coinSymbol0, decimals0] = await getTokenPrice(reserve0Address)
    }
    else {
        [price0, coinSymbol0, decimals0] = await getTokenPrice(reserve0Address);
        [price1, coinSymbol1, decimals1] = await getTokenPrice(reserve1Address)
    }

    const coinSymbol = `${coinSymbol0}-${coinSymbol1}`
    const reserve0Value = (new BigNumber(reserve0)).div((new BigNumber(10)).pow(decimals0)).toNumber() * price0
    const reserve1Value = (new BigNumber(reserve1)).div((new BigNumber(10)).pow(decimals1)).toNumber() * price1
    const total = reserve0Value + reserve1Value;
    let apyReward = calcAptRewardApy(rewardPerDay,cellPrice,total,)


    const res = {
        pool: `cellana-finance-${utils.formatSymbol(coinSymbol)}`,
        chain: utils.formatChain('aptos'),
        project: 'cellana-finance',
        symbol: utils.formatSymbol(coinSymbol),
        tvlUsd: total,
        apyBase: 0,
        apyReward: apyReward,
        rewardTokens : [CELL_fungible_asset_address]
    }
    return res;
}





function calcAptRewardApy(rewardPerDay, rewardPrice, tvl) {
    return (rewardPerDay * 365 * rewardPrice / tvl )* 100
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.ariesmarkets.xyz',
};