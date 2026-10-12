import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";

const web = fileURLToPath(new URL("../", import.meta.url));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const artifactPath = process.argv[2];
if (!artifactPath)
  throw new Error(
    "Pass the compiled Coinstark artifact: npm run verify:contract -- /absolute/path/to/Coinstark.json",
  );
const artifact = await json(resolve(artifactPath));
const deployment = await json(resolve(web, "src/contracts/deployment.json"));
const integrity = await json(resolve(web, "src/contracts/integrity.json"));
const abi = await json(resolve(web, "src/contracts/Coinstark.abi.json"));
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const abiHash = keccak256(toHex(JSON.stringify(canonical(artifact.abi))));
const creationCodeHash = keccak256(artifact.bytecode.object);
const runtimeCodeHash = keccak256(artifact.deployedBytecode.object);
assert.deepEqual(
  abi,
  artifact.abi,
  "The bundled ABI must equal the compiler ABI",
);
assert.equal(abiHash, `0x${deployment.contracts[0].abiHash}`);
assert.equal(creationCodeHash, `0x${deployment.contracts[0].creationCodeHash}`);
assert.equal(runtimeCodeHash, integrity.runtimeCodeHash);
assert.equal(integrity.abiHash, abiHash);
assert.equal(integrity.creationCodeHash, creationCodeHash);
assert.equal(integrity.sourceCommit, deployment.sourceCommit);
console.log(
  JSON.stringify(
    {
      passed: true,
      sourceCommit: deployment.sourceCommit,
      abiHash,
      creationCodeHash,
      runtimeCodeHash,
    },
    null,
    2,
  ),
);
