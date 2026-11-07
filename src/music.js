// Original generative chip-metal: 152 BPM sixteenths, palm-muted riffs on a
// minor scale with power-chord stabs and blast-beat-ish drums. Equal-tempered
// pitch: 440 * 2^((note - 69) / 12). No samples, no downloaded tracks.
export const BPM = 152;
export const STEP = 60/BPM/4;
export const noteHz = n => 440*2**((n - 69)/12);
const RIFFS = [
  [0,0,12,0, 0,0,10,0, 0,0,7,0, 5,3,0,0],
  [0,0,0,12, 0,0,0,10, 0,7,0,5, 7,0,10,0],
  [0,12,0,0, 3,15,0,0, 5,17,0,0, 7,0,6,5],
  [0,0,0,0, 7,7,7,7, 5,5,5,5, 3,3,10,12]
];
const ROOTS = [40, 40, 36, 38]; // E, E, C, D
// intensity 0 = exploring, 1 = combat, 2 = boss
export function musicStep(step, intensity = 0) {
  const bar = Math.floor(step/16), beat = step % 16, section = Math.floor(bar/2) % 4, root = ROOTS[section];
  const riff = RIFFS[(section + (intensity > 1 ? 2 : 0)) % RIFFS.length], n = riff[beat], notes = [];
  if (n || beat % 2 === 0) notes.push({note:root + n, dur:STEP*0.9, type:'sawtooth', vol:intensity ? 0.09 : 0.06, chord:n === 0 && beat % 4 === 0});
  if (beat % 4 === 0 || (intensity && beat % 8 === 6)) notes.push({drum:'kick'});
  if (intensity && beat % 2 === 1 && beat % 4 !== 3) notes.push({drum:'kick', soft:true});
  if (beat % 8 === 4) notes.push({drum:'snare'});
  if (beat % 2 === 0) notes.push({drum:'hat'});
  if (intensity > 1 && beat === 0) notes.push({note:root + 24, dur:STEP*7, type:'square', vol:0.04});
  return notes;
}
