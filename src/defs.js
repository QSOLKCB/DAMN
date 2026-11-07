// Everything DAMN knows about weapons, enemies, items and difficulty, plus the jokes.
// All names and gags are original; references are to general internet culture.

export const WEAPONS = Object.freeze([
  {id:'hammer', slot:1, name:'BAN HAMMER', ammo:null, cost:0, cooldown:0.48, damage:[20,40], kind:'melee', range:1.5,
    pickup:'', blurb:'Moderation, in its purest form.'},
  {id:'block', slot:2, name:'BLOCK BUTTON', ammo:'clicks', cost:1, cooldown:0.36, damage:[8,15], pellets:1, spread:0.012, kind:'hitscan',
    pickup:'', blurb:'Silence them. Reliably.'},
  {id:'hottake', slot:3, name:'HOT TAKE', ammo:'takes', cost:1, cooldown:0.9, damage:[6,11], pellets:7, spread:0.1, kind:'hitscan',
    pickup:'You got the HOT TAKE! It hits everyone at once.', blurb:'Spicy. Divisive. Effective at close range.'},
  {id:'copypasta', slot:4, name:'COPYPASTA', ammo:'clicks', cost:1, cooldown:0.095, damage:[6,11], pellets:1, spread:0.04, kind:'hitscan',
    pickup:'You got the COPYPASTA! Ctrl+C, Ctrl+V, Ctrl+V, Ctrl+V...', blurb:'The same joke, fired 600 times a minute.'},
  {id:'rocket', slot:5, name:'ROCKET EMOJI', ammo:'rockets', cost:1, cooldown:0.78, damage:[30,50], splash:[80,1.8], speed:13, kind:'projectile', projectile:'rocket',
    pickup:'You got the ROCKET EMOJI! To the moon, apparently.', blurb:'Do not fire at point blank. We are begging you.'},
  {id:'ratio', slot:6, name:'L + RATIO', ammo:'ratio', cost:20, cooldown:1.05, damage:[90,130], splash:[160,2.6], speed:17, kind:'projectile', projectile:'ratio',
    pickup:'You got the L + RATIO! The final word in any argument.', blurb:'Ends discourse. Permanently.'}
]);
export const WEAPON_BY_ID = Object.freeze(Object.fromEntries(WEAPONS.map(w => [w.id, w])));
export const AMMO_MAX = Object.freeze({clicks:200, takes:50, rockets:40, ratio:300});
export const AMMO_NAMES = Object.freeze({clicks:'CLICKS', takes:'TAKES', rockets:'ROCKETS', ratio:'RATIO'});

// Enemies. damage values are before difficulty scaling.
export const ENEMIES = Object.freeze({
  w:{id:'wellactually', name:'WELL ACTUALLY', hp:45, speed:2.9, radius:0.33, height:0.8, attack:'melee', damage:[5,11], windup:0.25, cooldown:0.75, range:1.1, pain:0.7,
    sight:['WELL ACTUALLY...', 'UM, SOURCE?', 'I THINK YOU\'LL FIND...'], deaths:['WELL ACTUALLY HAS BEEN RATIO\'D', 'WELL ACTUALLY LOST THE ARGUMENT', 'WELL ACTUALLY LEFT THE CHAT']},
  o:{id:'bot', name:'ENGAGEMENT BOT', hp:30, speed:1.7, radius:0.3, height:0.85, attack:'hitscan', damage:[3,8], windup:0.4, cooldown:1.3, range:16, spread:0.09, pain:0.8,
    sight:['HELLO SIR', 'NICE POST! CHECK MY BIO', 'BEEP BOOP. ENGAGE.'], deaths:['BOT REPORTED AS SPAM', 'BOT ACCOUNT SUSPENDED', '404: BOT NOT FOUND']},
  t:{id:'troll', name:'TROLL', hp:75, speed:1.9, radius:0.36, height:0.95, attack:'projectile', projectile:'hottake', damage:[8,15], windup:0.5, cooldown:1.7, range:18, projSpeed:7, pain:0.5,
    sight:['DO NOT FEED ME', 'LOL. LMAO EVEN.', 'COPE AND SEETHE'], deaths:['THE TROLL TOUCHED GRASS', 'TROLL HAS BEEN FED (TO DEATH)', 'TROLL WENT BACK UNDER THE BRIDGE']},
  i:{id:'influencer', name:'INFLUENCER', hp:110, speed:1.5, radius:0.38, height:1.0, float:0.25, attack:'projectile', projectile:'heart', volley:3, damage:[4,8], windup:0.55, cooldown:2.1, range:18, projSpeed:8, pain:0.35,
    sight:['HEY GUYS, WELCOME BACK!', 'SMASH THAT LIKE BUTTON', 'USE CODE DAMN FOR 10% OFF'], deaths:['INFLUENCER LOST ALL FOLLOWERS', 'INFLUENCER IS TAKING A BREAK FROM SOCIAL MEDIA', 'INFLUENCER GOT DEMONETIZED']},
  g:{id:'doomscroller', name:'DOOMSCROLLER', hp:420, speed:1.3, radius:0.46, height:1.35, attack:'projectile', projectile:'rocketmoji', damage:[16,28], splash:[30,1.4], windup:0.6, cooldown:1.5, range:22, projSpeed:9, pain:0.15,
    sight:['JUST ONE MORE SCROLL...', 'IT IS 4 AM. I AM AWAKE.', 'THE FEED NEVER ENDS'], deaths:['THE DOOMSCROLLER FINALLY PUT THE PHONE DOWN', 'DOOMSCROLLER REACHED THE END OF THE INTERNET']},
  A:{id:'algorithm', name:'THE ALGORITHM', hp:2600, speed:0.7, radius:0.7, height:2.2, boss:true, attack:'boss', projectile:'ad', damage:[9,15], windup:0.7, cooldown:1.6, range:30, projSpeed:9, pain:0.05,
    sight:['I KNOW WHAT YOU WATCHED.', 'RECOMMENDED FOR YOU: PAIN', 'YOU ARE THE PRODUCT.'], deaths:['THE ALGORITHM HAS BEEN UNINSTALLED']}
});

// Projectiles fired by anyone.
export const PROJECTILES = Object.freeze({
  rocket:{radius:0.12, sprite:'rocket'}, ratio:{radius:0.18, sprite:'ratio'},
  hottake:{radius:0.15, sprite:'hottake'}, heart:{radius:0.12, sprite:'heart'}, rocketmoji:{radius:0.16, sprite:'rocketmoji'}, ad:{radius:0.17, sprite:'ad'}
});

// Pickups by map character.
export const ITEMS = Object.freeze({
  h:{kind:'health', amount:10, max:100, sprite:'grass', message:'Touched grass. +10 HP. Feels weird, right?'},
  H:{kind:'health', amount:25, max:100, sprite:'water', message:'Hydration check! +25 HP. Drink water, bestie.'},
  m:{kind:'health', amount:100, max:200, sprite:'crown', message:'MAIN CHARACTER ENERGY! +100 HP. It\'s giving protagonist.'},
  a:{kind:'armor', amount:5, max:200, sprite:'adblock', message:'Ad-blocker shard. +5 ARMOR. Unskippable? Not today.'},
  v:{kind:'armor', set:100, max:200, sprite:'check', message:'Picked up a BLUE CHECK. You\'re verified now (somehow).'},
  c:{kind:'ammo', ammo:'clicks', amount:12, sprite:'clicks', message:'Picked up some CLICKS.'},
  C:{kind:'ammo', ammo:'clicks', amount:50, sprite:'clickbox', message:'A BOX OF CLICKS. You won\'t believe what happens next.'},
  s:{kind:'ammo', ammo:'takes', amount:6, sprite:'takes', message:'Picked up some HOT TAKES. Unpopular opinion: they rock.'},
  k:{kind:'ammo', ammo:'rockets', amount:4, sprite:'rockets', message:'Picked up ROCKET EMOJIS. To the moon.'},
  e:{kind:'ammo', ammo:'ratio', amount:40, sprite:'cell', message:'Picked up a RATIO CELL. Charged with pure discourse.'},
  r:{kind:'key', key:'r', sprite:'keyr', message:'RED admin password: hunter2. (It shows as ******* for you, right?)'},
  b:{kind:'key', key:'b', sprite:'keyb', message:'BLUE admin password: password123. Peak security.'},
  y:{kind:'key', key:'y', sprite:'keyy', message:'YELLOW admin password: admin / admin. Truly unhackable.'},
  p:{kind:'power', power:'airplane', time:20, sprite:'airplane', message:'AIRPLANE MODE! Nothing can reach you for 20 seconds.'},
  3:{kind:'weapon', weapon:'hottake', ammo:'takes', amount:8, sprite:'w3'},
  4:{kind:'weapon', weapon:'copypasta', ammo:'clicks', amount:30, sprite:'w4'},
  5:{kind:'weapon', weapon:'rocket', ammo:'rockets', amount:4, sprite:'w5'},
  6:{kind:'weapon', weapon:'ratio', ammo:'ratio', amount:60, sprite:'w6'}
});
export const PROPS = Object.freeze({
  x:{id:'battery', sprite:'battery', blocks:true, radius:0.3, hp:20, explodes:[70,2.2]},
  T:{id:'plant', sprite:'plant', blocks:true, radius:0.3},
  l:{id:'lamp', sprite:'lamp', blocks:false, radius:0.2}
});
export const KEY_NAMES = Object.freeze({r:'RED', b:'BLUE', y:'YELLOW'});

export const DIFFICULTIES = Object.freeze([
  {id:'casual', name:'CASUAL SCROLLER', note:'Half damage. Double ammo. Vibes only.', damage:0.5, ammo:2, aggression:0.75},
  {id:'online', name:'TERMINALLY ONLINE', note:'The intended experience.', damage:1, ammo:1, aggression:1},
  {id:'nograss', name:'HASN\'T TOUCHED GRASS', note:'They hit harder and think less.', damage:1.5, ammo:1, aggression:1.25},
  {id:'main', name:'MAIN CHARACTER SYNDROME', note:'Everyone is out to get you. They are.', damage:2, ammo:1, aggression:1.5}
]);

export const QUIPS = Object.freeze({
  locked:{r:'You need the RED admin password. (It\'s probably hunter2.)', b:'You need the BLUE admin password. Try password123?', y:'You need the YELLOW admin password. Have you tried admin?'},
  boss:'UNSUBSCRIBE FROM THE ALGORITHM FIRST.',
  secret:'SECRET FOUND! You found an Easter egg. Don\'t tell the subreddit.',
  hidden:'*dial-up modem noises*',
  noAmmo:'Out of ammo. Skill issue? Switch weapons.',
  exit:'LOGGING OFF...',
  death:['SKILL ISSUE.', 'YOU GOT RATIO\'D.', 'TOUCH GRASS AND TRY AGAIN.', 'CONNECTION LOST (YOURS).', 'L + YOU DIED.'],
  airplaneOff:'Airplane mode off. 847 notifications incoming.',
  bossDead:'THE ALGORITHM HAS BEEN UNINSTALLED. The exit is open. Go outside.'
});

export const VIBES = Object.freeze([[150,'GODLIKE'],[100,'IMMACULATE'],[70,'VALID'],[45,'MID'],[25,'CURSED'],[1,'COOKED'],[0,'OFFLINE']]);
export const vibeFor = hp => VIBES.find(([min]) => hp >= min)[1];

// Intermission grades by kill/secret percentage.
export function grade(stats) {
  const k = stats.totalKills ? stats.kills/stats.totalKills : 1, s = stats.totalSecrets ? stats.secrets/stats.totalSecrets : 1;
  const score = k*0.7 + s*0.3;
  return score >= 0.99 ? 'S / TOUCHED ALL THE GRASS' : score >= 0.8 ? 'A / BASED' : score >= 0.6 ? 'B / VALID' : score >= 0.4 ? 'C / MID' : 'D / SKILL ISSUE';
}
