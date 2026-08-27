import packageJson from "../../package.json";

interface BuildEnvironment {
  version?: string;
  sha?: string;
  repositoryUrl?: string;
  builtAt?: string;
}

export interface BuildInfo {
  version: string;
  sha: string;
  shortSha: string;
  repositoryUrl: string | null;
  builtAt: string;
  commitUrl: string | null;
}

export function createBuildInfo(environment: BuildEnvironment): BuildInfo {
  const deployed = Boolean(
    environment.sha && environment.repositoryUrl && environment.builtAt,
  );
  const sha = deployed ? environment.sha! : "local";
  const repositoryUrl = deployed ? environment.repositoryUrl!.replace(/\/$/, "") : null;
  return {
    version: environment.version ?? packageJson.version,
    sha,
    shortSha: deployed ? sha.slice(0, 7) : "local",
    repositoryUrl,
    builtAt: deployed ? environment.builtAt! : "local",
    commitUrl: deployed ? `${repositoryUrl}/commit/${sha}` : null,
  };
}

export function buildInfoFacts(info: BuildInfo): Record<string, string | number | null> {
  return {
    "app version": info.version,
    "build time": info.builtAt,
    "commit SHA": info.sha,
    "commit URL": info.commitUrl ?? "local",
  };
}

export const BUILD_INFO = createBuildInfo({
  version: process.env.NEXT_PUBLIC_YACCOUNT_VERSION ?? packageJson.version,
  sha: process.env.NEXT_PUBLIC_YACCOUNT_SHA,
  repositoryUrl: process.env.NEXT_PUBLIC_YACCOUNT_REPOSITORY_URL,
  builtAt: process.env.NEXT_PUBLIC_YACCOUNT_BUILD_TIME,
});
