# Activate Layer2 Account Assistant

#### Create Key File

Create `.secret.json` in the project root directory and fill in the following data:

`chainId`: Mainnet Chain ID

`web3Rpc`: Mainnet RPC node

`zklinkEndpoint`: Layer2 RPC internal network address

`privateKey`: Wallet private key

```json
{
  "chainId": 137,
  "web3Rpc": "https://polygon.llamarpc.com",
  "zklinkEndpoint": "...",
  "privateKey": "..."
}
```

#### Install Dependencies and Start the Service

```shell
yarn

yarn start
```
