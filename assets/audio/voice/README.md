# Character voice clips (Naruto / Sasuke)

**None are installed, and none could be obtained legally (checked 2026-11-01).** SHINOBI AI only plays
character voices that are added here with a licence that allows this use. Until then every activation
runs its full timeline (confirmation → charge → release) without voice. Nothing generic, synthetic or
imitated is ever played in place of a missing clip.

## The 8 files (exact names)

WAV only: the server reads each clip's length to time the activation (activation voice → chakra charge
→ jutsu name → main effect), so other formats are not used.

| file | speaker | what is said |
|---|---|---|
| `fire_style/activation.wav` | Naruto | activation shout |
| `fire_style/name.wav` | Naruto | "Katon: Gōkakyū no Jutsu!" |
| `chidori/activation.wav` | Sasuke | activation / charging call |
| `chidori/name.wav` | Sasuke | "Chidori!" |
| `shadow_clone/activation.wav` | Naruto | hand-sign shout |
| `shadow_clone/name.wav` | Naruto | "Kage Bunshin no Jutsu!" |
| `rasengan/activation.wav` | Naruto | charging shout |
| `rasengan/name.wav` | Naruto | "Rasengan!" |

Format: **16-bit PCM WAV, mono, 44.1 or 48 kHz**; dry voice only (no music or effects, reverb tail under
0.3 s); voice starting within 30 ms; `activation` 0.25–2 s, `name` 0.25–2.5 s; about −16 LUFS integrated,
peaks at most −1 dBFS, all 8 at the same level. Check them with:

```
python tools/check_voices.py
```

Then reload the page (the server lists the installed clips at `GET /api/voices`) and add a row per clip to
`../ASSET_LICENSES.md` (source, owner, licence, permission).

## When they play

Only after the backend confirms the complete, correct sequence (`jutsu` event), never on a single step, a
wrong sign, a timeout or an incomplete sequence:

1. the confirmation: the last sign's hand-sign sound, then `activation.wav`;
2. the chakra charge (visual + sound);
3. `name.wav`;
4. the main effect and its impact.

While a voice plays, the music and the sound effects get quieter so the voice stays clear. Settings →
Sound → "Character voices" sets their volume (separately from sound effects and music).

## Can the original Japanese anime voices be used? (research, 2026-11-01)

Not without permission. What was found:

* The voices are **Junko Takeuchi** (Naruto) and **Noriaki Sugiyama** (Sasuke) in the TV anime, animated by
  Studio Pierrot, produced by Aniplex and broadcast on TV Tokyo (Wikipedia, "Naruto (TV series)"). The
  anime's Japanese copyright notice is **"©岸本斉史 スコット／集英社・テレビ東京・ぴえろ"** (Masashi Kishimoto /
  Shueisha, TV Tokyo, Pierrot), as printed on the official NARUTO Shippuden pages at sonymusic.co.jp.
* No legal source offers these recordings for download or for use in an app. Studio Pierrot's official
  site has no public licensing page for individuals. Character licensing is normally done between
  companies.
* The "Naruto voice" files easy to find online are AI voice clones of the actors (fish.audio and similar)
  or audio ripped from episodes and videos. Neither may be used.

Legal routes, in order of what the request asks for:

1. **The existing anime recordings**: a written licence from the copyright holders in the notice above
   (Shueisha, TV Tokyo, Studio Pierrot; Aniplex produced the series). Outside Japan the series is licensed
   to Viz Media (North America), whose licence does not let third parties reuse the audio.
2. **New lines recorded by the original actors**: a booking through their agencies (third-party profiles
   list Junko Takeuchi at 尾木プロ THE NEXT and Noriaki Sugiyama at ステイラック / Stay Luck since February
   2016; confirm on the agencies' official sites) **and** approval from the character rights holders, since
   the lines voice their characters.

Sources: https://en.wikipedia.org/wiki/Naruto_(TV_series) ·
https://www.sonymusic.co.jp/naruto/movie/index.html (copyright notice) · https://pierrot.jp/ ·
https://www.crank-in.net/person/6419 · https://anime.eiga.com/person/10655/ ·
https://eiga.com/person/42322/wikipedia/ · https://www.crank-in.net/person/8610
