import { Wallet as Web3Wallet } from '@ethersproject/wallet'
import chalk from 'chalk'
import fetch from 'node-fetch'
import { Wallet } from 'zklink-js-sdk'
import { sleep } from 'zklink-js-sdk/build/utils'
import { privateKey, zklinkEndpoint } from './config'

async function checkAccountState(address: string) {
  console.log(chalk.blueBright(`Check account status:`), address)

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

async function getFeeTokenId(accountId: number) {
  console.log(chalk.blueBright('Check account balance: accountId='), accountId)
  while (true) {
    const { error, result } = await fetchAccountBalances(accountId)
    console.log(
      chalk.blueBright('Account balance:'),
      JSON.stringify({ error, result })
    )
    if (error?.message) {
      console.log(chalk.red(`[ERROR] ${error.message}`))
    }
    if (result) {
      if (result['0']) {
        return Number(Object.keys(result['0'])[0])
      } else {
        console.log(chalk.red(`[ERROR] Cannot find balance on account 0`))
      }
    }
    await sleep(1000)
  }
}

async function zklinkRpc(method: string, params: any[]) {
  return fetch(zklinkEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  }).then((r) => r.json())
}

async function fetchAccountState(address: string) {
  return zklinkRpc('getAccount', [address])
}

async function fetchAccountBalances(id: number) {
  return zklinkRpc('getAccountBalances', [id])
}

async function fetchChangePubkeyChainId() {
  return zklinkRpc('getChangePubkeyChainId', []).then((r) => r.result)
}

async function fetchTransactionByHash(hash: string) {
  return zklinkRpc('getTransactionByHash', [hash, false])
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

export async function sendActiveTransaction(signedData: any) {
  return zklinkRpc('sendTransaction', [signedData.tx, null, null])
}

async function main() {
  const web3Wallet = new Web3Wallet(privateKey)
  const { address } = web3Wallet

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

  const feeTokenId = await getFeeTokenId(accountState.id)

  if (!feeTokenId) {
    console.log(chalk.red(`Cannot find available fee token on account 0`))
    process.exit(0)
  }

  const changePubkeyChainId = await fetchChangePubkeyChainId()

  const signedData = await zkLinkWallet.signChangePubKey({
    accountId: accountState.id,
    subAccountId: 0,
    chainId: changePubkeyChainId,
    ethAuthType: 'EthECDSA',
    feeTokenId,
    fee: '0',
    nonce: accountState.nonce,
  })

  const tx = await sendActiveTransaction(signedData)

  if (tx?.error) {
    console.log(chalk.red(`[ERROR] ${tx?.error.message}`))
    process.exit(1)
  }
  if (tx?.result) {
    console.log(chalk.green(`Transaction sended, tx hash: `), tx?.result)
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
