import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: [
    "@alpenchaos/shared",
    "@alpenchaos/simulation-core",
    "@alpenchaos/network-simulator",
    "@alpenchaos/protocol-alpenglow",
    "@alpenchaos/protocol-legacy",
    "@alpenchaos/fault-injection",
    "@alpenchaos/game-rules",
    "@alpenchaos/scenarios",
  ],
};

export default config;
