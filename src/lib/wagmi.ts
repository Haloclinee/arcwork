import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "./arc";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: fallback([
      http("https://rpc.drpc.testnet.arc.network", { batch: true }),
      http("https://rpc.testnet.arc.network", { batch: true }),
      http("https://rpc.blockdaemon.testnet.arc.network", { batch: true }),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
