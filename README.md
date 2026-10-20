# Claude model advisor

A small web page that suggests which Claude model (Haiku, Sonnet or Opus) and effort level to use for a prompt, before you send it. Picking right up front saves usage: switching model mid-session rebuilds the prompt cache.

**Try it:** https://hapyrv.github.io/claude-model-advisor/

## How it decides

Plain keyword rules, no AI. Each rule in `RULES` (in `model-advisor.js`) is a regex, a weight and a reason. Matches add up to a score, and the score maps to a tier:

| Score | Suggestion |
|---|---|
| low | Haiku · low — tiny mechanical asks |
| middle | Sonnet · low / medium — routine edits, fixes, browser and desktop tasks |
| high | Opus · medium / high / max — design, hard or repeated bugs, big builds, research |

Details:
- Only your own words are scored. Pasted blocks, `@file` references and URLs count for little.
- Each rule counts once; extra keyword matches have diminishing weight.
- "Continue from the handoff" style prompts get *keep current model* rather than a new pick.
- Opus at max effort needs a hard signal (e.g. "still broken after", architecture, research).

Every suggestion lists the rules that fired, so you can see why.

## Privacy

Everything runs in your browser. There is no server, no analytics and no network call; your prompt never leaves the page.

## Use it locally

Open `index.html` in a browser, or use the CLI:

```bash
node model-advisor.js "why does the map still flicker after the last fix?"
```

`model-advisor.js` also works as a Node module: `require('./model-advisor').advise(text)`.

## Tune it

Edit the weights and regexes in `RULES` and the thresholds in `TIERS`. The Unity / 3D rule is an example of a domain rule; replace it with your own field.

## Disclaimer

Unofficial; not affiliated with or endorsed by Anthropic. Suggestions are rules of thumb.

## License

MIT — see [LICENSE](LICENSE).
