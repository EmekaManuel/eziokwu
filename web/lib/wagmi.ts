import { createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { config } from "./config";

export const wagmiConfig = createConfig({
  chains: [celo],
  transports: { [celo.id]: http(config.rpcUrl) },
  connectors: [
    injected(),
    ...(config.walletConnectProjectId
      ? [walletConnect({ projectId: config.walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  ssr: true,
});
