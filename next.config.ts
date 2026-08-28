import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` が AGENTS.md/CLAUDE.md にエージェント向けルールを自動追記する機能を無効化。
  // このリポジトリの CLAUDE.md は運用ルールを記載した独自ドキュメントのため、上書き・追記させない。
  agentRules: false,
};

export default nextConfig;
