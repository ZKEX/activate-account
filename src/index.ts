import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet as Web3Wallet } from '@ethersproject/wallet'
import chalk from 'chalk'
import inquirer from 'inquirer'
import fetch from 'node-fetch'
import { Wallet } from 'zklink-js-sdk'
import { sleep } from 'zklink-js-sdk/build/utils'
import secret from '../.secret.json'

const { zklinkEndpoint, privateKey } = secret

const chainId = secret.chainId
const provider = new JsonRpcProvider(secret.web3Rpc)

async function checkAccountState(address: string) {
  while (true) {
    const accountState = await fetchAccountState(address)
    if (accountState?.error) {
      console.log(chalk.red(`[ERROR] ${accountState?.error.message}`))
    }
    if (accountState?.result) {
      if (accountState?.result.id) {
        return accountState.result
      }
    }
    await sleep(1000)
  }
}

async function fetchAccountState(address: string) {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getAccount',
      params: [address],
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  }).then((r) => r.json())
}

async function fetchAccountBalances(id: number) {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getAccountBalances',
      params: [id],
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
    .then((r) => r.json())
    .then((r) => r.result)
}

async function fetchSupportChains() {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getSupportChains',
      params: [],
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
    .then((r) => r.json())
    .then((r) => r.result)
}

async function fetchTransactionByHash(hash: string) {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getTransactionByHash',
      params: [hash, false],
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  }).then((r) => r.json())
}

async function watchTransaction(hash: string) {
  while (true) {
    const r = await fetchTransactionByHash(hash)
    if (r.error) {
      console.log(chalk.red(`[ERROR] ${r.error.message}`))
    }
    if (r.result) {
      if (r.result?.receipt.executed) {
        return r.result
      }
    }
    await sleep(1000)
  }
}

export async function promptActivate() {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'action',
      message: `Activate account now?`,
    },
  ])
  return answers.action
}

export async function sendActiveTransaction(signedData: any) {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'sendTransaction',
      params: [signedData.tx, null, null],
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  }).then((r) => r.json())
}

async function main() {
  const web3Wallet = new Web3Wallet(privateKey, provider)
  const { address } = web3Wallet
  console.log(chalk.green(`Wallet address:`), address)

  const zkLinkWallet = await Wallet.fromEthSigner(web3Wallet)

  const accountState = await checkAccountState(address)

  const isSigningKeySet = await zkLinkWallet.isSigningKeySet(
    accountState.pubKeyHash
  )

  if (isSigningKeySet) {
    console.log('accountState:', accountState)
    console.log(chalk.green(`Account is activated`))
    process.exit(0)
  }

  const prompt = await promptActivate()

  if (!prompt) return
  const supportChains: { layerOneChainId: number; mainContract: string }[] =
    await fetchSupportChains()
  const { mainContract } =
    supportChains.find((v) => Number(v.layerOneChainId) === Number(chainId)) ??
    {}

  if (!mainContract) {
    throw new Error(`polygon's contract address not found.`)
  }
  const balances = await fetchAccountBalances(accountState.id)

  const feeTokenId: number = Number(Object.keys(balances['0'])[0])

  const signedData = await zkLinkWallet.signChangePubKey({
    accountId: accountState.id,
    subAccountId: 0,
    chainId: 1,
    ethAuthType: 'EthECDSA',
    feeTokenId,
    fee: '0',
    layerOneChainId: chainId,
    mainContract,
    nonce: accountState.nonce,
  })

  const tx = await sendActiveTransaction(signedData)

  if (tx?.error) {
    console.log(chalk.red(`[ERROR] ${tx?.error.message}`))
    process.exit(1)
  }
  if (tx?.result) {
    console.log(chalk.green(`Transaction sened, tx hash: `), tx?.result)
  }
  const txResult = await watchTransaction(tx?.result)
  if (txResult.receipt.success === false) {
    console.log(chalk.red(`[ERROR] ${txResult?.receipt.failReason}`))
    process.exit(1)
  }

  console.log(chalk.green(`Transaction execute success. `))

  const state = await fetchAccountState(address)

  console.log(
    `${chalk.bgGreen('[Your pubkey hash is]')} ${state.result.pubKeyHash}`
  )
}

main().catch((e) => {
  console.log(e)
  process.exit(1)
})
