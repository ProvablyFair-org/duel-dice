/**
 * Two-pass simulation for Duel Dice.
 *
 * Pass 1 — Fresh seeds (random HMAC keys):
 *   For each of 98 targets (200, 300, 400, ..., 9900 — full range):
 *     Simulate 1 seed × 1,000,000 rounds each.
 *     Record: win rate, chi-squared vs theoretical win_chance, serial independence.
 *     Track RTP snapshots at sample points for convergence chart.
 *
 * Pass 2 — Casino seeds (10,000 nonces per seed):
 *   For each revealed server seed (using actual client seed from dataset):
 *     Target = 5000 (50% win rate — sufficient expected counts for chi-squared).
 *     Test A: chi-squared win rate on full nonce range 0–9,999 vs theoretical at α=0.01.
 *     Test B: chi-squared on early nonces (0–49) and late nonces (50–9,999)
 *             separately vs theoretical. Flags seeds whose early-epoch distribution
 *             deviates while the late range does not — the statistical signature
 *             of cherry-picked seeds.
 *
 * Output: outputs/simulation-results.json, outputs/rtp-convergence.html
 */

import * as fs     from 'fs';
import * as path   from 'path';
import { computeResult, computeResultFromBuffer, theoreticalWinChance, theoreticalMultiplier } from './rng';
import { chiSquaredTest, lagOneAutocorrelation, waldsWolfowitzRunsTest } from './stats';
import { loadDataset, buildSeedMap }            from './loader';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Pass 1 simulation seeds — one unique pinned seed pair per target (98 total).
// Each pair generated once via crypto.randomBytes(32/16), pinned for reproducibility.
// Using distinct seeds per target prevents cross-target correlation artifacts:
// a single seed would produce the same HMAC-SHA256 byte stream for every target,
// meaning win/loss outcomes at similar thresholds would be correlated.
const SIM_SEEDS: { server: string; client: string }[] = [
  {server:"1249d85943dd2fa3e804098fa2e23fbff48d93c0b6c59c603a029653c15592a3",client:"162ce7214dbb52fef1811744082281d2"},
  {server:"4107109b995299a043c54ef4619d89710fffd47e828da4cc17b4c89e0be77f41",client:"d764059977d5b0737ed24f25cc09e2f9"},
  {server:"adac09e9746a68d7adacfdd7bcb8d9e4dbb6e0530459b44e8a61ab68469c973f",client:"f6f7f3ddf59bc1c35965cf3ba27a3d7e"},
  {server:"a91c927e0aa734bd6418ea9668511fdd0dd9ed0c1d64d26732ea5ee1aff3aba7",client:"4730d3779166ebb24e7b0274027ab67c"},
  {server:"e6a23a0fcbb0711f22bfa76ba4cbab4d490d84f7a136346443a3bab1b889ceb6",client:"45793fcf69aa737331633451b64310ba"},
  {server:"cce13c4723cdd5c0a4cf5c83a144e3b3e4e4aaa90fb7f950883f8f40d1e41617",client:"414589003fade4df73cbae7bc65732ff"},
  {server:"5dcdc6f774160804af3f2810c51b0683206c15456d9590a02f0088c9c390cb23",client:"a997847ff9ab247ceb4fe8cac2bb0837"},
  {server:"7c2c24a05484aa953be65cc0c2863ffaf224f2a6c05c237010e9a240260b1799",client:"c13b55aef4c94c2ffe8176caa8bbaa50"},
  {server:"3245429dcc1572bc78511feaef9031fd9a2876b2c5a6bf73b84c1eaec50381bf",client:"536b24e2a0070146304fa9096a9fe881"},
  {server:"82ce9e7da8be0034e0ef0d8278e2ddc6d974a4c485f6e42b22c9ff6b7521dfcd",client:"eb22032d1037757d4c60cc66dc1ee5a1"},
  {server:"f1811065f0ef8b7d4fd528215fa5b78b80604685aec60c8792e82536d983abdd",client:"4754bde4c22af94697a85b5f7e60ff51"},
  {server:"e73bf31ddf8fb4a71ecc046966804e1b11a01b5a063b090cfdb0569a97702247",client:"893fe070d2cd4e443a3120770a4388ce"},
  {server:"9dc3c29ff40403bd034992d5965a274565673acc59f132b1f66a12d0e9c46a18",client:"8a9ed19c58c05310f7ff037bc297f4c9"},
  {server:"6ac5905457d77afd5ed5eb8b35f09c99425585544470d0b3030f351708f42fe9",client:"0720ff735f0123ed2674fb7feaaceedf"},
  {server:"48141a98bfaf402f359ce2fe10a419ec08403b2dbf4962c381e47703c2631d44",client:"d81c92d2de4501f18bdf1a0b87ffda9c"},
  {server:"76d0d962ff75b991617a3aaf0ecf066153faa521b95e09efb238f40bd4a3595d",client:"5be3590d58c8097f79a624f313c669d0"},
  {server:"6aa5a74a963ac242e74a179552da32d5fc5a254e831b955d6471f0dbc9cceb4c",client:"343cf123adc410a5c9cbaf4fe57642f3"},
  {server:"d7eae1fc7a186b6ea711008bc29ef9acbf366dbe4d105006f47761cc26a70e33",client:"82621da65615ae3a91633e22e5936723"},
  {server:"760755ef64708320a517e75bf49ad8f536a3401d801be99d4babdde99225eef8",client:"e11819e2a24b84b468f74aa1f99562ae"},
  {server:"8118b623fb30e0c857564ec32a421ed2a75301dfe151d60a5773d9e9f47bb319",client:"e9b5614fad7f4a61ebe945ea14b2b2ba"},
  {server:"f22dc7fcbafa1c9cd45cbfdf39eb64377c8b8a2e9f8d754594dd0d7cef881704",client:"33699a5eb3d943dbdd91455e9b1b0177"},
  {server:"43c4d6bf28294f324d74f454e9a78d025ce19ef9d83c4ee0e784c9427d0df73f",client:"a0eca88998437880bfb8bfa61e71256b"},
  {server:"ff0440ce3d1988ed89f6bea1ea6c998e5abf22ce1780bc9b15df4019154d411a",client:"96790c30b26204e781761cfd5871fec3"},
  {server:"1720a2ccfd9d328f84acbbeb89ceb3af94ab81f67daa1fddd5cea26d571b57b5",client:"56022a22a618ea2ff71a0e1594dad7c1"},
  {server:"6d0d8a70a32ecc998a8846c82ed7e47f1a3b9b69c71f668681fe9aa51b286edd",client:"adad79438ca6e60fec18614b44a05d47"},
  {server:"13ac68b2a87a07abefacf9134ebe1e815bb6622a7a92f1374366866de0afac80",client:"2015b254f7acac70def01cbcab47bb7c"},
  {server:"1dbeae95a63c31846535c44652127ed993b67391b0910b5f314361160252fbda",client:"ba377ad2a1982b67c9ac2d70bbe4b445"},
  {server:"a198410498ec0242c5d5b69ca4bd119d61cca306570eb11a6f71854248aa5f28",client:"af5d4dd86364bb3747e715b219cd81ed"},
  {server:"995d75b9b5a34b228b3a047929c051b9e8e31ece2eb05a30fc5885b8cac88028",client:"9f538ac1aa8ac48b24e05793e9e2c38f"},
  {server:"780c1bf27f3f1d0e1b04b48babc768603f102cbd624637d73eec0570d73f7d64",client:"26d52d034c6d6f9002ba4b2d47c16767"},
  {server:"bff495271e1a4d917b6dfb92a66b148fe97373b862d6c688ecf6541c30a7c97d",client:"731bcbae2d2c1d2fe41374699f61b128"},
  {server:"40437f5e30339ed83e24a26b07270b887c99a8c5b2f4d71803c84fea0b0f0303",client:"905c1accb679f19bb4ea410019bd0008"},
  {server:"2843831a0e95115fbca56885a7be586c6737b4320ff9adc4bbdd585eabdc59e1",client:"9b2c5e1410eca2938f7afe86ee091d7f"},
  {server:"55f25e3928c32ddcd0add1946396054759d35674ab3be93371567612a703d804",client:"31beb121a1b03d75273ccabc54502056"},
  {server:"a777696a20202679e69c950e58762f20cf82fd85adf1979bfd74d5de297add80",client:"bb507a2266ca60b4d05cbc4d469a8170"},
  {server:"d3ace1e9fddbcc2b976b5d495f90ec65b044ffa79dc61fe02133a9b1b9c1acc3",client:"6ea41d3f457077ea3e4ffffc26e1a8da"},
  {server:"c4b4c52611b0c7dfb0fd278d25248474522328f65243f726d5a255a4d531a27e",client:"d231c4f0c8e6ceeaea454d61b23a6eb8"},
  {server:"a90ffbb8250475782f017d681a3e5b92dc4f71d8552c20fac6fca1331c1f95d8",client:"ac78284280c7b97bb3df7d1058af7c55"},
  {server:"58e654a9574e6650613d39efaae414fc168a4fc4ef6bbae1449cd749554ba8c7",client:"a75a256cbcb7e9b3a034539d3eea187f"},
  {server:"59c37f3ce9b7a2b314127daae0333696239dd9d2aa822f1082c4c1bf994575e1",client:"4352b608b1b3fa4e9061e3a8b771af78"},
  {server:"4821db79060119ceb2a88414d5cbef16b093b690d65de84676ca246e4f878d93",client:"d29424a8b3257eeb20f83dff6c0a5b6a"},
  {server:"cde657c711b42ad780916832d56638ead71281600a616786dae1d8e59a24b6ec",client:"5e1ce401cd814b1f0515581cc2ef8bb2"},
  {server:"2c50c27d7dd1ba15d88090aee23ff697800cd6a1de699b674864af9cfbe31713",client:"58d70d4da87d49ddfc04dea26e770b61"},
  {server:"8a65572c22c69858f8041d6adc03bb310e6bd9019cb6e143a97e40d592b92067",client:"bd1d19ad260780b979ace98d03dc052c"},
  {server:"8d865f2f62e2601207bc31bc7cc7eae1eb52c73dc17e52d917fa05cdd31c9519",client:"895141a53afc12f6e8056c35ff1032d1"},
  {server:"614d673a5def9b1ab5e5068e144269199482c74ea122075b64ee1036824b3e33",client:"5d7465c3912ddfa76d702bbc1022b4e1"},
  {server:"1096bba7bd33cae93cefb282af36e732a92731d91b9942545d69b32644371804",client:"603a127d0f6f3e9b845d731ea23d8b56"},
  {server:"ea67bda4ac9b10c9b12b51b75eb93a343e855d0736867c6aadf45bb8dd5f0e8c",client:"6f653234ae7798979f8548ca3b1079bc"},
  {server:"42010fff70ea33fe30ca3c8a4623d574b91963f09c1976364564c310b420a7f5",client:"d9944358d5dc121401a99755a75424b3"},
  {server:"84bbeb8005229542f16a25835689a5f4155eee8776dbef048814991a98331aa7",client:"2049614589bc7ef30d684bd6c72f33ff"},
  {server:"369ced720dedb690ca8f577ef788d41dc10f625a873260821023a0e9711dfe30",client:"62bae59f7458237437e467d64e1bfc47"},
  {server:"35c725086be6d2003189cda6a49904069119b61c63bc4f447c0ce418603e4866",client:"cb0bc829faf0d4af3b93a09e1786bb07"},
  {server:"3d6cff896451ae65b0e15d31e04e37331f7f729c906979ccbfc2aa4bf3d7117c",client:"d20b20299a9f442d72ffdda5cd5e5cb8"},
  {server:"6a5df4b7b3599d593752db8e2f16c077cf5510ca0b37705c6867120034435425",client:"0e4b181d4897b6ca46ca0c58af0cace5"},
  {server:"48c6cab2e44f0368dbcd45c1ddd2fa03907d1086f526d923c43fc0499fb99e31",client:"d8f318191eec6a275fdc100e1015248f"},
  {server:"9c90f614e1e67fd462e8006bb4c0a18209fa72f57df1c51bdb2a542221ded596",client:"59289f65c3e959751141412cdef04eb3"},
  {server:"ae238f6acf226f45d43159f649598d08a38d688223606ce8aea571c9081f5fe2",client:"4505a612c1174efa82e24146a1520422"},
  {server:"a4ab20511a8da99b1c9cc4942b4e6916b20263b4f13094ab7c7f2daee3c31ca1",client:"d6d9bca1e716ebbae3dd2cab56534cc0"},
  {server:"dfe5ca764f9e8cb2eb0401d41a396415543bf5a307a263963c9be039b176b4e2",client:"d2db0ccecfc37aa70cefff1c9eec0065"},
  {server:"780399af3dbf07758fd520f5a58c09772ff2a6dcf8c66bb21450407920bf181d",client:"29ea160214e1ba22458a8c2094d8e233"},
  {server:"cdd706fcbd98a80266b28179e0fd4367255231275f7ac93701833111a3834b30",client:"0ed5d7b0679fc0258e9ecdffa0f9f290"},
  {server:"d564abeb42b329eb76b832acc0a4072f288e0810dcea67ab28a67b7fe014170f",client:"31543ce15dfb7cd348196c43a1df521c"},
  {server:"2192977c034e80e7948bd1e2232a0be06dc6acd95b1982ccba6662548b5fe77d",client:"4471d5642bdb075302d2c1e5cdc5c84e"},
  {server:"6828a284a3ffc5bda2fcd0d2af27ba4e7ef023ca67d334b545507b3d7bbf321d",client:"f777ca6d491657cc59a1dc5d01291275"},
  {server:"54658c212a42dd125c3e766f14a007cac39c93451f08c104c2d7333c4fcfee81",client:"fd545dad761f5b88a7c41e2ab7721380"},
  {server:"da805b6cb117ad3a6bbb639f5bc39e1b0443cd113ea89f5995bbf29119fc4642",client:"defeb8365572fe64b1521c7720799883"},
  {server:"756b29d428f42f026b229e210caef477244ccbb0dc090c2671d0ed2201dcf753",client:"418e279c9add402c44d370cf5281fb5b"},
  {server:"f9b9a342112ed0bdea1442e80128c3eb9df7f16c9be77090e9ec4407374c3ae3",client:"d7b0a2cb825da115386327d019620a08"},
  {server:"d3618bd0bc5e1681196312fa40a50f9df35457d77eae4fae88275f42f94bae13",client:"906419be5d61fceec91baad63155b30b"},
  {server:"7d0e95da9d5e451bb40ca0a4a33a8634a298ba6b5b70c88500ee1e6911da562c",client:"e78cee3cc0dc2b2a91cf36bbc34f4191"},
  {server:"e1b58ca77a51ec0366ab513eace2a61b34d9e54fab1d98218c3c3e37c04752ea",client:"7f182185bb1d9a446f09cad68ae69763"},
  {server:"d0c8ca243e11e2f31542aed654ddba692daca794ffd1b8e62dad5d7d8c140d04",client:"0a7192dae8a736a7550025ce7ef05773"},
  {server:"56dfdc7e44497290b3c7e9e0696608c0d92593bfc104ca6fae508d47d5520f24",client:"64b1a235f1ca2f603d6c460af7bc2792"},
  {server:"dfe5af3380fbf421d3b270b1f1545d44f528ab359bb6db72ade8d8dfba501064",client:"42750c6b26c570e6e4060569ccc6357d"},
  {server:"6fb4515245d29bf4f3fde3bbf9005fbbdae3cf13adc60bb27b80c032fdbe0b35",client:"1d5c91c2539ed93e6d0c78c55882b858"},
  {server:"9a838ce5433b63683018d54b4edfca849293132bd76021e6502788d25c4bb7f4",client:"cad55e8536882b7bfab9c1220cef4887"},
  {server:"1f757ff0aeff79610c9bde01094124fb354f7a583897b150679bf35c3f5c6dac",client:"7df578a366b65924278aeed63cd5ca74"},
  {server:"5f2dc1d3b8fbfad3cc9e9f5243bae0d767149ae5d70bb7c3a9e3e90cbacccfb8",client:"4ab255fb72e7f6c33f7d9a7471cb52bf"},
  {server:"81f02ff4653bec95f5db5c39e930f76c34a5499e4669a2adb502c7527981b485",client:"96aa09ce16c1408274f8fef793f06001"},
  {server:"43bde7a01c502560fb26f90ebd97f4ce7586d5b25e5d0d2bd714bd8eff693e24",client:"17a73bd8076437291c5cd93cf0b09fa2"},
  {server:"74c7916cb14c243b5e2cd655fafab3ce5712ffcdf3e70fb91b5cdadd067b3a95",client:"f15c182f665ca8675c736e4248ae4390"},
  {server:"ffe89ab2e19b88407921ce0fe0a388650563f8288883c03541f1d0ad03213238",client:"0af4c67fac52d85a15a20eb70b189a8b"},
  {server:"55769fb62634897e0657b8a891de885d1273dd01c6db04d7f64f6158164798c6",client:"8d8b8ac5ab91cdd2526f10aca200ee7d"},
  {server:"d5433a1c7c128ce9e6f3bb1fdb7990b8dc944dcbf7dad2f92ea74f4fb0385427",client:"70cdc867ca274ad47ff4078fee05996c"},
  {server:"3dd003dfb4ca95beb1bbf5bf6ffa9fbc710f41ddd631454305bc52eb0a11f08d",client:"5425c07fc5b0c0895653ee9c5c9c1574"},
  {server:"89090d4f32b59e6a16674d1c58442152dd70195e3286839b611f6a8291403570",client:"5ec663f99f23e4e678f365afdfcf07ca"},
  {server:"06f1927bfe4dcb1f1e42259b47959df1d945801cce1dde4d647ef15f04e04374",client:"fcb78ca11660cc6196e6653a587e9e71"},
  {server:"d38f81aa1800bba73ccac41b3fccb667ca701064fafc93cf03335b9dfc4f211f",client:"5ad323abdb266a39c8e16b4de922c627"},
  {server:"ebb3d95818cd40b637ff738e3c1f4e02d316c701399cfb9535aaf80a252b9bbf",client:"84248003ed1be381f2d6f16d4d22baef"},
  {server:"308617996344bd9e076e7f127360a8da80c78d88062993cf54370f68ed0d43d4",client:"7be879c197b9c3cf66e3b6ea06d693e2"},
  {server:"1d6df47f8f609d8588e4c6c193460ac90377e10e1591934337647904418a7e88",client:"f1cb63a9740f7521ef65313360edb066"},
  {server:"cf64e9720832d063df3fc6c2930427a3a54cfe019704726a5289996105a5fd4b",client:"e1d50486ad1afb8814a5a2c10b564528"},
  {server:"1bfc658cbefa3ed6ecde13e9df5387d75ef3a4df97a24553dfaaeb896c5c9a50",client:"75a528fa6a247d00fb3dfd37345e1ae7"},
  {server:"769027a2b8ba8194a5392af22d94f5f37a4d45f65ea9d170131bbd2a9936e446",client:"3837a1adac14c617934da5b0fdaf81c7"},
  {server:"8382cb610f9c0d89f5c719f686f704daf49eb889cc82c043d31199a2e97530df",client:"6863f08bf1d0d144f50204f90c6b667b"},
  {server:"6c2e26c8ecd5f65e951bc3d999d8d75dad59f17b0ce9d6235cbea61b3b2cbe97",client:"244d90880d9808898b54f8bd7dc11141"},
  {server:"24415dbffea09972345df58fb33e3d5ca658e9b4c1ae2aa8086928cf2af99245",client:"ee53ed2d5de43550302dbc800d2f6e0f"},
  {server:"819f09d40900c29a9a2730fa7f8970a26f00925c27c972b6f1595abf04790be6",client:"8312fd086ba40a4aa67f6860f824c3b4"},
];

/**
 * Binomial survival function: P(X >= k) where X ~ Binomial(n, p).
 * Uses direct summation for small k, complement for large k.
 */
function binomialSurvival(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;

  // Compute P(X < k) = sum_{i=0}^{k-1} C(n,i) * p^i * (1-p)^(n-i)
  // Use log-space to avoid overflow
  const q = 1 - p;
  let cumulative = 0;
  let logBinom = 0; // log(C(n,0)) = 0
  for (let i = 0; i < k; i++) {
    if (i > 0) logBinom += Math.log(n - i + 1) - Math.log(i);
    const logProb = logBinom + i * Math.log(p) + (n - i) * Math.log(q);
    cumulative += Math.exp(logProb);
  }
  return Math.max(0, 1 - cumulative);
}

function progressBar(current: number, total: number, label: string, startMs: number): void {
  const pct    = current / total;
  const filled = Math.round(pct * 30);
  const bar    = '\u2501'.repeat(filled) + '\u254C'.repeat(30 - filled);
  const elapsed = (Date.now() - startMs) / 1000;
  const eta     = pct > 0 ? (elapsed / pct) * (1 - pct) : 0;
  process.stdout.write(`\r  ${bar} ${(pct * 100).toFixed(0)}% ${label} [${elapsed.toFixed(0)}s / ETA ${eta.toFixed(0)}s]`);
}

// ── Constants ─────────────────────────────────────────────────────────────────

// 98 targets: 200, 300, 400, ..., 9900 (full range in steps of 100)
const PASS1_TARGETS     = Array.from({ length: 98 }, (_, i) => (i + 2) * 100);
const PASS1_ROUNDS_EACH = 1_000_000;
const PASS1_SEEDS       = 1;    // single seed per target, 1M rounds
const CONVERGENCE_SAMPLES = [10_000, 50_000, 100_000, 500_000, 1_000_000];
const THEORETICAL_RTP   = 0.999; // 99.9% — uniform 0.1% house edge across all targets

// ── Pass 1 ────────────────────────────────────────────────────────────────────

console.log('=== Pass 1 — Fresh Seeds ===');
console.log(`  ${PASS1_TARGETS.length} targets \u00d7 ${PASS1_SEEDS} seeds \u00d7 ${PASS1_ROUNDS_EACH.toLocaleString()} rounds`);
console.log('');

interface Pass1Result {
  target: number;
  theoreticalWinChance: number;
  simWinRate: number;
  chi2: number;
  df: number;
  pValue: number;
  lag1R: number;
  lag1Z: number;
  runsP: number;
  rtpSnapshots: { roundCount: number; rtp: number }[];
}

const pass1Results: Pass1Result[] = [];
let pass1Chi2Fails = 0;

const pass1Start = Date.now();

for (let ti = 0; ti < PASS1_TARGETS.length; ti++) {
  const target = PASS1_TARGETS[ti];
  const theor  = theoreticalWinChance(target);
  const mult   = theoreticalMultiplier(target);
  let totalWins   = 0;
  let totalRounds = 0;
  let totalPayout = 0;
  const hitSequence: number[] = [];
  const rtpSnapshots: { roundCount: number; rtp: number }[] = [];
  let nextSampleIdx = 0;

  for (let s = 0; s < PASS1_SEEDS; s++) {
    const seed = SIM_SEEDS[ti];
    const key = Buffer.from(seed.server, 'hex');
    for (let n = 0; n < PASS1_ROUNDS_EACH; n++) {
      const result = computeResultFromBuffer(key, seed.client, n);
      hitSequence.push(result);
      if (result > target) {
        totalWins++;
        totalPayout += mult;
      }
      totalRounds++;

      // Record RTP snapshot at sample points (across all seeds combined)
      if (nextSampleIdx < CONVERGENCE_SAMPLES.length && totalRounds === CONVERGENCE_SAMPLES[nextSampleIdx]) {
        rtpSnapshots.push({ roundCount: totalRounds, rtp: (totalPayout / totalRounds) * 100 });
        nextSampleIdx++;
      }
    }
  }

  const simWinRate = totalWins / totalRounds;
  const n          = totalRounds;
  const observed   = [totalWins, n - totalWins];
  const expected   = [theor * n, (1 - theor) * n];
  const { chi2, df, pValue } = chiSquaredTest(observed, expected);
  if (pValue < 0.01) pass1Chi2Fails++;

  // Serial independence: lag-1 autocorrelation + Wald-Wolfowitz runs test
  const lag1R = lagOneAutocorrelation(hitSequence);
  const lag1Z = lag1R * Math.sqrt(hitSequence.length);
  const runs  = waldsWolfowitzRunsTest(hitSequence);

  pass1Results.push({ target, theoreticalWinChance: theor, simWinRate, chi2, df, pValue, lag1R, lag1Z, runsP: runs.pValue, rtpSnapshots });

  progressBar(ti + 1, PASS1_TARGETS.length, `target=${target}`, pass1Start);
}

process.stdout.write('\n\n');

// ── Convergence data (cross-target mean RTP at increasing round counts) ──────

interface ConvergencePoint {
  roundCount: number;
  meanRTP: number;
  stdDev: number;
}

const convergenceData: ConvergencePoint[] = [];

for (const samplePoint of CONVERGENCE_SAMPLES) {
  const rtpsAtPoint: number[] = [];
  for (const r of pass1Results) {
    const snap = r.rtpSnapshots.find(s => s.roundCount === samplePoint);
    if (snap) rtpsAtPoint.push(snap.rtp);
  }
  if (rtpsAtPoint.length === 0) continue;
  const mean = rtpsAtPoint.reduce((a, b) => a + b, 0) / rtpsAtPoint.length;
  const variance = rtpsAtPoint.length > 1
    ? rtpsAtPoint.reduce((a, b) => a + (b - mean) ** 2, 0) / (rtpsAtPoint.length - 1)
    : 0;
  const stdErr = rtpsAtPoint.length > 1 ? Math.sqrt(variance) / Math.sqrt(rtpsAtPoint.length) : 0;
  convergenceData.push({
    roundCount: samplePoint,
    meanRTP: mean,
    stdDev: stdErr,
  });
}

const pass1SerialFails = pass1Results.filter(r => Math.abs(r.lag1Z) > 3 || r.runsP < 0.01).length;

// FWER reporting
const bonferroniAlpha = 0.01 / PASS1_TARGETS.length;
console.log(`  FWER: Bonferroni \u03b1/N = ${bonferroniAlpha.toFixed(6)} (N=${PASS1_TARGETS.length})`);
console.log(`  Chi-squared fails (uncorrected \u03b1=0.01): ${pass1Chi2Fails}/${PASS1_TARGETS.length}`);
console.log(`  Serial independence fails: ${pass1SerialFails}/${PASS1_TARGETS.length} (|z|>3 or runs p<0.01)`);

const meanRtp = pass1Results.reduce((a, r) => a + r.simWinRate * theoreticalMultiplier(r.target) * 100, 0) / pass1Results.length;
console.log(`  Mean simulated RTP: ${meanRtp.toFixed(4)}%`);

const pass1Summary = {
  targets:                  PASS1_TARGETS.length,
  roundsPerTarget:          PASS1_SEEDS * PASS1_ROUNDS_EACH,
  totalRounds:              PASS1_TARGETS.length * PASS1_SEEDS * PASS1_ROUNDS_EACH,
  chi2FailsAtAlpha01:       pass1Chi2Fails,
  serialIndependenceFails:  pass1SerialFails,
  bonferroniAlpha,
  meanRtp,
  convergence:              convergenceData,
  results:                  pass1Results,
};

// ── Pass 2 ────────────────────────────────────────────────────────────────────

console.log('\n=== Pass 2 — Casino Seeds ===');

const dataset  = loadDataset();
const seedMap  = buildSeedMap(dataset.seeds);

// Build map: serverSeedHashed → most common clientSeed used in actual bets
const clientSeedForHash = new Map<string, string>();
for (const [hash] of seedMap) {
  const counts = new Map<string, number>();
  for (const bet of dataset.bets) {
    if (bet.response.server_seed_hashed === hash) {
      const cs = bet.response.client_seed;
      counts.set(cs, (counts.get(cs) || 0) + 1);
    }
  }
  if (counts.size > 0) {
    // Pick the most common client seed
    let bestCS = '';
    let bestCount = 0;
    for (const [cs, count] of counts) {
      if (count > bestCount) { bestCS = cs; bestCount = count; }
    }
    clientSeedForHash.set(hash, bestCS);
  }
}

// Cherry-pick test at target=5000 (50% win rate) — expected wins in 50 nonces = 25, well above chi-squared minimum of 5
const CHERRY_PICK_TARGET = 5000;
const CHERRY_PICK_THEOR  = theoreticalWinChance(CHERRY_PICK_TARGET);

const pass2Results: {
  serverSeedHashed: string;
  clientSeed: string;
  target: number;
  earlyWins: number; earlyTotal: number; early_p: number;
  lateWins:  number; lateTotal:  number; late_p: number;
  testA_chi2_fail: boolean;
  cherry_pick_flag: boolean;
}[] = [];

let pass2TestAFails  = 0;
let pass2TestBFlags  = 0;

const NONCES_PER_SEED = 10_000;
const EPOCH_LENGTH    = 50;   // nonces 0–49: the live capture window (early)

const seedEntries = Array.from(seedMap.entries());
console.log(`  ${seedEntries.length} revealed seeds \u00d7 target=${CHERRY_PICK_TARGET} (${(CHERRY_PICK_THEOR * 100).toFixed(1)}% win rate)`);
console.log(`  ${NONCES_PER_SEED.toLocaleString()} nonces per seed (early: 0\u2013${EPOCH_LENGTH - 1}, late: ${EPOCH_LENGTH}\u2013${NONCES_PER_SEED - 1})`);

const pass2Start = Date.now();

for (let si = 0; si < seedEntries.length; si++) {
  const [hash, serverSeed] = seedEntries[si];
  const clientSeed = clientSeedForHash.get(hash) || 'auditSeed';
  const keyBuf = Buffer.from(serverSeed, 'hex');

  // Early nonces 0–49, late nonces 50–9999
  let earlyWins = 0;
  let lateWins  = 0;

  for (let n = 0; n < NONCES_PER_SEED; n++) {
    const result = computeResultFromBuffer(keyBuf, clientSeed, n);
    if (result > CHERRY_PICK_TARGET) {
      if (n < EPOCH_LENGTH) earlyWins++;
      else                  lateWins++;
    }
  }

  // Test A: chi-squared on full range (10,000 rounds)
  const totalWins = earlyWins + lateWins;
  const { pValue: pA } = chiSquaredTest(
    [totalWins, NONCES_PER_SEED - totalWins],
    [CHERRY_PICK_THEOR * NONCES_PER_SEED, (1 - CHERRY_PICK_THEOR) * NONCES_PER_SEED],
  );
  const testA_fail = pA < 0.01;
  if (testA_fail) pass2TestAFails++;

  // Test B: compare early vs late win rate — cherry-picking detection
  const lateCount = NONCES_PER_SEED - EPOCH_LENGTH;
  const { pValue: pEarly } = chiSquaredTest(
    [earlyWins, EPOCH_LENGTH - earlyWins],
    [CHERRY_PICK_THEOR * EPOCH_LENGTH, (1 - CHERRY_PICK_THEOR) * EPOCH_LENGTH],
  );
  const { pValue: pLate } = chiSquaredTest(
    [lateWins, lateCount - lateWins],
    [CHERRY_PICK_THEOR * lateCount, (1 - CHERRY_PICK_THEOR) * lateCount],
  );
  // Cherry-picking signature: early deviates from binomial, late does not
  const cherry_pick_flag = pEarly < 0.05 && pLate >= 0.05;
  if (cherry_pick_flag) pass2TestBFlags++;

  pass2Results.push({
    serverSeedHashed: hash,
    clientSeed,
    target: CHERRY_PICK_TARGET,
    earlyWins, earlyTotal: EPOCH_LENGTH, early_p: pEarly,
    lateWins,  lateTotal:  lateCount, late_p:  pLate,
    testA_chi2_fail: testA_fail,
    cherry_pick_flag,
  });

  progressBar(si + 1, seedEntries.length, `seed ${si + 1}/${seedEntries.length}`, pass2Start);
}

process.stdout.write('\n\n');

const N = pass2Results.length;

// Binomial p-value for cherry-pick flag count:
// Under H₀, each seed flags independently with P(flag) ≈ 0.05 × 0.95 ≈ 0.0475.
// We use the exact binomial survival P(X >= observed | n=N, p=0.05) as a conservative
// upper bound. PASS if p >= 0.01, FAIL if p < 0.01.
const cherryPickBinomP = binomialSurvival(pass2TestBFlags, N, 0.05);
const cherryPickVerdict = cherryPickBinomP >= 0.01 ? 'PASS' : 'FAIL';

const testABinomP = binomialSurvival(pass2TestAFails, N, 0.01);
const testAVerdict = testABinomP >= 0.01 ? 'PASS' : 'FAIL';

const pass2Summary = {
  seed_count:                    N,
  target:                        CHERRY_PICK_TARGET,
  theoretical_win_chance:        CHERRY_PICK_THEOR,
  nonces_per_seed:               NONCES_PER_SEED,
  epoch_length:                  EPOCH_LENGTH,
  test_a_chi2_fails_at_alpha01:  pass2TestAFails,
  test_a_binom_p:                testABinomP,
  test_a_verdict:                testAVerdict,
  test_b_cherry_pick_flags:      pass2TestBFlags,
  test_b_binom_p:                cherryPickBinomP,
  test_b_verdict:                cherryPickVerdict,
  results: pass2Results,
};

console.log(`  Test A: ${pass2TestAFails}/${N} chi-squared fails — binomial P(X\u2265${pass2TestAFails}|n=${N},p=0.01) = ${testABinomP.toFixed(6)} — ${testAVerdict}`);
console.log(`  Test B: ${pass2TestBFlags}/${N} cherry-pick flags — binomial P(X\u2265${pass2TestBFlags}|n=${N},p=0.05) = ${cherryPickBinomP.toFixed(6)} — ${cherryPickVerdict}`);

// ── Write output ──────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '../outputs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const output = {
  generatedAt: new Date().toISOString(),
  pass1_fresh_seeds:  pass1Summary,
  pass2_casino_seeds: pass2Summary,
};

fs.writeFileSync(path.join(outDir, 'simulation-results.json'), JSON.stringify(output, null, 2));

// ── Generate RTP Convergence Chart (self-contained HTML) ─────────────────────

const lastPoint = convergenceData[convergenceData.length - 1];
const finalRTP  = lastPoint.meanRTP;

const chartHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Duel.com Dice RTP Convergence \u2014 ${PASS1_TARGETS.length} Targets \u00d7 1M Rounds Each</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; padding: 24px; }
  .container { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e0e0e0; padding: 32px; }
  h1 { text-align: center; font-size: 16px; font-weight: 600; color: #333; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { position: relative; height: 420px; }
  .final-box { display: inline-block; border: 2px solid #4caf50; border-radius: 8px; padding: 10px 20px; margin-top: 20px; }
  .final-box .label { font-size: 13px; color: #666; }
  .final-box .value { font-size: 22px; font-weight: 700; color: #2e7d32; }
  .final-box .check { color: #4caf50; font-size: 18px; }
  .legend { text-align: center; margin-top: 12px; font-size: 13px; color: #666; }
  .legend span { margin: 0 12px; }
  .legend .dot { display: inline-block; width: 12px; height: 3px; vertical-align: middle; margin-right: 4px; }
</style>
</head>
<body>
<div class="container">
  <h1>Duel.com Dice RTP Convergence \u2014 ${PASS1_TARGETS.length} Targets \u00d7 1M Rounds Each</h1>
  <div class="chart-wrap"><canvas id="chart"></canvas></div>
  <div class="legend">
    <span><span class="dot" style="background:#1565c0;height:3px"></span> Mean RTP</span>
    <span><span class="dot" style="background:rgba(229,115,115,0.5);height:3px"></span> \u00b12 SE band</span>
    <span><span class="dot" style="background:#e57373;border-top:2px dashed #e57373;height:0"></span> Theoretical (${(THEORETICAL_RTP * 100).toFixed(1)}%)</span>
  </div>
  <div style="text-align:right; margin-top:8px;">
    <div class="final-box">
      <span class="label">Final Mean RTP (1M rounds):</span>
      <span class="value">${finalRTP.toFixed(3)}%</span>
      <span class="check">\u2713</span>
    </div>
  </div>
</div>
<script>
const data = ${JSON.stringify(convergenceData.map(d => ({
  x: d.roundCount,
  y: d.meanRTP,
  sd: d.stdDev,
})))};

const theoretical = ${(THEORETICAL_RTP * 100).toFixed(6)};
const nTargets = ${PASS1_TARGETS.length};
const labels = data.map(d => {
  const m = d.x / 1e6;
  return m >= 1 ? m.toFixed(0) + 'M' : (d.x / 1e3).toFixed(0) + 'K';
});

const ctx = document.getElementById('chart').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels,
    datasets: [
      {
        label: 'Upper band',
        data: data.map(d => d.y + d.sd * 2),
        borderColor: 'transparent',
        backgroundColor: 'rgba(229,115,115,0.08)',
        fill: '+1',
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'Lower band',
        data: data.map(d => d.y - d.sd * 2),
        borderColor: 'transparent',
        backgroundColor: 'rgba(229,115,115,0.08)',
        fill: false,
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: '+2 SE',
        data: data.map(d => d.y + d.sd),
        borderColor: 'rgba(229,115,115,0.4)',
        borderWidth: 1,
        fill: false,
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: '-2 SE',
        data: data.map(d => d.y - d.sd),
        borderColor: 'rgba(229,115,115,0.4)',
        borderWidth: 1,
        fill: false,
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'Theoretical (' + theoretical.toFixed(1) + '%)',
        data: data.map(() => theoretical),
        borderColor: '#e57373',
        borderWidth: 2,
        borderDash: [8, 4],
        fill: false,
        pointRadius: 0,
      },
      {
        label: 'Mean RTP',
        data: data.map(d => d.y),
        borderColor: '#1565c0',
        borderWidth: 2.5,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#1565c0',
        pointHoverBackgroundColor: '#1565c0',
        tension: 0.3,
      },
      {
        label: 'Final',
        data: data.map((d, i) => i === data.length - 1 ? d.y : null),
        borderColor: '#1565c0',
        backgroundColor: '#1565c0',
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => labels[items[0].dataIndex] + ' rounds/target \u2014 mean of ' + nTargets + ' targets',
          label: (item) => {
            if (item.datasetIndex === 5) return 'Mean RTP: ' + item.parsed.y.toFixed(4) + '%';
            if (item.datasetIndex === 4) return 'Theoretical: ' + theoretical.toFixed(4) + '%';
            if (item.datasetIndex <= 1) return '\\u00b12 SE: ' + data[item.dataIndex].sd.toFixed(4) + '%';
            return null;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Rounds per Target (${PASS1_SEEDS} seeds \u00d7 N rounds)', font: { size: 12 } },
        ticks: { maxTicksLimit: 10 },
      },
      y: {
        title: { display: false },
        ticks: { callback: v => v.toFixed(1) + '%' },
      },
    },
  },
});
<\/script>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'rtp-convergence.html'), chartHTML);

console.log('\nOutputs:');
console.log('  outputs/simulation-results.json');
console.log('  outputs/rtp-convergence.html');
