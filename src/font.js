// A tiny original 3x5 pixel font. Each glyph is five rows of three bits.
const G = {
  A:'010101111101101', B:'110101110101110', C:'011100100100011', D:'110101101101110', E:'111100110100111', F:'111100110100100',
  G:'011100101101011', H:'101101111101101', I:'111010010010111', J:'001001001101010', K:'101101110101101', L:'100100100100111',
  M:'101111111101101', N:'110101101101101', O:'010101101101010', P:'110101110100100', Q:'010101101110011', R:'110101110101101',
  S:'011100010001110', T:'111010010010010', U:'101101101101111', V:'101101101101010', W:'101101111111101', X:'101101010101101',
  Y:'101101010010010', Z:'111001010100111', 0:'111101101101111', 1:'010110010010111', 2:'110001010100111', 3:'110001010001110',
  4:'101101111001001', 5:'111100110001110', 6:'011100110101010', 7:'111001010010010', 8:'010101010101010', 9:'010101011001110',
  ' ':'000000000000000', '.':'000000000000010', ',':'000000000010100', '!':'010010010000010', '?':'110001010000010', "'":'010010000000000',
  '-':'000000111000000', '+':'000010111010000', ':':'000010000010000', '/':'001001010100100', '%':'101001010100101', '#':'101111101111101',
  '@':'010101111100011', '(':'001010010010001', ')':'100010010010100', '<':'001010100010001', '>':'100010001010100', '=':'000111000111000',
  '$':'011110010011110', '"':'101101000000000', '&':'010101010101011', '*':'101010101000000', '_':'000000000000111', ';':'000010000010100',
  '[':'011010010010011', ']':'110010010010110', '~':'000011110000000'
};
export const GLYPHS = Object.freeze(G);
export const glyph = ch => G[ch] || G[ch.toUpperCase()] || G['?'];
export const textWidth = (s, scale = 1) => s.length ? (s.length*4 - 1)*scale : 0;
// target needs set(x, y, color) that ignores out-of-bounds writes.
export function drawText(target, x, y, s, color, scale = 1, shadow = 0) {
  x = Math.round(x); y = Math.round(y);
  if (shadow) drawText(target, x + scale, y + scale, s, shadow, scale);
  for (let i = 0; i < s.length; i++) {
    const g = glyph(s[i]);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r*3 + c] === '1')
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) target.set(x + (i*4 + c)*scale + sx, y + r*scale + sy, color);
  }
}
// Word-wrap to a pixel width.
export function wrap(s, width, scale = 1) {
  const words = s.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (textWidth(t, scale) > width && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
